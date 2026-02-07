import { dict, DictionaryEntry, Language } from "../../lib/dict";
import { processQuery } from "../../lib/query";
import { EnglishQuery, NativeQuery } from "../../lib/query/interfaces";
import { searchState } from "../../reactives/search.svelte";

export type SearchResults = {
  kind: string;
  results: DictionaryEntry[];
  loadMore: () => Promise<void>;
  hasMore: boolean;
};

export async function querySearchResults(
  query: string,
  language: Language,
): Promise<[] | [SearchResults] | [SearchResults, SearchResults]> {
  const queries = processQuery(query, language);

  if (queries.length === 0) {
    return [];
  } else if (queries.length === 1) {
    const [first] = queries;
    const firstResult = await searchState.markLoading(querySingle(first, language));

    if (firstResult.results.length === 0) {
      return [];
    } else {
      return [firstResult];
    }
  } else {
    const [first, second] = queries;
    const [firstResult, secondResult] = await searchState.markLoading(
      Promise.all([querySingle(first, language), querySingle(second, language)]),
    );

    if (firstResult.results.length === 0 && secondResult.results.length === 0) {
      return [];
    } else if (firstResult.results.length === 0) {
      return [secondResult];
    } else if (secondResult.results.length === 0) {
      return [firstResult];
    } else {
      return [firstResult, secondResult];
    }
  }
}

async function querySingle(query: EnglishQuery | NativeQuery, language: Language) {
  let generator: Generator<number> | undefined = await dict.search(query, language);

  let results = $state<DictionaryEntry[]>([]);

  const loadMore = async () => {
    if (generator == null) {
      return;
    }

    const resultIds: number[] = [];
    for (let i = 0; i < 100; i++) {
      const result = generator.next();
      if (result.done) {
        generator = undefined;
        break;
      } else {
        resultIds.push(result.value);
      }
    }
    results.push(
      ...(await Promise.all(resultIds.map((id) => dict.loadEntry(id, language).then((e) => e!)))),
    );
  };

  await loadMore();

  return {
    get results() {
      return results;
    },
    get hasMore() {
      return generator != null;
    },
    loadMore: () => searchState.markLoading(loadMore()),
    kind: query.kind(),
  };
}
