<script lang="ts">
  import type { KeyboardEventHandler } from "svelte/elements";
  import { isActive, navigate } from "../../router";
  import { Language } from "../dict";
  import { searchParams } from "sv-router";

  let query = $derived(searchParams.get("q") ?? "");
  let language = $derived.by(() => {
    const param = searchParams.get("lang");
    switch (param) {
      case Language.Chinese:
      case Language.Japanese:
        return param;
      default:
        return undefined;
    }
  });

  // update the search query as the user types, but only if they're on the search page
  $effect(() => {
    query;
    if (isActive("/search")) {
      search();
    }
  });

  const search = (selected?: Language) => {
    if (selected) {
      language = selected;
    }

    if (language == null) {
      return;
    }

    if (isActive("/search")) {
      searchParams.set("q", query, { replace: true });
      searchParams.set("lang", language, { replace: true });
    } else {
      navigate("/search", {
        search: new URLSearchParams({ q: query, lang: language }).toString(),
      });
    }
  };

  const handleKeyUp: KeyboardEventHandler<HTMLInputElement> = (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      search();
    }
  };
</script>

<nav>
  <a class="title" href="/">
    <span>ただ</span>
    <span class="titleDeemph">の</span>
    <span>ことば</span>
  </a>
  <span class="search-wrapper">
    <input
      bind:value={query}
      onkeyup={handleKeyUp}
      placeholder="Search"
      lang="ja"
      autocapitalize="none"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      autofocus
    />
    <button
      onclick={() => search(Language.Chinese)}
      class={["chinese", { selected: language === Language.Chinese }]}
      title="Chinese"
    >
      中
    </button>
    <button
      onclick={() => search(Language.Japanese)}
      class={["japanese", { selected: language === Language.Japanese }]}
      title="Japanese"
    >
      日
    </button>
  </span>
  <div class="buttons">
    <a class="reviews" href="/reviews">Reviews</a>
  </div>
</nav>

<style>
  nav {
    display: grid;
    grid-template-columns: auto 1fr auto;
    background-color: var(--t-secondary);
    color: var(--t-on-secondary);
    align-items: stretch;
    padding: 8px 16px;
    margin: 16px;
    margin-bottom: 0;
    border-radius: 16px;
    gap: 16px 16px;
  }

  @media (max-width: 700px) {
    nav {
      grid-template-columns: auto auto;
      margin: 0;
      border-radius: 0;
      padding-bottom: 16px;
    }

    .search-wrapper {
      grid-row: 2;
      grid-column: 1 / 3;
    }
  }

  .title {
    margin: auto 0;
    font-family: "Noto Serif JP";
    font-size: 28px;
    color: var(--t-on-secondary);
    text-decoration: none;
    display: flex;
    align-items: baseline;
    transform: translateY(-4px) rotate(-3deg);
    transition: transform 0.15s;
    flex-wrap: wrap;
  }

  .title:hover {
    transform: translateY(-5px) rotate(-3deg) scale(1.1);
  }

  .title:active {
    transform: translateY(-5px) rotate(-3deg) scale(1.05);
  }

  .title :nth-child(1) {
    padding-right: 3px;
  }

  .title :nth-child(3) {
    transform: translateY(4px);
  }

  .titleDeemph {
    font-size: 0.8em;
    transform: translateY(2px);
  }

  .search-wrapper {
    flex: 1;

    display: flex;
    flex-direction: row;
    align-items: stretch;
  }

  .search-wrapper input {
    flex: 1;

    width: 0;
    border: unset;
    outline: unset;
    background-color: unset;
    padding: 8px 0;
    padding-left: 12px;
    border-top-left-radius: 16px;
    border-bottom-left-radius: 16px;
    background-color: var(--t-background);
    color: var(--t-on-background);
  }

  .search-wrapper button {
    all: unset;

    user-select: none;
    cursor: pointer;

    --bg: var(--t-background);
    --fg: var(--t-on-background);

    background-color: var(--bg);
    color: var(--fg);

    padding: 8px 10px;
  }

  .search-wrapper button:hover {
    background-color: color-mix(in hsl, var(--bg), black 10%);
  }

  .search-wrapper .japanese {
    border-top-right-radius: 16px;
    border-bottom-right-radius: 16px;
  }

  .search-wrapper .selected {
    --bg: var(--t-primary);
    --fg: var(--t-on-primary);
  }

  .buttons {
    margin: auto 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px 20px;
    text-wrap: nowrap;
    flex-wrap: wrap;
  }

  .reviews {
    color: var(--t-on-secondary);
  }
</style>
