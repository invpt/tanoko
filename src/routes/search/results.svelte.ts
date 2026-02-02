import { dict, DictionaryEntry, Language } from "../../lib/dict";
import { EnglishQuery, NativeQuery } from "../../lib/query/interfaces";

export type SearchResults = {
  results: DictionaryEntry[];
  loadMore: () => Promise<void>;
};

export async function querySearchResults(
  query: EnglishQuery | NativeQuery,
  language: Language,
): Promise<SearchResults> {
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
    loadMore,
  };
}
