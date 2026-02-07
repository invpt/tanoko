import { untrack } from "svelte";

class SearchState {
  #loadingCount = $state(0);
  loading = $derived(this.#loadingCount > 0);

  markLoading<T>(promise: Promise<T>): Promise<T> {
    this.#loadingCount = untrack(() => this.#loadingCount) + 1;
    promise.finally(() => {
      this.#loadingCount = untrack(() => this.#loadingCount) - 1;
    });
    return promise;
  }
}

export const searchState = new SearchState();
