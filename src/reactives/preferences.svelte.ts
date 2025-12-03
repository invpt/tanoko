import z from "zod";
import { Language } from "../lib/dict";

export enum ChineseCharacterVariant {
  simplified = "simplified",
  traditional = "traditional",
}

export enum ChinesePronunciationGuide {
  pinyin = "pinyin",
  bopomofo = "bopomofo",
}

export type Preferences = z.infer<typeof preferencesSchema>;

const preferencesSchema = z.object({
  language: z.enum(Language).optional(),
  chinese: z.object({
    characterVariant: z.enum(ChineseCharacterVariant),
    pronunciationGuide: z.enum(ChinesePronunciationGuide),
  }),
});

const key = "tanoko-preferences";

const defaultPreferenes: Preferences = {
  chinese: {
    characterVariant: ChineseCharacterVariant.simplified,
    pronunciationGuide: ChinesePronunciationGuide.pinyin,
  },
};

export const preferences = $state(
  (() => {
    const stored = localStorage.getItem(key);
    if (stored == null) {
      return defaultPreferenes;
    }

    return preferencesSchema.parse(JSON.parse(stored));
  })(),
);

$effect.root(() => {
  $effect(() => {
    localStorage.setItem(key, JSON.stringify(preferences));
  });
});
