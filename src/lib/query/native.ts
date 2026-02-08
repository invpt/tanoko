import { Language } from "../dict";
import { NativeQuery } from "./interfaces";
import { StringPrefixQuery } from "./prefix";

class LanguagePrefixQuery extends StringPrefixQuery {
  constructor(
    query: string,
    private language: Language,
  ) {
    super(convertKatakanaToHiragana(query));
  }

  kind(): string {
    if (this.language === Language.Chinese) {
      return "hanzi";
    } else {
      return "kanji/kana";
    }
  }
}

export function processNative(query: string, language: Language): NativeQuery | null {
  if (hasCjk(query)) {
    return new LanguagePrefixQuery(query, language);
  } else {
    return null;
  }
}

function convertKatakanaToHiragana(text: string): string {
  return text.replace(/[\u30A0-\u30FF]/g, (char) => {
    const codePoint = char.codePointAt(0)!;
    // Convert katakana to hiragana by subtracting the offset
    // Katakana range: 0x30A0-0x30FF, Hiragana range: 0x3040-0x309F
    // The offset is 0x60 (96 in decimal)
    if (codePoint >= 0x30a1 && codePoint <= 0x30f6) {
      return String.fromCodePoint(codePoint - 0x60);
    }
    // Return the character unchanged if it's not in the convertible range
    return char;
  });
}

function hasCjk(query: string): boolean {
  for (const char of query) {
    if (isCjkCharacter(char.codePointAt(0)!)) {
      return true;
    }
  }

  return false;
}

function isCjkCharacter(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0x3040 && codePoint <= 0x309f) || // Hiragana
    (codePoint >= 0x30a0 && codePoint <= 0x30ff) || // Katakana
    (codePoint >= 0xac00 && codePoint <= 0xd7af) || // Hangul
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK Extension A
    (codePoint >= 0x20000 && codePoint <= 0x2a6df) || // CJK Extension B
    (codePoint >= 0x2a700 && codePoint <= 0x2b73f) || // CJK Extension C
    (codePoint >= 0x2b740 && codePoint <= 0x2b81f) || // CJK Extension D
    (codePoint >= 0x2b820 && codePoint <= 0x2ceaf) || // CJK Extension E
    (codePoint >= 0x2ceb0 && codePoint <= 0x2ebef) // CJK Extension F
  );
}
