<script lang="ts">
  import { type DictionaryEntry } from "../dict";
  import { segmentFurigana, toneNumbersToAccents } from "../word";

  const { word }: { word: DictionaryEntry } = $props();
</script>

<div class="word">
  <div class="wordHeadline">
    {#if word.type === "jmdict"}
      {@const kanji =
        word.kanji.length === 0 || !word.kanji[0].common ? word.kana[0].text : word.kanji[0].text}
      {@const segments = segmentFurigana(
        word.kanji?.[0]?.text ?? word.kana[0].text,
        word.kana[0].text,
      )}
      <ruby
        class={{
          wordTitleBase: true,
          fontJapanese: true,
        }}
      >
        {#each segments as el}
          {el.kanji}<rt
            class={{
              hiddenReading: false,
              reading: true,
            }}
          >
            {el.reading}
          </rt>
        {/each}
      </ruby>
    {:else}
      <div class="wordTitleBase">
        <span class="fontSimplifiedChinese">{word.simplified}</span>
        <span class="pinyin">{word.pinyin.map((p) => toneNumbersToAccents(p)).join(", ")}</span>
      </div>
    {/if}
    <div class="headlineSkewer">
      <div
        class={{
          headlineSkewerSizer: true,
          fontJapanese: true,
        }}
      >
        &nbsp;
      </div>
      <div class="headlineSpacer"></div>
      <!--<div class="headlineBadge">Review {reviewIn()}</div>-->
      <button class="headlineBadge" onclick={() => {}}> Add to deck </button>
    </div>
  </div>
  <div class="sensesWrapper">
    {#if word.type === "jmdict"}
      <ol class="wordSenses">
        {#each word.sense as sense}
          {#if sense.partOfSpeech}
            <div class="wordPartOfSpeech">
              {sense.partOfSpeech.join("; ")}
            </div>
          {/if}
          <li class="wordSense">
            {sense.gloss.map((gloss) => gloss.text).join("; ")}
          </li>
        {/each}
      </ol>
    {:else}
      <ol class="wordSenses">
        {#each word.senses as senseGroup}
          <li class="wordSense">{senseGroup.join("; ")}</li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<style>
  .word {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .wordHeadline {
    display: flex;
    flex-direction: row;
    align-items: baseline;
  }

  .wordTitleBase {
    font-size: 1.75em;
  }

  .fontJapanese {
    font-family: "Noto Serif JP";
  }

  .fontTraditionalChinese {
    font-family: "Noto Serif TC";
  }

  .fontSimplifiedChinese {
    font-family: "Noto Serif SC";
  }

  .pinyin {
    font-family: "Noto Serif";
    margin-left: 0.25em;
    font-size: 0.75em;
    color: #444;
  }

  .reading {
    user-select: none;
  }

  .hiddenReading {
    visibility: hidden;
  }

  .headlineSkewer {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  .headlineSkewerSizer {
    width: 0;
    visibility: hidden;
    user-select: none;
    font-size: 1.75em;
    font-family: "Noto Serif JP";
  }

  .headlineSpacer {
    flex: 1;
    height: 2px;
    margin: 0 16px;
    background-color: rgb(230, 230, 230);
  }

  .headlineBadge,
  button.headlineBadge {
    border-radius: 8px;
    font-size: 0.8em;
    background-color: rgb(245, 245, 245);
    color: rgb(97, 97, 97);
    padding: 6px;
  }

  button.headlineBadge {
    border: none;
    cursor: pointer;
    user-select: none;
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  button.headlineBadge:hover {
    background-color: black;
    color: white;
  }

  .sensesWrapper {
    margin: 12px 24px;
  }

  .wordSenses {
    list-style-position: inside;
    margin: unset;
    padding: unset;
  }

  .wordPartOfSpeech {
    color: gray;
    font-size: 0.75em;
  }

  .wordSense {
    margin-bottom: 0.5em;
  }

  .wordSense::marker {
    font-size: 0.75em;
    color: gray;
  }
</style>
