import { FileReader } from "./storage-interfaces";

export class BlobFileReader implements FileReader {
  constructor(private blob: Blob) {}

  async read(start?: number, end?: number): Promise<ArrayBuffer> {
    return await this.blob.slice(start, end).arrayBuffer();
  }

  stream(start?: number, end?: number): ReadableStream {
    return this.blob.slice(start, end).stream();
  }
}
