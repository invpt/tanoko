export function containsJapaneseScript(query: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(query);
}

export function containsCJKUnifiedIdeographs(query: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(query);
}

export function isPureRomajiCandidate(query: string): boolean {
  return /^[a-z]+$/.test(query.toLowerCase());
}

export type QueryType =
  | "japanese-native"
  | "japanese-english"
  | "chinese-native"
  | "chinese-english";

import { toHiragana } from "wanakana";
import { isPinyinCandidate } from "./PinyinUtils";

interface QueryDetectionResult {
  queryToSend: string;
  actualQueryType: QueryType;
  shouldShowRomajiWarning: boolean;
}

/**
 * Determines the actual query type and if a Romaji warning should be shown
 * based on the original query and the selected dictionary.
 * @param originalQuery The raw query string from the user.
 * @param selectedDict The currently selected dictionary type ('japanese' or 'chinese').
 * @returns An object containing the processed query, actual query type, and a warning flag.
 */
export function determineQueryType(
  originalQuery: string,
  selectedDict: "japanese" | "chinese",
): QueryDetectionResult {
  let queryToSend = originalQuery;
  let actualQueryType: QueryType;
  let shouldShowRomajiWarning = false;

  if (selectedDict === "japanese") {
    const hasJapaneseScript = containsJapaneseScript(originalQuery);
    const hasCJK = containsCJKUnifiedIdeographs(originalQuery);
    const isRomaji = isPureRomajiCandidate(originalQuery);

    if (hasJapaneseScript || hasCJK) {
      actualQueryType = "japanese-native";
    } else if (isRomaji) {
      const convertedQuery = toHiragana(originalQuery);
      if (
        convertedQuery !== originalQuery &&
        (containsJapaneseScript(convertedQuery) ||
          containsCJKUnifiedIdeographs(convertedQuery)) &&
        !/[a-zA-Z]/.test(convertedQuery)
      ) {
        queryToSend = convertedQuery;
        actualQueryType = "japanese-native";
        shouldShowRomajiWarning = true;
      } else {
        actualQueryType = "japanese-english";
      }
    } else {
      actualQueryType = "japanese-english";
    }
  } else {
    const hasCJK = containsCJKUnifiedIdeographs(originalQuery);
    const isPinyin = isPinyinCandidate(originalQuery);

    if (hasCJK || isPinyin) {
      actualQueryType = "chinese-native";
    } else {
      actualQueryType = "chinese-english";
    }
  }

  return { queryToSend, actualQueryType, shouldShowRomajiWarning };
}

/**
 * Suggests a query type for display purposes based on the original query
 * and the selected dictionary, without modifying the query itself.
 * @param originalQuery The raw query string from the user.
 * @param selectedDict The currently selected dictionary type ('japanese' or 'chinese').
 * @returns The suggested QueryType.
 */
export function suggestQueryType(
  originalQuery: string,
  selectedDict: "japanese" | "chinese",
): QueryType | undefined {
  if (originalQuery.trim() === "") {
    return undefined;
  }

  if (selectedDict === "japanese") {
    return containsJapaneseScript(originalQuery) ||
      containsCJKUnifiedIdeographs(originalQuery)
      ? "japanese-native"
      : "japanese-english";
  } else {
    return containsCJKUnifiedIdeographs(originalQuery) ||
      isPinyinCandidate(originalQuery)
      ? "chinese-native"
      : "chinese-english";
  }
}
