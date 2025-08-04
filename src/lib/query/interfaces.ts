export type Query = NativeQuery | EnglishQuery;

export type NativeQueryState = number | undefined;

export abstract class NativeQuery {
  /**
   * @param from current state. 0 is initial state by convention
   * @param by a UTF-8 byte
   * @returns the new state, or undefined if this is the end (complete successful match), or -1 if
   * could not transition
   *
   * NOTE: if `from` is `undefined`, return `undefined` to support prefix matching or -1 for
   * exact. if `from` is less than zero, behavior is implementation-defined.
   */
  abstract transition(from: NativeQueryState, by: number): NativeQueryState;

  /**
   * Formats the query, surrounded by the appropriate quotation marks and spacing.
   */
  abstract toString(): string;

  /**
   * A human-readable name for this type of query
   */
  abstract kind(): string;
}

export class EnglishQuery {
  constructor(public query: string) {}

  toString() {
    return ` “${this.query}” `;
  }

  kind() {
    return "English";
  }
}
