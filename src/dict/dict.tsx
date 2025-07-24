import {
  JMdictWord,
  Kanjidic2Character,
} from "@scriptin/jmdict-simplified-types";
import { CedictWord } from "./types";

export type { JMdictWord, Kanjidic2Character, CedictWord };

export type QueryType =
  | "japanese-english"
  | "japanese-native"
  | "chinese-english"
  | "chinese-native";

export type DictionaryEntry = JMdictWord | CedictWord;

type ImportStatus =
  | {
      status: "loading";
      bytes: number;
    }
  | {
      status: "success";
    }
  | {
      status: "failure";
      error: unknown;
    };

type DictStatus =
  | {
      status: "loading";
      bytes: number;
    }
  | {
      status: "failure";
      error: unknown;
    }
  | {
      status: "ready";
    };

import ImportWorker from "./db-import-worker?worker";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { IDBPDatabase } from "idb";
import { DictDbSchema, openDictDb } from "./db";
import { RadixTreeIndex } from "./radix";

import cedictEnglishUrl from "../assets/gen/cedict-english.bin?url";
import cedictNativeUrl from "../assets/gen/cedict-native.bin?url";
import jmdictEnglishUrl from "../assets/gen/jmdict-english.bin?url";
import jmdictNativeUrl from "../assets/gen/jmdict-native.bin?url";
import { InvertedIndex } from "./inverted-index";
import { Decoder } from "./decode";

let status: DictStatus = { status: "loading", bytes: 0 };

const statusListeners: ((status: DictStatus) => void)[] = [];

let _load: Promise<Dict> | undefined;
const load = () => {
  if (_load === undefined) {
    _load = Dict.load((bytes) => {
      status = { status: "loading", bytes };
      statusListeners.forEach((listener) => listener(status));
    });
    _load
      .then(() => {
        status = { status: "ready" };
        statusListeners.forEach((listener) => listener(status));
      })
      .catch((error) => {
        console.error("Failed to load dictionary:", error);
        status = { status: "failure", error };
        statusListeners.forEach((listener) => listener(status));
      });
  }

  return _load;
};

export function useDictStatus() {
  const [currentStatus, setStatus] = createSignal(dict.status);
  createEffect(() => {
    statusListeners.push(setStatus);
    onCleanup(() =>
      statusListeners.splice(statusListeners.indexOf(setStatus), 1),
    );
  });
  return currentStatus;
}

export const dict = {
  get status() {
    load();
    return status;
  },
  async search(query: string, queryType: QueryType) {
    const dict = await load();
    return dict.search(query, queryType);
  },
  async loadWord(id: string) {
    const dict = await load();
    return await dict.loadWord(id);
  },
};

class Dict {
  private db: IDBPDatabase<DictDbSchema>;
  private cedictEnglish: InvertedIndex;
  private cedictNative: RadixTreeIndex;
  private jmdictEnglish: InvertedIndex;
  private jmdictNative: RadixTreeIndex;

  static async load(progress: (bytes: number) => void) {
    const [
      ,
      db,
      cedictEnglishIndex,
      pinyinRadixIndex,
      jmdictEnglishIndex,
      jmdictNativeRadixIndex,
    ] = await Promise.all([
      new Promise((resolve, reject) => {
        const importWorker = new ImportWorker();
        importWorker.onmessage = (msg) => {
          const importStatus: ImportStatus = msg.data;
          switch (importStatus.status) {
            case "loading":
              progress(importStatus.bytes);
              break;
            case "failure":
              reject(importStatus.error);
              break;
            case "success":
              resolve(undefined);
              break;
          }
        };
        importWorker.onerror = (msg) => {
          reject(msg.error);
        };
      }),
      openDictDb(),
      InvertedIndex.load(cedictEnglishUrl),
      RadixTreeIndex.load(cedictNativeUrl),
      InvertedIndex.load(jmdictEnglishUrl),
      RadixTreeIndex.load(jmdictNativeUrl),
    ]);
    return new Dict(
      db,
      cedictEnglishIndex,
      pinyinRadixIndex,
      jmdictEnglishIndex,
      jmdictNativeRadixIndex,
    );
  }

  private constructor(
    db: IDBPDatabase<DictDbSchema>,
    cedictEnglishIndex: InvertedIndex,
    pinyinRadixIndex: RadixTreeIndex,
    jmdictEnglishIndex: InvertedIndex,
    jmdictNativeRadixIndex: RadixTreeIndex,
  ) {
    this.db = db;
    this.cedictEnglish = cedictEnglishIndex;
    this.cedictNative = pinyinRadixIndex;
    this.jmdictEnglish = jmdictEnglishIndex;
    this.jmdictNative = jmdictNativeRadixIndex;
  }

  async *search(
    query: string,
    queryType: QueryType,
  ): AsyncGenerator<DictionaryEntry> {
    let index: InvertedIndex | RadixTreeIndex;
    let storeName: "jmdict" | "cedict";

    switch (queryType) {
      case "japanese-english":
        index = this.jmdictEnglish;
        storeName = "jmdict";
        break;
      case "japanese-native":
        // Use radix tree for Japanese native search (kanji + kana)
        index = this.jmdictNative;
        storeName = "jmdict";
        break;
      case "chinese-english":
        index = this.cedictEnglish;
        storeName = "cedict";
        break;
      case "chinese-native":
        // Use radix tree for Chinese native search (pinyin + characters)
        index = this.cedictNative;
        storeName = "cedict";
        break;
      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }

    for (const resultId of index.search(query)) {
      let result: DictionaryEntry | undefined;
      if (storeName === "jmdict") {
        result = await this.loadJmdictWord(resultId);
      } else {
        result = await this.loadCedictWord(resultId);
      }

      if (result === undefined) {
        console.warn(
          "Ignoring dictionary search result with no corresponding entry",
        );
        continue;
      } else {
        yield result;
      }
    }
  }

  async loadJmdictWord(id: number): Promise<JMdictWord | undefined> {
    const word = await this.db.get("jmdict", id);
    if (word !== undefined) {
      return parseJmdictWord(word.data);
    } else {
      return undefined;
    }
  }

  async loadCedictWord(id: number): Promise<CedictWord | undefined> {
    const word = await this.db.get("cedict", id);
    if (word !== undefined) {
      return parseCedictWord(word.data);
    } else {
      return undefined;
    }
  }

  async loadWord(id: string): Promise<DictionaryEntry | undefined> {
    // TODO: allow searching by ref id
    return undefined;
  }
}

function parseJmdictWord(data: Uint8Array): JMdictWord {
  const decoder = new Decoder(data);

  // Read word ID (string)
  const id = decoder.string();

  // Read kanji array
  const kanji = Array.from(
    decoder.iterArray(() => {
      const text = decoder.string();
      const common = decoder.uint8() !== 0; // Bool is encoded as uint8
      const tags = Array.from(decoder.iterArray(() => decoder.string()));
      return { text, common, tags };
    }),
  );

  // Read kana array
  const kana = Array.from(
    decoder.iterArray(() => {
      const text = decoder.string();
      const common = decoder.uint8() !== 0; // Bool is encoded as uint8
      const tags = Array.from(decoder.iterArray(() => decoder.string()));
      const appliesToKanji = Array.from(
        decoder.iterArray(() => decoder.string()),
      );
      return { text, common, tags, appliesToKanji };
    }),
  );

  // Read sense array
  const sense = Array.from(
    decoder.iterArray(() => {
      const partOfSpeech = Array.from(
        decoder.iterArray(() => decoder.string()),
      );
      const appliesToKanji = Array.from(
        decoder.iterArray(() => decoder.string()),
      );
      const appliesToKana = Array.from(
        decoder.iterArray(() => decoder.string()),
      );
      const gloss = Array.from(
        decoder.iterArray(() => {
          return { text: decoder.string() };
        }),
      );

      return {
        partOfSpeech,
        appliesToKanji,
        appliesToKana,
        related: [], // Not encoded in binary format
        antonym: [], // Not encoded in binary format
        field: [], // Not encoded in binary format
        dialect: [], // Not encoded in binary format
        misc: [], // Not encoded in binary format
        info: [], // Not encoded in binary format
        languageSource: [], // Not encoded in binary format
        gloss: gloss.map((g) => ({
          lang: "eng" as const,
          gender: null,
          type: null,
          text: g.text,
        })),
      };
    }),
  );

  return { id, kanji, kana, sense };
}

function parseCedictWord(data: Uint8Array): CedictWord {
  const decoder = new Decoder(data);

  const traditional = decoder.string();
  const simplified = decoder.string();
  const pinyin = [...decoder.iterArray(() => decoder.string())];
  const senses = [
    ...decoder.iterArray(() => [...decoder.iterArray(() => decoder.string())]),
  ];

  return { traditional, simplified, pinyin, senses };
}
