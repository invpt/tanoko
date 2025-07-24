package index

import (
	"cmp"
	"errors"
	"fmt"
	"io"
	"slices"
	"sort"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/english"
)

const COMMON_WORD_COUNT = 16
const COMMON_POSTING_LIST_SIZE = 100

type Builder struct {
	postings map[string][]Posting
	maxID    uint32
}

type Posting struct {
	entryId uint32
	senses  uint8
}

func NewBuilder() *Builder {
	return &Builder{postings: map[string][]Posting{}}
}

func (b *Builder) Add(text string, id uint32, senseIdx int) {
	senseBit := uint8(1 << min(8, senseIdx))

	b.maxID = max(b.maxID, id)
outer:
	for _, token := range english.Tokenize(text) {
		postings := b.postings[token]
		for i, posting := range postings {
			if posting.entryId == id {
				posting.senses |= senseBit
				postings[i] = posting
				continue outer
			}
		}
		b.postings[token] = append(b.postings[token], Posting{entryId: id, senses: senseBit})
		slices.SortFunc(b.postings[token], func(a Posting, b Posting) int { return cmp.Compare(a.entryId, b.entryId) })
	}
}

func (b *Builder) Build() *Index {
	return &Index{
		commonWords: findCommonWords(b.postings),
		postings:    b.postings,
		maxID:       b.maxID,
	}
}

func findCommonWords(entries map[string][]Posting) (commonWords []string) {
	type tokenCount struct {
		token string
		count int
	}
	var counts []tokenCount
	for token, ids := range entries {
		counts = append(counts, tokenCount{token: token, count: len(ids)})
	}
	sort.Slice(counts, func(i, j int) bool {
		return counts[i].count > counts[j].count
	})

	for i := range COMMON_WORD_COUNT {
		commonWords = append(commonWords, counts[i].token)
	}

	return
}

type Index struct {
	commonWords []string
	postings    map[string][]Posting
	maxID       uint32
}

func (idx *Index) PrintStats(name string) {
	totalEntries := len(idx.postings)
	totalPostings := 0
	for _, postings := range idx.postings {
		totalPostings += len(postings)
	}
	fmt.Printf("%s: %d terms, %d postings, %d common words\n", name, totalEntries, totalPostings, len(idx.commonWords))
}

func (idx *Index) Export(w io.Writer) (err error) {
	s := encode.NewStream(w)
	defer func() { err = errors.Join(err, s.Flush()) }()

	var b *encode.Buffer

	if b, err = s.Append(); err != nil {
		return
	}
	offsets, err := idx.exportEntries(b)
	if err != nil {
		return fmt.Errorf("failed to build entries: %w", err)
	}

	if b, err = s.Append(); err != nil {
		return
	}
	if err := idx.exportEntryIndex(b, offsets); err != nil {
		return fmt.Errorf("failed to build: %w", err)
	}

	if b, err = s.Append(); err != nil {
		return
	}
	if err := idx.exportCommonWordsList(b); err != nil {
		return fmt.Errorf("failed to build common words: %w", err)
	}

	if b, err = s.Append(); err != nil {
		return
	}
	if err := idx.exportCommonWords(b); err != nil {
		return fmt.Errorf("failed to build common words: %w", err)
	}

	return nil
}

func (idx *Index) exportCommonWordsList(b *encode.Buffer) error {
	for _, word := range encode.Array(b, idx.commonWords) {
		encode.String(b, word)
	}
	return nil
}

func (idx *Index) exportCommonWords(b *encode.Buffer) (err error) {
	wordToBit := make(map[string]uint16, len(idx.commonWords))
	for i, word := range idx.commonWords {
		wordToBit[word] = uint16(1 << i)
	}

	table := make([]uint16, idx.maxID+1)

	for word, postings := range idx.postings {
		if bitMask, isCommon := wordToBit[word]; isCommon {
			for _, posting := range postings {
				if int(posting.entryId) < len(table) {
					table[posting.entryId] |= bitMask
				}
			}
		}
	}

	for _, entry := range table {
		encode.Uint16(b, entry)
	}

	return nil
}

func (idx *Index) exportEntryIndex(b *encode.Buffer, offsets map[string]uint32) error {
	var sortedWords []string
	for word := range idx.postings {
		sortedWords = append(sortedWords, word)
	}
	sort.Strings(sortedWords)

	for _, word := range sortedWords {
		if len(word) > 255 {
			return fmt.Errorf("word '%s' is too long (%d chars, max 255)", word, len(word))
		}

		if offsets[word] > 0x7FFFFFFF {
			return fmt.Errorf("offset for word '%s' is too large", word)
		}

		encode.Uint32(b, offsets[word]|uint32(len(word))<<24)
	}

	return nil
}

func (idx *Index) exportEntries(b *encode.Buffer) (map[string]uint32, error) {
	var sortedWords []string
	for word := range idx.postings {
		sortedWords = append(sortedWords, word)
	}
	slices.Sort(sortedWords)

	offsets := make(map[string]uint32, len(idx.postings))
	for _, word := range sortedWords {
		offsets[word] = uint32(b.Offset())

		encode.Raw(b, word)

		postings := idx.postings[word]
		if slices.Contains(idx.commonWords, word) && len(postings) > COMMON_POSTING_LIST_SIZE {
			postings = postings[:COMMON_POSTING_LIST_SIZE]
		}

		for _, posting := range encode.Array(b, postings) {
			encode.Uvarint(b, posting.entryId)
			encode.Uint8(b, posting.senses)
		}
	}

	return offsets, nil
}
