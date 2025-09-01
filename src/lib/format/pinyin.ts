export function segmentPinyin(hanzi: string, pinyin: string): { base: string; gloss: string }[] {
  const hanziArr = [...hanzi];
  const pinyinArr = pinyin.split(" ");
  if (hanziArr.length === pinyinArr.length) {
    return hanziArr.map((char, index) => ({ base: char, gloss: pinyinArr[index] }));
  } else {
    return [{ base: hanzi, gloss: pinyin }];
  }
}

const toneMap: Record<string, string[]> = {
  a: ["a", "ā", "á", "ă", "à"],
  e: ["e", "ē", "é", "ě", "è"],
  i: ["i", "ī", "í", "ǐ", "ì"],
  o: ["o", "ō", "ó", "ǒ", "ò"],
  u: ["u", "ū", "ú", "ǔ", "ù"],
  ü: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
  r: ["r", "r", "r", "r", "r"],
  A: ["A", "Ā", "Á", "Ă", "À"],
  E: ["E", "Ē", "É", "Ě", "È"],
  I: ["I", "Ī", "Í", "Ǐ", "Ì"],
  O: ["O", "Ō", "Ó", "Ǒ", "Ò"],
  U: ["U", "Ū", "Ú", "Ǔ", "Ù"],
  Ü: ["Ü", "Ǖ", "Ǘ", "Ǚ", "Ǜ"],
  R: ["R", "R", "R", "R", "R"],
};

export function formatPinyin(pinyin: string): string {
  // Replace u: with ü
  const input = pinyin.replace(/u:/g, "ü");

  const vowels = new Set(["a", "e", "i", "o", "u", "ü", "r", "A", "E", "I", "O", "U", "Ü", "R"]);
  let result = "";
  let lastProcessedIndex = 0;

  // Process tone numbers from left to right
  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ("12345".includes(char)) {
      const tone = parseInt(char, 10);

      // Find the start of the vowel cluster preceding this tone number
      let vowelClusterStart = i - 1;
      while (vowelClusterStart >= 0 && !vowels.has(input[vowelClusterStart])) {
        vowelClusterStart--;
      }

      // Find the end of the vowel cluster (going backwards)
      let vowelClusterEnd = vowelClusterStart;
      while (vowelClusterStart >= 0 && vowels.has(input[vowelClusterStart])) {
        vowelClusterStart--;
      }
      vowelClusterStart++; // Move back to the first vowel

      if (vowelClusterStart > vowelClusterEnd) {
        // If no vowels found, just skip the tone number
        continue;
      }

      const vowelCluster = input.substring(vowelClusterStart, vowelClusterEnd + 1);
      const toneVowelIndex = vowelClusterStart + calculateToneIndex(vowelCluster.toLowerCase());

      // For tone 5 (neutral tone), use the original vowel without accent
      const accentedVowel =
        tone === 5 ? input[toneVowelIndex] : toneMap[input[toneVowelIndex]]?.[tone];
      if (accentedVowel === undefined) {
        // Skip tone number if we can't find the vowel in the tone map
        continue;
      }

      // Append everything from last processed index up to the vowel to be accented
      result += input.substring(lastProcessedIndex, toneVowelIndex);

      // Append the accented vowel (or original vowel for tone 5)
      result += accentedVowel;

      // Append everything after the vowel up to the tone number
      result += input.substring(toneVowelIndex + 1, i);

      // Skip only the tone number
      lastProcessedIndex = i + 1;
    }
  }

  // Append any remaining characters
  result += input.substring(lastProcessedIndex);

  return result;
}

function calculateToneIndex(vowelCluster: string): number {
  const aIndex = vowelCluster.search(/[aA]/);
  if (aIndex !== -1) return aIndex;
  const eIndex = vowelCluster.search(/[eE]/);
  if (eIndex !== -1) return eIndex;
  const ouIndex = vowelCluster.search(/[oO][uU]/);
  if (ouIndex !== -1) return ouIndex;
  return vowelCluster.length - 1;
}
