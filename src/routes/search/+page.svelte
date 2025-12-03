<script lang="ts">
  import { searchParams } from "sv-router";
  import { dict, Language, type DictionaryEntry } from "../../lib/dict";
  import Word from "../../components/Word.svelte";
  import { processQuery } from "../../lib/query";
  import { Languages } from "lucide-svelte";
  import { type Query } from "../../lib/query/interfaces";
  import { ItemType } from "../../lib/item";
  import { searchState } from "../../reactives/search.svelte";

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

  let results = $state<DictionaryEntry[]>([]);
  let generator = $state.raw<AsyncGenerator<DictionaryEntry>>();

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
      results = [];
      generator = undefined;
      return;
    }

    generator = dict.search(query, language);
    queueMicrotask(() => loadMore(true));
  });

  $effect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  });

  const loadMore = async (clear: boolean) => {
    if (generator == null || searchState.loading) {
      return;
    }

    searchState.loading = true;

    try {
      const newResults = [];
      for (let i = 0; i < 100; i++) {
        const result = await generator.next();
        if (result.done) {
          generator = undefined;
          break;
        } else {
          if (clear) {
            results = [];
            clear = false;
          }

          newResults.push(result.value);
        }
      }
      results.push(...newResults);

      if (clear) {
        results = [];
      }
    } catch (error) {
      // TODO: error popup or something
      console.error("Failed to load results:", error);
    }

    searchState.loading = false;
  };

  const handleScroll = () => {
    if (
      generator != null &&
      !searchState.loading &&
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000
    ) {
      loadMore(false);
    }
  };
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

  {#each results as result (result.type === ItemType.jmdict ? result.id : result.traditional + "|" + result.simplified + "|" + result.pinyin)}
    <Word word={result} />
    <div class="divider"></div>
  {/each}

  <div class="message">
    {#if searchState.loading}
      Loading...
    {:else if results.length === 0}
      No results
    {:else if generator == null}
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
