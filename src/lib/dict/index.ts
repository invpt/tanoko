import { type JMdictWord, type Kanjidic2Character } from "@scriptin/jmdict-simplified-types";
import { FileStorage } from "./storage/interfaces";
import { OPFSStorage } from "./storage/opfs";
import { IndexedDBStorage } from "./storage/indexeddb";

import ceEnglish from "../../assets/gen/ce-english.bin?url";
import ceNative from "../../assets/gen/ce-native.bin?url";
import jmEnglish from "../../assets/gen/jm-english.bin?url";
import jmNative from "../../assets/gen/jm-native.bin?url";
import jmEntries from "../../assets/gen/jm-entries.bin?url";
import ceEntries from "../../assets/gen/ce-entries.bin?url";
import jmOffsets from "../../assets/gen/jm-offsets.bin?url";
import ceOffsets from "../../assets/gen/ce-offsets.bin?url";
import { Decoder } from "./decode";
import { WordLoader } from "./word-loader";
import { RadixTree } from "./radix-tree";
import { InvertedIndex } from "./inverted-index";
import { EnglishQuery, NativeQuery } from "../query/interfaces";
import { ItemType } from "../item";
import { NetworkFileReader } from "./storage/network-file-reader";

export type { JMdictWord, Kanjidic2Character };

export type DictionaryEntry =
  | (CedictWord & { lang: Language; type: ItemType.cedict; index: number })
  | (JMdictWord & { furigana: number[]; lang: Language; type: ItemType.jmdict; index: number });

export type CedictWord = {
  traditional: string;
  simplified: string;
  pinyin: string;
  senses: string[][];
};

export enum Language {
  Chinese = "zh",
  Japanese = "jp",
}

export const dict = {
  async *search(
    query: EnglishQuery | NativeQuery,
    language: Language,
  ): AsyncGenerator<DictionaryEntry> {
    const entryLoader = await _loaders[language]();

    const results =
      query instanceof EnglishQuery
        ? (await _invertedIndexes[language]()).search(query)
        : (await _radixTrees[language]()).search(query);

    for (const id of results) {
      const entry = await entryLoader.loadEntry(id);
      if (entry) {
        yield entry;
      }
    }
  },

  async loadEntry(index: number, language: Language): Promise<DictionaryEntry | undefined> {
    const loader = await _loaders[language]();
    return loader.loadEntry(index);
  },

  async clearData(): Promise<void> {
    const storage = await _storage();
    await storage.clearAll();
  },
};

function lazy<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined = undefined;
  return () => (promise ??= factory());
}

const _storage = lazy(async () => {
  try {
    const storage = await OPFSStorage.create();
    console.log("Using OPFS for file storage");
    return storage;
  } catch (error) {
    console.warn("OPFS not available, falling back to IndexedDB:", error);
    return await IndexedDBStorage.create();
  }
});

const _loaders = {
  [Language.Chinese]: lazy(async () => {
    const storage = await _storage();
    return WordLoader.load(
      new NetworkFileReader(ceEntries, storage.ensureFileExists("cedict.bin", ceEntries)),
      await storage.ensureFileExists("cedict-offsets.bin", ceOffsets),
      parseCedictEntry,
    );
  }),
  [Language.Japanese]: lazy(async () => {
    const storage = await _storage();
    return WordLoader.load(
      new NetworkFileReader(jmEntries, storage.ensureFileExists("jmdict.bin", jmEntries)),
      await storage.ensureFileExists("jmdict-offsets.bin", jmOffsets),
      parseJmdictEntry,
    );
  }),
};

const _radixTrees = {
  [Language.Chinese]: lazy(async () => {
    const storage = await _storage();
    return RadixTree.load(await storage.ensureFileExists("cedict-native.bin", ceNative));
  }),
  [Language.Japanese]: lazy(async () => {
    const storage = await _storage();
    return RadixTree.load(await storage.ensureFileExists("jmdict-native.bin", jmNative));
  }),
};

const _invertedIndexes = {
  [Language.Chinese]: lazy(async () => {
    const storage = await _storage();
    return InvertedIndex.load(await storage.ensureFileExists("cedict-english.bin", ceEnglish));
  }),
  [Language.Japanese]: lazy(async () => {
    const storage = await _storage();
    return InvertedIndex.load(await storage.ensureFileExists("jmdict-english.bin", jmEnglish));
  }),
};

function parseJmdictEntry(index: number, decoder: Decoder): DictionaryEntry | undefined {
  try {
    const id = decoder.string();

    const kanji = Array.from(
      decoder.iterArray(() => ({
        text: decoder.string(),
        common: decoder.uint8() !== 0,
        tags: Array.from(decoder.iterArray(() => decoder.string())),
      })),
    );

    const kana = Array.from(
      decoder.iterArray(() => ({
        text: decoder.string(),
        common: decoder.uint8() !== 0,
        tags: Array.from(decoder.iterArray(() => decoder.string())),
        appliesToKanji: Array.from(decoder.iterArray(() => decoder.string())),
      })),
    );

    const sense = Array.from(
      decoder.iterArray(() => {
        const partOfSpeech = Array.from(decoder.iterArray(() => decoder.string()));
        const appliesToKanji = Array.from(decoder.iterArray(() => decoder.string()));
        const appliesToKana = Array.from(decoder.iterArray(() => decoder.string()));
        const gloss = Array.from(decoder.iterArray(() => ({ text: decoder.string() })));

        return {
          partOfSpeech,
          appliesToKanji,
          appliesToKana,
          related: [],
          antonym: [],
          field: [],
          dialect: [],
          misc: [],
          info: [],
          languageSource: [],
          gloss: gloss.map((g) => ({
            lang: "eng" as const,
            gender: null,
            type: null,
            text: g.text,
          })),
        };
      }),
    );

    const furigana = Array.from(decoder.iterArray(() => decoder.uvarint()));

    return {
      index,
      id,
      kanji,
      kana,
      sense,
      furigana,
      lang: Language.Japanese,
      type: ItemType.jmdict,
    };
  } catch {
    return undefined;
  }
}

function parseCedictEntry(index: number, decoder: Decoder): DictionaryEntry | undefined {
  try {
    const traditional = decoder.string();
    const simplified = decoder.string();
    const pinyin = decoder.string();
    const senses = Array.from(
      decoder.iterArray(() => Array.from(decoder.iterArray(() => decoder.string()))),
    );

    return {
      index,
      traditional,
      simplified,
      pinyin,
      senses,
      lang: Language.Chinese,
      type: ItemType.cedict,
    };
  } catch {
    return undefined;
  }
}
