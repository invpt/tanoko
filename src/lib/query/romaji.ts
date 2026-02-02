import { romajiSyllables } from "../data/romaji";
import { NativeQuery } from "./interfaces";
import { StringPrefixQuery } from "./prefix";

class RomajiPrefixQuery extends StringPrefixQuery {
  constructor(query: string, possibleSuffixes: string[] = []) {
    super(query);

    // TODO: make use of this for more precise matching of incomplete romaji prefixes
    possibleSuffixes;
  }

  kind() {
    return "romaji";
  }
}

export function processRomaji(query: string): NativeQuery | null {
  if (!query) return null;

  let result = "";
  let queryRemaining = query;

  while (queryRemaining.length > 0) {
    let currentNode = romajiTrie;
    let consumed = 0;
    let foundSyllable = false;
    for (const char of queryRemaining) {
      const nextNode = currentNode.children.get(char);
      if (!nextNode) {
        if (currentNode.geminator === char) {
          // GEMINATE!!
          result += "っ";
          consumed += char.length;
          continue;
        }

        // Check for special case: single 'n' that should become 'ん'
        if (
          consumed === 1 &&
          queryRemaining.length >= 2 &&
          queryRemaining[0] === "n" &&
          !"aiuoey".includes(queryRemaining[1])
        ) {
          result += "ん";
          queryRemaining = queryRemaining.slice(consumed);
          foundSyllable = true;
          break;
        }

        // invalid romaji
        return null;
      }

      currentNode = nextNode;
      consumed += char.length;

      // If we found a complete syllable, add it to result and continue
      if (currentNode.kana !== undefined) {
        result += currentNode.kana;
        queryRemaining = queryRemaining.slice(consumed);
        foundSyllable = true;
        break;
      }
    }

    // We matched the whole query but we're not yet ready to yield kana
    if (currentNode.kana === undefined && !foundSyllable) {
      if (result.length > 0) {
        return new RomajiPrefixQuery(result, collectKana(currentNode));
      } else {
        return null;
      }
    }
  }

  return new RomajiPrefixQuery(result);
}

function collectKana(node: RomajiTrieNode, kana: string[] = []): string[] {
  if (node.kana !== undefined) {
    if (node.children.size > 0) {
      // this should never happen since no romaji syllable (in our system) prefixes another
      throw new Error("a romaji node cannot have both children and kana");
    }

    kana.push(node.kana);
  } else {
    for (const child of node.children.values()) {
      let start = kana.length;
      collectKana(child, kana);
      if (node.geminator !== undefined) {
        for (const k of kana.slice(start)) {
          kana.push("っ" + k);
        }
      }
    }
  }

  return kana;
}

class RomajiTrieNode {
  children: Map<string, RomajiTrieNode> = new Map();
  kana?: string;
  geminator?: string;
}

const ungeminatable = new Set(["a", "i", "u", "e", "o", "n"]);
const romajiTrie = new RomajiTrieNode();
for (const [syllable, kana] of Object.entries(romajiSyllables)) {
  let currentNode = romajiTrie;
  for (const char of syllable) {
    let node = currentNode.children.get(char);
    if (node === undefined) {
      node = new RomajiTrieNode();
      currentNode.children.set(char, node);
    }
    if (currentNode === romajiTrie) {
      // add geminator to first character
      node.geminator = ungeminatable.has(syllable[0]) ? undefined : syllable[0];
    }
    currentNode = node;
  }
  currentNode.kana = kana;
}
