<script lang="ts">
  import { searchParams } from "sv-router";
  import { dict, Language, QueryType, type DictionaryEntry } from "../lib/dict";
  import Word from "../lib/components/Word.svelte";
  import { processQuery } from "../lib/query";
  import { ArrowLeftRight, Languages } from "lucide-svelte";

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
  $effect(() => {
    if (processed != null && language != null) {
      const gen = dict.search(processed.query, language, processed.queryType);

      (async () => {
        const temp = [];
        for await (const result of gen) {
          temp.push(result);
          if (temp.length >= 32) {
            break;
          }
        }
        results = temp;
      })();
    }
  });

  const swapToAlternative = () => {
    [processed, alternative] = [alternative, processed];
  };
</script>

<main>
  {#if processed != null && alternative != null}
    <button class="alternative" onclick={swapToAlternative}>
      <Languages /> Searching{processed.brackets[0]}{processed.query}{processed
        .brackets[1]}({processed.kind}). Click to search by {alternative.kind}{alternative
        .brackets[0]}{alternative.query}{alternative.brackets[1]}instead.
    </button>
  {/if}
  <div class="results">
    {#each results as result (result.type === "jmdict" ? result.id : result.traditional + "|" + result.simplified + "|" + result.pinyin.join("|"))}
      <Word word={result} />
    {/each}
  </div>
</main>

<style>
  main {
    margin: 20px 16px 0 16px;
    display: flex;
    flex-direction: column;
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

  .results {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
