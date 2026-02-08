import { describe, test, expect } from "vitest";
import { processRomaji } from "./romaji";
import { NativeQueryState } from "./interfaces";

describe("RomajiPrefixQuery", () => {
  function testByteTransitions(query: any, text: string, shouldComplete: boolean = true) {
    const bytes = new TextEncoder().encode(text);
    let state: NativeQueryState = 0;

    for (const byte of bytes) {
      state = query.transition(state, byte);
      expect(state).not.toBe(-1);
    }

    if (shouldComplete) {
      expect(state).toBeUndefined();
    }
  }

  test("complete romaji conversion", () => {
    const query = processRomaji("ka");
    expect(query).not.toBeNull();
    expect(query!.kind()).toBe("romaji");

    testByteTransitions(query!, "か");
  });

  test("incomplete romaji with suffix matching", () => {
    const query = processRomaji("k");
    expect(query).not.toBeNull();
    expect(query!.kind()).toBe("romaji");

    testByteTransitions(query!, "か");
    testByteTransitions(query!, "き");
  });

  test("invalid romaji", () => {
    expect(processRomaji("xyz")).toBeNull();
    expect(processRomaji("")).toBeNull();
  });

  test("prefix matching from undefined state", () => {
    const query = processRomaji("ka");
    expect(query).not.toBeNull();

    const result = query!.transition(undefined, 65);
    expect(result).toBeUndefined();
  });

  test("state machine rejects invalid transitions", () => {
    const query = processRomaji("ka");
    expect(query).not.toBeNull();

    const result = query!.transition(0, 100);
    expect(result).toBe(-1);
  });

  test("complex romaji conversions", () => {
    const kappaQuery = processRomaji("kappa");
    expect(kappaQuery).not.toBeNull();
    testByteTransitions(kappaQuery!, "かっぱ");

    const kanQuery = processRomaji("kan");
    expect(kanQuery).not.toBeNull();
    testByteTransitions(kanQuery!, "かん");
  });

  test("suffix matching rejects invalid completions", () => {
    const query = processRomaji("k");
    expect(query).not.toBeNull();

    const aBytes = new TextEncoder().encode("あ");
    let state: NativeQueryState = 0;

    state = query!.transition(state, aBytes[0]);
    expect(state).not.toBe(-1);

    if (state !== -1 && state !== undefined) {
      state = query!.transition(state, aBytes[1]);
      expect(state).not.toBe(-1);
    }

    if (state !== -1 && state !== undefined) {
      state = query!.transition(state, aBytes[2]);
      expect(state).toBe(-1);
    }
  });

  test("mixed known and suffix matching", () => {
    const query = processRomaji("kat");
    expect(query).not.toBeNull();

    testByteTransitions(query!, "かた");
    testByteTransitions(query!, "かった");
  });
});
