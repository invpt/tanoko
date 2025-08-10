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
function expectValidSegmentation(kanji: string, kana: string) {
  const result = segmentFurigana(kanji, kana);
  const reconstructedKanji = result.map((s) => s.kanji).join("");
  const reconstructedKana = result.map((s) => s.kana || s.kanji).join("");

  expect(reconstructedKanji).toBe(kanji);
  expect(
    isSubsequence(reconstructedKana, kana),
    `expected kana '${kana}' to be subsequence of reconstructed '${reconstructedKana}'`,
  ).toBeTruthy();
}

describe("segmentFurigana", () => {
  test("edge cases", () => {
    expect(segmentFurigana("", "")).toEqual([]);
    expect(segmentFurigana("", "reading")).toEqual([{ kanji: "", kana: "reading" }]);
    expect(segmentFurigana("kanji", "")).toEqual([{ kanji: "kanji", kana: "" }]);
  });

  test("basic kanji with readings", () => {
    expect(segmentFurigana("水", "みず")).toEqual([{ kanji: "水", kana: "みず" }]);
    expect(segmentFurigana("学校", "がっこう")).toEqual([{ kanji: "学校", kana: "がっこう" }]);
    expect(segmentFurigana("美術館", "びじゅつかん")).toEqual([
      { kanji: "美術館", kana: "びじゅつかん" },
    ]);
    expect(segmentFurigana("国際会議", "こくさいかいぎ")).toEqual([
      { kanji: "国際会議", kana: "こくさいかいぎ" },
    ]);
  });

  test("kanji with okurigana", () => {
    expect(segmentFurigana("食べる", "たべる")).toEqual([
      { kanji: "食", kana: "た" },
      { kanji: "べる", kana: "" },
    ]);
    expect(segmentFurigana("行きます", "いきます")).toEqual([
      { kanji: "行", kana: "い" },
      { kanji: "きます", kana: "" },
    ]);
    expect(segmentFurigana("読む", "よむ")).toEqual([
      { kanji: "読", kana: "よ" },
      { kanji: "む", kana: "" },
    ]);
    expect(segmentFurigana("新しい", "あたらしい")).toEqual([
      { kanji: "新", kana: "あたら" },
      { kanji: "しい", kana: "" },
    ]);
    expect(segmentFurigana("小さい頃", "ちいさいころ")).toEqual([
      { kanji: "小", kana: "ちい" },
      { kanji: "さい", kana: "" },
      { kanji: "頃", kana: "ころ" },
    ]);
  });

  test("exact matches get no reading", () => {
    expect(segmentFurigana("コンピューター", "コンピューター")).toEqual([
      { kanji: "コンピューター", kana: "" },
    ]);
    expect(segmentFurigana("ひらがな", "ひらがな")).toEqual([{ kanji: "ひらがな", kana: "" }]);
    expect(segmentFurigana("しょっぱい", "しょっぱい")).toEqual([
      { kanji: "しょっぱい", kana: "" },
    ]);
    expect(segmentFurigana("チャンス", "チャンス")).toEqual([{ kanji: "チャンス", kana: "" }]);
    expect(segmentFurigana("ドクター・フー", "ドクター・フー")).toEqual([
      { kanji: "ドクター・フー", kana: "" },
    ]);
    expect(segmentFurigana("ここ", "ここ")).toEqual([{ kanji: "ここ", kana: "" }]);
  });

  test("single characters", () => {
    expect(segmentFurigana("a", "a")).toEqual([{ kanji: "a", kana: "" }]);
    expect(segmentFurigana("あ", "あ")).toEqual([{ kanji: "あ", kana: "" }]);
    expect(segmentFurigana("ア", "ア")).toEqual([{ kanji: "ア", kana: "" }]);
  });

  test("mixed kanji and kana", () => {
    expect(segmentFurigana("日本語の勉強", "にほんごのべんきょう")).toEqual([
      { kanji: "日本語", kana: "にほんご" },
      { kanji: "の", kana: "" },
      { kanji: "勉強", kana: "べんきょう" },
    ]);
    expect(segmentFurigana("私の本", "わたしのほん")).toEqual([
      { kanji: "私", kana: "わたし" },
      { kanji: "の", kana: "" },
      { kanji: "本", kana: "ほん" },
    ]);
    expect(segmentFurigana("月の兎", "つきのうさぎ")).toEqual([
      { kanji: "月", kana: "つき" },
      { kanji: "の", kana: "" },
      { kanji: "兎", kana: "うさぎ" },
    ]);
    expect(segmentFurigana("お疲れ様でした", "おつかれさまでした")).toEqual([
      { kanji: "お", kana: "" },
      { kanji: "疲", kana: "つか" },
      { kanji: "れ", kana: "" },
      { kanji: "様", kana: "さま" },
      { kanji: "でした", kana: "" },
    ]);
  });

  test("multiple kanji groups", () => {
    expect(segmentFurigana("隠し引き出し", "かくしひきだし")).toEqual([
      { kanji: "隠", kana: "かく" },
      { kanji: "し", kana: "" },
      { kanji: "引", kana: "ひ" },
      { kanji: "き", kana: "" },
      { kanji: "出", kana: "だ" },
      { kanji: "し", kana: "" },
    ]);
    expect(segmentFurigana("そんな中", "そんななか")).toEqual([
      { kanji: "そんな", kana: "" },
      { kanji: "中", kana: "なか" },
    ]);
    expect(segmentFurigana("どう言う", "どういう")).toEqual([
      { kanji: "どう", kana: "" },
      { kanji: "言", kana: "い" },
      { kanji: "う", kana: "" },
    ]);
  });

  test("numbers and symbols", () => {
    expect(segmentFurigana("学校！", "がっこう！")).toEqual([
      { kanji: "学校", kana: "がっこう" },
      { kanji: "！", kana: "" },
    ]);
    expect(segmentFurigana("１年生", "いちねんせい")).toEqual([
      { kanji: "１年生", kana: "いちねんせい" },
    ]);
    expect(segmentFurigana("２０２４年", "にせんにじゅうよねん")).toEqual([
      { kanji: "２０２４年", kana: "にせんにじゅうよねん" },
    ]);
    expect(segmentFurigana("ABC３４５", "エービーシーさんよんご")).toEqual([
      { kanji: "ABC３４５", kana: "エービーシーさんよんご" },
    ]);
  });

  test("mismatches and edge cases", () => {
    expect(segmentFurigana("あいう", "えおか")).toEqual([{ kanji: "あいう", kana: "えおか" }]);
    expect(segmentFurigana("水火", "みずひ")).toEqual([{ kanji: "水火", kana: "みずひ" }]);
    expect(segmentFurigana("水火土", "みず")).toEqual([{ kanji: "水火土", kana: "みず" }]);
    expect(segmentFurigana("水", "みずのようなもの")).toEqual([
      { kanji: "水", kana: "みずのようなもの" },
    ]);
    expect(segmentFurigana("iPhone", "アイフォーン")).toEqual([
      { kanji: "iPhone", kana: "アイフォーン" },
    ]);
    expect(segmentFurigana("１０人", "じゅうにん")).toEqual([
      { kanji: "１０人", kana: "じゅうにん" },
    ]);
    expect(segmentFurigana("母", "はは")).toEqual([{ kanji: "母", kana: "はは" }]);
  });

  test("alternating patterns", () => {
    expect(segmentFurigana("水あ火い", "みずあひい")).toEqual([
      { kanji: "水", kana: "みず" },
      { kanji: "あ", kana: "" },
      { kanji: "火", kana: "ひ" },
      { kanji: "い", kana: "" },
    ]);
    expect(segmentFurigana("ああ水", "ああみず")).toEqual([
      { kanji: "ああ", kana: "" },
      { kanji: "水", kana: "みず" },
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
    expect(segmentFurigana("aaa", "aaa")).toEqual([{ kanji: "aaa", kana: "" }]);
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
