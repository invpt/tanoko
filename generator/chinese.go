package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"

	"github.com/invpt/tanoko/generator/cedict"
	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/index"
	"github.com/invpt/tanoko/generator/radix"
	"github.com/invpt/wordfreq"
)

func generateChinese(ce cedict.CEDICT, outputDir string) error {
	idMap := newResultIDMap()

	if err := writeCedictBinary(ce, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write cedict binary: %w", err)
	}

	if err := writeCedictNativeRadix(ce, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write cedict native radix: %w", err)
	}

	if err := writeCedictEnglishIndex(ce, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write cedict english index: %w", err)
	}

	return nil
}

func writeCedictBinary(ce cedict.CEDICT, idMap *resultIDMap, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "cedict.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	offsets := encode.NewBuffer()

	s := encode.NewStream(file)
	defer s.Flush()

	wf, err := wordfreq.New()
	if err != nil {
		return fmt.Errorf("failed to initialize wordfreq: %w", err)
	}

	freqs := map[string]float64{}
	getFreq := func(word string) float64 {
		if freq, ok := freqs[word]; ok {
			return freq
		} else {
			freq, err := wf.WordFrequency(word, wordfreq.LanguageChinese, wordfreq.WordlistBest, 0.0)
			if err != nil {
				panic(err)
			}
			freqs[word] = freq
			return freq
		}
	}

	sort.Slice(ce, func(i, j int) bool {
		return getFreq(ce[i].Simplified) > getFreq(ce[j].Simplified)
	})

	for _, word := range ce {
		encode.Uint32(offsets, uint32(s.Offset()))

		b, err := s.Append()
		if err != nil {
			return err
		}

		encode.Uvarint(b, idMap.GetID(word.Traditional))
		encode.String(b, word.Traditional)
		encode.String(b, word.Simplified)

		for _, pinyin := range encode.Array(b, word.Pinyin) {
			encode.String(b, pinyin)
		}

		for _, glosses := range encode.Array(b, word.Senses) {
			for _, gloss := range encode.Array(b, glosses) {
				encode.String(b, gloss)
			}
		}
	}

	encode.Uint32(offsets, uint32(s.Offset()))

	offsetsFile, err := os.Create(filepath.Join(outputDir, "cedict-offsets.bin"))
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

func writeCedictNativeRadix(ce cedict.CEDICT, idMap *resultIDMap, outputDir string) error {
	tree := radix.New()

	for _, entry := range ce {
		entryID := idMap.GetID(entry.Traditional)

		for _, pinyin := range processPinyin(entry.Pinyin) {
			tree.Add(pinyin, entryID)
		}

		tree.Add(entry.Traditional, entryID)

		if entry.Simplified != entry.Traditional {
			tree.Add(entry.Simplified, entryID)
		}
	}

	tree.PrintStats("CEDICT native radix")

	file, err := os.Create(filepath.Join(outputDir, "cedict-native.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return tree.Export(file)
}

func writeCedictEnglishIndex(ce cedict.CEDICT, idMap *resultIDMap, outputDir string) error {
	builder := index.NewBuilder()

	for _, entry := range ce {
		entryID := idMap.GetID(entry.Traditional)

		for senseIdx, sense := range entry.Senses {
			for _, gloss := range sense {
				if strings.TrimSpace(gloss) != "" {
					builder.Add(stripSquareBrackets(gloss), entryID, senseIdx)
				}
			}
		}
	}

	idx := builder.Build()
	idx.PrintStats("CEDICT English index")

	file, err := os.Create(filepath.Join(outputDir, "cedict-english.bin"))
	if err != nil {
		return err
	}
	defer file.Close()

	return idx.Export(file)
}

func processPinyin(pinyin []string) []string {
	result := make([]string, 0, len(pinyin))
	for _, p := range pinyin {
		b := strings.Builder{}
		for _, c := range p {
			l := unicode.ToLower(c)
			if 'a' <= l && l <= 'z' {
				b.WriteRune(l)
			}
		}
		result = append(result, b.String())
	}
	return result
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
