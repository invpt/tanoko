package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/invpt/tanoko/generator/cedict"
	"github.com/invpt/tanoko/generator/encode"
)

func generateChinese(ce cedict.CEDICT, outputDir string) error {
	idMap := newResultIDMap()

	if err := writeCedictWords(ce, outputDir, idMap); err != nil {
		return fmt.Errorf("failed to write cedict words: %w", err)
	}

	pinyinTreeRoot, err := buildPinyinTree(ce, idMap)
	if err != nil {
		return fmt.Errorf("failed to build pinyin tree: %w", err)
	}

	// Print radix tree statistics
	stats := calculateRadixTreeStats(pinyinTreeRoot)
	fmt.Println("CEDICT Native Radix Tree Statistics:")
	printRadixTreeStats(stats)

	flattenedPinyinTree, rootOffset, err := flattenTree(pinyinTreeRoot)
	if err != nil {
		return fmt.Errorf("failed to flatten pinyin tree: %w", err)
	}

	if err := writePinyinTree(flattenedPinyinTree, outputDir); err != nil {
		return fmt.Errorf("failed to write pinyin tree: %w", err)
	}

	if err := writePinyinTreeMetadata(rootOffset, outputDir); err != nil {
		return fmt.Errorf("failed to write pinyin tree metadata: %w", err)
	}

	if err := generateCedictEnglishIndex(ce, idMap, outputDir); err != nil {
		return fmt.Errorf("failed to generate cedict english index: %w", err)
	}

	return nil
}

func writeCedictWords(ce cedict.CEDICT, outputDir string, idMap *resultIDMap) (err error) {
	file, err := os.Create(filepath.Join(outputDir, "cedict.bin"))
	if err != nil {
		return
	}
	defer file.Close()

	s := encode.NewStream(file)
	defer func() { err = errors.Join(err, s.Flush()) }()

	for _, word := range ce {
		var b *encode.Buffer
		b, err = s.Append()
		if err != nil {
			return
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

	return
}

func buildCedictEnglishIndex(ce cedict.CEDICT) []IndexItem {
	var index []IndexItem
	alreadyAdded := make(map[string]bool)

	add := func(item IndexItem) {
		if !alreadyAdded[item.Text] {
			alreadyAdded[item.Text] = true
			index = append(index, item)
		}
	}

	for _, entry := range ce {
		id := entry.Traditional

		for senseIdx, sense := range entry.Senses {
			for glossIdx, gloss := range sense {
				if strings.TrimSpace(gloss) != "" {
					priority := float64(senseIdx) + float64(glossIdx)/float64(len(sense))

					add(IndexItem{
						ID:       id,
						Text:     normalizeEnglish(gloss),
						Common:   false,
						Priority: priority + 2, // English glosses get lower priority
					})
				}
			}
		}

		alreadyAdded = make(map[string]bool)
	}

	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		lenA, lenB := len(a.Text), len(b.Text)
		if lenA == lenB {
			if a.Priority == b.Priority {
				idA, _ := strconv.Atoi(a.ID)
				idB, _ := strconv.Atoi(b.ID)
				return idA < idB
			}
			return a.Priority < b.Priority
		}
		return lenA < lenB
	})

	return index
}

func buildCedictNativeIndex(ce cedict.CEDICT) []IndexItem {
	var index []IndexItem
	alreadyAdded := make(map[string]bool)

	add := func(item IndexItem) {
		if !alreadyAdded[item.Text] {
			alreadyAdded[item.Text] = true
			index = append(index, item)
		}
	}

	for _, entry := range ce {
		id := entry.Traditional

		add(IndexItem{
			ID:       id,
			Text:     entry.Traditional,
			Common:   false,
			Priority: 0,
		})

		if entry.Simplified != entry.Traditional {
			add(IndexItem{
				ID:       id,
				Text:     entry.Simplified,
				Common:   false,
				Priority: 0,
			})
		}

		for i, pinyin := range processPinyin(entry.Pinyin) {
			add(IndexItem{
				ID:       id,
				Text:     pinyin,
				Common:   false,
				Priority: float64(i) + 1,
			})
		}

		alreadyAdded = make(map[string]bool)
	}

	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		lenA, lenB := len(a.Text), len(b.Text)
		if lenA == lenB {
			if a.Priority == b.Priority {
				idA, _ := strconv.Atoi(a.ID)
				idB, _ := strconv.Atoi(b.ID)
				return idA < idB
			}
			return a.Priority < b.Priority
		}
		return lenA < lenB
	})

	return index
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

func writeCedictEnglishIndex(index []IndexItem, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "cedict-index-english.dsv"))
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

// buildPinyinTree constructs a radix tree from CEDICT pinyin entries.
func buildPinyinTree(ce cedict.CEDICT, idMap *resultIDMap) (*radixNode, error) {
	root := newRadixNode()

	for _, entry := range ce {
		entryID := idMap.GetID(entry.Traditional)

		// Process pinyin
		pinyins := processPinyin(entry.Pinyin)
		for _, pinyin := range pinyins {
			insertIntoRadixTree(root, pinyin, entryID)
		}

		// Process traditional Chinese
		insertIntoRadixTree(root, entry.Traditional, entryID)

		// Process simplified Chinese
		insertIntoRadixTree(root, entry.Simplified, entryID)
	}
	return root, nil
}

// writePinyinTree writes the flattened radix tree data to a binary file.
func writePinyinTree(data []byte, outputDir string) error {
	filePath := filepath.Join(outputDir, "pinyin-tree.bin")
	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create pinyin radix tree file: %w", err)
	}
	defer file.Close()

	_, err = file.Write(data)
	if err != nil {
		return fmt.Errorf("failed to write data to pinyin radix tree file: %w", err)
	}
	return nil
}

// writePinyinTreeMetadata writes the root offset and other metadata as JSON
func writePinyinTreeMetadata(rootOffset uint32, outputDir string) error {
	filePath := filepath.Join(outputDir, "pinyin-tree-metadata.json")
	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create pinyin tree metadata file: %w", err)
	}
	defer file.Close()

	metadata := map[string]interface{}{
		"rootOffset": rootOffset,
	}

	encoder := json.NewEncoder(file)
	if err := encoder.Encode(metadata); err != nil {
		return fmt.Errorf("failed to encode metadata: %w", err)
	}

	return nil
}
