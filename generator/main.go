package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/invpt/tanoko/generator/cedict"
	"github.com/invpt/tanoko/generator/jmdict"
)

const (
	unitSeparator   = "\x1F"
	recordSeparator = "\x1E"
)

func main() {
	var (
		clearCacheFlag = flag.Bool("clear-cache", false, "Clear the download cache before running")
		helpFlag       = flag.Bool("help", false, "Show help message")
	)
	flag.Parse()

	if *helpFlag {
		fmt.Println("Tanoko Dictionary Generator")
		fmt.Println("Usage:")
		flag.PrintDefaults()
		return
	}

	if *clearCacheFlag {
		if err := clearCache(); err != nil {
			fmt.Printf("Error clearing cache: %v\n", err)
			os.Exit(1)
		}
	}

	outputDir := filepath.Join("..", "src", "assets", "gen")
	if err := os.MkdirAll(outputDir, 0755); err != nil && !os.IsExist(err) {
		panic(err)
	}

	fmt.Println("Fetching dictionary data...")

	ce, err := fetchCEDICT()
	if err != nil {
		panic(err)
	}

	jm, kj, err := fetchJMdict()
	if err != nil {
		panic(err)
	}

	fmt.Println("Generating files...")

	if err := generateJapanese(jm, kj, outputDir); err != nil {
		panic(err)
	}

	if err := generateChinese(ce, outputDir); err != nil {
		panic(err)
	}

	fmt.Println("Generation complete!")
}

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

type IndexItem struct {
	ID        string
	Text      string
	Common    bool
	Priority  float64
	KanaCount int
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

func normalizeEnglish(text string) string {
	var result strings.Builder
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			result.WriteRune(unicode.ToLower(r))
		} else if result.Len() > 0 && !strings.HasSuffix(result.String(), " ") {
			result.WriteRune(' ')
		}
	}
	return strings.TrimSpace(result.String())
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
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

// RadixNode represents a node in the radix tree (compressed trie).
type RadixNode struct {
	edge     string              // UTF-8 byte sequence for this edge
	children map[byte]*RadixNode // children indexed by first byte of their edge
	results  []uint32
}

// newRadixNode creates and returns a new RadixNode.
func newRadixNode() *RadixNode {
	return &RadixNode{
		edge:     "",
		children: make(map[byte]*RadixNode),
		results:  []uint32{},
	}
}

// newRadixNodeWithEdge creates a new RadixNode with a specific edge
func newRadixNodeWithEdge(edge string) *RadixNode {
	return &RadixNode{
		edge:     edge,
		children: make(map[byte]*RadixNode),
		results:  []uint32{},
	}
}

// ResultIDMap maps string IDs (like Traditional Chinese characters) to unique uint32 IDs.
type ResultIDMap struct {
	mapping map[string]uint32
	nextID  uint32
}

// newResultIDMap creates and returns a new ResultIDMap.
func newResultIDMap() *ResultIDMap {
	return &ResultIDMap{
		mapping: make(map[string]uint32),
		nextID:  0,
	}
}

// GetID returns the unique uint32 ID for a given string ID, assigning a new one if it doesn't exist.
func (m *ResultIDMap) GetID(str string) uint32 {
	if id, ok := m.mapping[str]; ok {
		return id
	}
	id := m.nextID
	m.mapping[str] = id
	m.nextID++
	return id
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

// insertIntoRadixTree inserts a UTF-8 byte sequence into the radix tree
func insertIntoRadixTree(root *RadixNode, key string, resultID uint32) {
	if len(key) == 0 {
		root.results = append(root.results, resultID)
		sort.Slice(root.results, func(i, j int) bool {
			return root.results[i] < root.results[j]
		})
		root.results = uniqueUint32Slice(root.results)
		return
	}

	firstByte := key[0]
	child, exists := root.children[firstByte]

	if !exists {
		// No child with this first byte, create new node
		newNode := newRadixNodeWithEdge(key)
		newNode.results = append(newNode.results, resultID)
		root.children[firstByte] = newNode
		return
	}

	// Find common prefix between key and child's edge
	commonPrefixLen := 0
	minLen := len(key)
	if len(child.edge) < minLen {
		minLen = len(child.edge)
	}

	for i := 0; i < minLen; i++ {
		if key[i] == child.edge[i] {
			commonPrefixLen++
		} else {
			break
		}
	}

	if commonPrefixLen == len(child.edge) {
		// Child's edge is a prefix of key, continue recursively
		insertIntoRadixTree(child, key[commonPrefixLen:], resultID)
	} else if commonPrefixLen == len(key) {
		// Key is a prefix of child's edge, need to split the child
		splitNode := newRadixNodeWithEdge(key)
		splitNode.results = append(splitNode.results, resultID)

		// Update child's edge to remaining part
		remainingEdge := child.edge[commonPrefixLen:]
		child.edge = remainingEdge

		// Set child as a child of split node
		if len(remainingEdge) > 0 {
			splitNode.children[remainingEdge[0]] = child
		}

		root.children[firstByte] = splitNode
	} else {
		// Need to split at common prefix
		splitNode := newRadixNodeWithEdge(key[:commonPrefixLen])

		// Update existing child's edge
		remainingChildEdge := child.edge[commonPrefixLen:]
		child.edge = remainingChildEdge

		// Add existing child to split node
		if len(remainingChildEdge) > 0 {
			splitNode.children[remainingChildEdge[0]] = child
		}

		// Create new node for remaining key
		remainingKey := key[commonPrefixLen:]
		if len(remainingKey) > 0 {
			newNode := newRadixNodeWithEdge(remainingKey)
			newNode.results = append(newNode.results, resultID)
			splitNode.children[remainingKey[0]] = newNode
		} else {
			// Remaining key is empty, add result to split node
			splitNode.results = append(splitNode.results, resultID)
		}

		root.children[firstByte] = splitNode
	}
}

// uniqueUint32Slice removes duplicate elements from a sorted uint32 slice.
func uniqueUint32Slice(s []uint32) []uint32 {
	if len(s) == 0 {
		return s
	}
	j := 0
	for i := 1; i < len(s); i++ {
		if s[j] == s[i] {
			continue
		}
		j++
		s[j] = s[i]
	}
	return s[:j+1]
}

// encodeVarint encodes a uint32 as variable-length bytes (LEB128)
func encodeVarint(value uint32) []byte {
	if value == 0 {
		return []byte{0}
	}

	var result []byte
	for value > 0 {
		b := byte(value & 0x7F)
		value >>= 7
		if value != 0 {
			b |= 0x80
		}
		result = append(result, b)
	}
	return result
}

// flattenTrie converts the radix tree into variable-length encoded bytes using post-order traversal.
func flattenTrie(root *RadixNode) ([]byte, uint32, error) {
	var flattenedData []byte
	nodeOffsets := make(map[*RadixNode]uint32)

	// Post-order traversal: encode children before parents
	var encodeNode func(*RadixNode) uint32
	encodeNode = func(node *RadixNode) uint32 {
		// If already encoded, return its offset
		if offset, exists := nodeOffsets[node]; exists {
			return offset
		}

		// First, encode all children (post-order)
		sortedChildrenKeys := make([]byte, 0, len(node.children))
		for b := range node.children {
			sortedChildrenKeys = append(sortedChildrenKeys, b)
		}
		sort.Slice(sortedChildrenKeys, func(i, j int) bool {
			return sortedChildrenKeys[i] < sortedChildrenKeys[j]
		})

		childOffsets := make([]uint32, len(sortedChildrenKeys))
		for i, b := range sortedChildrenKeys {
			childNode := node.children[b]
			childOffsets[i] = encodeNode(childNode)
		}

		// Now encode this node
		currentOffset := uint32(len(flattenedData))
		nodeOffsets[node] = currentOffset

		numChildren := uint32(len(node.children))
		numResults := uint32(len(node.results))
		edgeLen := uint32(len(node.edge))

		// 2. Children count (varint)
		flattenedData = append(flattenedData, encodeVarint(numChildren)...)

		// 1. Result count (varint)
		flattenedData = append(flattenedData, encodeVarint(numResults)...)

		// 3. Edge length (varint)
		flattenedData = append(flattenedData, encodeVarint(edgeLen)...)

		// 4. Edge bytes (raw bytes)
		flattenedData = append(flattenedData, node.edge...)

		// 5. Children as alternating first byte and offset varints
		for i, b := range sortedChildrenKeys {
			// First byte of child's edge as varint
			flattenedData = append(flattenedData, encodeVarint(uint32(b))...)
			// Child node offset as varint
			flattenedData = append(flattenedData, encodeVarint(childOffsets[i])...)
		}

		// 6. Results (varints)
		sortedResults := make([]uint32, len(node.results))
		copy(sortedResults, node.results)
		sort.Slice(sortedResults, func(i, j int) bool {
			return sortedResults[i] < sortedResults[j]
		})
		for _, resultID := range sortedResults {
			flattenedData = append(flattenedData, encodeVarint(resultID)...)
		}

		return currentOffset
	}

	// Start encoding from root and capture its offset
	rootOffset := encodeNode(root)

	return flattenedData, rootOffset, nil
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

// RadixTreeStats holds statistics about the radix tree
type RadixTreeStats struct {
	TotalNodes      int
	LeafNodes       int
	InternalNodes   int
	TotalResults    int
	MaxDepth        int
	TotalEdgeLength int
	UniqueResults   map[uint32]bool
}

// calculateRadixTreeStats performs a depth-first traversal to collect statistics
func calculateRadixTreeStats(root *RadixNode) *RadixTreeStats {
	stats := &RadixTreeStats{
		UniqueResults: make(map[uint32]bool),
	}

	calculateStatsRecursive(root, stats, 0)
	return stats
}

// calculateStatsRecursive recursively calculates statistics for the radix tree
func calculateStatsRecursive(node *RadixNode, stats *RadixTreeStats, depth int) {
	if node == nil {
		return
	}

	stats.TotalNodes++
	stats.TotalEdgeLength += len(node.edge)

	// Update max depth
	if depth > stats.MaxDepth {
		stats.MaxDepth = depth
	}

	// Count results
	stats.TotalResults += len(node.results)
	for _, result := range node.results {
		stats.UniqueResults[result] = true
	}

	// Check if this is a leaf node (has results and no children)
	if len(node.results) > 0 && len(node.children) == 0 {
		stats.LeafNodes++
	} else if len(node.children) > 0 {
		stats.InternalNodes++
	}

	// Recursively process children
	for _, child := range node.children {
		calculateStatsRecursive(child, stats, depth+1)
	}
}

// printRadixTreeStats prints detailed statistics about the radix tree
func printRadixTreeStats(stats *RadixTreeStats) {
	fmt.Println("\n=== Radix Tree Statistics ===")
	fmt.Printf("Total nodes: %d\n", stats.TotalNodes)
	fmt.Printf("  - Internal nodes: %d\n", stats.InternalNodes)
	fmt.Printf("  - Leaf nodes: %d\n", stats.LeafNodes)
	fmt.Printf("  - Other nodes: %d\n", stats.TotalNodes-stats.InternalNodes-stats.LeafNodes)
	fmt.Printf("Maximum depth: %d\n", stats.MaxDepth)
	fmt.Printf("Total edge length: %d characters\n", stats.TotalEdgeLength)
	fmt.Printf("Average edge length per node: %.2f characters\n", float64(stats.TotalEdgeLength)/float64(stats.TotalNodes))
	fmt.Printf("Total result entries: %d\n", stats.TotalResults)
	fmt.Printf("Unique results: %d\n", len(stats.UniqueResults))
	if len(stats.UniqueResults) > 0 {
		fmt.Printf("Average results per unique entry: %.2f\n", float64(stats.TotalResults)/float64(len(stats.UniqueResults)))
	}
	fmt.Println("=============================\n")
}
