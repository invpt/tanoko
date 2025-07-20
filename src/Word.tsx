import { JMdictSense } from "@scriptin/jmdict-simplified-types";
import { Component, For, Show } from "solid-js";

import styles from "./Word.module.css";
import { useSrs } from "./srs/srs";
import { segmentReading, smartApproximateDuration } from "./util";
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
    <div class={styles.Word}>
      <div class={styles.WordHeadline}>
        <Show when={isJmdict(props.word)}>
          <JmdictWordTitle word={props.word as JMdictWord} />
        </Show>
        <Show when={isCedict(props.word)}>
          <CedictWordTitle word={props.word as CedictWord} />
        </Show>
        <div class={styles.HeadlineSkewer}>
          <div class={styles.HeadlineSkewerSizer}>&nbsp;</div>
          <div class={styles.HeadlineSpacer}></div>
          <Show when={reviewIn()}>
            <div class={styles.HeadlineBadge}>Review {reviewIn()}</div>
          </Show>
          <Show when={!reviewIn()}>
            <button class={styles.HeadlineBadge} onClick={props.onClick}>
              Add to deck
            </button>
          </Show>
        </div>
      </div>
      <div class={styles.SensesWrapper}>
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
      <ruby class={styles.WordTitle}>
        <For each={segments()}>
          {(el) => (
            <>
              {el.kanji}
              <rt classList={{ [styles.HiddenReading]: !showReading() }}>
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
  return (
    <div class={styles.WordTitle}>
      {props.word.traditional} ({props.word.simplified})
      <span class={styles.PinyinReading}>
        {" "}
        [{props.word.pinyin.join(", ")}]
      </span>
    </div>
  );
};

export const JmdictWordSenses: Component<{ senses: JMdictSense[] }> = (
  props,
) => {
  return (
    <ol class={styles.WordSenses}>
      {props.senses.map((sense) => (
        <>
          {sense.partOfSpeech && (
            <div class={styles.WordPartOfSpeech}>
              {sense.partOfSpeech.join("; ")}
            </div>
          )}
          <li class={styles.WordSense}>
            {sense.gloss.map((gloss) => gloss.text).join("; ")}
          </li>
        </>
      ))}
    </ol>
  );
};

export const CedictWordSenses: Component<{ senses: string[][] }> = (props) => {
  return (
    <ol class={styles.WordSenses}>
      {props.senses.map((senseGroup) => (
        <li class={styles.WordSense}>{senseGroup.join("; ")}</li>
      ))}
    </ol>
  );
};

export default Word;
