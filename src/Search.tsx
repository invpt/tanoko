import {
  createResource,
  createSignal,
  createEffect,
  onCleanup, // Import onCleanup
  Show,
  type Component,
} from "solid-js";

import styles from "./Search.module.css";
import { JMdictWord } from "@scriptin/jmdict-simplified-types";
import { useLocation } from "@solidjs/router";
import { useSrs } from "./srs/srs";
import Word from "./Word";
import { dict, useDictStatus, QueryType } from "./dict/dict";
import { toHiragana } from "wanakana";

const Search: Component = () => {
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

  // This is a simple heuristic: if the query contains any Japanese characters,
  // it's a native query. Otherwise, it's an English query.
  function detectQueryType(query: string): QueryType {
    if (
      /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(
        query,
      )
    ) {
      return "native";
    }
    return "english";
  }

  const [searchParams, setSearchParams] = createSignal<{
    query: string | undefined;
    queryType: QueryType | undefined;
  }>({ query: undefined, queryType: undefined });

  createEffect(() => {
    const queryParam = location.query["query"];
    const originalQuery = Array.isArray(queryParam)
      ? queryParam[0]
      : queryParam;

    if (!originalQuery || originalQuery.trim() === "") {
      setSearchParams({ query: undefined, queryType: undefined });
      setCurrentQueryType(undefined);
      setSuggestedQueryType(undefined);
      setShowRomajiWarning(false);
      return;
    }

    const initialQueryType = detectQueryType(originalQuery);
    let queryToSend = originalQuery;
    let actualQueryType = initialQueryType;
    let shouldShowWarning = false;

    if (initialQueryType === "english") {
      const isPureRomajiCandidate = /^[a-z]+$/.test(
        originalQuery.toLowerCase(),
      );

      if (isPureRomajiCandidate) {
        const convertedQuery = toHiragana(originalQuery);

        if (
          convertedQuery !== originalQuery &&
          detectQueryType(convertedQuery) === "native" &&
          !/[a-zA-Z]/.test(convertedQuery)
        ) {
          queryToSend = convertedQuery;
          actualQueryType = "native";
          shouldShowWarning = true;
        }
      }
    }

    setCurrentQueryType(actualQueryType);
    setSuggestedQueryType(initialQueryType);
    setShowRomajiWarning(shouldShowWarning);

    setSearchParams({ query: queryToSend, queryType: actualQueryType });
  });

  const [results] = createResource(searchParams, async (params) => {
    if (!params.query || params.query.trim() === "" || !params.queryType) {
      return [];
    }

    const results: JMdictWord[] = [];
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
    if (originalQuery) {
      setSearchParams({ query: originalQuery, queryType: "english" });
      setShowRomajiWarning(false);
    }
  };

  const handleWordClick = async (word: JMdictWord) => {
    try {
      await add("jmdict-vocab", word.id);
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
              when={currentQueryType() === "native" && !showRomajiWarning()}
            >
              <p>Searching in Japanese (native).</p>
            </Show>
            <Show
              when={currentQueryType() === "english" && !showRomajiWarning()}
            >
              <p>Searching in English.</p>
            </Show>
            <Show when={showRomajiWarning()}>
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
              <p>No results found for \"{query()}\"</p>
            </div>
          </Show>

          <Show when={results() && results()!.length > 0}>
            {results()?.map((word) => (
              <Word word={word} onClick={() => handleWordClick(word)} />
            ))}
          </Show>
        </Show>
      </Show>
    </div>
  );
};

export default Search;
