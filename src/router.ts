import { createRouter } from "sv-router";
import Home from "./routes/Home.svelte";
import Settings from "./routes/Settings.svelte";
import Search from "./routes/Search.svelte";
import Item from "./routes/Item.svelte";

export const { p, navigate, isActive, route } = createRouter({
  "/": Home,
  "/settings": Settings,
  "/search": Search,
  "/item/:type/:index": Item,
});
