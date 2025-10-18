package subset

import "github.com/invpt/tanoko/generator/src"

func JMdictCodepoints(entries []src.JMdictWord) (set map[rune]struct{}) {
	set = map[rune]struct{}{}

	for _, entry := range entries {
		for _, kana := range entry.Kana {
			for _, r := range kana.Text {
				set[r] = struct{}{}
			}
		}
		for _, kanji := range entry.Kanji {
			for _, r := range kanji.Text {
				set[r] = struct{}{}
			}
		}
		for _, sense := range entry.Sense {
			for _, gloss := range sense.Gloss {
				for _, r := range gloss.Text {
					set[r] = struct{}{}
				}
			}
		}
	}

	return
}

func CEDICTCodepoints(entries []src.CEDICTEntry, simplified bool) (set map[rune]struct{}) {
	set = map[rune]struct{}{}

	for _, entry := range entries {
		if simplified {
			for _, r := range entry.Simplified {
				set[r] = struct{}{}
			}
		} else {
			for _, r := range entry.Traditional {
				set[r] = struct{}{}
			}
		}

		for _, sense := range entry.Senses {
			for _, gloss := range sense {
				for _, r := range gloss {
					set[r] = struct{}{}
				}
			}
		}
	}

	return
}
