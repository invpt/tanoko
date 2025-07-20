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
import { toHiragana } from "wanakana";

import {
  determineQueryType,
  suggestQueryType,
  QueryType,
} from "./QueryDetection";
import SearchResultDisplay from "./SearchResultDisplay";

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
      {/* Language selection is now in Header, removed from here */}

      <Show when={!query() || query()?.trim() === ""}>
        <div class={styles.EmptyState}>
          <p>Enter a search term to find words</p>
        </div>
      </Show>

      <Show when={query() && query()?.trim() !== ""}>
        <SearchResultDisplay
          query={query()}
          results={results()}
          dictStatus={dictStatus}
          currentQueryType={currentQueryType()}
          showRomajiWarning={showRomajiWarning()}
          selectedDict={selectedDict()}
          handleSwitchToEnglish={handleSwitchToEnglish}
          handleWordClick={handleWordClick}
        />
      </Show>
    </div>
  );
};

export default Search;
