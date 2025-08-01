import { Language, QueryType } from "./dict";
import pinyinSyllables from "./pinyinSyllables";
import romajiMap from "./romajiMap";

const europeanQuotes = [" “", "” "] as const;
const cornerQuotes = ["「", " 」"] as const;

export function processQuery(
  query: string,
  language: Language,
): [
  { query: string; queryType: QueryType; kind: string; brackets: readonly [string, string] },
  (
    | { query: string; queryType: QueryType; kind: string; brackets: readonly [string, string] }
    | undefined
  ),
] {
  if (query.length === 0) {
    return [
      { query: "", queryType: QueryType.English, kind: "English", brackets: europeanQuotes },
      undefined,
    ];
  }

  const cjk = processCjk(query);
  if (cjk != null) {
    return [
      {
        query: cjk,
        queryType: QueryType.Native,
        kind: language === Language.Chinese ? "Chinese" : "Japanese",
        brackets: language === Language.Chinese ? europeanQuotes : cornerQuotes,
      },
      undefined,
    ];
  }

  if (language == Language.Chinese) {
    const pinyin = processPinyin(query);
    if (pinyin != null) {
      return [
        { query: pinyin, queryType: QueryType.Native, kind: "pinyin", brackets: europeanQuotes },
        { query: query, queryType: QueryType.English, kind: "English", brackets: europeanQuotes },
      ];
    } else {
      return [
        { query: query, queryType: QueryType.English, kind: "English", brackets: europeanQuotes },
        undefined,
      ];
    }
  } else {
    const kana = processRomaji(query);
    if (kana != null) {
      return [
        { query: kana, queryType: QueryType.Native, kind: "kana", brackets: cornerQuotes },
        { query: query, queryType: QueryType.English, kind: "English", brackets: europeanQuotes },
      ];
    } else {
      return [
        { query: query, queryType: QueryType.English, kind: "English", brackets: europeanQuotes },
        undefined,
      ];
    }
  }
}

function processCjk(query: string): string | undefined {
  const processed = query.replace(/\s+/g, "");

  if (processed.length === 0) {
    return undefined;
  }

  for (let i = 0; i < processed.length; i++) {
    const codePoint = processed.codePointAt(i)!;
    if (isCjkCharacter(codePoint)) {
      return processed;
    }
  }

  return undefined;
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

// TODO: update processRomaji to use a trie just like pinyin?
function processRomaji(query: string): string | undefined {
  let result = "";
  let i = 0;

  while (i < query.length) {
    let matched = false;

    // Try to match longer sequences first (up to 4 characters)
    for (let len = Math.min(4, query.length - i); len > 0; len--) {
      const substr = query.substring(i, i + len).toLowerCase();

      if (romajiMap[substr]) {
        result += romajiMap[substr];
        i += len;
        matched = true;
        break;
      }
    }

    // Handle double consonants (っ)
    if (!matched && i < query.length - 1) {
      const currentChar = query[i].toLowerCase();
      const nextChar = query[i + 1].toLowerCase();

      if (
        currentChar === nextChar &&
        currentChar !== "n" &&
        currentChar !== "a" &&
        currentChar !== "i" &&
        currentChar !== "u" &&
        currentChar !== "e" &&
        currentChar !== "o"
      ) {
        result += "っ";
        i++;
        matched = true;
      }
    }

    // If no match found, this isn't valid romaji so exit
    if (!matched) {
      return undefined;
    }
  }

  return result;
}

function processPinyin(query: string): string | undefined {
  query = query.toLowerCase().replace(/\s+/g, "");
  if (query.length === 0) {
    return undefined;
  }

  if (isPinyinCandidate(query)) {
    // Notice we are returning the query *after* preprocessing
    return query;
  } else {
    return undefined;
  }
}

function isPinyinCandidate(query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  let current = pinyinTrie;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    if (!current.children.has(char)) {
      break;
    }
    current = current.children.get(char)!;

    if (current.isEndOfSyllable) {
      if (isPinyinCandidate(query.substring(i + 1))) {
        return true;
      }
    }
  }

  return false;
}

class TrieNode {
  children: Map<string, TrieNode>;
  isEndOfSyllable: boolean;

  constructor() {
    this.children = new Map();
    this.isEndOfSyllable = false;
  }
}

const pinyinTrie = new TrieNode();

function buildPinyinTrie() {
  for (const syllable of pinyinSyllables) {
    let currentNode = pinyinTrie;
    for (const char of syllable) {
      if (!currentNode.children.has(char)) {
        currentNode.children.set(char, new TrieNode());
      }
      currentNode = currentNode.children.get(char)!;
    }
    currentNode.isEndOfSyllable = true;
  }
}

buildPinyinTrie();
