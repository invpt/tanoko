<script lang="ts" generics="T">
  import { AlertDialog } from "bits-ui";
  import Button from "./Button.svelte";

  interface ActionButton<T> {
    value: T;
    label: string;
    variant?: "primary" | "secondary";
  }

  interface Props<T> {
    open?: boolean;
    title: string;
    description?: string;
    actions: ActionButton<T>[];
    cancelText?: string;
    onAction?: (value: T) => void;
    onCancel?: () => void;
    onOpenChange?: (open: boolean) => void;
  }

  let {
    open = $bindable(false),
    title,
    description,
    actions,
    cancelText = "Cancel",
    onAction,
    onCancel,
    onOpenChange,
  }: Props<T> = $props();

  const handleAction = (value: T) => {
    if (onAction) {
      onAction(value);
    }
    open = false;
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    open = false;
  };

  const handleOpenChange = (newOpen: boolean) => {
    open = newOpen;
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
  };
</script>

<AlertDialog.Root bind:open onOpenChange={handleOpenChange}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay>
      {#snippet child({ props })}
        <div {...props} class="overlay"></div>
      {/snippet}
    </AlertDialog.Overlay>
    <AlertDialog.Content>
      {#snippet child({ props })}
        <div {...props} class="content">
          <AlertDialog.Title>
            {#snippet child({ props: titleProps })}
              <div {...titleProps} class="title">
                {title}
              </div>
            {/snippet}
          </AlertDialog.Title>

          {#if description}
            <AlertDialog.Description>
              {#snippet child({ props: descProps })}
                <div {...descProps} class="description">
                  {description}
                </div>
              {/snippet}
            </AlertDialog.Description>
          {/if}

          <div class="actions">
            <AlertDialog.Cancel>
              {#snippet child({ props: cancelProps })}
                <Button {...cancelProps} variant="secondary" onclick={handleCancel}>
                  {cancelText}
                </Button>
              {/snippet}
            </AlertDialog.Cancel>

            {#each actions as action}
              <AlertDialog.Action>
                {#snippet child({ props: actionProps })}
                  <Button {...actionProps} onclick={() => handleAction(action.value)}>
                    {action.label}
                  </Button>
                {/snippet}
              </AlertDialog.Action>
            {/each}
          </div>
        </div>
      {/snippet}
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 50;
  }

  .content {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: var(--t-background);
    border-radius: 4px;
    padding: 18px;
    z-index: 51;
    max-width: 90vw;
    min-width: 300px;
  }

  .title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--t-on-background);
    margin-bottom: 4px;
  }

  .description {
    font-size: 0.875rem;
    color: var(--t-on-background);
    opacity: 0.8;
    margin-bottom: 12px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
