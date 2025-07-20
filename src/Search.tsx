import {
  createResource,
  createSignal,
  createEffect,
  Show,
  type Component,
} from "solid-js";

import styles from "./Search.module.css";
import { useLocation } from "@solidjs/router";
import { useSrs } from "./srs/srs";
import { dict, useDictStatus, DictionaryEntry } from "./dict/dict";

import {
  determineQueryType,
  suggestQueryType,
  QueryType,
} from "./QueryDetection";
import { toHiragana } from "wanakana";
import Word from "./Word";

const Search: Component = () => {
  const [selectedDict, setSelectedDict] = createSignal<"japanese" | "chinese">(
    "japanese",
  );
  const location = useLocation();
  const { add } = useSrs();
  const dictStatus = useDictStatus();

  const [currentQueryType, setCurrentQueryType] = createSignal<
    QueryType | undefined
  >(undefined);
  const [suggestedQueryType, setSuggestedQueryType] = createSignal<
    QueryType | undefined
  >(undefined);
  const [showRomajiWarning, setShowRomajiWarning] = createSignal(false);

  const [searchParams, setSearchParams] = createSignal<{
    query: string | undefined;
    queryType: QueryType | undefined;
  }>({ query: undefined, queryType: undefined });

  createEffect(() => {
    const queryParam = location.query["query"];
    const originalQuery = Array.isArray(queryParam)
      ? queryParam[0]
      : queryParam;

    const dictParam = location.query["dict"];
    const currentSelectedDict =
      dictParam === "chinese" ? "chinese" : "japanese";
    setSelectedDict(currentSelectedDict);

    if (!originalQuery || originalQuery.trim() === "") {
      setSearchParams({ query: undefined, queryType: undefined });
      setCurrentQueryType(undefined);
      setSuggestedQueryType(undefined);
      setShowRomajiWarning(false);
      return;
    }

    const { queryToSend, actualQueryType, shouldShowRomajiWarning } =
      determineQueryType(originalQuery, currentSelectedDict);

    const queryTypeParam = location.query["queryType"];
    const finalQueryType: QueryType =
      (queryTypeParam as QueryType) || actualQueryType;

    const suggested = suggestQueryType(originalQuery, currentSelectedDict);

    setCurrentQueryType(finalQueryType);
    setSuggestedQueryType(suggested);
    setShowRomajiWarning(shouldShowRomajiWarning);

    setSearchParams({ query: queryToSend, queryType: finalQueryType });
  });

  const [results] = createResource(searchParams, async (params) => {
    if (!params.query || params.query.trim() === "" || !params.queryType) {
      return [];
    }

    const results: DictionaryEntry[] = [];
    for await (const result of await dict.search(
      params.query,
      params.queryType,
    )) {
      results.push(result);
      if (results.length >= 100) {
        break;
      }
    }
    return results;
  });

  const handleSwitchToEnglish = () => {
    const originalQuery = query();
    if (originalQuery && selectedDict() === "japanese") {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("queryType", "japanese-english");
      setShowRomajiWarning(false);
      window.history.replaceState({}, "", currentUrl.toString());
    }
  };

  const handleWordClick = async (word: DictionaryEntry) => {
    try {
      if ("id" in word) {
        await add("jmdict-vocab", word.id);
      } else if (
        "simplified" in word &&
        "traditional" in word &&
        "pinyin" in word
      ) {
        const cedictId = `${word.traditional}::${word.simplified}::${word.pinyin.join(";")}`;
        await add("cedict-vocab", cedictId);
      } else {
        console.warn("Attempted to add an unknown word type to SRS:", word);
      }
    } catch (error) {
      console.error("Failed to add word to SRS:", error);
    }
  };

  const query = () => {
    const queryParam = location.query["query"];
    return Array.isArray(queryParam) ? queryParam[0] : queryParam;
  };

  return (
    <div class={styles.Search}>
      <Show when={!query() || query()?.trim() === ""}>
        <div class={styles.EmptyState}>
          <p>Enter a search term to find words</p>
        </div>
      </Show>

      <Show when={query() && query()?.trim() !== ""}>
        <Show when={dictStatus().status === "loading"}>
          <div class={styles.LoadingState}>
            <p>Dictionary is still loading... Search will be available soon.</p>
          </div>
        </Show>

        <Show when={dictStatus().status === "failure"}>
          <div class={styles.ErrorState}>
            <p>Dictionary failed to load. Search is not available.</p>
          </div>
        </Show>

        <Show when={dictStatus().status === "ready"}>
          <div class={styles.QueryInfoMessage}>
            <Show
              when={
                currentQueryType() === "japanese-native" && !showRomajiWarning()
              }
            >
              <p>Searching in Japanese (native).</p>
            </Show>
            <Show
              when={
                currentQueryType() === "japanese-english" &&
                !showRomajiWarning()
              }
            >
              <p>Searching in Japanese (English).</p>
            </Show>
            <Show when={currentQueryType() === "chinese-native"}>
              <p>Searching in Chinese (Pinyin/Characters).</p>
            </Show>
            <Show when={currentQueryType() === "chinese-english"}>
              <p>Searching in Chinese (English).</p>
            </Show>
            <Show when={showRomajiWarning() && selectedDict() === "japanese"}>
              <p>
                Romaji detected! Searching for "{toHiragana(query()!)}"
                (Hiragana).
                <button onClick={handleSwitchToEnglish}>
                  Search for "{query()!}" (English) instead
                </button>
              </p>
            </Show>
          </div>
          <Show when={results() && results()!.length === 0}>
            <div class={styles.EmptyState}>
              <p>No results found for "{query()}"</p>
            </div>
          </Show>

          <Show when={results() && results()!.length > 0}>
            {results()!.map((word) => (
              <Word word={word} onClick={() => handleWordClick(word)} />
            ))}
          </Show>
        </Show>
      </Show>
    </div>
  );
};

export default Search;
