<script lang="ts" generics="T extends string">
  import { randomId } from "../utils/random-id";

  interface RadioOption<T> {
    value: T;
    label: string;
  }

  interface Props<T> {
    options: RadioOption<T>[];
    value?: T;
  }

  let { options, value = $bindable() }: Props<T> = $props();

  const name = randomId("radio-group");

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const selectedOption = options.find((option) => String(option.value) === target.value);
    if (selectedOption) {
      value = selectedOption.value;
    }
  }
</script>

<div role="radiogroup">
  {#each options as option (option.value)}
    <label class="radio-option">
      <input
        {name}
        type="radio"
        value={option.value}
        checked={value === option.value}
        onchange={handleChange}
      />
      {option.label}
    </label>
  {/each}
</div>

<style>
  div {
    display: flex;
    flex-direction: row;
    gap: 0.5em;
  }

  .radio-option {
    cursor: pointer;
  }

  input {
    margin: 0;
  }
</style>
