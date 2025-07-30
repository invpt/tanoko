import { Decoder, StreamDecoder } from "./decode";

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

  static async load(handle: FileSystemFileHandle): Promise<InvertedIndex> {
    const file = await handle.getFile();
    const fileUrl = URL.createObjectURL(file);
    try {
      const response = await fetch(fileUrl);
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

      const [entriesData, indexData, commonWordsData, commonWordsTableData] = chunks;

      const d = new Decoder(commonWordsData);
      const commonWords = [...d.iterArray((d) => d.string())];

      return new InvertedIndex(entriesData, indexData, commonWordsTableData, commonWords);
    } finally {
      URL.revokeObjectURL(fileUrl);
    }
  }

  *search(query: string): Generator<number, undefined, undefined> {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) {
      return;
    }

    if (tokens.length === 1) {
      yield* this.getOrderedDocuments(this.searchSingleWord(tokens[0]));
    } else {
      yield* this.searchMultiWord(tokens);
    }
  }

  private tokenize(text: string): string[] {
    const removeDiacritics = (char: string): string => DIACRITIC_MAP[char] || char;
    const isEnglishChar = (char: string): boolean => {
      const code = char.charCodeAt(0);
      return (
        (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57)
      );
    };

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

  private findWordEntry(word: string): { offset: number; length: number } | null {
    const wordBytes = new TextEncoder().encode(word);

    const numEntries = this.indexData.length / 4;

    let left = 0;
    let right = numEntries - 1;

    const indexDecoder = new Decoder(this.indexData);
    const entriesDecoder = new Decoder(this.entriesData);

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      indexDecoder.seek(mid * 4);
      const packed = indexDecoder.uint32();
      const offset = packed & 0xffffff; // Lower 24 bits for offset
      const wordLength = (packed >>> 24) & 0xff; // Upper 8 bits for length

      entriesDecoder.seek(offset);
      const indexWordBytes = entriesDecoder.byteString(wordLength);

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

  private compareBytes(a: Uint8Array, b: Uint8Array): number {
    const minLength = Math.min(a.length, b.length);

    for (let i = 0; i < minLength; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }

    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
  }

  private *searchSingleWord(
    word: string,
  ): Generator<{ docId: number; senses: number; length: number }, undefined, undefined> {
    const entry = this.findWordEntry(word);
    if (!entry) {
      return;
    }

    const decoder = new Decoder(this.entriesData);
    decoder.seek(entry.offset + entry.length); // Skip the word itself

    yield* decoder.iterArray((d) => ({
      docId: d.uvarint(),
      senses: d.uint8(),
      length: d.uint8(),
    }));
  }

  private *searchMultiWord(tokens: string[]): Generator<number, undefined, undefined> {
    const commonWords = this.commonWords;
    const nonCommonTokens: string[] = [];
    const commonTokenBitmasks: number[] = [];

    for (const token of tokens) {
      const commonWordIndex = commonWords.findIndex((w) => w === token);
      if (commonWordIndex !== -1) {
        commonTokenBitmasks.push(1 << commonWordIndex);
      } else {
        nonCommonTokens.push(token);
      }
    }

    if (nonCommonTokens.length === 0) {
      yield* this.getOrderedDocuments(
        this.intersect(tokens.map((token) => this.searchSingleWord(token))),
      );
      return;
    }

    const candidates = this.intersect(nonCommonTokens.map((token) => this.searchSingleWord(token)));

    if (commonTokenBitmasks.length > 0) {
      const combinedBitmask = commonTokenBitmasks.reduce((acc, mask) => acc | mask, 0);

      yield* this.getOrderedDocuments(
        candidates.filter((match) => this.checkCommonWordBitmask(match.docId, combinedBitmask)),
      );
    } else {
      yield* this.getOrderedDocuments(candidates);
    }
  }

  private *intersect(
    gens: Generator<{ docId: number; senses: number; length: number }, undefined, undefined>[],
  ): Generator<{ docId: number; senses: number; length: number }, undefined, undefined> {
    if (gens.length === 0) {
      return;
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

  private *getOrderedDocuments(
    matches: IteratorObject<
      { docId: number; senses: number; length: number },
      undefined,
      undefined
    >,
  ): Generator<number, undefined, undefined> {
    const allMatches: { docId: number; senses: number; length: number }[] = [];
    for (const match of matches) {
      allMatches.push(match);
    }

    allMatches.sort((a, b) => {
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

    for (const match of allMatches) {
      yield match.docId;
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
