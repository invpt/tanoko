import { LRUCache } from "lru-cache";
import { Decoder } from "./decode";
import { FileReader } from "../storage/interfaces";

export class WordLoader<T extends {}> {
  private dataReader: FileReader;
  private offsetsDecoder: Decoder;
  private parseFunction: (rank: number, decoder: Decoder) => T | undefined;
  private cache: LRUCache<number, T>;

  private constructor(
    dataReader: FileReader,
    offsetsDecoder: Decoder,
    parseFunction: (rank: number, decoder: Decoder) => T | undefined,
    cacheSize: number = 100,
  ) {
    this.dataReader = dataReader;
    this.offsetsDecoder = offsetsDecoder;
    this.parseFunction = parseFunction;
    this.cache = new LRUCache<number, T>({ max: cacheSize });
  }

  static async load<T extends {}>(
    dataReader: FileReader,
    offsetsReader: FileReader,
    parseFunction: (rank: number, decoder: Decoder) => T | undefined,
    cacheSize?: number,
  ): Promise<WordLoader<T>> {
    const offsetsBuffer = await offsetsReader.read();
    const offsetsDecoder = new Decoder(new Uint8Array(offsetsBuffer));

    return new WordLoader(dataReader, offsetsDecoder, parseFunction, cacheSize);
  }

  async loadEntry(id: number): Promise<T | undefined> {
    const cached = this.cache.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const startOffset = this.getOffset(id);
    const endOffset = this.getOffset(id + 1);
    const length = endOffset - startOffset;

    if (length <= 0) return undefined;

    const buffer = await this.dataReader.read(startOffset, endOffset);
    const entry = this.parseFunction(id, new Decoder(new Uint8Array(buffer)));
    if (entry !== undefined) {
      this.cache.set(id, entry);
    }

    return entry;
  }

  private getOffset(index: number): number {
    this.offsetsDecoder.seek(index * 4);
    return this.offsetsDecoder.uint32();
  }
}
