import { NativeQuery, NativeQueryState } from "./interfaces";

export abstract class StringPrefixQuery extends NativeQuery {
  private bytes: Uint8Array;

  constructor(query: string) {
    super();

    this.bytes = new TextEncoder().encode(query);
  }

  transition(from: NativeQueryState, by: number): NativeQueryState {
    if (from === undefined || from >= this.bytes.length) {
      return undefined;
    } else if (from === -1 || this.bytes[from] !== by) {
      return -1;
    } else {
      return from !== this.bytes.length - 1 ? from + 1 : undefined;
    }
  }
}
