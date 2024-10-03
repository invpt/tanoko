import { Component } from "solid-js";

import styles from "./Settings.module.css";
import { useSrs } from "./srs/srs";

const Settings: Component = () => {
  const { snapshot } = useSrs();

  const handleExportReviewsClick = () => {
    const s = snapshot();
    if (s.status !== "success") {
      return;
    }

    const state = s.snapshot.state;
    const stringified = JSON.stringify(state);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([stringified]));
    a.download = "tanoko-reviews.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div class={styles.Settings}>
      <button
        class={styles.Button}
        onClick={handleExportReviewsClick}
        disabled={snapshot().status !== "success"}
      >
        Export Reviews
      </button>
    </div>
  );
};

export default Settings;
