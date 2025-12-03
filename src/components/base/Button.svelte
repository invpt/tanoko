<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    icon?: Snippet;
    variant?: "primary" | "secondary" | "text";
  }

  const { icon, variant = "primary", children, ...restProps }: Props = $props();
</script>

<button {...restProps} data-variant={variant}>
  {@render icon?.()}
  {@render children?.()}
</button>

<style>
  button {
    all: unset;
    cursor: pointer;
    user-select: none;
    display: flex;
    flex-direction: row;
    gap: 6px;
    align-items: center;
  }

  button[data-variant="primary"],
  button[data-variant="secondary"] {
    padding: 2px 10px;
    font-size: 0.875rem;
    border-radius: 6px;
  }

  button[data-variant="primary"] {
    background-color: var(--t-primary);
    color: var(--t-on-primary);
  }

  button[data-variant="secondary"] {
    background-color: var(--t-secondary);
    color: var(--t-on-secondary);
    border: 1px solid var(--t-border);
  }

  button[data-variant="text"] {
    border-radius: unset;
  }

  button:hover:not(:disabled):not([data-variant="text"]) {
    filter: brightness(0.9);
  }

  button[data-variant="text"]:hover:not(:disabled) {
    text-decoration: underline;
  }

  button:active:not(:disabled):not([data-variant="text"]) {
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
