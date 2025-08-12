import { type JMdictWord, type Kanjidic2Character } from "@scriptin/jmdict-simplified-types";
import { StorageFactory } from "./storage/factory";
import { FileStorage } from "./storage/interfaces";

import cedictEnglishUrl from "../../assets/gen/cedict-english.bin?url";
import cedictNativeUrl from "../../assets/gen/cedict-native.bin?url";
import jmdictEnglishUrl from "../../assets/gen/jmdict-english.bin?url";
import jmdictNativeUrl from "../../assets/gen/jmdict-native.bin?url";
import jmdictUrl from "../../assets/gen/jmdict.bin?url";
import cedictUrl from "../../assets/gen/cedict.bin?url";
import jmdictOffsetsUrl from "../../assets/gen/jmdict-offsets.bin?url";
import cedictOffsetsUrl from "../../assets/gen/cedict-offsets.bin?url";
import { Decoder } from "./decode";
import { WordLoader } from "./word-loader";
import { RadixTree } from "./radix-tree";
import { InvertedIndex } from "./inverted-index";
import { ProgressTracker } from "./storage/progress-tracker";
import { EnglishQuery, NativeQuery } from "../query/interfaces";
import { ItemType } from "../item";

export type { JMdictWord, Kanjidic2Character };

export type DictionaryEntry =
  | (CedictWord & { type: ItemType.cedict; index: number })
  | (JMdictWord & { type: ItemType.jmdict; index: number });

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
    this.storage = await StorageFactory.createStorage("dictionaries");
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
        ...(await Promise.all([
          this.storage.ensureFileExists("cedict.bin", cedictUrl, progressTracker),
          this.storage.ensureFileExists("cedict-offsets.bin", cedictOffsetsUrl, progressTracker),
        ])),
        parseCedictEntry,
      ));
    } else {
      return (this.jmdictLoader ??= await WordLoader.load(
        ...(await Promise.all([
          this.storage.ensureFileExists("jmdict.bin", jmdictUrl, progressTracker),
          this.storage.ensureFileExists("jmdict-offsets.bin", jmdictOffsetsUrl, progressTracker),
        ])),
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
        await this.storage.ensureFileExists("cedict-native.bin", cedictNativeUrl, progressTracker),
      ));
    } else {
      return (this.jmdictNativeQuery ??= await RadixTree.load(
        await this.storage.ensureFileExists("jmdict-native.bin", jmdictNativeUrl, progressTracker),
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
        await this.storage.ensureFileExists(
          "cedict-english.bin",
          cedictEnglishUrl,
          progressTracker,
        ),
      ));
    } else {
      return (this.jmdictEnglishQuery ??= await InvertedIndex.load(
        await this.storage.ensureFileExists(
          "jmdict-english.bin",
          jmdictEnglishUrl,
          progressTracker,
        ),
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

    return { index, id, kanji, kana, sense, type: ItemType.jmdict };
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

    return { index, traditional, simplified, pinyin, senses, type: ItemType.cedict };
  } catch {
    return undefined;
  }
}
