package english

import (
	"strings"
	"unicode"
)

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

func Tokenize(text string) []string {
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
