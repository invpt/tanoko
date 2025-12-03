<script lang="ts">
  import { Popover } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    open?: boolean;
    side?: "top" | "bottom" | "left" | "right";
    align?: "start" | "center" | "end";
    onOpenChange?: (open: boolean) => void;
    trigger: Snippet<[Record<string, unknown>]>;
    children: Snippet;
  }

  let { open = $bindable(false), side, align, onOpenChange, trigger, children }: Props = $props();

  const handleOpenChange = (newOpen: boolean) => {
    open = newOpen;
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
  };
</script>

<Popover.Root bind:open onOpenChange={handleOpenChange}>
  <Popover.Trigger>
    {#snippet child({ props })}
      {@render trigger(props)}
    {/snippet}
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content {side} {align}>
      {#snippet child({ wrapperProps, props })}
        <div {...wrapperProps}>
          <div {...props} class="content">
            {@render children()}
          </div>
        </div>
      {/snippet}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  .content {
    background-color: var(--t-background);
    border: 1px solid var(--t-border);
    border-radius: 8px;
    padding: 12px;
    z-index: 51;
    overflow: auto;
    color: var(--t-on-background);
  }
</style>
