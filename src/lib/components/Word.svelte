<script lang="ts">
  import { p } from "../../router";
  import { Language, type DictionaryEntry } from "../dict";
  import { segmentFurigana } from "../format/furigana";
  import { formatPinyin, segmentPinyin } from "../format/pinyin";
  import { ItemType } from "../item";

  const { word }: { word: DictionaryEntry } = $props();

  const rank = $derived((word.index + 1).toLocaleString());
</script>

<div class="word">
  <div class="headline">
    {#if word.type === ItemType.jmdict}
      {@const segments = segmentFurigana(
        word.kanji?.[0]?.text ?? word.kana[0].text,
        word.kana[0].text,
      )}
      {@const hasAnyReading = segments.some((el) => el.kana.length > 0)}
      <ruby class="wordTitleBase fontJapanese">
        {#each segments as el}
          {el.kanji}{#if hasAnyReading}
            <rt
              class={{
                hiddenReading: false,
                reading: true,
              }}
            >
              {el.kana}
            </rt>
          {/if}
        {/each}
      </ruby>
    {:else}
      {@const segments = segmentPinyin(word.simplified, formatPinyin(word.pinyin))}
      <ruby class="wordTitleBase">
        {#each segments as segment}
          <span class="fontSimplifiedChinese">{segment.hanzi}</span><rt class="pinyin"
            >{segment.pinyin}</rt
          >
        {/each}
      </ruby>
    {/if}
    <a
      href={p("/item/:type/:index", { type: word.type, index: word.index.toString() })}
      class="rank"
      title="This word's frequency rank in the dictionary">#{rank}</a
    >
  </div>
  <div class="sensesWrapper">
    {#if word.type === ItemType.jmdict}
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

  .headline {
  }

  .rank {
    color: color-mix(in srgb, var(--t-on-background) 50%, transparent);
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

  .reading,
  .pinyin {
    user-select: none;
    pointer-events: none;
  }

  .pinyin {
    margin: 0 0.2em;
  }

  .hiddenReading {
    visibility: hidden;
  }

  .sensesWrapper {
    margin: 0 12px;
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

  .wordSense:not(:last-child) {
    margin-bottom: 0.25em;
  }

  .wordSense::marker {
    font-size: 0.75em;
    color: gray;
  }
</style>
