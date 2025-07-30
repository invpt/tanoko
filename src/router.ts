import { createRouter } from "sv-router";
import Home from "./routes/Home.svelte";
import About from "./routes/About.svelte";
import Search from "./routes/Search.svelte";

export const { p, navigate, isActive, route } = createRouter({
  "/": Home,
  "/about": About,
  "/search": Search,
});
