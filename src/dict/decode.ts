export enum SeekOrigin {
  Begin = 0,
  Current = 1,
  End = 2,
}

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
    let chunkIdx = 0;
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
  private view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.offset = 0;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  seek(offset: number, origin: SeekOrigin = SeekOrigin.Begin) {
    switch (origin) {
      case SeekOrigin.Begin:
        this.offset = offset;
        break;
      case SeekOrigin.Current:
        this.offset += offset;
        break;
      case SeekOrigin.End:
        this.offset = this.bytes.length + offset;
        break;
    }
  }

  currentOffset(): number {
    return this.offset;
  }

  rest(): Uint8Array {
    return this.bytes.slice(this.offset);
  }

  *iterArray<T>(decoder: (d: Decoder) => T): Generator<T> {
    const length = this.uvarint();

    for (let i = 0; i < length; i++) {
      const decoded = decoder(this);
      const offset = this.offset;
      yield decoded;
      this.seek(offset); // protect against people doing stuff in between
    }
  }

  string(length?: number): string {
    length ??= this.uvarint();
    const start = this.offset;
    this.offset += length;

    if (this.offset > this.bytes.length) {
      throw new Error(
        `Not enough bytes to read string at offset ${this.offset} with length ${length}`,
      );
    }

    return new TextDecoder().decode(this.bytes.slice(start, this.offset));
  }

  byteString(length?: number): Uint8Array {
    length ??= this.uvarint();
    const start = this.offset;
    this.offset += length;

    if (this.offset > this.bytes.length) {
      throw new Error(
        `Not enough bytes to read byte string at offset ${this.offset} with length ${length}`,
      );
    }

    return this.bytes.slice(start, this.offset);
  }

  varint(): number {
    const zigzag = this.uvarint();
    return this.unzigzag(zigzag);
  }

  uvarint(): number {
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

  int8(): number {
    this.checkBounds(1);
    return this.view.getInt8(this.offset++);
  }

  uint8(): number {
    this.checkBounds(1);
    return this.view.getUint8(this.offset++);
  }

  int16(): number {
    this.checkBounds(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  uint16(): number {
    this.checkBounds(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  int32(): number {
    this.checkBounds(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  uint32(): number {
    this.checkBounds(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  int64(): bigint {
    this.checkBounds(8);
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  uint64(): bigint {
    this.checkBounds(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  private checkBounds(bytes: number): void {
    if (this.offset + bytes > this.bytes.length) {
      throw new Error(`Not enough bytes to read ${bytes} bytes`);
    }
  }
}
