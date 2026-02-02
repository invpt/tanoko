<script lang="ts">
  import { Router } from "sv-router";
  import "./router";
  import Header from "./Header.svelte";
  import { FontPreference, preferences } from "./reactives/preferences.svelte";
</script>

<div class={["top", preferences.font === FontPreference.custom && "custom"]}>
  <Header />
  <div class="content">
    <Router />
  </div>
</div>

<style>
  .top {
    display: grid;
    max-width: 1200px;
    margin: 0 auto;
  }

  .content {
    margin: 20px 40px;
  }

  @media (max-width: 700px) {
    .content {
      margin: 20px 24px;
    }
  }

  .top.custom :global([lang="zh-Hans"]) {
    font-family:
      "Ysabeau", "Noto Serif SC", "Noto Serif SCTC", "Noto Serif SCJP", "Noto Serif SCTCJP", serif;
  }

  .top.custom :global([lang="zh-Hant"]) {
    font-family:
      "Ysabeau", "Noto Serif TC", "Noto Serif SCTC", "Noto Serif TCJP", "Noto Serif SCTCJP", serif;
  }

  .top.custom :global([lang="ja"]) {
    font-family:
      "Ysabeau", "Noto Serif JP", "Noto Serif SCJP", "Noto Serif TCJP", "Noto Serif SCTCJP", serif;
  }
</style>
