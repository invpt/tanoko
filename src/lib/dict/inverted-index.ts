import { Decoder, StreamDecoder } from "./decode";
import { FileReader } from "./storage-interfaces";

interface SearchMatch {
  docId: number;
  senses: number;
  length: number;
  isPrefix: boolean;
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
    if (tokens.length === 0) return;

    let { commonTokens, nonCommonTokens } = this.categorizeTokens(tokens);
    if (nonCommonTokens.length == 0) {
      nonCommonTokens = commonTokens;
      commonTokens = [];
    }

    const commonWordsMask = this.buildCommonWordsMask(commonTokens);
    const matches = this.searchWords(nonCommonTokens, commonWordsMask);
    if (matches.length === 0) return;

    this.sortMatches(matches);

    for (const match of matches) {
      yield match.docId;
    }
  }

  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    let currentToken = "";

    for (const char of text) {
      const code = char.charCodeAt(0);
      const isAlphaNum =
        (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57);

      if (isAlphaNum) {
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

  private categorizeTokens(tokens: string[]): {
    commonTokens: string[];
    nonCommonTokens: string[];
  } {
    const commonTokens: string[] = [];
    const nonCommonTokens: string[] = [];

    for (const token of tokens) {
      if (this.commonWords.includes(token)) {
        commonTokens.push(token);
      } else {
        nonCommonTokens.push(token);
      }
    }

    return { commonTokens, nonCommonTokens };
  }

  private searchWords(tokens: string[], commonWordsMask: number): SearchMatch[] {
    if (tokens.length === 0) {
      return [];
    }

    const exactTokens = tokens.slice(0, -1);
    const lastToken = tokens[tokens.length - 1];

    if (exactTokens.length === 0) {
      // Only one token - filter, deduplicate, then materialize
      const generator = this.findWordMatches(lastToken, true);
      const filteredGenerator =
        commonWordsMask === 0 ? generator : this.filterByCommonWords(generator, commonWordsMask);
      return this.deduplicateMatches(filteredGenerator);
    }

    // Multiple tokens - use generators for exact matches
    const exactGenerators = exactTokens.map((token) => this.findWordMatches(token, false));

    // Intersect exact matches first (they're already sorted by docId)
    const exactMatches = this.intersectExactMatches(exactGenerators);

    // Filter by common words before prefix intersection
    const filteredExactMatches =
      commonWordsMask === 0
        ? exactMatches
        : this.filterByCommonWords(exactMatches, commonWordsMask);

    // Then intersect with prefix matches
    return this.intersectWithPrefix(filteredExactMatches, lastToken);
  }

  private *findWordMatches(
    word: string,
    allowPrefix: boolean,
  ): Generator<SearchMatch, undefined, undefined> {
    const wordBytes = new TextEncoder().encode(word);
    const startIndex = this.findWordIndex(wordBytes);

    if (startIndex === -1) return;

    const numEntries = this.indexData.length / 4;
    const indexDecoder = new Decoder(this.indexData);
    const entriesDecoder = new Decoder(this.entriesData);

    for (let i = startIndex; i < numEntries; i++) {
      const { offset, wordLength, indexWord } = this.readIndexEntry(
        i,
        indexDecoder,
        entriesDecoder,
      );

      if (!this.wordMatches(indexWord, wordBytes, allowPrefix)) break;

      const isExact = indexWord.length === wordBytes.length;
      if (!allowPrefix && !isExact) continue;

      // Read document entries for this word
      entriesDecoder.seek(offset + wordLength);
      yield* entriesDecoder.iterArray((d) => ({
        docId: d.uvarint(),
        senses: d.uint8(),
        length: d.uint8(),
        isPrefix: !isExact,
      }));

      if (!allowPrefix && isExact) break;
    }
  }

  private findWordIndex(wordBytes: Uint8Array): number {
    const numEntries = this.indexData.length / 4;
    const indexDecoder = new Decoder(this.indexData);
    const entriesDecoder = new Decoder(this.entriesData);

    let left = 0;
    let right = numEntries - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const { indexWord } = this.readIndexEntry(mid, indexDecoder, entriesDecoder);

      const cmp = this.compareBytes(wordBytes, indexWord);

      if (cmp <= 0) {
        if (this.wordMatches(indexWord, wordBytes, true)) {
          result = mid;
        }
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return result;
  }

  private readIndexEntry(index: number, indexDecoder: Decoder, entriesDecoder: Decoder) {
    indexDecoder.seek(index * 4);
    const packed = indexDecoder.uint32();
    const offset = packed & 0xffffff;
    const wordLength = (packed >>> 24) & 0xff;

    entriesDecoder.seek(offset);
    const indexWord = entriesDecoder.byteString(wordLength);

    return { offset, wordLength, indexWord };
  }

  private wordMatches(word: Uint8Array, target: Uint8Array, allowPrefix: boolean): boolean {
    if (target.length > word.length) return false;

    for (let i = 0; i < target.length; i++) {
      if (word[i] !== target[i]) return false;
    }

    return allowPrefix || word.length === target.length;
  }

  private compareBytes(a: Uint8Array, b: Uint8Array): number {
    const minLength = Math.min(a.length, b.length);

    for (let i = 0; i < minLength; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }

    return a.length - b.length;
  }

  private *intersectExactMatches(
    generators: Generator<SearchMatch, undefined, undefined>[],
  ): Generator<SearchMatch, undefined, undefined> {
    if (generators.length === 0) return;
    if (generators.length === 1) {
      yield* generators[0];
      return;
    }

    // Since individual word results are already sorted by docId, we can do streaming intersection
    const iterators = generators.map((gen) => ({ iter: gen, current: gen.next() }));

    while (iterators.every((it) => !it.current.done)) {
      let minDocId = iterators[0].current.value!.docId;
      let maxDocId = minDocId;
      for (let i = 1; i < iterators.length; i++) {
        const docId = iterators[i].current.value!.docId;
        if (docId < minDocId) {
          minDocId = docId;
        }
        if (docId > maxDocId) {
          maxDocId = docId;
        }
      }

      if (minDocId === maxDocId) {
        // All have same docId - check sense overlap
        let commonSenses = iterators[0].current.value!.senses;
        let maxLength = iterators[0].current.value!.length;

        for (let i = 1; i < iterators.length; i++) {
          const value = iterators[i].current.value!;
          commonSenses &= value.senses;
          maxLength = Math.max(maxLength, value.length);
        }

        if (commonSenses !== 0) {
          yield {
            docId: minDocId,
            senses: commonSenses,
            length: maxLength,
            isPrefix: false, // exact matches only here
          };
        }

        // Advance all iterators
        for (let i = 0; i < iterators.length; i++) {
          iterators[i].current = iterators[i].iter.next();
        }
      } else {
        // Advance iterators pointing to minDocId
        for (let i = 0; i < iterators.length; i++) {
          if (iterators[i].current.value!.docId === minDocId) {
            iterators[i].current = iterators[i].iter.next();
          }
        }
      }
    }
  }

  private intersectWithPrefix(
    exactMatches: Generator<SearchMatch, undefined, undefined>,
    prefixToken: string,
  ): SearchMatch[] {
    // Materialize exact matches (we need to scan them multiple times)
    const exactArray = [...exactMatches];
    if (exactArray.length === 0) return [];

    // Stream through prefix matches without materializing them all
    const prefixGenerator = this.findWordMatches(prefixToken, true);

    // Generator that yields intersection results
    const intersectionGenerator = this.intersectWithPrefixGenerator(exactArray, prefixGenerator);

    // Deduplicate and return
    return this.deduplicateMatches(intersectionGenerator);
  }

  private *intersectWithPrefixGenerator(
    exactArray: SearchMatch[],
    prefixGenerator: Generator<SearchMatch, undefined, undefined>,
  ): Generator<SearchMatch, undefined, undefined> {
    let exactIndex = 0;
    let lastPrefixDocId = -1;

    for (const prefixMatch of prefixGenerator) {
      // Reset exact index if we've moved to a new word (docId went down)
      if (prefixMatch.docId < lastPrefixDocId) {
        exactIndex = 0;
      }
      lastPrefixDocId = prefixMatch.docId;

      // Advance exact index to find matching docId
      while (exactIndex < exactArray.length && exactArray[exactIndex].docId < prefixMatch.docId) {
        exactIndex++;
      }

      // Check for match
      if (exactIndex < exactArray.length && exactArray[exactIndex].docId === prefixMatch.docId) {
        const exactMatch = exactArray[exactIndex];
        const overlap = exactMatch.senses & prefixMatch.senses;
        if (overlap !== 0) {
          yield {
            docId: exactMatch.docId,
            senses: overlap,
            length: Math.max(exactMatch.length, prefixMatch.length),
            isPrefix: prefixMatch.isPrefix,
          };
        }
      }
    }
  }

  private buildCommonWordsMask(commonTokens: string[]): number {
    let mask = 0;
    for (const token of commonTokens) {
      const index = this.commonWords.indexOf(token);
      if (index !== -1) {
        mask |= 1 << index;
      }
    }
    return mask;
  }

  private *filterByCommonWords(
    matches: Generator<SearchMatch, undefined, undefined>,
    requiredMask: number,
  ): Generator<SearchMatch, undefined, undefined> {
    for (const match of matches) {
      if (this.hasCommonWords(match.docId, requiredMask)) {
        yield match;
      }
    }
  }

  private deduplicateMatches(matches: Generator<SearchMatch, undefined, undefined>): SearchMatch[] {
    const seenDocIds = new Map<number, SearchMatch>();

    for (const match of matches) {
      const existing = seenDocIds.get(match.docId);
      if (existing) {
        // Combine with existing result for this docId
        seenDocIds.set(match.docId, {
          docId: match.docId,
          senses:
            !existing.isPrefix && match.isPrefix ? existing.senses : existing.senses | match.senses,
          length:
            !existing.isPrefix && match.isPrefix
              ? existing.length
              : Math.max(existing.length, match.length),
          isPrefix: existing.isPrefix && match.isPrefix,
        });
      } else {
        // First result for this docId
        seenDocIds.set(match.docId, match);
      }
    }

    return Array.from(seenDocIds.values());
  }

  private hasCommonWords(docId: number, requiredMask: number): boolean {
    const decoder = new Decoder(this.commonWordsTableData);
    decoder.seek(docId * 2);
    const docMask = decoder.uint16();
    return (docMask & requiredMask) === requiredMask;
  }

  private sortMatches(matches: SearchMatch[]): void {
    matches.sort((a, b) => {
      // Exact matches before prefix matches
      if (a.isPrefix !== b.isPrefix) {
        return a.isPrefix ? 1 : -1;
      }

      // Lower sense indices first
      const aLowest = this.getLowestSenseIndex(a.senses);
      const bLowest = this.getLowestSenseIndex(b.senses);
      if (aLowest !== bLowest) {
        return aLowest - bLowest;
      }

      // Shorter matches first
      if (a.length !== b.length) {
        return a.length - b.length;
      }

      // Document ID as tiebreaker
      return a.docId - b.docId;
    });
  }

  private getLowestSenseIndex(senses: number): number {
    if (senses === 0) return Infinity;

    let index = 0;
    while ((senses & (1 << index)) === 0) {
      index++;
    }
    return index;
  }
}
