import { JMdictSense } from "@scriptin/jmdict-simplified-types";
import { Component, For, Show } from "solid-js";

import styles from "./Word.module.css";
import { useSrs } from "./srs/srs";
import {
  segmentReading,
  smartApproximateDuration,
  toToneAccents,
} from "./util";
import { DictionaryEntry, type CedictWord, type JMdictWord } from "./dict/dict";

const Word: Component<{ word: DictionaryEntry; onClick: () => void }> = (
  props,
) => {
  const { snapshot } = useSrs();

  const isJmdict = (word: DictionaryEntry): word is JMdictWord => {
    return "id" in word;
  };

  const isCedict = (word: DictionaryEntry): word is CedictWord => {
    return (
      "simplified" in word &&
      "traditional" in word &&
      "pinyin" in word &&
      "senses" in word
    );
  };

  const getSrsKey = (word: DictionaryEntry) => {
    if (isJmdict(word)) {
      return "jmdict-vocab";
    } else if (isCedict(word)) {
      return "cedict-vocab";
    }
    return undefined;
  };

  const getSrsId = (word: DictionaryEntry) => {
    if (isJmdict(word)) {
      return word.id;
    } else if (isCedict(word)) {
      return `${word.traditional}::${word.simplified}::${word.pinyin.join(";")}`;
    }
    return undefined; // Should not happen
  };

  const reviewIn = () => {
    const now = new Date();

    const s = snapshot();
    if (s.status !== "success") {
      return undefined;
    }

    const srsKey = getSrsKey(props.word);
    const srsId = getSrsId(props.word);

    if (srsKey === undefined || srsId === undefined) {
      return undefined;
    }

    const entry = s.snapshot.state[srsKey]?.[srsId];
    if (entry === undefined) {
      return undefined;
    }

    const ms = entry.nextReview.getTime() - now.getTime();
    if (ms <= 0) {
      return "now";
    } else {
      return "in " + smartApproximateDuration(ms);
    }
  };

  return (
    <div class={styles.word}>
      <div class={styles.wordHeadline}>
        <Show when={isJmdict(props.word)}>
          <JmdictWordTitle word={props.word as JMdictWord} />
        </Show>
        <Show when={isCedict(props.word)}>
          <CedictWordTitle word={props.word as CedictWord} />
        </Show>
        <div class={styles.headlineSkewer}>
          <div
            classList={{
              [styles.headlineSkewerSizer]: true,
              [styles.fontJapanese]: true,
            }}
          >
            &nbsp;
          </div>
          <div class={styles.headlineSpacer}></div>
          <Show when={reviewIn()}>
            <div class={styles.headlineBadge}>Review {reviewIn()}</div>
          </Show>
          <Show when={!reviewIn()}>
            <button class={styles.headlineBadge} onClick={props.onClick}>
              Add to deck
            </button>
          </Show>
        </div>
      </div>
      <div class={styles.sensesWrapper}>
        <Show when={isJmdict(props.word)}>
          <JmdictWordSenses senses={(props.word as JMdictWord).sense} />
        </Show>
        <Show when={isCedict(props.word)}>
          <CedictWordSenses senses={(props.word as CedictWord).senses} />
        </Show>
      </div>
    </div>
  );
};

export const JmdictWordTitle: Component<{
  word: JMdictWord;
  showReading?: boolean;
}> = (props) => {
  const showReading = () => props.showReading ?? true;
  const headline = () => {
    if (props.word.kanji[0] != null) {
      return props.word.kanji[0].text;
    } else {
      return props.word.kana[0].text;
    }
  };
  const headlineReading = () => {
    if (props.word.kanji[0] != null) {
      return props.word.kana[0].text;
    } else {
      return undefined;
    }
  };
  const segments = () => {
    const hl = headline();
    const hlr = headlineReading();
    if (hlr === undefined) {
      return [{ kanji: hl, reading: "" }];
    }

    return segmentReading(hl, hlr);
  };

  return (
    <>
      <ruby
        classList={{
          [styles.wordTitleBase]: true,
          [styles.fontJapanese]: true,
        }}
      >
        <For each={segments()}>
          {(el) => (
            <>
              {el.kanji}
              <rt
                classList={{
                  [styles.hiddenReading]: !showReading(),
                  [styles.reading]: true,
                }}
              >
                {el.reading}
              </rt>
            </>
          )}
        </For>
      </ruby>
    </>
  );
};

export const CedictWordTitle: Component<{
  word: CedictWord;
  showReading?: boolean;
}> = (props) => {
  const formattedPinyin = () => props.word.pinyin.map(toToneAccents).join(", ");

  return (
    <div class={styles.wordTitleBase}>
      <span class={styles.fontSimplifiedChinese}>{props.word.simplified}</span>
      <span class={styles.pinyin}>{formattedPinyin()}</span>
    </div>
  );
};

export const JmdictWordSenses: Component<{ senses: JMdictSense[] }> = (
  props,
) => {
  return (
    <ol class={styles.wordSenses}>
      {props.senses.map((sense) => (
        <>
          {sense.partOfSpeech && (
            <div class={styles.wordPartOfSpeech}>
              {sense.partOfSpeech.join("; ")}
            </div>
          )}
          <li class={styles.wordSense}>
            {sense.gloss.map((gloss) => gloss.text).join("; ")}
          </li>
        </>
      ))}
    </ol>
  );
};

export const CedictWordSenses: Component<{ senses: string[][] }> = (props) => {
  return (
    <ol class={styles.wordSenses}>
      {props.senses.map((senseGroup) => (
        <li class={styles.wordSense}>{senseGroup.join("; ")}</li>
      ))}
    </ol>
  );
};

export default Word;
