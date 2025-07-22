package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"unicode"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/jmdict"
)

func generateJapanese(jm jmdict.JMdict, kj jmdict.Kanjidic2, outputDir string) error {
	idMap := newResultIDMap()

	if err := writeJmdict(jm, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict words: %w", err)
	}

	if err := writeJmdictMeta(jm, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict meta: %w", err)
	}

	englishIndex := buildJmdictEnglishIndex(jm)
	if err := writeJmdictEnglishIndex(englishIndex, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict english index: %w", err)
	}

	nativeTreeRoot, err := buildJmdictNativeRadixTree(jm, idMap)
	if err != nil {
		return fmt.Errorf("failed to build jmdict native tree: %w", err)
	}

	stats := calculateRadixTreeStats(nativeTreeRoot)
	fmt.Println("JMdict Native Radix Tree Statistics:")
	printRadixTreeStats(stats)

	flattenedNativeTree, rootOffset, err := flattenTree(nativeTreeRoot)
	if err != nil {
		return fmt.Errorf("failed to flatten jmdict native tree: %w", err)
	}

	if err := writeJmdictNativeRadixTree(flattenedNativeTree, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native tree: %w", err)
	}

	if err := writeJmdictNativeRadixTreeMetadata(int(rootOffset), outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native tree metadata: %w", err)
	}

	return nil
}

func writeJmdict(jm jmdict.JMdict, idMap *ResultIDMap, outputDir string) (err error) {
	file, err := os.Create(filepath.Join(outputDir, "jmdict.bin"))
	if err != nil {
		return
	}
	defer file.Close()

	s := encode.NewStream(file)
	defer func() { err = errors.Join(err, s.Flush()) }()

	for _, word := range jm.Words {
		var b *encode.Buffer
		b, err = s.Append()
		if err != nil {
			return
		}

		encode.Uint(b, idMap.GetID(word.ID))

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

	return
}

func buildJmdictNativeRadixTree(jm jmdict.JMdict, idMap *ResultIDMap) (*RadixNode, error) {
	root := newRadixNode()

	for _, word := range jm.Words {
		entryID := idMap.GetID(word.ID)

		for _, kanji := range word.Kanji {
			insertIntoRadixTree(root, kanji.Text, entryID)
		}

		for _, kana := range word.Kana {
			insertIntoRadixTree(root, kana.Text, entryID)
		}
	}

	return root, nil
}

func writeJmdictNativeRadixTree(flattenedTree []byte, outputDir string) error {
	return os.WriteFile(filepath.Join(outputDir, "jmdict-native.bin"), flattenedTree, 0644)
}

func writeJmdictNativeRadixTreeMetadata(rootOffset int, outputDir string) error {
	metadata := struct {
		RootOffset int `json:"rootOffset"`
	}{
		RootOffset: rootOffset,
	}

	data, err := json.Marshal(metadata)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(outputDir, "jmdict-native.meta.json"), data, 0644)
}

func writeJmdictMeta(jm jmdict.JMdict, outputDir string) error {
	meta := struct {
		jmdict.JMdictDictionaryMetadata
	}{
		JMdictDictionaryMetadata: jm.JMdictDictionaryMetadata,
	}

	data, err := json.Marshal(meta)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(outputDir, "jmdict-meta.json"), data, 0644)
}

func buildJmdictEnglishIndex(jm jmdict.JMdict) []IndexItem {
	const (
		c = 10.0 // common weight
		l = 2.0  // length weight
		p = 1.0  // priority weight
	)

	var index []IndexItem
	alreadyAdded := make(map[string]bool)

	add := func(item IndexItem) {
		if !alreadyAdded[item.Text] {
			alreadyAdded[item.Text] = true
			index = append(index, item)
		}
	}

	for _, word := range jm.Words {
		for senseIdx, sense := range word.Sense {
			allKanji := len(sense.AppliesToKanji) == 1 && sense.AppliesToKanji[0] == "*"
			allKana := len(sense.AppliesToKana) == 1 && sense.AppliesToKana[0] == "*"

			commonKanji := false
			for _, kanji := range word.Kanji {
				if allKanji || contains(sense.AppliesToKanji, kanji.Text) {
					if kanji.Common {
						commonKanji = true
						break
					}
				}
			}

			commonKana := false
			for _, kana := range word.Kana {
				if allKana || contains(sense.AppliesToKana, kana.Text) {
					if kana.Common {
						commonKana = true
						break
					}
				}
			}

			for glossIdx, gloss := range sense.Gloss {
				priority := float64(senseIdx) + float64(glossIdx)/float64(len(sense.Gloss))

				add(IndexItem{
					ID:       word.ID,
					Text:     normalizeEnglish(gloss.Text),
					Common:   commonKanji || commonKana,
					Priority: priority,
				})
			}
		}

		alreadyAdded = make(map[string]bool)
	}

	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		sortKeyA := getSortKey(a, c, l, p)
		sortKeyB := getSortKey(b, c, l, p)

		if sortKeyA == sortKeyB {
			idA, _ := strconv.Atoi(a.ID)
			idB, _ := strconv.Atoi(b.ID)
			return idA < idB
		}

		return sortKeyA < sortKeyB
	})

	return index
}

func getSortKey(item IndexItem, c, l, p float64) float64 {
	uncommon := 0.0
	if !item.Common {
		uncommon = 1.0
	}
	length := float64(len(item.Text))
	priority := item.Priority

	return c*uncommon + l*length + p*priority
}

func writeJmdictEnglishIndex(index []IndexItem, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict-english.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, item := range index {
		if _, err := file.WriteString(item.Text); err != nil {
			return err
		}
		if _, err := file.WriteString(sep1); err != nil {
			return err
		}
		if _, err := file.WriteString(item.ID); err != nil {
			return err
		}
		if _, err := file.WriteString(sep2); err != nil {
			return err
		}
	}

	return nil
}

func countKana(s string) int {
	count := 0
	for _, r := range s {
		if unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) {
			count++
		}
	}
	return count
}
