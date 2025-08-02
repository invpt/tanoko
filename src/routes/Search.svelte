<script lang="ts">
  import { searchParams } from "sv-router";
  import { dict, Language, QueryType, type DictionaryEntry } from "../lib/dict";
  import Word from "../lib/components/Word.svelte";
  import { processQuery } from "../lib/query";
  import { Languages } from "lucide-svelte";

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

  let processed = $state.raw<{
    query: string;
    queryType: QueryType;
    kind: string;
    brackets: readonly [string, string];
  }>();
  let alternative = $state.raw<{
    query: string;
    queryType: QueryType;
    kind: string;
    brackets: readonly [string, string];
  }>();

  $effect(() => {
    if (language != null && query != null) {
      [processed, alternative] = processQuery(query, language);
    } else {
      processed = undefined;
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
    if (processed != null && language != null) {
      generator = dict.search(processed.query, language, processed.queryType);
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

  const swapToAlternative = () => {
    [processed, alternative] = [alternative, processed];
  };
</script>

<main>
  {#if processed != null && alternative != null}
    <button class="alternative" onclick={swapToAlternative}>
      <Languages class="alternativeIcon" /> Searching{processed
        .brackets[0]}{processed.query}{processed.brackets[1]}({processed.kind}). Click to search by {alternative.kind}{alternative
        .brackets[0]}{alternative.query}{alternative.brackets[1]}instead.
    </button>
  {/if}

  {#if results.length > 0}
    {#each results as result (result.type === "jmdict" ? result.id : result.traditional + "|" + result.simplified + "|" + result.pinyin.join("|"))}
      <Word word={result} />
    {/each}

    {#if showLoadingIndicator && hasMoreResults}
      <div class="loading">Loading more...</div>
    {/if}

    {#if !hasMoreResults}
      <div class="end-message">No more results</div>
    {/if}
  {:else if processed != null}
    {#if showLoadingIndicator}
      <div class="loading">Loading...</div>
    {:else if !isLoading}
      <div class="no-results">No results found</div>
    {/if}
  {/if}
</main>

<style>
  main {
    margin: 20px 16px 0 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .alternative {
    all: unset;
    cursor: pointer;
    user-select: none;

    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 auto;

    color: #444;
    font-size: 0.9em;
  }

  .alternative:hover {
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
    padding: 20px;
    color: #666;
    font-style: italic;
  }

  .end-message {
    border-top: 1px solid #eee;
    margin-top: 20px;
  }
</style>
