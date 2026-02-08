import { romajiSyllables } from "../data/romaji";
import { NativeQuery, NativeQueryState } from "./interfaces";

class SuffixTrieNode {
  children: Map<number, SuffixTrieNode> = new Map();
  isComplete: boolean = false;
  stateNumber: number = -1;
}

class RomajiPrefixQuery extends NativeQuery {
  private knownBytes: Uint8Array;
  private suffixTrie: SuffixTrieNode;
  private baseStateCount: number;
  private stateToNode: Map<number, SuffixTrieNode> = new Map();

  constructor(query: string, possibleSuffixes: string[] = []) {
    super();

    this.knownBytes = new TextEncoder().encode(query);
    this.baseStateCount = this.knownBytes.length;
    this.suffixTrie = this.buildSuffixTrie(possibleSuffixes);
  }

  private buildSuffixTrie(suffixes: string[]): SuffixTrieNode {
    const root = new SuffixTrieNode();
    let stateCounter = this.baseStateCount;

    root.stateNumber = stateCounter++;
    this.stateToNode.set(root.stateNumber, root);

    for (const suffix of suffixes) {
      const bytes = new TextEncoder().encode(suffix);
      let current = root;

      for (const byte of bytes) {
        if (!current.children.has(byte)) {
          const newNode = new SuffixTrieNode();
          newNode.stateNumber = stateCounter++;
          this.stateToNode.set(newNode.stateNumber, newNode);
          current.children.set(byte, newNode);
        }
        current = current.children.get(byte)!;
      }
      current.isComplete = true;
    }

    return root;
  }

  private findNodeByState(stateNumber: number): SuffixTrieNode | null {
    return this.stateToNode.get(stateNumber) || null;
  }

  transition(from: NativeQueryState, by: number): NativeQueryState {
    if (from === undefined) {
      return undefined;
    }

    if (from < 0) {
      return -1;
    }

    // First stage: we're matching directly known bytes
    if (from < this.baseStateCount) {
      if (this.knownBytes[from] !== by) {
        return -1;
      }

      const nextState = from + 1;
      if (nextState === this.baseStateCount && this.suffixTrie.children.size === 0) {
        // No possible suffixes, we're done
        return undefined;
      } else {
        return nextState;
      }
    }

    // Second stage: we're in the suffix trie
    const currentNode = this.findNodeByState(from);
    if (currentNode == null) {
      return -1;
    }

    const nextNode = currentNode.children.get(by);
    if (nextNode != null) {
      if (nextNode.isComplete) {
        return undefined;
      } else {
        return nextNode.stateNumber;
      }
    } else {
      return -1;
    }
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
      return new RomajiPrefixQuery(result, collectKana(currentNode));
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
