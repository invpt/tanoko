<script lang="ts" generics="T extends string">
  import { RadioGroup, Label, useId } from "bits-ui";

  interface RadioOption<T> {
    value: T;
    label: string;
  }

  interface Props<T> {
    options: RadioOption<T>[];
    value?: T;
    orientation?: "horizontal" | "vertical";
  }

  let { options, value = $bindable(), orientation = "horizontal" }: Props<T> = $props();
</script>

<RadioGroup.Root
  bind:value={() => (value === undefined ? "" : value), (v) => (value = v === "" ? undefined : v)}
  {orientation}
>
  {#snippet child({ props })}
    <div {...props} class="radio-group" data-orientation={orientation}>
      {#each options as option (option.value)}
        {@const id = useId()}
        <div class="radio-option">
          <RadioGroup.Item {id} value={option.value}>
            {#snippet child({ props: itemProps })}
              <button {...itemProps} class="radio-input"></button>
            {/snippet}
          </RadioGroup.Item>
          <Label.Root for={id}>
            {#snippet child({ props: labelProps })}
              <label {...labelProps} class="radio-label">
                {option.label}
              </label>
            {/snippet}
          </Label.Root>
        </div>
      {/each}
    </div>
  {/snippet}
</RadioGroup.Root>

<style>
  .radio-group {
    display: flex;
    gap: 0.5em;
  }

  .radio-group[data-orientation="vertical"] {
    flex-direction: column;
  }

  .radio-group[data-orientation="horizontal"] {
    flex-direction: row;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.25em;
  }

  .radio-input {
    width: 1em;
    height: 1em;
    border-radius: 50%;
    border: 1px solid var(--t-border);
    background: var(--t-input-background);
    cursor: pointer;
    margin: 0;
    position: relative;
  }

  .radio-input:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .radio-input[data-state="checked"] {
    border-color: var(--t-primary);
    background: var(--t-primary);
  }

  .radio-input[data-state="checked"]::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0.4em;
    height: 0.4em;
    border-radius: 50%;
    background: var(--t-on-primary);
  }

  .radio-label {
    cursor: pointer;
    font-size: 0.9em;
  }

  .radio-input:disabled + .radio-label {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
