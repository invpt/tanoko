package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

const (
	sep1 = "\x1F"
	sep2 = "\x1E"
	sep3 = "\x1D"
	sep4 = "\x1C"
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

type IndexItem struct {
	ID        string
	Text      string
	Common    bool
	Priority  float64
	KanaCount int
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

func removeDiacritics(r rune) rune {
	// Map common diacritics to base Latin characters
	diacriticMap := map[rune]rune{
		'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'a',
		'ç': 'c',
		'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
		'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
		'ñ': 'n',
		'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
		'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
		'ý': 'y', 'ÿ': 'y',
		'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Æ': 'A',
		'Ç': 'C',
		'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
		'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
		'Ñ': 'N',
		'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
		'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
		'Ý': 'Y', 'Ÿ': 'Y',
	}

	if mapped, exists := diacriticMap[r]; exists {
		return mapped
	}
	return r
}

func isEnglishChar(r rune) bool {
	// Check if character is basic Latin (English)
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
}

func tokenizeEnglish(text string) []string {
	results := []string{}
	var result strings.Builder
	for _, r := range text {
		normalized := removeDiacritics(r)

		if isEnglishChar(normalized) {
			result.WriteRune(unicode.ToLower(normalized))
		} else if result.Len() > 0 && r != '\'' && r != '.' {
			results = append(results, result.String())
			result.Reset()
		}
	}

	if result.Len() > 0 {
		results = append(results, result.String())
	}

	return results
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
