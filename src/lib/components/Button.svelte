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
    padding: 2px 10px;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  button:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  button:active:not(:disabled) {
    filter: brightness(0.8);
  }

  button:focus-visible {
    outline: 2px solid var(--t-focus-ring);
    outline-offset: 2px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
