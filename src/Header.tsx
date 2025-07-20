import { A, useLocation, useNavigate } from "@solidjs/router";
import {
  Component,
  createEffect,
  createSignal,
  createUniqueId,
  JSX,
  onCleanup,
  onMount,
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

  const [selectedDict, setSelectedDict] = createSignal<"japanese" | "chinese">(
    (localStorage.getItem("selectedDict") as "japanese" | "chinese") ||
      "japanese",
  );

  const onSearchPage = () => location.pathname === "/search";

  const searchId = createUniqueId();

  onMount(() => {
    const persistedDict = localStorage.getItem("selectedDict");
    if (persistedDict === "japanese" || persistedDict === "chinese") {
      setSelectedDict(persistedDict);
    }
  });

  createEffect(() => {
    localStorage.setItem("selectedDict", selectedDict());
  });

  createEffect(() => {
    const queryParam = location.query.query;
    const newQuery = Array.isArray(queryParam) ? queryParam[0] : queryParam;

    const dictParam = location.query.dict;
    const newSelectedDict = dictParam === "chinese" ? "chinese" : "japanese";

    if (selectedDict() !== newSelectedDict) {
      setSelectedDict(newSelectedDict);
    }

    setQuery(newQuery || "");
    setDebouncedQuery(newQuery || "");
  });

  const debouncedSetDebouncedQuery = debounce(setDebouncedQuery, 250);

  createEffect(() => {
    if (onSearchPage()) {
      debouncedSetDebouncedQuery(query());
    }
  });

  createEffect(() => {
    if (onSearchPage()) {
      const currentUrl = new URL(window.location.href);
      const currentQueryParam = currentUrl.searchParams.get("query") || "";
      const currentDictParam =
        currentUrl.searchParams.get("dict") || "japanese";

      const targetQuery = debouncedQuery();
      const targetDict = selectedDict();

      const newUrlSearchParams = new URLSearchParams();
      newUrlSearchParams.set("query", targetQuery);
      newUrlSearchParams.set("dict", targetDict);

      const targetPathname = "/search";
      const targetSearchParams = newUrlSearchParams.toString();
      const newUrl = `${targetPathname}${targetSearchParams ? `?${targetSearchParams}` : ""}`;

      // Only navigate if the query or dict parameters have actually changed in a way that affects the URL
      // This prevents unnecessary navigations and redirect loops
      if (
        targetQuery !== currentQueryParam ||
        targetDict !== currentDictParam
      ) {
        navigate(newUrl, {
          replace: true,
          scroll: false,
        });
      }
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
  };

  const handleSearch = (ev: Event) => {
    ev.preventDefault();
    let url = `/search?query=${encodeURIComponent(query() || "")}`;
    url += `&dict=${selectedDict()}`;
    navigate(url);
  };

  const handleSelectedDictChange: JSX.EventHandlerUnion<
    HTMLInputElement,
    Event
  > = (event) => {
    const newDict = event.currentTarget.value as "japanese" | "chinese";
    setSelectedDict(newDict);
    const currentQ = query();
    let url = `/search?query=${encodeURIComponent(currentQ || "")}`;
    url += `&dict=${newDict}`;
    navigate(url, { replace: true, scroll: false });
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
        <div class={styles.SearchInputContainer}>
          <input
            class={styles.SearchInput}
            type="text"
            onInput={handleSearchInput}
            value={query()}
            placeholder="Press / to focus"
            id={searchId}
          />
          <div class={styles.DictSelectionInline}>
            <label class={styles.RadioLabel}>
              <input
                type="radio"
                name="dictType"
                value="japanese"
                checked={selectedDict() === "japanese"}
                onChange={handleSelectedDictChange}
              />
              Japanese
            </label>
            <label class={styles.RadioLabel}>
              <input
                type="radio"
                name="dictType"
                value="chinese"
                checked={selectedDict() === "chinese"}
                onChange={handleSelectedDictChange}
              />
              Chinese
            </label>
          </div>
        </div>
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
