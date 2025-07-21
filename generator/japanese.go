package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"unicode"

	"github.com/invpt/tanoko/generator/jmdict"
)

func generateJapanese(jm jmdict.JMdict, kj jmdict.Kanjidic2, outputDir string) error {
	if err := writeKanjidicKanji(kj, outputDir); err != nil {
		return fmt.Errorf("failed to write kanjidic kanji: %w", err)
	}

	if err := writeKanjidicMeta(kj, outputDir); err != nil {
		return fmt.Errorf("failed to write kanjidic meta: %w", err)
	}

	if err := writeJmdictWords(jm, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict words: %w", err)
	}

	if err := writeJmdictMeta(jm, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict meta: %w", err)
	}

	englishIndex := buildJmdictEnglishIndex(jm)
	if err := writeJmdictEnglishIndex(englishIndex, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict english index: %w", err)
	}

	// Build and write native radix trie
	nativeTrieRoot, err := buildJmdictNativeRadixTrie(jm)
	if err != nil {
		return fmt.Errorf("failed to build jmdict native trie: %w", err)
	}

	// Print radix tree statistics
	stats := calculateRadixTreeStats(nativeTrieRoot)
	fmt.Println("JMdict Native Radix Tree Statistics:")
	printRadixTreeStats(stats)

	flattenedNativeTrie, rootOffset, err := flattenTrie(nativeTrieRoot)
	if err != nil {
		return fmt.Errorf("failed to flatten jmdict native trie: %w", err)
	}

	if err := writeJmdictNativeRadixTrie(flattenedNativeTrie, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native trie: %w", err)
	}

	if err := writeJmdictNativeRadixTrieMetadata(int(rootOffset), outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native trie metadata: %w", err)
	}

	if err := writeJmdictNativeRadixTrieIdMap(jm, outputDir); err != nil {
		return fmt.Errorf("failed to write jmdict native trie id map: %w", err)
	}

	return nil
}

func writeKanjidicKanji(kj jmdict.Kanjidic2, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "kanjidic-kanji.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, character := range kj.Characters {
		data, err := json.Marshal(character)
		if err != nil {
			return err
		}

		if _, err := file.WriteString(character.Literal); err != nil {
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

func writeKanjidicMeta(kj jmdict.Kanjidic2, outputDir string) error {
	meta := struct {
		jmdict.Kanjidic2DictionaryMetadata
	}{
		Kanjidic2DictionaryMetadata: kj.Kanjidic2DictionaryMetadata,
	}

	data, err := json.Marshal(meta)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(outputDir, "kanjidic-meta.json"), data, 0644)
}

func writeJmdictWords(jm jmdict.JMdict, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict-words.dsv"))
	if err != nil {
		return err
	}
	defer file.Close()

	for _, word := range jm.Words {
		data, err := json.Marshal(word)
		if err != nil {
			return err
		}

		if _, err := file.WriteString(word.ID); err != nil {
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

func buildJmdictNativeRadixTrie(jm jmdict.JMdict) (*RadixNode, error) {
	root := newRadixNode()
	idMap := newResultIDMap()

	for _, word := range jm.Words {
		entryID := idMap.GetID(word.ID)

		// Process kanji readings
		for _, kanji := range word.Kanji {
			insertIntoRadixTree(root, kanji.Text, entryID)
		}

		// Process kana readings
		for _, kana := range word.Kana {
			insertIntoRadixTree(root, kana.Text, entryID)
		}
	}
	return root, nil
}

func writeJmdictNativeRadixTrie(flattenedTrie []byte, outputDir string) error {
	return os.WriteFile(filepath.Join(outputDir, "jmdict-native-trie.bin"), flattenedTrie, 0644)
}

func writeJmdictNativeRadixTrieIdMap(jm jmdict.JMdict, outputDir string) error {
	// Create a mapping from numeric ID to word ID string
	mapping := make(map[string]string)
	idMap := newResultIDMap()

	for _, word := range jm.Words {
		numericID := idMap.GetID(word.ID)
		mapping[fmt.Sprintf("%d", numericID)] = word.ID
	}

	file, err := os.Create(filepath.Join(outputDir, "jmdict-native-trie-id-map.json"))
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	return encoder.Encode(mapping)
}

func writeJmdictNativeRadixTrieMetadata(rootOffset int, outputDir string) error {
	metadata := struct {
		RootOffset int `json:"rootOffset"`
	}{
		RootOffset: rootOffset,
	}

	data, err := json.Marshal(metadata)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(outputDir, "jmdict-native-trie-metadata.json"), data, 0644)
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

func buildJmdictNativeIndex(jm jmdict.JMdict) []IndexItem {
	const (
		c = 10.0  // common weight
		l = 2.0   // length weight
		p = 1.0   // priority weight
		k = 0.001 // kana weight
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
		for _, kanji := range word.Kanji {
			add(IndexItem{
				ID:        word.ID,
				Text:      kanji.Text,
				Common:    kanji.Common,
				Priority:  0,
				KanaCount: countKana(kanji.Text),
			})
		}

		for _, kana := range word.Kana {
			add(IndexItem{
				ID:        word.ID,
				Text:      kana.Text,
				Common:    kana.Common,
				Priority:  0,
				KanaCount: 0,
			})
		}

		alreadyAdded = make(map[string]bool)
	}

	sort.Slice(index, func(i, j int) bool {
		a, b := index[i], index[j]

		sortKeyA := getJmdictNativeSortKey(a, c, l, p, k)
		sortKeyB := getJmdictNativeSortKey(b, c, l, p, k)

		if sortKeyA == sortKeyB {
			idA, _ := strconv.Atoi(a.ID)
			idB, _ := strconv.Atoi(b.ID)
			return idA < idB
		}

		return sortKeyA < sortKeyB
	})

	return index
}

func getJmdictNativeSortKey(item IndexItem, c, l, p, k float64) float64 {
	uncommon := 0.0
	if !item.Common {
		uncommon = 1.0
	}
	length := float64(len(item.Text))
	priority := item.Priority
	kanaCount := float64(item.KanaCount)

	return c*uncommon + l*length + p*priority - k*kanaCount
}

func writeJmdictEnglishIndex(index []IndexItem, outputDir string) error {
	file, err := os.Create(filepath.Join(outputDir, "jmdict-index-english.dsv"))
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

func countKana(s string) int {
	count := 0
	for _, r := range s {
		if unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) {
			count++
		}
	}
	return count
}
