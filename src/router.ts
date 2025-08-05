import { createRouter } from "sv-router";
import Home from "./routes/Home.svelte";
import About from "./routes/About.svelte";
import Search from "./routes/Search.svelte";
import Word from "./routes/Word.svelte";

export const { p, navigate, isActive, route } = createRouter({
  "/": Home,
  "/about": About,
  "/search": Search,
  "/word/:lang/:index": Word,
});
