import { Language } from "../dict";
import { processPinyin } from "../query/pinyin";
import { EnglishQuery, Query } from "./interfaces";
import { processNative } from "./native";
import { processRomaji } from "./romaji";

export function processQuery(query: string, language: Language): [] | [Query] | [Query, Query] {
  query = query.toLowerCase().trim();

  if (query.length === 0) {
    return [];
  }

  const direct = processNative(query, language) ?? new EnglishQuery(query);
  const interpreted = language == Language.Chinese ? processPinyin(query) : processRomaji(query);

  if (interpreted != null) {
    return [direct, interpreted];
  } else {
    return [direct];
  }
}
