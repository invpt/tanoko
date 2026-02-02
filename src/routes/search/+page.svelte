<script lang="ts">
  import { searchParams } from "sv-router";
  import { dict, Language, type DictionaryEntry } from "../../lib/dict";
  import Word from "../../components/Word.svelte";
  import { processQuery } from "../../lib/query";
  import { Languages } from "lucide-svelte";
  import { type Query } from "../../lib/query/interfaces";
  import { ItemType } from "../../lib/item";
  import { searchState } from "../../reactives/search.svelte";
  import { type SearchResults, querySearchResults } from "./results.svelte";

  const query = $derived(searchParams.get("q"));
  const language = $derived.by(() => {
    const param = searchParams.get("lang");
    switch (param) {
      case Language.Chinese:
      case Language.Japanese:
        return param;
      default:
        return undefined;
    }
  });

  // TODO: useAlternative should be in the query params
  let useAlternative = $state(false);

  let direct = $state.raw<Query | null>();
  let alternative = $state.raw<Query | null>();

  let searchResults = $state<SearchResults>();

  $effect(() => {
    if (language != null && query != null) {
      [direct, alternative] = processQuery(query, language);
    } else {
      direct = undefined;
      alternative = undefined;
    }
  });

  $effect(() => {
    const query = useAlternative ? (alternative ?? direct) : direct;
    if (query == null || language == null) {
      searchResults = undefined;
      return;
    }

    querySearchResults(query, language).then((results) => {
      searchResults = results;
    });
  });

  $effect(() => {
    const handleScroll = () => {
      if (
        searchResults != null &&
        !searchState.loading &&
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000
      ) {
        searchResults.loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  });
</script>

<main>
  {#if direct != null}
    <button
      class={{ alternative: true, active: alternative != null }}
      onclick={alternative != null ? () => (useAlternative = !useAlternative) : undefined}
    >
      {#if alternative != null}
        {@const current = useAlternative ? alternative : direct}
        {@const other = useAlternative ? direct : alternative}

        <Languages class="alternativeIcon" /> Searching{current}({current.kind()}). Click to search
        by {other.kind()} instead.
      {:else}
        <Languages class="alternativeIcon" /> Searching{direct}({direct.kind()}).
      {/if}
    </button>
  {/if}

  {#each searchResults?.results as result (result.type === ItemType.jmdict ? result.id : result.traditional + "|" + result.simplified + "|" + result.pinyin)}
    <Word word={result} />
    <div class="divider"></div>
  {/each}

  <div class="message">
    {#if searchState.loading}
      Loading...
    {:else if searchResults?.results.length === 0}
      No results
    {:else if searchResults == null}
      No more results
    {/if}
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .alternative {
    all: unset;
    user-select: none;

    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 auto;

    color: color-mix(in srgb, var(--t-on-background) 75%, transparent);
    font-size: 0.9em;
  }

  .alternative.active {
    cursor: pointer;
  }

  .alternative.active:hover {
    text-decoration: underline;
  }

  .alternative :global(.alternativeIcon) {
    width: 1em;
    height: 1em;
    min-width: 1em;
  }

  .message {
    text-align: center;
    color: color-mix(in srgb, var(--t-on-background) 25%, transparent);
  }

  .divider {
    border-top: 2px solid var(--t-secondary);
  }
</style>
