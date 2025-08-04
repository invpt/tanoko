import { Query, QueryState } from "../query";
import { Decoder } from "./decode";
import { FileReader } from "./storage-interfaces";

type QueueItem = {
  length: number;
  offset: number;
  edgeLen: number;
  state: QueryState;
};

export class RadixTree {
  private decoder: Decoder;
  private rootOffset: number;
  private rootEdgeLen: number;

  private constructor(decoder: Decoder, rootOffset: number, rootEdgeLen: number) {
    this.decoder = decoder;
    this.rootOffset = rootOffset;
    this.rootEdgeLen = rootEdgeLen;
  }

  static async load(fileReader: FileReader): Promise<RadixTree> {
    const buffer = await fileReader.read();
    const data = new Uint8Array(buffer);
    const decoder = new Decoder(data);
    decoder.seek(data.length - 8);
    const rootOffset = decoder.uint32();
    const rootEdgeLen = decoder.uint32();
    decoder.seek(0);

    return new RadixTree(decoder, rootOffset, rootEdgeLen);
  }

  *search(query: Query): Generator<number> {
    const yielded = new Set<number>();
    let currentLength = undefined;
    const results: number[] = [];
    const queue: QueueItem[] = [];
    const root = {
      length: this.rootEdgeLen,
      offset: this.rootOffset,
      edgeLen: this.rootEdgeLen,
      state: 0,
    };
    for (let item: QueueItem | undefined = root; item !== undefined; item = queue.pop()) {
      if (currentLength !== undefined && item.length !== currentLength && results.length > 0) {
        yield* results;
        results.length = 0;
        currentLength = item.length;
      }

      for (const result of this.processItem(query, item, queue)) {
        currentLength ??= item.length;
        if (!yielded.has(result)) {
          this.insertIntoResults(results, result);
          yielded.add(result);
        }
      }
    }

    if (results.length > 0) {
      yield* results;
    }
  }

  private *processItem(query: Query, item: QueueItem, queue: QueueItem[]): Generator<number> {
    this.decoder.seek(item.offset);

    let queryState = item.state;

    const edge = this.decoder.byteString(item.edgeLen);
    let edgeIndex = 0;
    while (edgeIndex < edge.length && queryState !== -1) {
      queryState = query.transition(queryState, edge[edgeIndex]);
      edgeIndex++;
    }

    // If we failed to match the edge completely, it's over
    if (queryState === -1) {
      return;
    }

    for (const child of this.decoder.iterArray((d) => ({
      firstByte: d.uint8(),
      edgeLen: d.uint8(),
      offset: d.uvarint(),
    }))) {
      if (query.transition(queryState, child.firstByte) !== -1) {
        this.insertIntoQueue(queue, {
          length: item.length + child.edgeLen,
          edgeLen: child.edgeLen,
          offset: child.offset,
          state: queryState,
        });
      }
    }

    if (queryState === undefined) {
      yield* this.decoder.iterArray((d) => d.uvarint());
    }
  }

  private insertIntoQueue(queue: QueueItem[], item: QueueItem) {
    let insertIndex = 0;
    while (insertIndex < queue.length && queue[insertIndex].length > item.length) {
      insertIndex++;
    }
    queue.splice(insertIndex, 0, item);
  }

  private insertIntoResults(results: number[], result: number) {
    let insertIndex = 0;
    while (insertIndex < results.length && results[insertIndex] < result) {
      insertIndex++;
    }
    if (insertIndex >= results.length || results[insertIndex] !== result) {
      results.splice(insertIndex, 0, result);
    }
  }
}
