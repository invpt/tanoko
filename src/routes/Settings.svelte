<script lang="ts">
  import Button from "../lib/components/Button.svelte";
  import RadioGroup from "../lib/components/RadioGroup.svelte";
  import { dict } from "../lib/dict";
  import {
    ChineseCharacterVariant,
    ChinesePronunciationGuide,
    preferences,
  } from "../lib/reactives/preferences.svelte";

  const handleClearData = async () => {
    await dict.clearData();
    console.log("Cleared");
  };
</script>

<h2>Chinese settings</h2>
<small>Character variant</small>
<RadioGroup
  options={[
    { label: "Simplified", value: ChineseCharacterVariant.simplified },
    { label: "Traditional", value: ChineseCharacterVariant.traditional },
  ]}
  bind:value={preferences.chinese.characterVariant}
/>
<small>Pronunciation guide</small>
<RadioGroup
  options={[
    { label: "Pinyin", value: ChinesePronunciationGuide.pinyin },
    { label: "Bopomofo", value: ChinesePronunciationGuide.bopomofo },
  ]}
  bind:value={preferences.chinese.pronunciationGuide}
/>

<h2>Developer options</h2>
<Button onclick={handleClearData}>Clear dictionary data</Button>
