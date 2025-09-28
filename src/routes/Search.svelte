<script lang="ts">
  import { searchParams } from "sv-router";
  import { dict, Language, type DictionaryEntry } from "../lib/dict";
  import Word from "../lib/components/Word.svelte";
  import { processQuery } from "../lib/query";
  import { Languages } from "lucide-svelte";
  import { type Query } from "../lib/query/interfaces";
  import { ItemType } from "../lib/item";

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

  $effect(() => {
    if (language != null && query != null) {
      [direct, alternative] = processQuery(query, language);
    } else {
      direct = undefined;
      alternative = undefined;
    }
  });

  let results = $state.raw<DictionaryEntry[]>([]);
  let generator = $state.raw<AsyncGenerator<DictionaryEntry> | null>(null);
  let isLoading = $state(false);
  let hasMoreResults = $state(true);
  let showLoadingIndicator = $state(false);
  let loadingTimeout: number | undefined;

  $effect(() => {
    if (direct != null && language != null) {
      generator =
        useAlternative && alternative != null
          ? dict.search(alternative, language)
          : dict.search(direct, language);

      hasMoreResults = true;
      clearLoadingState();

      // Trigger initial load manually (not in effect)
      queueMicrotask(() => loadResults(true));
    } else {
      results = [];
      generator = null;
      hasMoreResults = false;
      clearLoadingState();
    }
  });

  const loadResults = async (isInitialLoad = false) => {
    if (!generator || isLoading) return;

    isLoading = true;

    // Set up delayed loading indicator
    if (loadingTimeout) clearTimeout(loadingTimeout);
    loadingTimeout = setTimeout(() => {
      if (isLoading) showLoadingIndicator = true;
    }, 500);

    try {
      const batchSize = 10;
      const newResults: DictionaryEntry[] = [];

      for (let i = 0; i < batchSize; i++) {
        const next = await generator.next();
        if (next.done) {
          hasMoreResults = false;
          break;
        }
        newResults.push(next.value);
      }

      if (isInitialLoad) {
        results = newResults;
      } else {
        results = [...results, ...newResults];
      }
    } catch (error) {
      console.error("Error loading results:", error);
      hasMoreResults = false;
    } finally {
      clearLoadingState();
    }
  };

  const clearLoadingState = () => {
    isLoading = false;
    showLoadingIndicator = false;
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = undefined;
    }
  };

  // Infinite scroll handler
  const handleScroll = () => {
    if (
      hasMoreResults &&
      !isLoading &&
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000
    ) {
      loadResults(false);
    }
  };

  // Set up scroll listener
  $effect(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }
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

  {#if results.length > 0}
    {#each results as result (result.type === ItemType.jmdict ? result.id : result.traditional + "|" + result.simplified + "|" + result.pinyin)}
      <Word word={result} />
      <div class="divider"></div>
    {/each}

    {#if showLoadingIndicator && hasMoreResults}
      <div class="loading">Loading more...</div>
    {/if}

    {#if !hasMoreResults}
      <div class="end-message">No more results</div>
    {/if}
  {:else if direct != null}
    {#if showLoadingIndicator}
      <div class="loading">Loading...</div>
    {:else if !isLoading}
      <div class="no-results">No results found</div>
    {/if}
  {/if}
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

  .loading,
  .end-message,
  .no-results {
    text-align: center;
    color: color-mix(in srgb, var(--t-on-background) 25%, transparent);
  }

  .divider {
    border-top: 2px solid var(--t-secondary);
  }
</style>
