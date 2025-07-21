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
import jmdictNativeTrieUrl from "../assets/gen/jmdict-native-trie.bin?url";
import jmdictNativeTrieIdMapUrl from "../assets/gen/jmdict-native-trie-id-map.json?url";
import jmdictNativeTrieMetadataUrl from "../assets/gen/jmdict-native-trie-metadata.json?url";
import cedictIndexEnglishUrl from "../assets/gen/cedict-index-english.dsv?url";
import pinyinTrieUrl from "../assets/gen/pinyin-trie.bin?url";
import pinyinTrieIdMapUrl from "../assets/gen/pinyin-trie-idmap.json?url";
import pinyinTrieMetadataUrl from "../assets/gen/pinyin-trie-metadata.json?url";

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
  private jmdictNativeRadixIndex: RadixTreeIndex;
  private cedictEnglishIndex: Index;
  private pinyinRadixIndex: RadixTreeIndex;

  static async load(progress: (bytes: number) => void) {
    const [
      ,
      db,
      jmdictEnglishIndex,
      jmdictNativeRadixIndex,
      cedictEnglishIndex,
      pinyinRadixIndex,
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
      RadixTreeIndex.load(
        jmdictNativeTrieUrl,
        jmdictNativeTrieIdMapUrl,
        jmdictNativeTrieMetadataUrl,
      ),
      Index.load(cedictIndexEnglishUrl),
      RadixTreeIndex.load(
        pinyinTrieUrl,
        pinyinTrieIdMapUrl,
        pinyinTrieMetadataUrl,
      ),
    ]);
    return new Dict(
      db,
      jmdictEnglishIndex,
      jmdictNativeRadixIndex,
      cedictEnglishIndex,
      pinyinRadixIndex,
    );
  }

  private constructor(
    db: IDBPDatabase<DictDbSchema>,
    jmdictEnglishIndex: Index,
    jmdictNativeRadixIndex: RadixTreeIndex,
    cedictEnglishIndex: Index,
    pinyinRadixIndex: RadixTreeIndex,
  ) {
    this.db = db;
    this.jmdictEnglishIndex = jmdictEnglishIndex;
    this.jmdictNativeRadixIndex = jmdictNativeRadixIndex;
    this.cedictEnglishIndex = cedictEnglishIndex;
    this.pinyinRadixIndex = pinyinRadixIndex;
  }

  async *search(
    query: string,
    queryType: QueryType,
  ): AsyncGenerator<DictionaryEntry> {
    let index: Index | RadixTreeIndex;
    let storeName: "jmdict" | "cedict";

    switch (queryType) {
      case "japanese-english":
        index = this.jmdictEnglishIndex;
        storeName = "jmdict";
        break;
      case "japanese-native":
        // Use radix tree for Japanese native search (kanji + kana)
        index = this.jmdictNativeRadixIndex;
        storeName = "jmdict";
        break;
      case "chinese-english":
        index = this.cedictEnglishIndex;
        storeName = "cedict";
        break;
      case "chinese-native":
        // Use radix tree for Chinese native search (pinyin + characters)
        index = this.pinyinRadixIndex;
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

class RadixTreeIndex {
  private data: Uint8Array;
  private idToEntry: Map<number, string>;
  private rootOffset: number;

  private constructor(
    data: Uint8Array,
    idToEntry: Map<number, string>,
    rootOffset: number,
  ) {
    this.data = data;
    this.idToEntry = idToEntry;
    this.rootOffset = rootOffset;
  }

  static async load(trieUrl: string, idMapUrl: string, metadataUrl: string) {
    const [trieResp, idMapResp, metadataResp] = await Promise.all([
      fetch(trieUrl),
      fetch(idMapUrl),
      fetch(metadataUrl),
    ]);

    const data = new Uint8Array(await trieResp.arrayBuffer());
    const idMapData = await idMapResp.json();
    const metadata = await metadataResp.json();

    // Convert the ID map to use number keys
    const idToEntry = new Map<number, string>();
    for (const [idStr, entryId] of Object.entries(idMapData)) {
      idToEntry.set(parseInt(idStr), entryId as string);
    }

    const rootOffset = metadata.rootOffset || 0;

    return new RadixTreeIndex(data, idToEntry, rootOffset);
  }

  *search(query: string): Generator<string> {
    const results = new Set<string>();
    const normalizedQuery = query.toLowerCase().trim();

    if (normalizedQuery.length === 0) {
      return;
    }

    // Convert query to UTF-8 bytes
    const queryBytes = new TextEncoder().encode(normalizedQuery);

    // Search for matches in the radix tree
    const matches = this.searchInTrie(queryBytes);

    for (const id of matches) {
      const entryId = this.idToEntry.get(id);
      if (entryId && !results.has(entryId)) {
        results.add(entryId);
        yield entryId;
      }
    }
  }

  private searchInTrie(queryBytes: Uint8Array): Set<number> {
    const results = new Set<number>();

    if (this.data.length === 0 || queryBytes.length === 0) {
      return results;
    }

    try {
      this.traverseNode(this.rootOffset, queryBytes, 0, results);
    } catch (error) {
      console.warn("Error searching radix tree:", error, {
        queryBytes,
        dataLength: this.data.length,
        rootOffset: this.rootOffset,
      });
    }

    return results;
  }

  private traverseNode(
    nodeOffset: number,
    queryBytes: Uint8Array,
    queryIndex: number,
    results: Set<number>,
  ): void {
    if (nodeOffset >= this.data.length) {
      console.warn("Node offset out of bounds:", nodeOffset, this.data.length);
      return;
    }

    let offset = nodeOffset;

    try {
      // Read node structure: numChildren, numResults, edgeLen, edge, children, results
      const [numChildren, newOffset1] = this.decodeVarint(offset);
      const [numResults, newOffset2] = this.decodeVarint(newOffset1);
      const [edgeLen, newOffset3] = this.decodeVarint(newOffset2);

      if (edgeLen > 1000) {
        // Sanity check
        console.warn(
          "Suspicious edge length:",
          edgeLen,
          "at offset:",
          nodeOffset,
        );
        return;
      }

      offset = newOffset3;

      // Bounds check for edge
      if (offset + edgeLen > this.data.length) {
        console.warn(
          "Edge extends beyond data bounds:",
          offset,
          edgeLen,
          this.data.length,
        );
        return;
      }

      // Read edge as raw bytes - don't decode as it might not be valid UTF-8
      const edgeBytes = this.data.slice(offset, offset + edgeLen);
      offset += edgeLen;

      // Check if query bytes match this edge
      const remainingQueryBytes = queryBytes.slice(queryIndex);

      // Check if remaining query starts with edge bytes
      const edgeMatches =
        remainingQueryBytes.length >= edgeBytes.length &&
        this.bytesEqual(
          remainingQueryBytes.slice(0, edgeBytes.length),
          edgeBytes,
        );

      if (edgeMatches) {
        // Edge matches, continue traversal
        const newQueryIndex = queryIndex + edgeBytes.length;

        // If we've consumed the entire query, collect results from this node and descendants
        if (newQueryIndex >= queryBytes.length) {
          // Read results from this node
          let resultsOffset = offset;

          // Skip children first
          for (let i = 0; i < numChildren; i++) {
            const [, nextOffset1] = this.decodeVarint(resultsOffset); // first byte
            const [, nextOffset2] = this.decodeVarint(nextOffset1); // child offset
            resultsOffset = nextOffset2;
          }

          // Now read results
          for (let i = 0; i < numResults; i++) {
            const [resultId, nextOffset] = this.decodeVarint(resultsOffset);
            results.add(resultId);
            resultsOffset = nextOffset;
          }

          // For prefix matching, also traverse children to get results from descendant nodes
          this.traverseAllDescendants(nodeOffset, results);
        } else {
          // Continue searching in children
          for (let i = 0; i < numChildren; i++) {
            const [firstByte, nextOffset1] = this.decodeVarint(offset);
            const [childOffset, nextOffset2] = this.decodeVarint(nextOffset1);
            offset = nextOffset2;

            // Check if the next byte in query matches this child's first byte
            if (
              newQueryIndex < queryBytes.length &&
              queryBytes[newQueryIndex] === firstByte
            ) {
              this.traverseNode(
                childOffset,
                queryBytes,
                newQueryIndex,
                results,
              );
            }
          }
        }
      } else if (
        edgeBytes.length >= remainingQueryBytes.length &&
        this.bytesEqual(
          edgeBytes.slice(0, remainingQueryBytes.length),
          remainingQueryBytes,
        )
      ) {
        // Query is a prefix of the edge - collect all results from this subtree
        this.traverseAllDescendants(nodeOffset, results);
      }
      // If neither case matches, this path doesn't match the query
    } catch (error) {
      console.warn("Error traversing node at offset:", nodeOffset, error);
    }
  }

  private traverseAllDescendants(
    nodeOffset: number,
    results: Set<number>,
    depth: number = 0,
  ): void {
    if (nodeOffset >= this.data.length || depth > 20) {
      // Prevent infinite recursion
      return;
    }

    let offset = nodeOffset;

    try {
      const [numChildren, newOffset1] = this.decodeVarint(offset);
      const [numResults, newOffset2] = this.decodeVarint(newOffset1);
      const [edgeLen, newOffset3] = this.decodeVarint(newOffset2);

      offset = newOffset3 + edgeLen; // Skip edge

      // Store children offsets
      const childOffsets: number[] = [];
      for (let i = 0; i < numChildren; i++) {
        const [, nextOffset1] = this.decodeVarint(offset); // first byte
        const [childOffset, nextOffset2] = this.decodeVarint(nextOffset1);
        if (childOffset < this.data.length) {
          childOffsets.push(childOffset);
        }
        offset = nextOffset2;
      }

      // Read results from this node
      for (let i = 0; i < numResults; i++) {
        const [resultId, nextOffset] = this.decodeVarint(offset);
        results.add(resultId);
        offset = nextOffset;
      }

      // Recursively traverse children
      for (const childOffset of childOffsets) {
        this.traverseAllDescendants(childOffset, results, depth + 1);
      }
    } catch (error) {
      console.warn(
        "Error in traverseAllDescendants at offset:",
        nodeOffset,
        error,
      );
    }
  }

  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  private decodeVarint(offset: number): [number, number] {
    let value = 0;
    let shift = 0;
    let currentOffset = offset;

    if (offset >= this.data.length) {
      throw new Error(
        `Varint decode offset out of bounds: ${offset} >= ${this.data.length}`,
      );
    }

    while (currentOffset < this.data.length && shift < 35) {
      // Prevent overflow
      const byte = this.data[currentOffset];
      currentOffset++;

      value |= (byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        break;
      }

      shift += 7;
    }

    return [value, currentOffset];
  }
}
