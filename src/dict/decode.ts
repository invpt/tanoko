/**
 * Decodes a stream of varint-prefixed chunks as produced by the Go Stream encoder.
 * Each chunk in the stream is prefixed by a varint indicating its length.
 */
export class StreamDecoder implements AsyncIterable<Uint8Array> {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer: Uint8Array;
  private bufferOffset: number;
  private bufferEnd: number;
  private closed: boolean;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
    this.buffer = new Uint8Array(0);
    this.bufferOffset = 0;
    this.bufferEnd = 0;
    this.closed = false;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    while (!this.closed) {
      try {
        const length = await this.readVarint();
        if (length === null) {
          this.close();
          break;
        }

        const chunkBytes = await this.readBytes(length);
        yield chunkBytes;
      } catch (error) {
        this.closed = true;
        throw error;
      }
    }
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      this.reader.releaseLock();
    }
  }

  private async readVarint(): Promise<number | null> {
    let result = 0;
    let shift = 0;

    while (true) {
      const byte = await this.readByte();
      if (byte === null) {
        if (shift === 0) {
          return null;
        } else {
          throw new Error("Unexpected end of stream");
        }
      }

      result |= (byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        break;
      }

      shift += 7;

      if (shift >= 32) {
        throw new Error("Varint too long");
      }
    }

    return result;
  }

  private async readByte(): Promise<number | null> {
    if (!(await this.more())) {
      return null;
    }

    return this.buffer[this.bufferOffset++];
  }

  private async readBytes(length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    let resultOffset = 0;

    while (resultOffset < length) {
      if (!(await this.more())) {
        throw new Error("Unexpected end of stream");
      }

      const available = this.bufferEnd - this.bufferOffset;
      const needed = length - resultOffset;
      const toCopy = Math.min(available, needed);

      result.set(
        this.buffer.slice(this.bufferOffset, this.bufferOffset + toCopy),
        resultOffset,
      );

      this.bufferOffset += toCopy;
      resultOffset += toCopy;
    }

    return result;
  }

  private async more(): Promise<boolean> {
    if (this.bufferOffset >= this.bufferEnd) {
      const readResult = await this.reader.read();
      if (readResult.done) {
        return false;
      }
      this.buffer = readResult.value;
      this.bufferOffset = 0;
      this.bufferEnd = this.buffer.length;
      return true;
    } else {
      return true;
    }
  }
}

export class Decoder {
  private bytes: Uint8Array;
  private offset: number;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.offset = 0;
  }

  array<T>(decoder: (d: Decoder) => T): T[] {
    const length = this.varint();
    const items: T[] = [];
    for (let i = 0; i < length; i++) {
      items.push(decoder(this));
    }
    return items;
  }

  string(): string {
    const length = this.varint();
    const start = this.offset;
    this.offset += length;

    if (this.offset > this.bytes.length) {
      throw new Error("Not enough bytes to read string");
    }

    return new TextDecoder().decode(this.bytes.slice(start, this.offset));
  }

  int(): number {
    const zigzag = this.varint();
    return this.unzigzag(zigzag);
  }

  uint(): number {
    return this.varint();
  }

  private varint(): number {
    let result = 0;
    let shift = 0;

    while (this.offset < this.bytes.length) {
      const byte = this.bytes[this.offset++];
      result |= (byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        break;
      }

      shift += 7;

      if (shift >= 32) {
        throw new Error("Varint too long");
      }
    }

    return result;
  }

  private unzigzag(zigzag: number): number {
    return (zigzag >>> 1) ^ -(zigzag & 1);
  }
}
