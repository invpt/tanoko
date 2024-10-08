import { createResource, type Component } from "solid-js";

import styles from "./Search.module.css";
import { JMdictWord } from "@scriptin/jmdict-simplified-types";
import { useLocation } from "@solidjs/router";
import { useSrs } from "./srs/srs";
import Word from "./Word";
import { dict } from "./dict/dict";

const Search: Component = () => {
  const location = useLocation();
  const { add } = useSrs();
  const [results] = createResource(
    () => location.query["query"],
    (query) => dict.search(query),
  );

  const handleWordClick = async (word: JMdictWord) => {
    await add("jmdict-vocab", word.id);
  };

  return (
    <div class={styles.Search}>
      {results()?.map((word) => (
        <Word word={word} onClick={() => handleWordClick(word)} />
      ))}
    </div>
  );
};

export default Search;
