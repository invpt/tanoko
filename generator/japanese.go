package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/index"
	"github.com/invpt/tanoko/generator/jmdict"
	"github.com/invpt/tanoko/generator/radix"
	"github.com/invpt/wordfreq"
)

func generateJapanese(jm jmdict.JMdict, jmne jmdict.JMnedict, kj jmdict.Kanjidic2, outputDir string) error {
	sortJmdictByFrequency(jm)
	sortAndFilterJmnedictByFrequency(&jmne)

	if err := writeJmdictBinary(jm, jmne, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict binary: %w", err)
	}

	if err := writeJmdictNativeRadix(jm, jmne, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native radix: %w", err)
	}

	if err := writeJmdictEnglishIndex(jm, jmne, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict english index: %w", err)
	}

	if err := writeJmdictRefRadix(jm, jmne, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict ref radix: %w", err)
	}

	return nil
}

func sortJmdictByFrequency(jm jmdict.JMdict) error {
	wf, err := wordfreq.New()
	if err != nil {
		return fmt.Errorf("failed to initialize wordfreq: %w", err)
	}

	freqs := map[string]float64{}
	getStringFreq := func(word string) float64 {
		if freq, ok := freqs[word]; ok {
			return freq
		} else {
			freq, err := wf.WordFrequency(word, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
			if err != nil {
				panic(err)
			}
			freqs[word] = freq
			return freq
		}
	}
	getFreq := func(word jmdict.JMdictWord) float64 {
		if len(word.Kanji) > 0 && word.Kanji[0].Common && !word.Kana[0].Common {
			return getStringFreq(word.Kanji[0].Text)
		} else if len(word.Kanji) > 0 && word.Kanji[0].Common && word.Kana[0].Common {
			return 2 / (1/getStringFreq(word.Kana[0].Text) + 1/getStringFreq(word.Kanji[0].Text))
		} else {
			return getStringFreq(word.Kana[0].Text)
		}
	}

	sort.Slice(jm.Words, func(i, j int) bool {
		return getFreq(jm.Words[i]) > getFreq(jm.Words[j])
	})

	return nil
}

func sortAndFilterJmnedictByFrequency(jmne *jmdict.JMnedict) error {
	wf, err := wordfreq.New()
	if err != nil {
		return fmt.Errorf("failed to initialize wordfreq: %w", err)
	}

	freqs := map[string]float64{}
	getStringFreq := func(word string) float64 {
		if freq, ok := freqs[word]; ok {
			return freq
		} else {
			freq, err := wf.WordFrequency(word, wordfreq.LanguageJapanese, wordfreq.WordlistBest, 0.0)
			if err != nil {
				panic(err)
			}
			freqs[word] = freq
			return freq
		}
	}
	getFreq := func(word jmdict.JMnedictWord) float64 {
		if len(word.Kanji) > 0 {
			return getStringFreq(word.Kanji[0].Text)
		} else {
			return getStringFreq(word.Kana[0].Text)
		}
	}

	sort.Slice(jmne.Words, func(i, j int) bool {
		return getFreq(jmne.Words[i]) > getFreq(jmne.Words[j])
	})

	// Aggressive filtering for now to keep results clean until we split names into separate DB
	isRemovable := func(tag jmdict.Tag) bool { return tag == "place" || tag == "unclass" || tag == "person" }
	n := min(50_000, len(jmne.Words))
	for i := n; i < len(jmne.Words) && n < 100_000; i++ {
		removable := true
		for _, t := range jmne.Words[i].Translation {
			for _, ty := range t.Type {
				removable = removable && isRemovable(ty)
			}
		}

		if !removable {
			jmne.Words[n] = jmne.Words[i]
			n++
		}
	}
	jmne.Words = jmne.Words[:n]

	return nil
}

func writeJmdictBinary(jm jmdict.JMdict, jmne jmdict.JMnedict, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	offsets := encode.NewBuffer()

	s := encode.NewStream(file, false)
	defer s.Flush()

	for _, word := range jm.Words {
		b, err := s.Append()
		if err != nil {
			return err
		}

		encode.Uint32(offsets, uint32(s.Offset()))

		encode.String(b, word.ID)

		for _, k := range encode.Array(b, word.Kanji) {
			encode.String(b, k.Text)
			encode.Bool(b, k.Common)
			tags := encode.Array(b, k.Tags)
			for _, tag := range tags {
				encode.String(b, string(tag))
			}
		}

		for _, k := range encode.Array(b, word.Kana) {
			encode.String(b, k.Text)
			encode.Bool(b, k.Common)
			for _, tag := range encode.Array(b, k.Tags) {
				encode.String(b, string(tag))
			}
			for _, applies := range encode.Array(b, k.AppliesToKanji) {
				encode.String(b, applies)
			}
		}

		for _, sense := range encode.Array(b, word.Sense) {
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
	}

	for _, word := range jmne.Words {
		b, err := s.Append()
		if err != nil {
			return err
		}

		encode.Uint32(offsets, uint32(s.Offset()))

		encode.String(b, word.ID)

		for _, k := range encode.Array(b, word.Kanji) {
			encode.String(b, k.Text)
			encode.Bool(b, false)
			tags := encode.Array(b, k.Tags)
			for _, tag := range tags {
				encode.String(b, string(tag))
			}
		}

		for _, k := range encode.Array(b, word.Kana) {
			encode.String(b, k.Text)
			encode.Bool(b, false)
			for _, tag := range encode.Array(b, k.Tags) {
				encode.String(b, string(tag))
			}
			for _, applies := range encode.Array(b, k.AppliesToKanji) {
				encode.String(b, applies)
			}
		}

		for _, sense := range encode.Array(b, word.Translation) {
			for range encode.Array(b, []struct{}{}) {
			}

			for range encode.Array(b, []struct{}{}) {
			}

			for range encode.Array(b, []struct{}{}) {
			}

			for _, gloss := range encode.Array(b, sense.Translation) {
				encode.String(b, gloss.Text)
			}
		}
	}

	if err := s.Flush(); err != nil {
		return err
	}

	encode.Uint32(offsets, uint32(s.Offset()))

	offsetsFile, err := os.Create(filepath.Join(outputDir, "jmdict-offsets.bin"))
	if err != nil {
		return err
	}
	defer offsetsFile.Close()

	_, err = offsetsFile.Write(offsets.Finish())
	if err != nil {
		return err
	}

	return nil
}

func writeJmdictNativeRadix(jm jmdict.JMdict, jmne jmdict.JMnedict, outputDir string) error {
	tree := radix.New()

	for index, word := range jm.Words {
		for _, kanji := range word.Kanji {
			tree.Add(kanji.Text, uint32(index))
		}

		for _, kana := range word.Kana {
			tree.Add(kana.Text, uint32(index))
		}
	}

	for index, word := range jmne.Words {
		for _, kanji := range word.Kanji {
			tree.Add(kanji.Text, uint32(index+len(jm.Words)))
		}

		for _, kana := range word.Kana {
			tree.Add(kana.Text, uint32(index+len(jm.Words)))
		}
	}

	tree.PrintStats("JMdict native radix")

	file, err := os.Create(filepath.Join(outputDir, "jmdict-native.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return tree.Export(file)
}

func writeJmdictEnglishIndex(jm jmdict.JMdict, jmne jmdict.JMnedict, outputDir string) error {
	builder := index.NewBuilder()

	for index, word := range jm.Words {
		for senseIdx, sense := range word.Sense {
			for _, gloss := range sense.Gloss {
				if strings.TrimSpace(gloss.Text) != "" {
					builder.Add(gloss.Text, uint32(index), senseIdx)
				}
			}
		}
	}

	for index, word := range jmne.Words {
		for senseIdx, sense := range word.Translation {
			for _, gloss := range sense.Translation {
				if strings.TrimSpace(gloss.Text) != "" {
					builder.Add(gloss.Text, uint32(index+len(jm.Words)), senseIdx)
				}
			}
		}
	}

	idx := builder.Build()
	idx.PrintStats("JMdict English index")

	file, err := os.Create(filepath.Join(outputDir, "jmdict-english.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return idx.Export(file)
}

func writeJmdictRefRadix(jm jmdict.JMdict, jmne jmdict.JMnedict, outputDir string) error {
	tree := radix.New()

	for index, word := range jm.Words {
		tree.Add(word.ID, uint32(index))
	}

	for index, word := range jmne.Words {
		tree.Add(word.ID, uint32(index+len(jm.Words)))
	}

	tree.PrintStats("JMdict ref radix")

	file, err := os.Create(filepath.Join(outputDir, "jmdict-ref.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return tree.Export(file)
}
