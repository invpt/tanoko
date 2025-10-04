import { formatPinyin } from "./pinyin";

export function formatCedict(text: string, useSimplified: boolean) {
  return text
    .replaceAll("CL:", "Classifier: ")
    .replaceAll(
      /( ?)\[[^\]]+\]/g,
      (pinyin, space: string) => (space === "" ? " " : "") + formatPinyin(pinyin),
    )
    .replaceAll(
      /([\p{Ll}\p{Lm}\p{Lo}\p{Lt}\p{Lu}]+)\|([\p{Ll}\p{Lm}\p{Lo}\p{Lt}\p{Lu}]+)/gu,
      (_, traditional: string, simplified: string) => (useSimplified ? simplified : traditional),
    );
}
