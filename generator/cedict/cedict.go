package cedict

import (
	"bufio"
	"errors"
	"io"
	"strings"
)

func Parse(r io.Reader) (ce CEDICT, err error) {
	s := bufio.NewScanner(r)

	for s.Scan() {
		text := s.Text()
		entry := Entry{}

		if strings.HasPrefix(text, "#") {
			continue
		}

		end := strings.Index(text, " ")
		if end < 0 {
			return CEDICT{}, errors.New("invalid CEDICT format")
		}
		entry.Traditional = text[:end]
		text = text[end+1:]

		end = strings.Index(text, " [")
		if end < 0 {
			return CEDICT{}, errors.New("invalid CEDICT format")
		}
		entry.Simplified = text[:end]
		text = text[end+2:]

		end = strings.Index(text, "] /")
		if end < 0 {
			return CEDICT{}, errors.New("invalid CEDICT format")
		}
		pinyinUnsplit := text[:end]
		text = text[end+3:]

		entry.Pinyin = []string{}
		for _, pinyin := range strings.Split(pinyinUnsplit, ",") {
			entry.Pinyin = append(entry.Pinyin, strings.TrimSpace(pinyin))
		}

		entry.Senses = []Gloss{}
		for text != "" {
			end = strings.Index(text, "/")
			if end < 0 {
				return CEDICT{}, errors.New("invalid CEDICT format")
			}
			sense := text[:end]
			text = text[end+1:]

			glosses := strings.Split(sense, ";")
			for i := range glosses {
				glosses[i] = strings.Trim(glosses[i], " ")
			}

			entry.Senses = append(entry.Senses, glosses)
		}

		ce = append(ce, entry)
	}

	return
}

type CEDICT []Entry

type Entry struct {
	Traditional string   `json:"traditional"`
	Simplified  string   `json:"simplified"`
	Pinyin      []string `json:"pinyin"`
	Senses      []Gloss  `json:"senses"`
}

type Gloss []string
