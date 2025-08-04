import { Language } from "../dict";
import { processPinyin } from "../query/pinyin";
import { EnglishQuery, Query } from "./interfaces";
import { processNative } from "./native";
import { processRomaji } from "./romaji";

export function processQuery(query: string, language: Language): [Query | null, Query | null] {
  query = query.toLowerCase().trim();

  if (query.length === 0) {
    return [null, null];
  }

  return [
    processNative(query, language) ?? new EnglishQuery(query),
    language == Language.Chinese ? processPinyin(query) : processRomaji(query),
  ];
}
