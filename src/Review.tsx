import { createResource, createSignal, Show, type Component } from "solid-js";
import { useSrs } from "./srs/srs";

import styles from "./Review.module.css";
import { WordSenses, WordTitle } from "./Word";
import { dict } from "./dict/dict";

const Review: Component = () => {
  const { snapshot, review } = useSrs();

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
    await review(firstAvailable()!.type, firstAvailable()!.word.id, true);
    setRevealed(false);
  };

  const handleIncorrectClick = async () => {
    await review(firstAvailable()!.type, firstAvailable()!.word.id, false);
    setRevealed(false);
  };

  return (
    <>
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
            <WordTitle word={firstAvailable()!.word} showReading={revealed()} />
          </div>
          <div class={styles.ReviewBack}>
            <WordSenses senses={firstAvailable()?.word.sense ?? []} />
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
    </>
  );
};

export default Review;
