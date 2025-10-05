<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {}

  const { children, ...restProps }: Props = $props();
</script>

<button {...restProps}>
  {@render children?.()}
</button>

<style>
  button {
    all: unset;
    cursor: pointer;
    user-select: none;
    background-color: var(--t-primary);
    color: var(--t-on-primary);
    padding: 2px 6px;
    border-radius: 6px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
