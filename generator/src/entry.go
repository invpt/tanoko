package src

import (
	"strings"
	"unicode"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/wordfreq"
)

// CEDICT

func (e CEDICTEntry) Freq(wf *wordfreq.WordFreq) (float64, error) {
	return wf.WordFrequency(e.Simplified, wordfreq.LanguageChinese, wordfreq.WordlistBest, 0.0)
}

func (e CEDICTEntry) Encode(b *encode.Buffer) {
	encode.String(b, e.Traditional)
	encode.String(b, e.Simplified)
	encode.String(b, e.Pinyin)

	for _, glosses := range encode.Array(b, e.Senses) {
		for _, gloss := range encode.Array(b, glosses) {
			encode.String(b, gloss)
		}
	}
}

func (e CEDICTEntry) Native(add func(text string)) {
	add(e.Traditional)
	add(e.Simplified)
	add(processPinyin(e.Pinyin))
}

func processPinyin(pinyin string) string {
	b := strings.Builder{}
	for _, c := range pinyin {
		l := unicode.ToLower(c)
		if 'a' <= l && l <= 'z' || '1' <= l && l <= '5' {
			b.WriteRune(l)
		}
	}
	return b.String()
}

func (e CEDICTEntry) English(add func(text string, senseIndex int)) {
	for senseIndex, sense := range e.Senses {
		for _, gloss := range sense {
			if strings.TrimSpace(gloss) != "" {
				add(stripSquareBrackets(gloss), senseIndex)
			}
		}
	}
}

func stripSquareBrackets(text string) string {
	result := ""
	depth := 0

	for _, char := range text {
		if char == '[' {
			depth++
		} else if char == ']' {
			if depth > 0 {
				depth--
			}
		} else if depth == 0 {
			result += string(char)
		}
	}

	return result
}

func (e CEDICTEntry) Ref() string {
	ref := e.Traditional
	if e.Simplified != e.Traditional {
		ref += "|" + e.Simplified
	}
	return ref
}

// JMdict

func (e JMdictWord) Freq(wf *wordfreq.WordFreq) (float64, error) {
	if len(e.Kanji) > 0 && e.Kanji[0].Common && !e.Kana[0].Common {
		return wf.WordFrequency(e.Kanji[0].Text, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
	} else if len(e.Kanji) > 0 && e.Kanji[0].Common && e.Kana[0].Common {
		a, err := wf.WordFrequency(e.Kana[0].Text, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
		if err != nil {
			return 0, err
		}
		b, err := wf.WordFrequency(e.Kanji[0].Text, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
		if err != nil {
			return 0, err
		}
		return 2 / (1/a + 1/b), nil
	} else {
		return wf.WordFrequency(e.Kana[0].Text, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
	}
}

func (e JMdictWord) Encode(b *encode.Buffer) {
	encode.String(b, e.ID)

	for _, k := range encode.Array(b, e.Kanji) {
		encode.String(b, k.Text)
		encode.Bool(b, k.Common)
		tags := encode.Array(b, k.Tags)
		for _, tag := range tags {
			encode.String(b, string(tag))
		}
	}

	for _, k := range encode.Array(b, e.Kana) {
		encode.String(b, k.Text)
		encode.Bool(b, k.Common)
		for _, tag := range encode.Array(b, k.Tags) {
			encode.String(b, string(tag))
		}
		for _, applies := range encode.Array(b, k.AppliesToKanji) {
			encode.String(b, applies)
		}
	}

	for _, sense := range encode.Array(b, e.Sense) {
		for _, p := range encode.Array(b, sense.PartOfSpeech) {
			encode.String(b, string(p))
		}

		for _, applies := range encode.Array(b, sense.AppliesToKanji) {
			encode.String(b, applies)
		}

		for _, applies := range encode.Array(b, sense.AppliesToKana) {
			encode.String(b, applies)
		}

		for _, gloss := range encode.Array(b, sense.Gloss) {
			encode.String(b, gloss.Text)
		}
	}

	for _, f := range encode.Array(b, e.Furigana) {
		encode.Uvarint(b, f)
	}
}

func (e JMdictWord) Native(add func(text string)) {
	for _, kanji := range e.Kanji {
		add(kanji.Text)
	}

	for _, kana := range e.Kana {
		add(kana.Text)
	}
}

func (e JMdictWord) English(add func(text string, senseIndex int)) {
	for senseIndex, sense := range e.Sense {
		for _, gloss := range sense.Gloss {
			if strings.TrimSpace(gloss.Text) != "" {
				add(gloss.Text, senseIndex)
			}
		}
	}
}

func (e JMdictWord) Ref() string {
	return e.ID
}

// JMnedict

func (e JMnedictWord) Freq(wf *wordfreq.WordFreq) (float64, error) {
	a, err := wf.WordFrequency(e.Kana[0].Text, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
	if err != nil {
		return 0, err
	}
	var b float64
	if len(e.Kanji) > 0 {
		var err error
		b, err = wf.WordFrequency(e.Kanji[0].Text, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
		if err != nil {
			return 0, err
		}
	} else {
		b = a
	}
	return 2 / (1/a + 1/b), nil
}

func (e JMnedictWord) Encode(b *encode.Buffer) {
	encode.String(b, e.ID)

	for _, k := range encode.Array(b, e.Kanji) {
		encode.String(b, k.Text)
		tags := encode.Array(b, k.Tags)
		for _, tag := range tags {
			encode.String(b, string(tag))
		}
	}

	for _, k := range encode.Array(b, e.Kana) {
		encode.String(b, k.Text)
		for _, tag := range encode.Array(b, k.Tags) {
			encode.String(b, string(tag))
		}
		for _, applies := range encode.Array(b, k.AppliesToKanji) {
			encode.String(b, applies)
		}
	}

	for _, sense := range encode.Array(b, e.Translation) {
		for _, gloss := range encode.Array(b, sense.Translation) {
			encode.String(b, gloss.Text)
		}
	}
}

func (e JMnedictWord) Native(add func(text string)) {
	for _, kanji := range e.Kanji {
		add(kanji.Text)
	}

	for _, kana := range e.Kana {
		add(kana.Text)
	}
}

func (e JMnedictWord) English(add func(text string, senseIndex int)) {
	for senseIndex, sense := range e.Translation {
		for _, gloss := range sense.Translation {
			if strings.TrimSpace(gloss.Text) != "" {
				add(gloss.Text, senseIndex)
			}
		}
	}
}

func (e JMnedictWord) Ref() string {
	return e.ID
}
