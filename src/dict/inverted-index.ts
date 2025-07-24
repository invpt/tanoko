import { Decoder, StreamDecoder } from "./decode.js";

interface WordEntry {
  offset: number;
  length: number;
}

// Diacritic mapping similar to Go code
const DIACRITIC_MAP: Record<string, string> = {
  à: "a",
  á: "a",
  â: "a",
  ã: "a",
  ä: "a",
  å: "a",
  æ: "a",
  ç: "c",
  è: "e",
  é: "e",
  ê: "e",
  ë: "e",
  ì: "i",
  í: "i",
  î: "i",
  ï: "i",
  ñ: "n",
  ò: "o",
  ó: "o",
  ô: "o",
  õ: "o",
  ö: "o",
  ø: "o",
  ù: "u",
  ú: "u",
  û: "u",
  ü: "u",
  ý: "y",
  ÿ: "y",
  À: "A",
  Á: "A",
  Â: "A",
  Ã: "A",
  Ä: "A",
  Å: "A",
  Æ: "A",
  Ç: "C",
  È: "E",
  É: "E",
  Ê: "E",
  Ë: "E",
  Ì: "I",
  Í: "I",
  Î: "I",
  Ï: "I",
  Ñ: "N",
  Ò: "O",
  Ó: "O",
  Ô: "O",
  Õ: "O",
  Ö: "O",
  Ø: "O",
  Ù: "U",
  Ú: "U",
  Û: "U",
  Ü: "U",
  Ý: "Y",
  Ÿ: "Y",
};

function removeDiacritics(char: string): string {
  return DIACRITIC_MAP[char] || char;
}

function isEnglishChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) || // A-Z
    (code >= 48 && code <= 57)
  ); // 0-9
}

export function tokenize(text: string): string[] {
  const tokens = [];

  let currentToken = "";

  for (const char of text) {
    const normalized = removeDiacritics(char);

    if (isEnglishChar(normalized)) {
      currentToken += normalized.toLowerCase();
    } else if (currentToken.length > 0 && char !== "'" && char !== ".") {
      tokens.push(currentToken);
      currentToken = "";
    }
  }

  if (currentToken.length > 0) {
    tokens.push(currentToken);
  }

  return tokens;
}

export class InvertedIndex {
  private entriesData: Uint8Array;
  private indexData: Uint8Array;
  private commonWordsTableData: Uint8Array;

  private commonWords: string[];

  private constructor(
    entriesData: Uint8Array,
    indexData: Uint8Array,
    commonWordsTableData: Uint8Array,
    commonWords: string[],
  ) {
    this.entriesData = entriesData;
    this.indexData = indexData;
    this.commonWordsTableData = commonWordsTableData;
    this.commonWords = commonWords;
  }

  static async load(url: string): Promise<InvertedIndex> {
    const response = await fetch(url);
    const stream = response.body;
    if (!stream) {
      throw new Error("Failed to get response stream");
    }

    const decoder = new StreamDecoder(stream);
    const chunks: Uint8Array[] = [];

    for await (const chunk of decoder) {
      chunks.push(chunk);
    }

    if (chunks.length !== 4) {
      throw new Error(`Expected 4 chunks, got ${chunks.length}`);
    }

    const [entriesData, indexData, commonWordsData, commonWordsTableData] =
      chunks;

    const d = new Decoder(commonWordsData);
    const commonWords = [...d.iterArray((d) => d.string())];

    return new InvertedIndex(
      entriesData,
      indexData,
      commonWordsTableData,
      commonWords,
    );
  }

  /**
   * Find a word in the index and return its entry information using binary search.
   */
  private findWordEntry(word: string): WordEntry | null {
    // Encode the search word to UTF-8 bytes for comparison
    const wordBytes = new TextEncoder().encode(word);

    // Calculate the number of entries in the index (each entry is 4 bytes)
    const numEntries = this.indexData.length / 4;

    let left = 0;
    let right = numEntries - 1;

    const indexDecoder = new Decoder(this.indexData);
    const entriesDecoder = new Decoder(this.entriesData);

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      // Seek to the middle entry
      indexDecoder.seek(mid * 4);
      const packed = indexDecoder.uint32();
      const offset = packed & 0xffffff; // Lower 31 bits for offset
      const wordLength = (packed >>> 24) & 0xff; // Upper 8 bits for length

      // Read the word bytes at this offset
      entriesDecoder.seek(offset);
      const indexWordBytes = entriesDecoder.byteString(wordLength);

      // Compare bytes
      const comparison = this.compareBytes(wordBytes, indexWordBytes);

      if (comparison === 0) {
        return { offset, length: wordLength };
      } else if (comparison < 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return null;
  }

  /**
   * Compare two Uint8Array byte arrays lexicographically.
   * Returns -1 if a < b, 0 if a === b, 1 if a > b
   */
  private compareBytes(a: Uint8Array, b: Uint8Array): number {
    const minLength = Math.min(a.length, b.length);

    for (let i = 0; i < minLength; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }

    // If all compared bytes are equal, compare lengths
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
  }

  /**
   * Check if a document has the required common word bitmask.
   */
  private checkCommonWordBitmask(
    docId: number,
    requiredBitmask: number,
  ): boolean {
    const decoder = new Decoder(this.commonWordsTableData);
    decoder.seek(docId * 2);
    const docBitmask = decoder.uint16();
    return (docBitmask & requiredBitmask) === requiredBitmask;
  }

  /**
   * Search for a query and return a generator of document IDs for lazy evaluation.
   */
  *search(query: string): Generator<number, undefined, undefined> {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return;
    }

    if (tokens.length === 1) {
      // Single word query
      yield* this.searchSingleWord(tokens[0]);
    } else {
      // Multi-word query
      yield* this.searchMultiWord(tokens);
    }
  }

  /**
   * Search for a single word and return a generator of document IDs.
   */
  private *searchSingleWord(
    word: string,
  ): Generator<number, undefined, undefined> {
    const entry = this.findWordEntry(word);
    if (!entry) {
      return;
    }

    const decoder = new Decoder(this.entriesData);
    decoder.seek(entry.offset + entry.length); // Skip the word itself

    // Read the posting list using generator
    yield* decoder.iterArray((d) => d.uvarint());
  }

  /**
   * Search for multiple words using generators for memory efficiency.
   */
  private *searchMultiWord(
    tokens: string[],
  ): Generator<number, undefined, undefined> {
    const commonWords = this.commonWords;
    const nonCommonTokens: string[] = [];
    const commonTokenBitmasks: number[] = [];

    // Separate common and non-common tokens
    for (const token of tokens) {
      const commonWordIndex = commonWords.findIndex((w) => w === token);
      if (commonWordIndex !== -1) {
        commonTokenBitmasks.push(1 << commonWordIndex);
      } else {
        nonCommonTokens.push(token);
      }
    }

    // If we have no non-common tokens, search all tokens normally
    if (nonCommonTokens.length === 0) {
      yield* this.intersectSortedGenerators(
        tokens.map((token) => this.searchSingleWord(token)),
      );
      return;
    }

    const candidates = this.intersectSortedGenerators(
      nonCommonTokens.map((token) => this.searchSingleWord(token)),
    );

    // Filter candidates using common word bitmasks
    if (commonTokenBitmasks.length > 0) {
      const combinedBitmask = commonTokenBitmasks.reduce(
        (acc, mask) => acc | mask,
        0,
      );

      for (const docId of candidates) {
        if (this.checkCommonWordBitmask(docId, combinedBitmask)) {
          yield docId;
        }
      }
    } else {
      yield* candidates;
    }
  }

  private *intersectSortedGenerators(
    gens: Generator<number, undefined, undefined>[],
  ) {
    if (gens.length === 0) {
      return;
    }

    const values = gens.map((iter) => iter.next());

    while (true) {
      // Check if any generator is exhausted
      if (values.some((v) => v.done)) {
        return;
      }

      // Find min and max values without allocation
      let minVal = values[0].value!;
      let maxVal = values[0].value!;
      for (let i = 1; i < values.length; i++) {
        const val = values[i].value!;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      // If all values are equal, we have an intersection
      if (minVal === maxVal) {
        yield minVal;
        // Advance all generators
        for (let i = 0; i < values.length; i++) {
          values[i] = gens[i].next();
        }
      } else {
        // Advance generators that don't have the maximum value
        for (let i = 0; i < values.length; i++) {
          if (values[i].value !== maxVal) {
            values[i] = gens[i].next();
          }
        }
      }
    }
  }
}
