<script lang="ts">
  import { p } from "../../router";
  import { Language, type DictionaryEntry } from "../dict";
  import { formatBopomofo } from "../format/bopomofo";
  import { formatCedict } from "../format/cedict";
  import { segmentFurigana } from "../format/furigana";
  import { formatPinyin, segmentPinyin } from "../format/pinyin";
  import { ItemType } from "../item";
  import {
    ChineseCharacterVariant,
    ChinesePronunciationGuide,
    preferences,
  } from "../reactives/preferences.svelte";

  const { word }: { word: DictionaryEntry } = $props();

  const rank = $derived((word.index + 1).toLocaleString());

  const { headline, otherWritings, otherReadings, multipleReadingGroups } = $derived(
    (() => {
      if (word.type === ItemType.jmdict) {
        const arrayEq = (a: string[], b: string[]) =>
          a.length === b.length && a.every((a, i) => a === b[i]);
        const readingGroups: string[][] = [];
        const readings: { group: number; text: string; common: boolean }[] = [];
        const kanaWritings: { text: string; common: boolean; applicable: [] }[] = [];
        for (const kana of word.kana) {
          if (kana.appliesToKanji.length === 0) {
            kanaWritings.push({ text: kana.text, common: kana.common, applicable: [] });
          } else {
            let group = readingGroups.findIndex((g) => arrayEq(g, kana.appliesToKanji));
            if (group === -1) {
              group = readingGroups.length;
              readingGroups.push(kana.appliesToKanji);
            }

            readings.push({ group, text: kana.text, common: kana.common });
          }
        }

        readings.sort((a, b) => a.group - b.group);

        const writings: { text: string; common: boolean; applicable: number[] }[] = [];
        for (const kanji of word.kanji) {
          writings.push({
            text: kanji.text,
            common: kanji.common,
            applicable: readingGroups
              .map((g, i) => [g, i] as const)
              .filter(([g, _]) => g[0] === "*" || g.includes(kanji.text))
              .map(([_, i]) => i),
          });
        }
        for (const kanaWriting of kanaWritings) {
          writings.push(kanaWriting);
        }

        const useKanjiHeadline =
          writings.length !== 0 && (writings[0].common || !readings[0].common);

        const headline = useKanjiHeadline
          ? segmentFurigana(writings[0].text, readings[0].text, word.furigana)
          : [{ base: readings[0].text }];

        const multipleReadingGroups = readingGroups.length > 1;

        return {
          multipleReadingGroups,
          headline: {
            segments: headline,
            applicable: useKanjiHeadline && multipleReadingGroups ? writings[0].applicable : [],
          },
          otherWritings: useKanjiHeadline ? writings.slice(1) : writings,
          otherReadings: multipleReadingGroups ? readings : readings.slice(1),
        };
      } else {
        const characters =
          preferences.chinese.characterVariant === ChineseCharacterVariant.simplified
            ? word.simplified
            : word.traditional;

        return {
          multipleReadingGroups: false,
          headline: {
            segments: segmentPinyin(characters, word.pinyin).map((segment) => ({
              base: segment.base,
              gloss:
                preferences.chinese.pronunciationGuide === ChinesePronunciationGuide.pinyin
                  ? formatPinyin(segment.gloss)
                  : formatBopomofo(segment.gloss),
            })),
            applicable: [],
          },
          applicable: [],
          otherWritings: [],
          otherReadings: [],
        };
      }
    })(),
  );
</script>

{#snippet ordinal(i: number, first: boolean = true)}
  <sup class="readingGroupNumber"
    >{#if !first}|{/if}{i + 1}</sup
  >
{/snippet}

{#snippet ordinals(is: number[])}
  {#each is as i, j}
    {@render ordinal(i, j === 0)}
  {/each}
{/snippet}

<div
  class={["word", word.lang, preferences.chinese.pronunciationGuide, { multipleReadingGroups }]}
  lang={word.lang === Language.Chinese
    ? preferences.chinese.characterVariant === ChineseCharacterVariant.simplified
      ? "zh-Hans"
      : "zh-Hant"
    : "ja"}
>
  <div class="headline">
    {#each headline.segments as segment}
      <ruby>
        <rt
          >{#if word.type === ItemType.jmdict}
            {#each [...(segment.gloss || "")] as char}<span>{char}</span>{/each}
          {:else}{segment.gloss}{/if}</rt
        ><rb>{segment.base}</rb>
      </ruby>
    {/each}
    {@render ordinals(headline.applicable)}
    <div style:flex="1"></div>
    <a
      href={p("/item/:type/:index", { type: word.type, index: word.index.toString() })}
      class="rank"
      title="This word's frequency rank in the dictionary">#{rank}</a
    >
  </div>

  {#if otherWritings.length > 0 || otherReadings.length > 0}
    <div class="otherForms">
      {#if otherWritings.length > 0}
        <span class="otherFormsLabel">also</span>
        {#each otherWritings as w, i}<span class="otherForm">{i !== 0 ? "、" : ""}{w.text}</span
          >{@render ordinals(w.applicable)}{/each}
      {/if}
      {#if otherWritings.length > 0 && otherReadings.length > 0}
        <br />
      {/if}
      {#if otherReadings.length > 0}
        <span class="otherFormsLabel"
          >{#if !multipleReadingGroups}also{/if} read</span
        >
        {#each otherReadings as r, i}<span class="otherForm">{i !== 0 ? "、" : ""}</span
          >{@render ordinal(r.group)}<span class="otherForm">{r.text}</span>{/each}
      {/if}
    </div>
  {/if}

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
          <li class="wordSense">
            {formatCedict(
              senseGroup.join("; "),
              preferences.chinese.characterVariant === ChineseCharacterVariant.simplified,
            )}
          </li>
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

  .rank {
    float: right;
    color: color-mix(in srgb, var(--t-on-background) 50%, transparent);
  }

  .headline {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  ruby {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    font-size: 34px;
    line-height: 100%;
  }

  rt {
    all: unset;
    user-select: none;
    pointer-events: none;
    display: flex;
    justify-content: space-around;
    font-size: 50%;
    line-height: 100%;
  }

  rb {
    all: unset;
    display: flex;
    justify-content: space-around;
    line-height: 100%;
  }

  .zh rt {
    margin: 0 2px;
  }

  .zh.bopomofo ruby {
    display: inline;
  }

  .zh.bopomofo rb {
    display: inline-block;
    vertical-align: baseline;
  }

  .zh.bopomofo rt {
    display: inline-block;
    writing-mode: vertical-rl;
    vertical-align: middle;
    margin-top: -0.5em; /* alignment hack :/ */
    margin-right: 0.1em;
  }

  .sensesWrapper {
    margin: 0 12px;
    margin-top: 4px;
  }

  .wordSenses {
    list-style-position: inside;
    margin: unset;
    padding: unset;
  }

  .wordPartOfSpeech {
    color: gray;
    font-size: 0.75em;
    line-height: 100%;
  }

  .wordSense:not(:last-child) {
    margin-bottom: 0.25em;
  }

  .wordSense::marker {
    color: gray;
  }

  .otherForms {
    margin: 0 0 0.25em 0.1em;
    font-size: 1em;
    color: color-mix(in srgb, var(--t-on-background) 75%, transparent);
  }

  .readingGroupNumber {
    display: none;
  }

  .multipleReadingGroups .readingGroupNumber {
    display: unset;
    color: color-mix(in srgb, var(--t-on-background) 50%, transparent);
    font-size: 1.25em;
  }

  .multipleReadingGroups .readingGroupNumber:first-of-type {
    margin-left: 0.1em;
  }

  .otherFormsLabel {
    color: color-mix(in srgb, var(--t-on-background) 50%, transparent);
  }
</style>
