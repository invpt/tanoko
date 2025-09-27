import { FileReader } from "./interfaces";

export class BlobFileReader implements FileReader {
  constructor(private blob: Blob) {}

  async read(start?: number, end?: number): Promise<ArrayBuffer> {
    return await this.blob.slice(start, end).arrayBuffer();
  }

  async stream(start?: number, end?: number): Promise<ReadableStream> {
    return this.blob.slice(start, end).stream();
  }
}
