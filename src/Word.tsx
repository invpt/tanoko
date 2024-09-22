import { JMdictSense, JMdictWord } from "@scriptin/jmdict-simplified-types";
import { Component, For, Show } from "solid-js";

import styles from "./Word.module.css";
import { useSrs } from "./srs/srs";
import { segmentReading, smartApproximateDuration } from "./util";

const Word: Component<{ word: JMdictWord; onClick: () => void }> = (props) => {
  const { snapshot } = useSrs();

  const reviewIn = () => {
    const now = new Date();

    const s = snapshot();
    if (s.status !== "success") {
      return undefined;
    }

    const entry = s.snapshot.state["jmdict-vocab"][props.word.id];
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

  const headline = () => {
    if (props.word.kanji[0] != null && props.word.kanji[0].common) {
      return props.word.kanji[0].text;
    } else {
      return props.word.kana[0].text;
    }
  };
  const headlineReading = () => {
    if (props.word.kanji[0] != null && props.word.kanji[0].common) {
      return props.word.kana[0].text;
    } else {
      return undefined;
    }
  };

  return (
    <div class={styles.Word}>
      <div class={styles.WordHeadline}>
        <WordTitle word={props.word} />
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
        <WordSenses senses={props.word.sense} />
      </div>
    </div>
  );
};

export const WordTitle: Component<{
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

export const WordSenses: Component<{ senses: JMdictSense[] }> = (props) => {
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

export default Word;
