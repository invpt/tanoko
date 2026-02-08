import { untrack } from "svelte";
import { Language, parseLanguage } from "../lib/dict";
import { isActive } from "../router";
import { searchParams } from "sv-router";

class SearchState {
  #loadingCount = $state(0);
  loading = $derived(this.#loadingCount > 0);
  active = $derived(isActive("/search"));
  query = $state("");
  language = $state<Language>();
  interpret = $state<boolean>(false);

  beforeLoad() {
    const query = searchParams.get("q");
    if (query != null) {
      this.query = query;
    }

    const lang = searchParams.get("lang");
    if (lang != null) {
      this.language = parseLanguage(lang);
    }

    const interp = searchParams.get("interp");
    if (interp != null) {
      this.interpret = interp === "true";
    }
  }

  updateSearchParams() {
    searchParams.set("q", this.query);
    searchParams.set("lang", this.language ?? "");
    searchParams.set("interp", this.interpret ? "true" : "false");
  }

  markLoading<T>(promise: Promise<T>): Promise<T> {
    this.#loadingCount = untrack(() => this.#loadingCount) + 1;
    promise.finally(() => {
      this.#loadingCount = untrack(() => this.#loadingCount) - 1;
    });
    return promise;
  }
}

export const searchState = new SearchState();
