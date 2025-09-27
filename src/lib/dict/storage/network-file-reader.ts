import { FileReader } from "./interfaces";

export class NetworkFileReader implements FileReader {
  constructor(
    private url: string,
    until?: Promise<FileReader>,
  ) {
    until?.then((r) => {
      this.reader = r;
    });
  }

  private reader: FileReader | null = null;

  async read(start?: number, end?: number): Promise<ArrayBuffer> {
    if (this.reader !== null) {
      return this.reader.read(start, end);
    }

    const headers: Record<string, string> = {};

    // Add Range header for partial content requests
    if (start !== undefined || end !== undefined) {
      const rangeStart = start ?? 0;
      const rangeEnd = end !== undefined ? end : "";
      headers["Range"] = `bytes=${rangeStart}-${rangeEnd}`;
    }

    const response = await fetch(this.url, { headers });

    if (!response.ok) {
      throw new Error(`Network request failed: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  async stream(): Promise<ReadableStream<Uint8Array>> {
    if (this.reader !== null) {
      return this.reader.stream();
    }

    const response = await fetch(this.url);

    if (!response.ok) {
      throw new Error(`Network request failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    return response.body;
  }
}
