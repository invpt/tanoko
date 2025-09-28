<script lang="ts">
  import { Router } from "sv-router";
  import "./router";
  import Header from "./lib/components/Header.svelte";
</script>

<div class="top">
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
</style>
