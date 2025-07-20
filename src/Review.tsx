import { createResource, createSignal, Show, type Component } from "solid-js";
import { useSrs } from "./srs/srs";

import styles from "./Review.module.css";
import {
  JmdictWordSenses,
  JmdictWordTitle,
  CedictWordSenses,
  CedictWordTitle,
} from "./Word";
import {
  dict,
  useDictStatus,
  DictionaryEntry,
  type JMdictWord,
  type CedictWord,
} from "./dict/dict";

const Review: Component = () => {
  const { snapshot, review } = useSrs();
  const dictStatus = useDictStatus();

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

  const getSrsId = (word: DictionaryEntry) => {
    if (isJmdict(word)) {
      return word.id;
    } else if (isCedict(word)) {
      return `${word.traditional}::${word.simplified}::${word.pinyin.join(
        ";",
      )}`;
    }
    return undefined;
  };

  const firstAvailable = () => {
    const r = snapshot();

    if (r.status !== "success" || r.snapshot.availableReviews.length === 0) {
      return undefined;
    }

    return r.snapshot.availableReviews[0];
  };

  const [revealed, setRevealed] = createSignal(false);

  const handleRevealClick = () => {
    setRevealed(true);
  };

  const handleCorrectClick = async () => {
    const availableWord = firstAvailable();
    if (availableWord && getSrsId(availableWord.word)) {
      try {
        await review(availableWord.type, getSrsId(availableWord.word)!, true);
        setRevealed(false);
      } catch (error) {
        console.error("Failed to record correct review:", error);
      }
    }
  };

  const handleIncorrectClick = async () => {
    const availableWord = firstAvailable();
    if (availableWord && getSrsId(availableWord.word)) {
      try {
        await review(availableWord.type, getSrsId(availableWord.word)!, false);
        setRevealed(false);
      } catch (error) {
        console.error("Failed to record incorrect review:", error);
      }
    }
  };

  return (
    <>
      <Show when={dictStatus().status === "loading"}>
        <div class={styles.LoadingState}>
          <p>Dictionary is still loading... Reviews will be available soon.</p>
        </div>
      </Show>

      <Show when={dictStatus().status === "failure"}>
        <div class={styles.ErrorState}>
          <p>Dictionary failed to load. Reviews are not available.</p>
        </div>
      </Show>

      <Show when={dictStatus().status === "ready"}>
        <Show when={!firstAvailable()}>
          <div class={styles.Nothing}>
            {(() => {
              const r = snapshot();
              switch (r.status) {
                case "loading":
                  return <p>Loading your reviews...</p>;
                case "success":
                  if (r.snapshot.soonestReview !== undefined) {
                    return (
                      <>
                        <p>Nothing to review right now. 😌</p>
                        <p>
                          Your next review is on{" "}
                          {r.snapshot.soonestReview.toLocaleString(undefined, {
                            dateStyle: "long",
                            timeStyle: "long",
                          })}
                          .
                        </p>
                      </>
                    );
                  } else {
                    return (
                      <>
                        <p>Nothing to review right now. 😌</p>
                        <p>Try clicking on a word to add it to your SRS.</p>
                      </>
                    );
                  }
                case "failure":
                  return <p>Failed to load your reviews. 😭</p>;
              }
            })()}
          </div>
        </Show>
        <Show when={firstAvailable()}>
          <div
            class={styles.Review}
            classList={{ [styles.Revealed]: revealed() }}
          >
            <div class={styles.ReviewFront}>
              <Show when={isJmdict(firstAvailable()!.word)}>
                <JmdictWordTitle
                  word={firstAvailable()!.word as JMdictWord}
                  showReading={revealed()}
                />
              </Show>
              <Show when={isCedict(firstAvailable()!.word)}>
                <CedictWordTitle
                  word={firstAvailable()!.word as CedictWord}
                  showReading={revealed()}
                />
              </Show>
            </div>
            <div class={styles.ReviewBack}>
              <Show when={isJmdict(firstAvailable()!.word)}>
                <JmdictWordSenses
                  senses={(firstAvailable()!.word as JMdictWord).sense ?? []}
                />
              </Show>
              <Show when={isCedict(firstAvailable()!.word)}>
                <CedictWordSenses
                  senses={(firstAvailable()!.word as CedictWord).senses ?? []}
                />
              </Show>
            </div>
            <div class={styles.ReviewButtons}>
              <button class={styles.RevealButton} onClick={handleRevealClick}>
                Reveal
              </button>
              <button
                class={styles.IncorrectButton}
                onClick={handleIncorrectClick}
              >
                Wrong
              </button>
              <button class={styles.CorrectButton} onClick={handleCorrectClick}>
                Right
              </button>
            </div>
          </div>
        </Show>
      </Show>
    </>
  );
};

export default Review;
