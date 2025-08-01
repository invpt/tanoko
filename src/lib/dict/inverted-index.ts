import { Decoder, StreamDecoder } from "./decode";
import { FileReader } from "./storage-interfaces";

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

  static async load(fileReader: FileReader): Promise<InvertedIndex> {
    const decoder = new StreamDecoder(fileReader.stream());
    const chunks: Uint8Array[] = [];

    for await (const chunk of decoder) {
      chunks.push(chunk);
    }

    if (chunks.length !== 4) {
      throw new Error(`Expected 4 chunks, got ${chunks.length}`);
    }

    const [entriesData, indexData, commonWordsData, commonWordsTableData] = chunks;

    const d = new Decoder(commonWordsData);
    const commonWords = [...d.iterArray((d) => d.string())];

    return new InvertedIndex(entriesData, indexData, commonWordsTableData, commonWords);
  }

  *search(query: string): Generator<number, undefined, undefined> {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) {
      return;
    }

    const yielded = new Set<number>();
    for (const id of this.searchMultiWord(tokens)) {
      if (!yielded.has(id)) {
        yielded.add(id);
        yield id;
      }
    }
  }

  private tokenize(text: string): string[] {
    const isEnglishChar = (char: string): boolean => {
      const code = char.charCodeAt(0);
      return (
        (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57)
      );
    };

    const tokens = [];
    let currentToken = "";

    for (const char of text) {
      if (isEnglishChar(char)) {
        currentToken += char.toLowerCase();
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

  private *searchMultiWord(tokens: string[]): Generator<number, undefined, undefined> {
    // Separate tokens into common and non-common words
    const nonCommonTokens: string[] = [];
    let commonBitmask = 0;

    for (const token of tokens) {
      const commonWordIndex = this.commonWords.findIndex((w) => w === token);
      if (commonWordIndex !== -1) {
        commonBitmask |= 1 << commonWordIndex;
      } else {
        nonCommonTokens.push(token);
      }
    }

    // Split non-common tokens: all but last are exact, last is prefix
    const exactTokens = nonCommonTokens.slice(0, -1);
    const prefixToken =
      nonCommonTokens.length > 0 ? nonCommonTokens[nonCommonTokens.length - 1] : undefined;

    // Get candidates from each source
    let candidates: Generator<
      { docId: number; senses: number; length: number; isPrefix: boolean },
      undefined,
      undefined
    >;

    if (nonCommonTokens.length === 0) {
      // Only common words - search them as exact matches
      candidates = this.intersectExactMatches(
        tokens.map((token) => this.searchWord(token, "exact")),
      );
    } else if (exactTokens.length === 0) {
      // Only one token (prefix)
      candidates = this.searchWord(prefixToken!, "both");
    } else if (prefixToken === undefined) {
      // Only exact tokens
      candidates = this.intersectExactMatches(
        exactTokens.map((token) => this.searchWord(token, "exact")),
      );
    } else {
      // Both exact and prefix tokens - intersect them
      const exactCandidates = this.intersectExactMatches(
        exactTokens.map((token) => this.searchWord(token, "exact")),
      );
      candidates = this.intersectWithPrefix(exactCandidates, prefixToken);
    }

    // Filter by common words if needed
    const filteredCandidates =
      commonBitmask !== 0 ? this.filterByCommonWords(candidates, commonBitmask) : candidates;

    // Convert to array and sort
    const matchArr = [...filteredCandidates];
    this.sortMatches(matchArr);

    for (const match of matchArr) {
      yield match.docId;
    }
  }

  private *intersectWithPrefix(
    exactCandidates: Generator<
      { docId: number; senses: number; length: number; isPrefix: boolean },
      undefined,
      undefined
    >,
    prefixToken: string,
  ): Generator<
    { docId: number; senses: number; length: number; isPrefix: boolean },
    undefined,
    undefined
  > {
    const exactMatches = [...exactCandidates];
    if (exactMatches.length === 0) return;

    const prefixMatches = [...this.searchWord(prefixToken, "both")];

    // Sort prefix matches by docId (exactMatches should already be sorted that way)
    prefixMatches.sort((a, b) => a.docId - b.docId);

    let exactIndex = 0;
    let prefixIndex = 0;

    while (exactIndex < exactMatches.length && prefixIndex < prefixMatches.length) {
      const exactMatch = exactMatches[exactIndex];
      const prefixMatch = prefixMatches[prefixIndex];

      if (exactMatch.docId === prefixMatch.docId) {
        // Check if senses overlap
        const overlap = exactMatch.senses & prefixMatch.senses;
        if (overlap !== 0) {
          yield {
            docId: exactMatch.docId,
            senses: overlap,
            length: Math.max(exactMatch.length, prefixMatch.length),
            isPrefix: prefixMatch.isPrefix,
          };
        }
        exactIndex++;
        prefixIndex++;
      } else if (exactMatch.docId < prefixMatch.docId) {
        exactIndex++;
      } else {
        prefixIndex++;
      }
    }
  }

  private binarySearchWord(
    target: Uint8Array,
    mode: "exact" | "prefix",
  ): { found: boolean; index: number; offset?: number; length?: number } {
    const numEntries = this.indexData.length / 4;
    const indexDecoder = new Decoder(this.indexData);
    const entriesDecoder = new Decoder(this.entriesData);

    let left = 0;
    let right = numEntries - 1;
    let result = { found: false, index: -1 };

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      indexDecoder.seek(mid * 4);
      const packed = indexDecoder.uint32();
      const offset = packed & 0xffffff;
      const wordLength = (packed >>> 24) & 0xff;

      entriesDecoder.seek(offset);
      const indexWordBytes = entriesDecoder.byteString(wordLength);

      const comparison = this.compareBytes(target, indexWordBytes, mode);

      if (comparison === 0) {
        if (mode === "exact") {
          return { found: true, index: mid, offset, length: wordLength };
        } else {
          // For prefix search, find the first match
          result = { found: true, index: mid };
          right = mid - 1;
        }
      } else if (comparison < 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return result;
  }

  private compareBytes(a: Uint8Array, b: Uint8Array, mode: "exact" | "prefix" = "exact"): number {
    const minLength = Math.min(a.length, b.length);

    for (let i = 0; i < minLength; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }

    if (mode === "prefix") {
      // For prefix mode, if we've matched the entire prefix, it's a match
      return a.length <= b.length ? 0 : 1;
    }

    // For exact mode, lengths must match
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
  }

  private *searchWord(
    word: string,
    mode: "exact" | "prefix" | "both",
  ): Generator<
    { docId: number; senses: number; length: number; isPrefix: boolean },
    undefined,
    undefined
  > {
    const wordBytes = new TextEncoder().encode(word);
    const result = this.binarySearchWord(wordBytes, "prefix");

    if (!result.found) {
      return;
    }

    const numEntries = this.indexData.length / 4;
    const indexDecoder = new Decoder(this.indexData);
    const entriesDecoder = new Decoder(this.entriesData);

    // Iterate from the first match onwards while the prefix matches
    for (let i = result.index; i < numEntries; i++) {
      indexDecoder.seek(i * 4);
      const packed = indexDecoder.uint32();
      const offset = packed & 0xffffff;
      const wordLength = (packed >>> 24) & 0xff;

      entriesDecoder.seek(offset);
      const indexWordBytes = entriesDecoder.byteString(wordLength);

      // Check if this word still starts with our prefix
      if (!this.startsWithPrefix(indexWordBytes, wordBytes)) {
        break;
      }

      const isExactMatch = indexWordBytes.length === wordBytes.length;

      // Handle different modes
      if (mode === "exact" && !isExactMatch) {
        continue;
      }
      if (mode === "prefix" && isExactMatch) {
        continue;
      }

      // For "both" mode or matching mode, yield the documents
      entriesDecoder.seek(offset + wordLength);
      for (const doc of entriesDecoder.iterArray((d) => ({
        docId: d.uvarint(),
        senses: d.uint8(),
        length: d.uint8(),
      }))) {
        yield { ...doc, isPrefix: !isExactMatch };
      }

      // For exact mode, stop after first exact match
      if (mode === "exact" && isExactMatch) {
        break;
      }
    }
  }

  private startsWithPrefix(word: Uint8Array, prefix: Uint8Array): boolean {
    if (prefix.length > word.length) return false;

    for (let i = 0; i < prefix.length; i++) {
      if (word[i] !== prefix[i]) return false;
    }

    return true;
  }

  private sortMatches(
    matches: Array<{ docId: number; senses: number; length: number; isPrefix?: boolean }>,
  ) {
    matches.sort((a, b) => {
      // Exact matches come before prefix matches
      if ((a.isPrefix ?? false) !== (b.isPrefix ?? false)) {
        return a.isPrefix ? 1 : -1;
      }

      const aLowestSense = this.getLowestSenseIndex(a.senses);
      const bLowestSense = this.getLowestSenseIndex(b.senses);

      if (aLowestSense !== bLowestSense) {
        return aLowestSense - bLowestSense;
      }

      if (a.length !== b.length) {
        return a.length - b.length;
      }

      return a.docId - b.docId;
    });
  }

  private *filterByCommonWords(
    matches: IteratorObject<
      { docId: number; senses: number; length: number; isPrefix: boolean },
      undefined,
      undefined
    >,
    requiredBitmask: number,
  ): Generator<
    { docId: number; senses: number; length: number; isPrefix: boolean },
    undefined,
    undefined
  > {
    for (const match of matches) {
      if (this.checkCommonWordBitmask(match.docId, requiredBitmask)) {
        yield match;
      }
    }
  }

  private *intersectExactMatches(
    gens: Generator<
      { docId: number; senses: number; length: number; isPrefix: boolean },
      undefined,
      undefined
    >[],
  ): Generator<
    { docId: number; senses: number; length: number; isPrefix: boolean },
    undefined,
    undefined
  > {
    if (gens.length === 0) {
      return;
    }

    if (gens.length === 1) {
      yield* gens[0];
    }

    const values = gens.map((iter) => iter.next());

    while (true) {
      if (values.some((v) => v.done)) {
        return;
      }

      let minDocId = values[0].value!.docId;
      let maxDocId = values[0].value!.docId;
      for (let i = 1; i < values.length; i++) {
        const docId = values[i].value!.docId;
        if (docId < minDocId) minDocId = docId;
        if (docId > maxDocId) maxDocId = docId;
      }

      if (minDocId === maxDocId) {
        let commonSenses = values[0].value!.senses;
        let maxLength = values[0].value!.length;
        for (let i = 1; i < values.length; i++) {
          commonSenses &= values[i].value!.senses;
          maxLength = Math.max(maxLength, values[i].value!.length);
        }

        if (commonSenses !== 0) {
          yield {
            docId: minDocId,
            senses: commonSenses,
            length: maxLength,
            isPrefix: false,
          };
        }

        for (let i = 0; i < values.length; i++) {
          values[i] = gens[i].next();
        }
      } else {
        for (let i = 0; i < values.length; i++) {
          if (values[i].value!.docId !== maxDocId) {
            values[i] = gens[i].next();
          }
        }
      }
    }
  }

  private getLowestSenseIndex(senses: number): number {
    if (senses === 0) return Infinity;

    let index = 0;
    while ((senses & (1 << index)) === 0) {
      index++;
    }
    return index;
  }

  private checkCommonWordBitmask(docId: number, requiredBitmask: number): boolean {
    const decoder = new Decoder(this.commonWordsTableData);
    decoder.seek(docId * 2);
    const docBitmask = decoder.uint16();
    return (docBitmask & requiredBitmask) === requiredBitmask;
  }
}
