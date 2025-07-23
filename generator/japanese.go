package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/index"
	"github.com/invpt/tanoko/generator/jmdict"
	"github.com/invpt/tanoko/generator/radix"
)

func generateJapanese(jm jmdict.JMdict, kj jmdict.Kanjidic2, outputDir string) error {
	idMap := newResultIDMap()

	if err := writeJmdictBinary(jm, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict binary: %w", err)
	}

	if err := writeJmdictNativeRadix(jm, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native radix: %w", err)
	}

	if err := writeJmdictEnglishIndex(jm, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict english index: %w", err)
	}

	return nil
}

func writeJmdictBinary(jm jmdict.JMdict, idMap *resultIDMap, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	s := encode.NewStream(file)
	defer s.Flush()

	for _, word := range jm.Words {
		b, err := s.Append()
		if err != nil {
			return err
		}

		encode.Uvarint(b, idMap.GetID(word.ID))
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

	return nil
}

func writeJmdictNativeRadix(jm jmdict.JMdict, idMap *resultIDMap, outputDir string) error {
	tree := radix.New()

	for _, word := range jm.Words {
		entryID := idMap.GetID(word.ID)

		// Add kanji
		for _, kanji := range word.Kanji {
			tree.Add(kanji.Text, entryID)
		}

		// Add kana
		for _, kana := range word.Kana {
			tree.Add(kana.Text, entryID)
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

func writeJmdictEnglishIndex(jm jmdict.JMdict, idMap *resultIDMap, outputDir string) error {
	builder := index.NewBuilder()

	for _, word := range jm.Words {
		entryID := idMap.GetID(word.ID)

		for _, sense := range word.Sense {
			for _, gloss := range sense.Gloss {
				if strings.TrimSpace(gloss.Text) != "" {
					builder.Add(gloss.Text, entryID)
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
