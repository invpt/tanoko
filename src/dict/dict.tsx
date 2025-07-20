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

import jmdictIndexEnglishUrl from "../assets/gen/jmdict-index-english.dsv?url";
import jmdictIndexNativeUrl from "../assets/gen/jmdict-index-native.dsv?url";
import cedictIndexEnglishUrl from "../assets/gen/cedict-index-english.dsv?url";
import cedictIndexNativeUrl from "../assets/gen/cedict-index-native.dsv?url";

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
  async loadKanji(literal: string) {
    const dict = await load();
    return await dict.loadKanji(literal);
  },
};

class Dict {
  private db: IDBPDatabase<DictDbSchema>;
  private jmdictEnglishIndex: Index;
  private jmdictNativeIndex: Index;
  private cedictEnglishIndex: Index;
  private cedictNativeIndex: Index;

  static async load(progress: (bytes: number) => void) {
    const [
      ,
      db,
      jmdictEnglishIndex,
      jmdictNativeIndex,
      cedictEnglishIndex,
      cedictNativeIndex,
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
      Index.load(jmdictIndexEnglishUrl),
      Index.load(jmdictIndexNativeUrl),
      Index.load(cedictIndexEnglishUrl),
      Index.load(cedictIndexNativeUrl),
    ]);
    return new Dict(
      db,
      jmdictEnglishIndex,
      jmdictNativeIndex,
      cedictEnglishIndex,
      cedictNativeIndex,
    );
  }

  private constructor(
    db: IDBPDatabase<DictDbSchema>,
    jmdictEnglishIndex: Index,
    jmdictNativeIndex: Index,
    cedictEnglishIndex: Index,
    cedictNativeIndex: Index,
  ) {
    this.db = db;
    this.jmdictEnglishIndex = jmdictEnglishIndex;
    this.jmdictNativeIndex = jmdictNativeIndex;
    this.cedictEnglishIndex = cedictEnglishIndex;
    this.cedictNativeIndex = cedictNativeIndex;
  }

  async *search(
    query: string,
    queryType: QueryType,
  ): AsyncGenerator<DictionaryEntry> {
    let index: Index;
    let storeName: "jmdict" | "cedict";

    switch (queryType) {
      case "japanese-english":
        index = this.jmdictEnglishIndex;
        storeName = "jmdict";
        break;
      case "japanese-native":
        index = this.jmdictNativeIndex;
        storeName = "jmdict";
        break;
      case "chinese-english":
        index = this.cedictEnglishIndex;
        storeName = "cedict";
        break;
      case "chinese-native":
        index = this.cedictNativeIndex;
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

  async loadJmdictWord(id: string): Promise<JMdictWord | undefined> {
    const word = await this.db.get("jmdict", id);
    if (word !== undefined) {
      return JSON.parse(word);
    } else {
      return undefined;
    }
  }

  async loadCedictWord(id: string): Promise<CedictWord | undefined> {
    const word = await this.db.get("cedict", id);
    if (word !== undefined) {
      return JSON.parse(word);
    } else {
      return undefined;
    }
  }

  async loadWord(id: string): Promise<DictionaryEntry | undefined> {
    let word: DictionaryEntry | undefined = await this.loadJmdictWord(id);
    if (word === undefined) {
      word = await this.loadCedictWord(id);
    }
    return word;
  }

  async loadKanji(literal: string): Promise<Kanjidic2Character | undefined> {
    const kanji = await this.db.get("kanjidic", literal);
    if (kanji !== undefined) {
      return JSON.parse(kanji);
    } else {
      return undefined;
    }
  }
}

class Index {
  private index: string;

  private constructor(index: string) {
    this.index = index;
  }

  static async load(from: string) {
    const resp = await fetch(from);
    const index = await resp.text();
    return new Index(index);
  }

  *search(query: string) {
    const index = this.index;

    const alreadyYielded = new Set();

    let start = 0;
    while (true) {
      const i = index.indexOf(query, start);
      if (i < 0) {
        break;
      } else {
        const unit = index.indexOf("\x1F", i);
        const record = index.indexOf("\x1E", i);
        if (unit < 0 || record < 0) {
          break;
        }

        if (record < unit) {
          start = record + 1;
          continue;
        }

        const result = index.substring(unit + 1, record);
        if (!alreadyYielded.has(result)) {
          alreadyYielded.add(result);
          yield result;
        }
        start = record + 1;
      }
    }
  }
}
