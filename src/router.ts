import { createRouter } from "sv-router";
import Home from "./routes/+page.svelte";
import Settings from "./routes/settings/+page.svelte";
import Search from "./routes/search/+page.svelte";
import Item from "./routes/item/+page.svelte";

export const { p, navigate, isActive, route } = createRouter({
  "/": Home,
  "/settings": Settings,
  "/search": Search,
  "/item/:type/:index": Item,
});
