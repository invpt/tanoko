<script lang="ts">
  import Button from "../../components/base/Button.svelte";
  import RadioGroup from "../../components/base/RadioGroup.svelte";
  import { dict } from "../../lib/dict";
  import {
    ChineseCharacterVariant,
    ChinesePronunciationGuide,
    preferences,
  } from "../../reactives/preferences.svelte";

  const handleClearData = async () => {
    await dict.clearData();
    console.log("Cleared");
  };
</script>

<h2>Chinese settings</h2>
<p class="text-sm">Character variant</p>
<RadioGroup
  options={[
    { label: "Simplified", value: ChineseCharacterVariant.simplified },
    { label: "Traditional", value: ChineseCharacterVariant.traditional },
  ]}
  bind:value={preferences.chinese.characterVariant}
/>
<p class="text-sm">Pronunciation guide</p>
<RadioGroup
  options={[
    { label: "Pinyin", value: ChinesePronunciationGuide.pinyin },
    { label: "Bopomofo", value: ChinesePronunciationGuide.bopomofo },
  ]}
  bind:value={preferences.chinese.pronunciationGuide}
/>

<h2>Developer options</h2>
<Button onclick={handleClearData}>Clear dictionary data</Button>
