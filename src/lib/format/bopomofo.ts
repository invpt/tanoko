export function formatBopomofo(pinyin: string): string {
  if (!pinyin) {
    return "";
  }

  pinyin = pinyin.toLowerCase();

  const toneMatch = pinyin.match(/[1-5]$/);
  const tone = toneMatch ? toneMatch[0] : "1";
  const syllableWithoutTone = toneMatch ? pinyin.slice(0, -1) : pinyin;

  if (completeSyllables[syllableWithoutTone]) {
    return completeSyllables[syllableWithoutTone] + (toneMarks[tone] || "");
  }

  // If not found in complete mapping, try to split into initial + final
  let result = "";
  let remainingPinyin = syllableWithoutTone;

  for (const initial of Object.keys(initials)) {
    if (syllableWithoutTone.startsWith(initial)) {
      result += initials[initial];
      remainingPinyin = syllableWithoutTone.slice(initial.length);
      break;
    }
  }

  // Add final if present
  if (remainingPinyin && finals[remainingPinyin]) {
    result += finals[remainingPinyin];
  } else if (remainingPinyin) {
    // If we can't find the final, return original
    return pinyin;
  }

  // Add tone mark
  result += toneMarks[tone] || "";

  return result || pinyin;
}

const initials: Record<string, string> = {
  zh: "ㄓ",
  ch: "ㄔ",
  sh: "ㄕ",
  b: "ㄅ",
  p: "ㄆ",
  m: "ㄇ",
  f: "ㄈ",
  d: "ㄉ",
  t: "ㄊ",
  n: "ㄋ",
  l: "ㄌ",
  g: "ㄍ",
  k: "ㄎ",
  h: "ㄏ",
  j: "ㄐ",
  q: "ㄑ",
  x: "ㄒ",
  r: "ㄖ",
  z: "ㄗ",
  c: "ㄘ",
  s: "ㄙ",
};

const standaloneVowels: Record<string, string> = {
  a: "ㄚ",
  o: "ㄛ",
  e: "ㄜ",
  ai: "ㄞ",
  ei: "ㄟ",
  ao: "ㄠ",
  ou: "ㄡ",
  an: "ㄢ",
  en: "ㄣ",
  ang: "ㄤ",
  eng: "ㄥ",
  er: "ㄦ",
};

const completeSyllables: Record<string, string> = {
  ...standaloneVowels,

  yi: "ㄧ",
  ya: "ㄧㄚ",
  ye: "ㄧㄝ",
  yao: "ㄧㄠ",
  you: "ㄧㄡ",
  yan: "ㄧㄢ",
  yin: "ㄧㄣ",
  yang: "ㄧㄤ",
  ying: "ㄧㄥ",
  yong: "ㄩㄥ",
  yu: "ㄩ",
  yue: "ㄩㄝ",
  yuan: "ㄩㄢ",
  yun: "ㄩㄣ",
  "yu:": "ㄩ",
  "yue:": "ㄩㄝ",
  "yuan:": "ㄩㄢ",
  "yun:": "ㄩㄣ",

  wu: "ㄨ",
  wa: "ㄨㄚ",
  wo: "ㄨㄛ",
  wai: "ㄨㄞ",
  wei: "ㄨㄟ",
  wan: "ㄨㄢ",
  wen: "ㄨㄣ",
  wang: "ㄨㄤ",
  weng: "ㄨㄥ",
};

const finals: Record<string, string> = {
  ...standaloneVowels,

  // Finals that can follow consonants
  i: "ㄧ",
  u: "ㄨ",
  "u:": "ㄩ",
  ia: "ㄧㄚ",
  ie: "ㄧㄝ",
  iao: "ㄧㄠ",
  iou: "ㄧㄡ",
  iu: "ㄧㄡ",
  ian: "ㄧㄢ",
  in: "ㄧㄣ",
  iang: "ㄧㄤ",
  ing: "ㄧㄥ",
  iong: "ㄩㄥ",
  ua: "ㄨㄚ",
  uo: "ㄨㄛ",
  uai: "ㄨㄞ",
  uei: "ㄨㄟ",
  ui: "ㄨㄟ",
  uan: "ㄨㄢ",
  uen: "ㄨㄣ",
  un: "ㄨㄣ",
  uang: "ㄨㄤ",
  ueng: "ㄨㄥ",
  ong: "ㄨㄥ",
  "u:e": "ㄩㄝ",
  "u:an": "ㄩㄢ",
  "u:n": "ㄩㄣ",
  "u:ng": "ㄩㄥ",
};

// Tone marks in bopomofo
const toneMarks: Record<string, string> = {
  "1": "",
  "2": "ˊ",
  "3": "ˇ",
  "4": "ˋ",
  "5": "˙",
};
