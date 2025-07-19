import {
  JMdictWord,
  Kanjidic2Character,
} from "@scriptin/jmdict-simplified-types";
import ImportWorker from "./db-import-worker?worker";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { IDBPDatabase } from "idb";
import { DictDbSchema, openDictDb } from "./db";
import jmdictIndexUrl from "../assets/gen/jmdict-index-english.dsv?url";
import jmdictIndexNativeUrl from "../assets/gen/jmdict-index-native.dsv?url";

export type QueryType = "english" | "native";

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
  const [status, setStatus] = createSignal(dict.status);
  createEffect(() => {
    statusListeners.push(setStatus);
    onCleanup(() =>
      statusListeners.splice(statusListeners.indexOf(setStatus), 1),
    );
  });
  return status;
}

export const dict = {
  get status() {
    // trigger loading if it has not already started
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
  private wordIndex: Index;
  private nativeWordIndex: Index;

  static async load(progress: (bytes: number) => void) {
    const [, db, wordIndex, nativeWordIndex] = await Promise.all([
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
      Index.load(jmdictIndexUrl),
      Index.load(jmdictIndexNativeUrl),
    ]);
    return new Dict(db, wordIndex, nativeWordIndex);
  }

  private constructor(
    db: IDBPDatabase<DictDbSchema>,
    wordIndex: Index,
    nativeWordIndex: Index,
  ) {
    this.db = db;
    this.wordIndex = wordIndex;
    this.nativeWordIndex = nativeWordIndex;
  }

  async *search(query: string, queryType: QueryType) {
    const index =
      queryType === "native" ? this.nativeWordIndex : this.wordIndex;
    for (const resultId of index.search(query)) {
      const result = await this.loadWord(resultId);
      if (result === undefined) {
        console.warn("Ignoring word search result with no dictionary entry");
        continue;
      } else {
        yield result;
      }
    }
  }

  async loadWord(id: string): Promise<JMdictWord | undefined> {
    const word = await this.db.get("jmdict", id);
    if (word !== undefined) {
      return JSON.parse(word);
    } else {
      return undefined;
    }
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
          // the search matched an ID, not text!
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
