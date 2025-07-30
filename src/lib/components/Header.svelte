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
      searchParams.set("q", query);
      searchParams.set("lang", language);
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
  <span class="title">tanoko</span>
  <span class="search-wrapper">
    <input bind:value={query} onkeyup={handleKeyUp} placeholder="Search" />
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
</nav>

<style>
  nav {
    display: flex;
    flex-direction: row;
    align-items: center;
    background-color: rgb(238, 238, 238);
    padding: 8px;
    border-radius: 20px;
  }

  .title {
    margin: 0 8px;
  }

  .search-wrapper {
    flex: 1;

    display: flex;
    flex-direction: row;
    align-items: stretch;
  }

  input {
    flex: 1;

    width: 0;
    border: unset;
    outline: unset;
    background-color: unset;
    padding: 8px 0;
    padding-left: 12px;
    border-top-left-radius: 16px;
    border-bottom-left-radius: 16px;
    background-color: white;
  }

  button {
    all: unset;

    user-select: none;
    cursor: pointer;

    --bg: white;
    --fg: black;

    background-color: var(--bg);
    color: var(--fg);

    padding: 8px 10px;
  }

  button:hover {
    background-color: color-mix(in hsl, var(--bg), black 10%);
  }

  .japanese {
    border-top-right-radius: 16px;
    border-bottom-right-radius: 16px;
  }

  .selected {
    --bg: var(--t-primary);
    --fg: var(--t-on-primary);
  }
</style>
