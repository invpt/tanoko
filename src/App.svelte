<script lang="ts">
  import { Router } from "sv-router";
  import "./router";
  import Header from "./lib/components/Header.svelte";
</script>

<div>
  <Header />
  <Router />
</div>

<style>
  div {
    display: grid;
    max-width: 1200px;
    margin: 0 auto;
    padding: 12px;
  }
</style>
