<script lang="ts">
  import type { KeyboardEventHandler } from "svelte/elements";
  import { isActive, navigate } from "./router";
  import { Language } from "./lib/dict";
  import { searchParams } from "sv-router";
  import { searchState } from "./reactives/search.svelte";
  import AlertDialog from "./components/base/AlertDialog.svelte";
  import { ChineseCharacterVariant, preferences } from "./reactives/preferences.svelte";

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

  let isDebouncing = $state(false);
  let debounceTimer: number | null = null;
  let showLanguageDialog = $state(false);
  const languageActions = [
    { value: Language.Chinese, label: "Chinese" },
    { value: Language.Japanese, label: "Japanese" },
  ];

  $effect(() => {
    query;
    if (isActive("/search")) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      isDebouncing = true;
      debounceTimer = setTimeout(() => {
        isDebouncing = false;
        debounceTimer = null;
        search();
      }, 200);
    }
  });

  const search = (selected?: Language) => {
    if (selected) {
      language = selected;
    }

    if (language == null) {
      // Show dialog to select language
      showLanguageDialog = true;
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

  const handleLanguageAction = (selectedLang: Language) => {
    search(selectedLang);
  };

  const handleKeyUp: KeyboardEventHandler<HTMLInputElement> = (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      search();
    }
  };
</script>

<nav class={{ loading: searchState.loading || isDebouncing, active: isActive("/search") }}>
  <a class="title" href="/" lang="ja">
    <span>ただ</span>
    <span class="titleDeemph">の</span>
    <span>ことば</span>
  </a>
  <span class="search-wrapper">
    <input
      bind:value={query}
      onkeyup={handleKeyUp}
      placeholder="Search"
      lang={language === Language.Chinese
        ? preferences.chinese.characterVariant === ChineseCharacterVariant.simplified
          ? "zh-Hans"
          : "zh-Hant"
        : "ja"}
      autocapitalize="none"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
    />
    <button
      onclick={() => search(Language.Chinese)}
      class={["chinese", { selected: language === Language.Chinese }]}
      title="Chinese"
      lang="zh-Hans"
    >
      中
    </button>
    <button
      onclick={() => search(Language.Japanese)}
      class={["japanese", { selected: language === Language.Japanese }]}
      title="Japanese"
      lang="ja"
    >
      日
    </button>
  </span>
  <div class="buttons">
    <a class="reviews" href="/settings">Settings</a>
  </div>
</nav>

<AlertDialog
  bind:open={showLanguageDialog}
  title="Select a language"
  description="Choose a language for your search."
  actions={languageActions}
  cancelText="Cancel"
  onAction={handleLanguageAction}
/>

<style>
  nav {
    display: grid;
    grid-template-columns: auto 1fr auto;
    color: var(--t-on-secondary);
    align-items: stretch;
    padding: 8px 16px;
    margin: 16px;
    margin-bottom: 0;
    border-radius: 16px;
    gap: 16px 16px;

    background-image: linear-gradient(
      90deg,
      color-mix(in hsl, var(--t-secondary), var(--t-on-background) 10%) 0%,
      var(--t-secondary) 50%,
      var(--t-secondary) 100%
    );
    background-size: 400% 100%;
    background-position: 100% 0;
    transition: background-position 2s;
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

  nav.loading {
    animation: loading-bar 3s linear infinite;
  }

  @keyframes loading-bar {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -300% 0;
    }
  }

  .title {
    margin: auto 0;
    font-size: 28px;
    color: var(--t-on-secondary);
    text-decoration: none;
    display: flex;
    align-items: baseline;
    transform: translateY(-2px) rotate(-3deg);
    transition: transform 0.15s;
    flex-wrap: wrap;
  }

  .title:hover {
    transform: translateY(-2px) rotate(-3deg) scale(1.1);
  }

  .title:active {
    transform: translateY(-2px) rotate(-3deg) scale(1.05);
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

  nav:not(.active) input {
    color: color-mix(in hsl, var(--t-on-background), var(--t-background) 35%);
  }

  .search-wrapper button {
    outline: none;
    border: none;
    user-select: none;
    cursor: pointer;

    --bg: var(--t-background);
    --fg: var(--t-on-background);

    background-color: var(--bg);
    color: var(--fg);

    padding: 4px 8px;

    font-size: 1.1em;
  }

  .search-wrapper button:hover {
    background-color: color-mix(in hsl, var(--bg), black 10%);
  }

  .search-wrapper button.japanese {
    border-top-right-radius: 16px;
    border-bottom-right-radius: 16px;
  }

  .search-wrapper button.selected {
    --bg: var(--t-primary);
    --fg: var(--t-on-primary);
  }

  nav:not(.active) .search-wrapper button.selected {
    filter: saturate(75%);
    opacity: 65%;
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
