import { Decoder } from "./decode.js";

class RadixTreeIndex {
  private decoder: Decoder;
  private rootOffset: number;

  private constructor(decoder: Decoder, rootOffset: number) {
    this.decoder = decoder;
    this.rootOffset = rootOffset;
  }

  static async load(url: string) {
    const resp = await fetch(url);

    const data = new Uint8Array(await resp.arrayBuffer());
    const decoder = new Decoder(data);
    decoder.seek(data.length - 4);
    const rootOffset = decoder.uint32();
    decoder.seek(0);

    return new RadixTreeIndex(decoder, rootOffset);
  }

  *search(query: string): Generator<number> {
    if (query.length === 0) {
      return;
    }

    const queryBytes = new TextEncoder().encode(query);

    yield* this.traverseNode(this.rootOffset, queryBytes);
  }

  private *traverseNode(
    nodeOffset: number,
    query: Uint8Array,
  ): Generator<number> {
    this.decoder.seek(nodeOffset);

    const edge = this.decoder.byteString();

    if (
      query.length > edge.length &&
      bytesEqual(query.slice(0, edge.length), edge)
    ) {
      for (const child of this.iterChildren()) {
        if (query[edge.length] === child.firstByte) {
          yield* this.traverseNode(child.offset, query.slice(edge.length));
          break; // there cannot be multiple children with the same first byte
        }
      }
    } else if (
      edge.length >= query.length &&
      bytesEqual(edge.slice(0, query.length), query)
    ) {
      yield* this.traverseAllDescendants(nodeOffset);
    }
  }

  private *traverseAllDescendants(nodeOffset: number): Generator<number> {
    this.decoder.seek(nodeOffset);

    this.decoder.byteString(); // ignore edge bytes

    const children = [...this.iterChildren()];

    yield* this.iterResults();

    for (const child of children) {
      yield* this.traverseAllDescendants(child.offset);
    }
  }

  private *iterChildren(): Generator<{ firstByte: number; offset: number }> {
    yield* this.decoder.iterArray((d) => ({
      firstByte: d.uint8(),
      offset: d.uvarint(),
    }));
  }

  private *iterResults(): Generator<number> {
    yield* this.decoder.iterArray((d) => d.uvarint());
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export { RadixTreeIndex };
