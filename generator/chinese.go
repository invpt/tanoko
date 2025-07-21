package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/invpt/tanoko/generator/cedict"
)

func generateChinese(ce cedict.CEDICT, outputDir string) error {
	// Create ID map for Chinese entries
	idMap := newResultIDMap()

	if err := writeCedictWords(ce, outputDir, idMap); err != nil {
		return fmt.Errorf("failed to write cedict words: %w", err)
	}

	englishIndex := buildCedictEnglishIndex(ce)
	if err := writeCedictEnglishIndex(englishIndex, outputDir); err != nil {
		return fmt.Errorf("failed to write cedict english index: %w", err)
	}

	pinyinTrieRoot, err := buildPinyinTrie(ce, idMap)
	if err != nil {
		return fmt.Errorf("failed to build pinyin trie: %w", err)
	}

	// Print radix tree statistics
	stats := calculateRadixTreeStats(pinyinTrieRoot)
	fmt.Println("CEDICT Native Radix Tree Statistics:")
	printRadixTreeStats(stats)

	flattenedPinyinTrie, rootOffset, err := flattenTrie(pinyinTrieRoot)
	if err != nil {
		return fmt.Errorf("failed to flatten pinyin trie: %w", err)
	}

	if err := writePinyinTrie(flattenedPinyinTrie, outputDir); err != nil {
		return fmt.Errorf("failed to write pinyin trie: %w", err)
	}

	if err := writePinyinTrieMetadata(rootOffset, outputDir); err != nil {
		return fmt.Errorf("failed to write pinyin trie metadata: %w", err)
	}

	if err := writePinyinTrieIdMap(idMap, outputDir); err != nil {
		return fmt.Errorf("failed to write pinyin trie id map: %w", err)
	}

	return nil
}

func writeCedictWords(ce cedict.CEDICT, outputDir string, idMap *ResultIDMap) error {
	file, err := os.Create(filepath.Join(outputDir, "cedict-words.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, word := range ce {
		// Create a copy of the word with indexId field
		wordWithIndex := struct {
			cedict.Entry
			IndexId uint32 `json:"indexId"`
		}{
			Entry:   word,
			IndexId: idMap.GetID(word.Traditional),
		}

		data, err := json.Marshal(wordWithIndex)
		if err != nil {
			return err
		}

		if _, err := file.WriteString(word.Traditional); err != nil {
			return err
		}
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.Write(data); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
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
		if _, err := file.WriteString(unitSeparator); err != nil {
			return err
		}
		if _, err := file.WriteString(item.ID); err != nil {
			return err
		}
		if _, err := file.WriteString(recordSeparator); err != nil {
			return err
		}
	}

	return nil
}

// buildPinyinTrie constructs a radix tree from CEDICT pinyin entries.
func buildPinyinTrie(ce cedict.CEDICT, idMap *ResultIDMap) (*RadixNode, error) {
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

// writePinyinTrie writes the flattened radix tree data to a binary file.
func writePinyinTrie(data []byte, outputDir string) error {
	filePath := filepath.Join(outputDir, "pinyin-trie.bin")
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

// writePinyinTrieIdMap writes the ID to Traditional Chinese mapping as JSON
func writePinyinTrieIdMap(idMap *ResultIDMap, outputDir string) error {
	filePath := filepath.Join(outputDir, "pinyin-trie-idmap.json")
	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create pinyin trie id map file: %w", err)
	}
	defer file.Close()

	// Create reverse mapping: ID -> Traditional
	reverseMap := make(map[uint32]string)
	for traditional, id := range idMap.mapping {
		reverseMap[id] = traditional
	}

	encoder := json.NewEncoder(file)
	if err := encoder.Encode(reverseMap); err != nil {
		return fmt.Errorf("failed to encode id map: %w", err)
	}

	return nil
}

// writePinyinTrieMetadata writes the root offset and other metadata as JSON
func writePinyinTrieMetadata(rootOffset uint32, outputDir string) error {
	filePath := filepath.Join(outputDir, "pinyin-trie-metadata.json")
	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create pinyin trie metadata file: %w", err)
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
