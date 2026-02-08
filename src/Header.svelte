<script lang="ts">
  import type { KeyboardEventHandler } from "svelte/elements";
  import { isActive, navigate } from "./router";
  import { Language } from "./lib/dict";
  import { searchState } from "./reactives/search.svelte";
  import AlertDialog from "./components/base/AlertDialog.svelte";
  import { ChineseCharacterVariant, preferences } from "./reactives/preferences.svelte";
  import { X } from "lucide-svelte";

  let query = $derived(searchState.query);

  let isDebouncing = $state(false);
  let debounceTimer: number | null = null;
  let showLanguageDialog = $state(false);
  let searchInput: HTMLInputElement;
  const languageActions = [
    { value: Language.Chinese, label: "Chinese" },
    { value: Language.Japanese, label: "Japanese" },
  ];

  const search = () => {
    if (searchState.language == null) {
      showLanguageDialog = true;
      return;
    }

    searchState.query = query;

    if (!searchState.active) {
      navigate("/search");
    }
  };

  const handleLanguageChange = (selectedLang: Language) => {
    searchState.language = selectedLang;
    search();
  };

  const handleQueryChange = (newQuery: string) => {
    query = newQuery;

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
  };

  const handleKeyUp: KeyboardEventHandler<HTMLInputElement> = (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      search();
    }
  };

  const handleClear = () => {
    query = "";
    searchInput?.focus();
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
      bind:this={searchInput}
      bind:value={() => query, handleQueryChange}
      onkeyup={handleKeyUp}
      placeholder="Search"
      lang={searchState.language === Language.Chinese
        ? preferences.chinese.characterVariant === ChineseCharacterVariant.simplified
          ? "zh-Hans"
          : "zh-Hant"
        : "ja"}
      autocapitalize="none"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
    />
    <button onclick={handleClear} class="clear" title="Clear the search query">
      <X size={18} />
    </button>
    <div style="width: 8px"></div>
    <button
      onclick={() => handleLanguageChange(Language.Chinese)}
      class={["language", "chinese", { selected: searchState.language === Language.Chinese }]}
      title="Chinese"
      lang="zh-Hans"
    >
      中
    </button>
    <button
      onclick={() => handleLanguageChange(Language.Japanese)}
      class={["language", "japanese", { selected: searchState.language === Language.Japanese }]}
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
  onAction={handleLanguageChange}
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

  .clear {
    outline: none;
    border: none;
    user-select: none;
    cursor: pointer;

    background-color: var(--t-background);
    color: color-mix(in hsl, var(--t-on-background), var(--t-background) 50%);

    padding: 4px 10px;
  }

  .clear {
    border-top-right-radius: 16px;
    border-bottom-right-radius: 16px;
  }

  .clear:hover {
    color: color-mix(in hsl, var(--t-on-background), var(--t-background) 35%);
  }

  .language {
    outline: none;
    border: none;
    user-select: none;
    cursor: pointer;

    background-color: var(--t-background);
    color: var(--t-on-background);

    padding: 4px 10px;

    font-size: 1.1em;
  }

  .language.chinese {
    border-top-left-radius: 16px;
    border-bottom-left-radius: 16px;
  }

  .language.japanese {
    border-top-right-radius: 16px;
    border-bottom-right-radius: 16px;
  }

  .language:hover {
    background-color: color-mix(in hsl, var(--t-background), var(--t-on-background) 10%);
  }

  .language.selected {
    background-color: var(--t-primary);
    color: var(--t-on-primary);
  }

  .language.selected:hover {
    background-color: color-mix(in hsl, var(--t-primary), var(--t-on-primary) 10%);
  }

  nav:not(.active) .language.selected {
    background-color: color-mix(in hsl, var(--t-primary), black 20%);
  }

  nav:not(.active) .language.selected:hover {
    background-color: color-mix(in hsl, var(--t-primary), black 30%);
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
