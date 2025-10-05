import { type JMdictWord, type Kanjidic2Character } from "@scriptin/jmdict-simplified-types";
import { StorageFactory } from "./storage/factory";
import { FileStorage } from "./storage/interfaces";

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
import { ProgressTracker } from "./storage/progress-tracker";
import { EnglishQuery, NativeQuery } from "../query/interfaces";
import { ItemType } from "../item";
import { NetworkFileReader } from "./storage/network-file-reader";

export type { JMdictWord, Kanjidic2Character };

export type DictionaryEntry =
  | (CedictWord & { lang: Language; type: ItemType.cedict; index: number })
  | (JMdictWord & { lang: Language; type: ItemType.jmdict; index: number });

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

class Dictionary {
  private storage: FileStorage | undefined;
  private initialized = false;

  private jmdictLoader: WordLoader<DictionaryEntry> | undefined;
  private cedictLoader: WordLoader<DictionaryEntry> | undefined;
  private jmdictEnglishQuery: InvertedIndex | undefined;
  private jmdictNativeQuery: RadixTree | undefined;
  private cedictEnglishQuery: InvertedIndex | undefined;
  private cedictNativeQuery: RadixTree | undefined;

  constructor() {}

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.storage = await StorageFactory.getStorage();
    this.initialized = true;
  }

  async *search(
    query: EnglishQuery | NativeQuery,
    language: Language,
    onProgress?: (bytesDownloaded: number) => void,
  ): AsyncGenerator<DictionaryEntry> {
    await this.initialize();

    const progressTracker = onProgress ? new ProgressTracker(onProgress) : undefined;
    const entryLoader = await this.getEntryLoader(language, progressTracker);

    const results =
      query instanceof EnglishQuery
        ? (await this.getInvertedIndex(language)).search(query)
        : (await this.getRadixTree(language)).search(query);

    for (const id of results) {
      const entry = await entryLoader.loadEntry(id);
      if (entry) {
        yield entry;
      }
    }
  }

  async loadEntry(index: number, language: Language): Promise<DictionaryEntry | undefined> {
    await this.initialize();
    const loader = await this.getEntryLoader(language);
    return loader.loadEntry(index);
  }

  private async getEntryLoader(
    language: Language,
    progressTracker?: ProgressTracker,
  ): Promise<WordLoader<DictionaryEntry>> {
    if (!this.storage) {
      throw new Error("Dictionary not initialized");
    }

    if (language === Language.Chinese) {
      return (this.cedictLoader ??= await WordLoader.load(
        new NetworkFileReader(
          ceEntries,
          this.storage.ensureFileExists("cedict.bin", ceEntries, progressTracker),
        ),
        await this.storage.ensureFileExists("cedict-offsets.bin", ceOffsets, progressTracker),
        parseCedictEntry,
      ));
    } else {
      return (this.jmdictLoader ??= await WordLoader.load(
        new NetworkFileReader(
          jmEntries,
          this.storage.ensureFileExists("jmdict.bin", jmEntries, progressTracker),
        ),
        await this.storage.ensureFileExists("jmdict-offsets.bin", jmOffsets, progressTracker),
        parseJmdictEntry,
      ));
    }
  }

  private async getRadixTree(
    language: Language,
    progressTracker?: ProgressTracker,
  ): Promise<RadixTree> {
    if (!this.storage) {
      throw new Error("Dictionary not initialized");
    }

    if (language === Language.Chinese) {
      return (this.cedictNativeQuery ??= await RadixTree.load(
        await this.storage.ensureFileExists("cedict-native.bin", ceNative, progressTracker),
      ));
    } else {
      return (this.jmdictNativeQuery ??= await RadixTree.load(
        await this.storage.ensureFileExists("jmdict-native.bin", jmNative, progressTracker),
      ));
    }
  }

  private async getInvertedIndex(
    language: Language,
    progressTracker?: ProgressTracker,
  ): Promise<InvertedIndex> {
    if (!this.storage) {
      throw new Error("Dictionary not initialized");
    }

    if (language === Language.Chinese) {
      return (this.cedictEnglishQuery ??= await InvertedIndex.load(
        await this.storage.ensureFileExists("cedict-english.bin", ceEnglish, progressTracker),
      ));
    } else {
      return (this.jmdictEnglishQuery ??= await InvertedIndex.load(
        await this.storage.ensureFileExists("jmdict-english.bin", jmEnglish, progressTracker),
      ));
    }
  }

  async clearData(): Promise<void> {
    if (this.storage) {
      await this.storage.clearAll();
    }

    // Clear cached instances
    this.jmdictLoader = undefined;
    this.cedictLoader = undefined;
    this.jmdictEnglishQuery = undefined;
    this.jmdictNativeQuery = undefined;
    this.cedictEnglishQuery = undefined;
    this.cedictNativeQuery = undefined;

    this.storage = undefined;
    this.initialized = false;
  }
}

export const dict = new Dictionary();

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

    return {
      index,
      id,
      kanji,
      kana,
      sense,
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
