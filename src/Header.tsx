import { A, useLocation, useNavigate } from "@solidjs/router";
import {
  Component,
  createEffect,
  createSignal,
  createUniqueId,
  JSX,
  onCleanup,
  Show,
} from "solid-js";

import styles from "./Header.module.css";
import { useSrs } from "./srs/srs";
import { useDictStatus } from "./dict/dict";
import { debounce } from "./util";

const Header: Component = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { snapshot: reviews } = useSrs();
  const dictStatus = useDictStatus();
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");

  const onSearchPage = () => location.pathname === "/search";

  const searchId = createUniqueId();

  createEffect(() => {
    if (onSearchPage()) {
      const queryParam = location.query.query;
      const newQuery = Array.isArray(queryParam) ? queryParam[0] : queryParam;
      setQuery(newQuery);
      setDebouncedQuery(newQuery); // Initialize debounced query immediately
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  });

  const debouncedSetDebouncedQuery = debounce(setDebouncedQuery, 250); // 500ms debounce

  createEffect(() => {
    // When the raw query changes, update the debounced query
    // This effect runs on every keystroke, but debouncedSetDebouncedQuery
    // will delay the actual update to debouncedQuery.
    if (onSearchPage()) {
      debouncedSetDebouncedQuery(query());
    }
  });

  createEffect(() => {
    // When the debounced query changes, perform the navigation
    if (onSearchPage() && debouncedQuery() !== location.query.query) {
      navigate(`/search?query=${encodeURIComponent(debouncedQuery())}`, {
        replace: true,
        scroll: false,
      });
    }
  });

  createEffect(() => {
    const listener = (ev: KeyboardEvent) => {
      if (ev.key === "/") {
        ev.preventDefault();
        const element = document.getElementById(searchId) as HTMLInputElement;
        element.focus();
        element.select();
      }
    };

    document.addEventListener("keydown", listener);
    onCleanup(() => document.removeEventListener("keydown", listener));
  });

  const handleSearchInput: JSX.InputEventHandlerUnion<
    HTMLInputElement,
    InputEvent
  > = (ev) => {
    const query = ev.currentTarget.value;
    setQuery(query);
    // Navigation is now handled by the createEffect watching debouncedQuery
  };

  const handleSearch = (ev: Event) => {
    ev.preventDefault();
    navigate(`/search?query=${encodeURIComponent(query())}`);
  };

  return (
    <header>
      <A class={styles.Title} href="/">
        <span>ただ</span>
        <span class={styles.TitleDeemph}>の</span>
        <span>ことば</span>
        <Show when={dictStatus().status !== "ready"}>
          <span class={styles.LoadingIndicator}>
            {(() => {
              const s = dictStatus();
              if (s.status === "loading") {
                return s.bytes > 0
                  ? `(${(s.bytes / 1024 / 1024).toFixed(1)}MiB imported)`
                  : "(loading)";
              } else if (s.status === "failure") {
                return "(error)";
              }
            })()}
          </span>
        </Show>
      </A>
      <form
        class={styles.SearchBar}
        classList={{ [styles.SearchBarOtherPage]: !onSearchPage() }}
        onSubmit={handleSearch}
      >
        <input
          class={styles.SearchInput}
          type="text"
          onInput={handleSearchInput}
          value={query()}
          placeholder="Press / to focus"
          id={searchId}
        />
        <input type="submit" class={styles.SearchButton} value="Search" />
      </form>
      <div class={styles.Buttons}>
        <A class={styles.Reviews} href="/review">
          {(() => {
            const r = reviews();
            switch (r.status) {
              case "loading":
                return "Loading...";
              case "success":
                return `Review (${r.snapshot.availableReviews.length})`;
              case "failure":
                return "Couldn't load reviews";
            }
          })()}
        </A>
        <A class={styles.Settings} href="/settings">
          Settings
        </A>
      </div>
    </header>
  );
};

export default Header;
