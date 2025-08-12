<script lang="ts">
  import Word from "../lib/components/Word.svelte";
  import { dict, Language } from "../lib/dict";
  import { ItemType } from "../lib/item";
  import { route } from "../router";

  const params = $derived(route.getParams("/item/:type/:index"));
  const promise = $derived(
    dict.loadEntry(
      parseInt(params.index),
      params.type === ItemType.cedict ? Language.Chinese : Language.Japanese,
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
