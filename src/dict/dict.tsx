import {
  JMdictWord,
  Kanjidic2Character,
} from "@scriptin/jmdict-simplified-types";
import DictWorker from "./dictWorker?worker";
import ImportWorker from "./importWorker?worker";
import {
  Component,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  ParentProps,
  useContext,
} from "solid-js";
import { IDBPDatabase } from "idb";
import { DictDbSchema, openDictDb } from "./db";

type ImportStatus =
  | {
      status: "loading";
      items: number;
    }
  | {
      status: "success";
      items: number;
    }
  | {
      status: "failure";
      error: unknown;
    };

type DictStatus =
  | {
      status: "loading";
      itemsLoaded: number;
    }
  | {
      status: "failure";
      error: unknown;
    }
  | {
      status: "ready";
    };

type DictStatusListener = (status: DictStatus) => void;

let dictStatus: DictStatus = { status: "loading", itemsLoaded: 0 };
const dictStatusListeners: DictStatusListener[] = [];
let _dictPromise: Promise<Dict> | undefined;
const dictPromise = () => {
  if (_dictPromise === undefined) {
    _dictPromise = Dict.load((itemsLoaded) => {
      dictStatus = { status: "loading", itemsLoaded };
      dictStatusListeners.forEach((listener) => listener(dictStatus));
    });
    _dictPromise
      .then(() => {
        dictStatus = { status: "ready" };
        dictStatusListeners.forEach((listener) => listener(dictStatus));
      })
      .catch((error) => {
        dictStatus = { status: "failure", error };
        dictStatusListeners.forEach((listener) => listener(dictStatus));
      });
  }

  return _dictPromise;
};
export const dict = {
  get status() {
    // trigger loading if it has not already started
    dictPromise();
    return dictStatus;
  },
  addStatusListener(listener: DictStatusListener) {
    dictStatusListeners.push(listener);
  },
  removeStatusListener(listener: DictStatusListener) {
    dictStatusListeners.splice(dictStatusListeners.indexOf(listener), 1);
  },
  async search(query: string) {
    const dict = await dictPromise();
    return await dict.search(query);
  },
  async loadWord(id: string) {
    const dict = await dictPromise();
    return await dict.loadWord(id);
  },
  async loadKanji(literal: string) {
    const dict = await dictPromise();
    return await dict.loadKanji(literal);
  },
};

class Dict {
  private db: IDBPDatabase<DictDbSchema>;
  private wordIndex: Index;

  static async load(progress: (items: number) => void) {
    const [, db, wordIndex] = await Promise.all([
      new Promise((resolve, reject) => {
        const importWorker = new ImportWorker();
        importWorker.onmessage = (msg) => {
          const importStatus: ImportStatus = msg.data;
          switch (importStatus.status) {
            case "loading":
              progress(importStatus.items);
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
      Index.load("/src/assets/gen/jmdict-index.txt"),
    ]);
    return new Dict(db, wordIndex);
  }

  private constructor(db: IDBPDatabase<DictDbSchema>, wordIndex: Index) {
    this.db = db;
    this.wordIndex = wordIndex;
  }

  async search(query: string) {
    const resultIds = this.wordIndex.search(query);
    const results: JMdictWord[] = [];
    for (const resultId of resultIds) {
      const result = await this.loadWord(resultId);
      if (result === undefined) {
        console.warn("Ignoring word search result with no dictionary entry");
        continue;
      } else {
        results.push(result);
      }
    }
    return results;
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

  search(query: string) {
    const results: string[] = [];
    const index = this.index;

    let start = 0;
    while (results.length < 10) {
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
        if (!results.some((x) => x === result)) {
          results.push(result);
        }
        start = record + 1;
      }
    }

    return results;
  }
}

export function useDictStatus() {
  const [status, setStatus] = createSignal(dict.status);
  createEffect(() => {
    dict.addStatusListener(setStatus);
    onCleanup(() => dict.removeStatusListener(setStatus));
  });
  return status;
}
