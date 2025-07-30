<script lang="ts">
  import { searchParams } from "sv-router";
  import { dict, Language, QueryType, type DictionaryEntry } from "../lib/dict";
  import Word from "../lib/components/Word.svelte";
  import { processQuery } from "../lib/query";

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

  let processed = $state.raw<{ query: string; queryType: QueryType; transformation?: string }>();

  $effect(() => {
    if (language != null && query != null) {
      processed = processQuery(query, language);
    } else {
      processed = undefined;
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
</script>

<main>
  {#each results as result (result.type === "jmdict" ? result.id : result.traditional + "|" + result.simplified + "|" + result.pinyin.join("|"))}
    <Word word={result} />
  {/each}
</main>

<style>
  main {
    margin-top: 20px;
  }
</style>
