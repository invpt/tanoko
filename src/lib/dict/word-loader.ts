import { Decoder } from "./decode";

export class WordLoader<T> {
  private dataFile: File;
  private offsetsDecoder: Decoder;
  private parseFunction: (decoder: Decoder) => T | undefined;

  private constructor(
    dataFile: File,
    offsetsDecoder: Decoder,
    parseFunction: (decoder: Decoder) => T | undefined,
  ) {
    this.dataFile = dataFile;
    this.offsetsDecoder = offsetsDecoder;
    this.parseFunction = parseFunction;
  }

  static async load<T>(
    dataHandle: FileSystemFileHandle,
    offsetsHandle: FileSystemFileHandle,
    parseFunction: (decoder: Decoder) => T | undefined,
  ): Promise<WordLoader<T>> {
    const offsetsFile = await offsetsHandle.getFile();
    const offsetsBuffer = await offsetsFile.arrayBuffer();
    const offsetsDecoder = new Decoder(new Uint8Array(offsetsBuffer));

    const dataFile = await dataHandle.getFile();
    return new WordLoader(dataFile, offsetsDecoder, parseFunction);
  }

  async loadEntry(id: number): Promise<T | undefined> {
    const startOffset = this.getOffset(id);
    const endOffset = this.getOffset(id + 1);
    const length = endOffset - startOffset;

    if (length <= 0) return undefined;

    const slice = this.dataFile.slice(startOffset, endOffset);
    const buffer = await slice.arrayBuffer();

    return this.parseFunction(new Decoder(new Uint8Array(buffer)));
  }

  private getOffset(index: number): number {
    this.offsetsDecoder.seek(index * 4);
    return this.offsetsDecoder.uint32();
  }
}
