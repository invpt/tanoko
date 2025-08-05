import { Decoder } from "./decode";
import { FileReader } from "./storage-interfaces";

export class WordLoader<T> {
  private dataReader: FileReader;
  private offsetsDecoder: Decoder;
  private parseFunction: (rank: number, decoder: Decoder) => T | undefined;

  private constructor(
    dataReader: FileReader,
    offsetsDecoder: Decoder,
    parseFunction: (rank: number, decoder: Decoder) => T | undefined,
  ) {
    this.dataReader = dataReader;
    this.offsetsDecoder = offsetsDecoder;
    this.parseFunction = parseFunction;
  }

  static async load<T>(
    dataReader: FileReader,
    offsetsReader: FileReader,
    parseFunction: (rank: number, decoder: Decoder) => T | undefined,
  ): Promise<WordLoader<T>> {
    const offsetsBuffer = await offsetsReader.read();
    const offsetsDecoder = new Decoder(new Uint8Array(offsetsBuffer));

    return new WordLoader(dataReader, offsetsDecoder, parseFunction);
  }

  async loadEntry(id: number): Promise<T | undefined> {
    const startOffset = this.getOffset(id);
    const endOffset = this.getOffset(id + 1);
    const length = endOffset - startOffset;

    if (length <= 0) return undefined;

    const buffer = await this.dataReader.read(startOffset, endOffset);

    return this.parseFunction(id, new Decoder(new Uint8Array(buffer)));
  }

  private getOffset(index: number): number {
    this.offsetsDecoder.seek(index * 4);
    return this.offsetsDecoder.uint32();
  }
}
