package main

import (
	"strings"

	"github.com/invpt/tanoko/generator/src"
)

func computeFurigana(jm []src.JMdictWord, kj []src.Kanjidic2Character) {
	kanjiReadings := make(map[rune][]string, len(kj))
	for _, k := range kj {
		if k.ReadingMeaning == nil {
			continue
		}

		var rune rune
		for _, r := range k.Literal {
			if rune != 0 {
				panic("unexpected multi-rune kanji")
			}

			rune = r
		}

		uniqueReadings := kanjiReadings[rune]
		for _, g := range k.ReadingMeaning.Groups {
			for _, r := range g.Readings {
				if r.Type != "ja_on" && r.Type != "ja_kun" {
					continue
				}

				dot := strings.IndexRune(r.Value, '.')
				if dot == -1 {
					dot = len(r.Value)
				}
				uniqueReadings = appendUnique(uniqueReadings, r.Value[:dot])
			}
		}
		for _, r := range k.ReadingMeaning.Nanori {
			uniqueReadings = appendUnique(uniqueReadings, r)
		}
		kanjiReadings[rune] = uniqueReadings
	}

	for i, word := range jm {
		if len(word.Kanji) == 0 {
			continue
		}
		if !word.Kanji[0].Common && word.Kana[0].Common {
			continue
		}

		kanji := word.Kanji[0].Text
		kana := word.Kana[0].Text

		word.Furigana = computeWordFurigana(kanjiReadings, kanji, kana)

		jm[i] = word
	}
}

func computeWordFurigana(kanjiReadings map[rune][]string, kanji, kana string) []uint {
	kanjiRunes := []rune(kanji)
	kanaRunes := []rune(kana)

	result := make([]uint, len(kanjiRunes))

	if backtrack(kanjiReadings, kanjiRunes, kanaRunes, result) {
		return result
	}

	return []uint{}
}

func backtrack(kanjiReadings map[rune][]string, kanji, kana []rune, result []uint) bool {
	if len(kanji) == 0 {
		return len(kana) == 0
	}

	// Remaining kana is shorter than remaining kanji - impossible to match
	if len(kana) == 0 {
		return false
	}

	currentKanji := kanji[0]

	// Check if current character is a kanji (has readings)
	readings, isKanji := kanjiReadings[currentKanji]

	if !isKanji {
		// Non-kanji character - must match exactly one kana character
		if runesEqualIgnoringScript(kana[0], currentKanji) {
			result[0] = 1
			return backtrack(kanjiReadings, kanji[1:], kana[1:], result[1:])
		}
		return false
	}

	// Try each possible reading for this kanji
	for _, reading := range readings {
		readingRunes := []rune(reading)
		if len(readingRunes) > len(kana) {
			continue
		}

		// Check if the reading matches the kana at current position
		matches := true
		for i, r := range readingRunes {
			if !runesEqualIgnoringScript(kana[i], r) {
				matches = false
				break
			}
		}

		if !matches {
			continue
		}

		// Try this reading
		result[0] = uint(len(readingRunes))
		if backtrack(kanjiReadings, kanji[1:], kana[len(readingRunes):], result[1:]) {
			return true
		}

	}

	return false
}

// runesEqualIgnoringScript compares two runes treating hiragana and katakana as equivalent
func runesEqualIgnoringScript(r1, r2 rune) bool {
	// Convert both runes to hiragana for comparison
	normalizeToHiragana := func(r rune) rune {
		// Katakana range: U+30A1 to U+30F6
		// Hiragana range: U+3041 to U+3096
		// Offset between katakana and hiragana: 0x0060 (96)
		if r >= 0x30A1 && r <= 0x30F6 {
			return r - 0x0060
		}
		return r
	}

	return normalizeToHiragana(r1) == normalizeToHiragana(r2)
}

func appendUnique[T comparable](a []T, i T) []T {
	for _, existing := range a {
		if existing == i {
			return a
		}
	}
	return append(a, i)
}
