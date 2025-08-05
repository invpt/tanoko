<script lang="ts">
  import Word from "../lib/components/Word.svelte";
  import { dict, Language } from "../lib/dict";
  import { route } from "../router";

  const params = $derived(route.getParams("/word/:lang/:index"));
  const promise = $derived(
    dict.loadEntry(
      parseInt(params.index),
      params.lang === Language.Chinese ? Language.Chinese : Language.Japanese,
    ),
  );
</script>

{#await promise}
  Loading...
{:then word}
  {#if word !== undefined}
    <Word {word} />
  {:else}{/if}
{:catch error}
  {error}
{/await}
