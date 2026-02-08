<script lang="ts">
  import Word from "../../components/Word.svelte";
  import { Languages } from "lucide-svelte";
  import { ItemType } from "../../lib/item";
  import { searchState } from "../../reactives/search.svelte";
  import { type SearchResults, querySearchResults } from "./results.svelte";

  let results = $state.raw<SearchResults[]>([]);

  let current = $derived(
    results.length > 1 ? (searchState.interpret ? results[1] : results[0]) : results[0],
  );
  let other = $derived(
    results.length > 1 ? (searchState.interpret ? results[0] : results[1]) : undefined,
  );

  $effect(() => {
    searchState.updateSearchParams();
  });

  $effect(() => {
    if (searchState.language != null && searchState.query != null) {
      querySearchResults(searchState.query, searchState.language).then((r) => {
        results = r;
      });
    } else {
      results = [];
    }
  });

  $effect(() => {
    const handleScroll = () => {
      if (
        current != null &&
        !searchState.loading &&
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000
      ) {
        current.loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  });
</script>

<main>
  {#if current != null && other != null}
    <button
      class={{ alternative: true, active: other != null }}
      onclick={other != null ? () => (searchState.interpret = !searchState.interpret) : undefined}
    >
      <Languages class="alternativeIcon" /> Treating your query as {current.kind}. Click to search
      by {other.kind} instead. ({other.results.length}{other.hasMore ? "+" : ""} result{other
        .results.length !== 1
        ? "s"
        : ""})
    </button>
  {/if}

  {#each results as results}
    <div class="results" style:display={results === current ? undefined : "none"}>
      {#each results.results as result (result.type === ItemType.jmdict ? result.id : result.traditional + "|" + result.simplified + "|" + result.pinyin)}
        <Word word={result} />
        <div class="divider"></div>
      {/each}
    </div>
  {/each}

  <div class="message">
    {#if searchState.loading}
      Loading...
    {:else if current == null}
      No results
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

  .results {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .message {
    text-align: center;
    color: color-mix(in srgb, var(--t-on-background) 25%, transparent);
  }

  .divider {
    border-top: 2px solid var(--t-secondary);
  }
</style>
