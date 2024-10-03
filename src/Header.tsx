import { A, useLocation, useNavigate } from "@solidjs/router";
import {
  Component,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
} from "solid-js";

import styles from "./Header.module.css";
import { useSrs } from "./srs/srs";

const Header: Component = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { snapshot: reviews } = useSrs();
  const [query, setQuery] = createSignal("");

  const onSearchPage = () => location.pathname === "/search";

  const searchId = createUniqueId();

  createEffect(() => {
    if (onSearchPage()) {
      if (location.query.query !== "") {
        setQuery(location.query.query);
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
      </A>
      <form
        class={styles.SearchBar}
        classList={{ [styles.SearchBarOtherPage]: !onSearchPage() }}
        onSubmit={handleSearch}
      >
        <input
          class={styles.SearchInput}
          type="text"
          onInput={(ev) => setQuery(ev.currentTarget.value)}
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
