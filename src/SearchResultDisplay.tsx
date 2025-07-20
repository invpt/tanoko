import { Show, type Component } from "solid-js";

import styles from "./Search.module.css";
import Word from "./Word";
import { DictionaryEntry, useDictStatus } from "./dict/dict";

type DictStatus = ReturnType<typeof useDictStatus>;
import { QueryType } from "./QueryDetection";
import { toHiragana } from "wanakana";

interface SearchResultDisplayProps {
  query: string | undefined;
  results: DictionaryEntry[] | undefined;
  dictStatus: DictStatus;
  currentQueryType: QueryType | undefined;
  showRomajiWarning: boolean;
  selectedDict: "japanese" | "chinese";
  handleSwitchToEnglish: () => void;
  handleWordClick: (word: DictionaryEntry) => void;
}

const SearchResultDisplay: Component<SearchResultDisplayProps> = (props) => {
  return (
    <>
      <Show when={props.dictStatus().status === "loading"}>
        <div class={styles.LoadingState}>
          <p>Dictionary is still loading... Search will be available soon.</p>
        </div>
      </Show>

      <Show when={props.dictStatus().status === "failure"}>
        <div class={styles.ErrorState}>
          <p>Dictionary failed to load. Search is not available.</p>
        </div>
      </Show>

      <Show when={props.dictStatus().status === "ready"}>
        <div class={styles.QueryInfoMessage}>
          <Show
            when={
              props.currentQueryType === "japanese-native" &&
              !props.showRomajiWarning
            }
          >
            <p>Searching in Japanese (native).</p>
          </Show>
          <Show
            when={
              props.currentQueryType === "japanese-english" &&
              !props.showRomajiWarning
            }
          >
            <p>Searching in Japanese (English).</p>
          </Show>
          <Show when={props.currentQueryType === "chinese-native"}>
            <p>Searching in Chinese (Pinyin/Characters).</p>
          </Show>
          <Show when={props.currentQueryType === "chinese-english"}>
            <p>Searching in Chinese (English).</p>
          </Show>
          <Show
            when={props.showRomajiWarning && props.selectedDict === "japanese"}
          >
            <p>
              Romaji detected! Searching for "{toHiragana(props.query!)}"
              (Hiragana).
              <button onClick={props.handleSwitchToEnglish}>
                Search for "{props.query!}" (English) instead
              </button>
            </p>
          </Show>
        </div>
        <Show when={props.results && props.results.length === 0}>
          <div class={styles.EmptyState}>
            <p>No results found for "{props.query}"</p>
          </div>
        </Show>

        <Show when={props.results && props.results.length > 0}>
          {props.results?.map((word) => (
            <Word word={word} onClick={() => props.handleWordClick(word)} />
          ))}
        </Show>
      </Show>
    </>
  );
};

export default SearchResultDisplay;
