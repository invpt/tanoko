import { Language } from "../dict";
import { NativeQuery } from "./interfaces";
import { StringPrefixQuery } from "./prefix";

class LanguagePrefixQuery extends StringPrefixQuery {
  constructor(
    private query: string,
    private language: Language,
  ) {
    super(query);
  }

  toString(): string {
    if (this.language === Language.Chinese) {
      return ` “${this.query}” `;
    } else {
      return `「${this.query}」`;
    }
  }

  kind(): string {
    if (this.language === Language.Chinese) {
      return "Chinese";
    } else {
      return "Japanese";
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
