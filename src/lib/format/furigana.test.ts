import { describe, test, expect } from "vitest";
import { segmentFurigana } from "./furigana";

function isSubsequence(biggerString: string, smallerString: string): boolean {
  let i = 0;
  let j = 0;

  while (i < biggerString.length && j < smallerString.length) {
    if (biggerString[i] === smallerString[j]) {
      j++;
    }
    i++;
  }

  return j === smallerString.length;
}

// Helper function to test pathological inputs by checking invariants
function expectValidSegmentation(base: string, gloss: string) {
  const result = segmentFurigana(base, gloss, []);
  const reconstructedKanji = result.map((s) => s.base).join("");
  const reconstructedKana = result.map((s) => s.gloss || s.base).join("");

  expect(reconstructedKanji).toBe(base);
  expect(
    isSubsequence(reconstructedKana, gloss),
    `expected kana '${gloss}' to be subsequence of reconstructed '${reconstructedKana}'`,
  ).toBeTruthy();
}

describe("segmentFurigana", () => {
  test("edge cases", () => {
    expect(segmentFurigana("", "", [])).toEqual([]);
    expect(segmentFurigana("", "reading", [])).toEqual([]);
    expect(segmentFurigana("kanji", "", [])).toEqual([{ base: "kanji", gloss: undefined }]);
  });

  test("basic kanji with readings", () => {
    expect(segmentFurigana("水", "みず", [])).toEqual([{ base: "水", gloss: "みず" }]);
    expect(segmentFurigana("学校", "がっこう", [])).toEqual([{ base: "学校", gloss: "がっこう" }]);
    expect(segmentFurigana("美術館", "びじゅつかん", [])).toEqual([
      { base: "美術館", gloss: "びじゅつかん" },
    ]);
    expect(segmentFurigana("国際会議", "こくさいかいぎ", [])).toEqual([
      { base: "国際会議", gloss: "こくさいかいぎ" },
    ]);
  });

  test("kanji with okurigana", () => {
    expect(segmentFurigana("食べる", "たべる", [])).toEqual([
      { base: "食", gloss: "た" },
      { base: "べる" },
    ]);
    expect(segmentFurigana("行きます", "いきます", [])).toEqual([
      { base: "行", gloss: "い" },
      { base: "きます" },
    ]);
    expect(segmentFurigana("読む", "よむ", [])).toEqual([
      { base: "読", gloss: "よ" },
      { base: "む" },
    ]);
    expect(segmentFurigana("新しい", "あたらしい", [])).toEqual([
      { base: "新", gloss: "あたら" },
      { base: "しい" },
    ]);
    expect(segmentFurigana("小さい頃", "ちいさいころ", [])).toEqual([
      { base: "小", gloss: "ちい" },
      { base: "さい" },
      { base: "頃", gloss: "ころ" },
    ]);
  });

  test("exact matches get no reading", () => {
    expect(segmentFurigana("コンピューター", "コンピューター", [])).toEqual([
      { base: "コンピューター" },
    ]);
    expect(segmentFurigana("ひらがな", "ひらがな", [])).toEqual([{ base: "ひらがな" }]);
    expect(segmentFurigana("しょっぱい", "しょっぱい", [])).toEqual([{ base: "しょっぱい" }]);
    expect(segmentFurigana("チャンス", "チャンス", [])).toEqual([{ base: "チャンス" }]);
    expect(segmentFurigana("ドクター・フー", "ドクター・フー", [])).toEqual([
      { base: "ドクター・フー" },
    ]);
    expect(segmentFurigana("ここ", "ここ", [])).toEqual([{ base: "ここ" }]);
  });

  test("single characters", () => {
    expect(segmentFurigana("a", "a", [])).toEqual([{ base: "a" }]);
    expect(segmentFurigana("あ", "あ", [])).toEqual([{ base: "あ" }]);
    expect(segmentFurigana("ア", "ア", [])).toEqual([{ base: "ア" }]);
  });

  test("mixed kanji and kana", () => {
    expect(segmentFurigana("日本語の勉強", "にほんごのべんきょう", [])).toEqual([
      { base: "日本語", gloss: "にほんご" },
      { base: "の" },
      { base: "勉強", gloss: "べんきょう" },
    ]);
    expect(segmentFurigana("私の本", "わたしのほん", [])).toEqual([
      { base: "私", gloss: "わたし" },
      { base: "の" },
      { base: "本", gloss: "ほん" },
    ]);
    expect(segmentFurigana("月の兎", "つきのうさぎ", [])).toEqual([
      { base: "月", gloss: "つき" },
      { base: "の" },
      { base: "兎", gloss: "うさぎ" },
    ]);
    expect(segmentFurigana("お疲れ様でした", "おつかれさまでした", [])).toEqual([
      { base: "お" },
      { base: "疲", gloss: "つか" },
      { base: "れ" },
      { base: "様", gloss: "さま" },
      { base: "でした" },
    ]);
  });

  test("multiple kanji groups", () => {
    expect(segmentFurigana("隠し引き出し", "かくしひきだし", [])).toEqual([
      { base: "隠", gloss: "かく" },
      { base: "し" },
      { base: "引", gloss: "ひ" },
      { base: "き" },
      { base: "出", gloss: "だ" },
      { base: "し" },
    ]);
    expect(segmentFurigana("そんな中", "そんななか", [])).toEqual([
      { base: "そんな" },
      { base: "中", gloss: "なか" },
    ]);
    expect(segmentFurigana("どう言う", "どういう", [])).toEqual([
      { base: "どう" },
      { base: "言", gloss: "い" },
      { base: "う" },
    ]);
  });

  test("numbers and symbols", () => {
    expect(segmentFurigana("学校！", "がっこう！", [])).toEqual([
      { base: "学校", gloss: "がっこう" },
      { base: "！" },
    ]);
    expect(segmentFurigana("１年生", "いちねんせい", [])).toEqual([
      { base: "１年生", gloss: "いちねんせい" },
    ]);
    expect(segmentFurigana("２０２４年", "にせんにじゅうよねん", [])).toEqual([
      { base: "２０２４年", gloss: "にせんにじゅうよねん" },
    ]);
    expect(segmentFurigana("ABC３４５", "エービーシーさんよんご", [])).toEqual([
      { base: "ABC３４５", gloss: "エービーシーさんよんご" },
    ]);
  });

  test("mismatches and edge cases", () => {
    expect(segmentFurigana("あいう", "えおか", [])).toEqual([{ base: "あいう", gloss: "えおか" }]);
    expect(segmentFurigana("水火", "みずひ", [])).toEqual([{ base: "水火", gloss: "みずひ" }]);
    expect(segmentFurigana("水火土", "みず", [])).toEqual([{ base: "水火土", gloss: "みず" }]);
    expect(segmentFurigana("水", "みずのようなもの", [])).toEqual([
      { base: "水", gloss: "みずのようなもの" },
    ]);
    expect(segmentFurigana("iPhone", "アイフォーン", [])).toEqual([
      { base: "iPhone", gloss: "アイフォーン" },
    ]);
    expect(segmentFurigana("１０人", "じゅうにん", [])).toEqual([
      { base: "１０人", gloss: "じゅうにん" },
    ]);
    expect(segmentFurigana("母", "はは", [])).toEqual([{ base: "母", gloss: "はは" }]);
  });

  test("alternating patterns", () => {
    expect(segmentFurigana("水あ火い", "みずあひい", [])).toEqual([
      { base: "水", gloss: "みず" },
      { base: "あ" },
      { base: "火", gloss: "ひ" },
      { base: "い" },
    ]);
    expect(segmentFurigana("ああ水", "ああみず", [])).toEqual([
      { base: "ああ" },
      { base: "水", gloss: "みず" },
    ]);
  });

  test("multiple possible matches", () => {
    expectValidSegmentation("abcabc", "xaxbxc");
    expectValidSegmentation("aba", "bab");
  });

  test("order mismatches", () => {
    expectValidSegmentation("abc", "cba");
    expectValidSegmentation("abcd", "bdac");
  });

  test("greedy matching issues", () => {
    expectValidSegmentation("abcd", "xbcd");
    expectValidSegmentation("aabbcc", "abcabc");
  });

  test("repeated character confusion", () => {
    expectValidSegmentation("aab", "baa");
    expectValidSegmentation("abab", "baba");
    expect(segmentFurigana("aaa", "aaa", [])).toEqual([{ base: "aaa" }]);
  });

  test("one-to-many mappings", () => {
    expectValidSegmentation("a", "aaa");
    expectValidSegmentation("aaa", "a");
    expectValidSegmentation("ab", "aaabbb");
  });

  test("complex interleaving", () => {
    expectValidSegmentation("abcabc", "abxabx");
    expectValidSegmentation("ababab", "bababa");
  });

  test("suboptimal segmentation", () => {
    expectValidSegmentation("xyzabc", "abcxyz");
    expectValidSegmentation("prefixsuffix", "suffixprefix");
  });

  test("edge cases with matching", () => {
    expectValidSegmentation("abc", "xbx");
    expectValidSegmentation("abc", "def");
    expectValidSegmentation("abcde", "edcba");
  });

  test("performance stress cases", () => {
    const longPrefix = "x".repeat(100);
    const alternating1 = "ab".repeat(50);
    const alternating2 = "ba".repeat(50);

    expectValidSegmentation(longPrefix + "a", "a" + longPrefix);
    expectValidSegmentation(alternating1, alternating2);
  });
});
