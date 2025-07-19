package jmdict

//////////////////////////////////////////////
// Shared custom types for all dictionaries //
//////////////////////////////////////////////

// Language2Letter represents language code, ISO 639-1 standard.
// 2 letters: "en", "es", "fr"
// @see <https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes>
// @see <https://en.wikipedia.org/wiki/ISO_639-1>
type Language2Letter string

// Language3Letter represents language code, ISO 639-2 standard.
// 3 letters: "eng", "spa", "fra"
// @see <https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes>
// @see <https://en.wikipedia.org/wiki/ISO_639-2>
type Language3Letter string

// Language represents either 2-letter or 3-letter language code
type Language string

// DictionaryMetadata contains dictionary metadata: version, languages, creation date
type DictionaryMetadata struct {
	// Version represents semantic version of this project (not the dictionary itself).
	// For the dictionary revisions, see DictRevisions field
	// @see <https://semver.org/>
	Version string `json:"version"`

	// Languages contains list of languages in this file
	Languages []Language `json:"languages"`

	// DictDate represents creation date of JMdict file, as it appears in a comment
	// with format "JMdict created: YYYY-MM-DD" in the original XML file header
	DictDate string `json:"dictDate"`
}

/////////////////////////////////////////////////
// Shared custom types for JMdict and JMnedict //
/////////////////////////////////////////////////

// XrefWordReadingIndex represents xref - Full reference format: word (kanji+kana) + reading (kana-only) + sense index (starting from 1)
type XrefWordReadingIndex [3]interface{} // [kanji: string, kana: string, senseIndex: number]

// XrefWordReading represents xref - Shorter reference format: word + reading, without sense index
type XrefWordReading [2]string // [kanji: string, kana: string]

// XrefWordIndex represents xref - Shorter reference format: word (can be kana-only or contain kanji) + sense index
type XrefWordIndex [2]interface{} // [kanjiOrKana: string, senseIndex: number]

// XrefWord represents xref - The shortest reference format: just the word (can be kana-only or contain kanji)
type XrefWord [1]string // [kanjiOrKana: string]

// Xref represents cross-reference
//
// Examples:
//   - ["丸", "まる", 1] - refers to the word "丸", read as "まる" ("maru"),
//     specifically the 1st sense element
//   - ["○", "まる", 1] - same as previous, but "○" is a special character
//     for the word "丸"
//   - ["二重丸", "にじゅうまる"] - refers to the word "二重丸",
//     read as "にじゅうまる" ("nijoumaru")
//   - ["漢数字"] - refers to the word "漢数字", with any reading
type Xref []interface{}

// Tag represents all tags are listed in a separate section of the file.
// See the descriptions of the root JSON objects of each dictionary.
//
// Examples:
// - "v5uru" - "Godan verb - Uru old class verb (old form of Eru)"
// - "n" - "noun (common) (futsuumeishi)"
// - "tv" - "television"
type Tag string

// JMdictDictionaryMetadata contains dictionary metadata, such as revisions and tags.
type JMdictDictionaryMetadata struct {
	DictionaryMetadata

	// CommonOnly indicates if this file contains only common kana/kanji versions
	CommonOnly bool `json:"commonOnly"`

	// DictRevisions contains revisions of JMdict file, as they appear in comments
	// in the original XML file header. These only contain
	// actual version (e.g., "1.08"), not a full comment.
	// Original comments also mention changes made,
	// but this is omitted in the resulting JSON files
	DictRevisions []string `json:"dictRevisions"`

	// Tags contains parts of speech, names of dialects, fields of application, etc.
	// All those things are expressed as XML entities in the original file.
	// Keys of this object are tags per se, and values are descriptions,
	// slightly modified from the original file
	Tags map[Tag]string `json:"tags"`
}

//////////////////
// JMdict types //
//////////////////

// JMdict represents root object
//
// Important concepts:
//
//   - "Kanji" and "kana" versions of words are not always equivalent
//     to "spellings" and "readings" correspondingly. Some words are kana-only.
//     You should treat "kanji" and "kana" as different ways of spelling,
//     although when kanji versions are present, kana versions are indeed "readings" for those
//   - Some kana versions only apply to particular kanji versions, i.e. different spellings
//     of the same word can be read in different ways. You'll see the AppliesToKanji field
//     being filled with a particular version in such cases
//   - "Sense" in JMdict refers to translations along with some other information.
//     Sometimes, some "senses" only apply to some particular kanji/kana versions of a word,
//     that's why you'll see fields AppliesToKanji and AppliesToKana.
//     In JMnedict, translations are simply called "translations," there are no "senses"
type JMdict struct {
	JMdictDictionaryMetadata

	// Words contains list of dictionary entries/words
	Words []JMdictWord `json:"words"`
}

// JMdictWord represents JMdict entry/word
type JMdictWord struct {
	// ID is unique identifier of an entry
	ID string `json:"id"`

	// Kanji contains kanji (and other non-kana) writings.
	// Note that some words are only spelled with kana, so this may be empty.
	Kanji []JMdictKanji `json:"kanji"`

	// Kana contains kana-only writings of words.
	// If a kanji is also present, these can be considered as "readings",
	// but there are words written with kana only.
	Kana []JMdictKana `json:"kana"`

	// Sense contains senses = translations + some related data
	Sense []JMdictSense `json:"sense"`
}

// JMdictKanji represents kanji writing of a word
type JMdictKanji struct {
	// Common indicates if this particular word is considered common.
	// This field combines all the *_pri fields
	// from original files in a same way as <https://jisho.org>
	// and other on-line dictionaries do (typically, some words have
	// "common" markers/tags). It gets rid of a bunch of *_pri fields
	// which are not typically used. Words marked with "news1", "ichi1",
	// "spec1", "spec2", "gai1" in the original file are treated as common,
	// which may or may not be true according to other sources.
	Common bool `json:"common"`

	// Text is the word itself, as spelled with any non-kana-only writing.
	// May contain kanji, kana (but not only kana!), and some other characters.
	// Example: "ＣＤプレイヤー" - none of these symbols are kanji,
	// but "ＣＤ" is not kana, so it will be in this field. The corresponding
	// kana text will be "シーディープレイヤー", where "シーディー" is how the "ＣＤ"
	// is spelled in Japanese kana.
	Text string `json:"text"`

	// Tags contains tags applicable to this writing
	Tags []Tag `json:"tags"`
}

// JMdictKana represents kana writing of a word
type JMdictKana struct {
	// Common is same as JMdictKanji.Common.
	// In this case, it shows that this particular kana transcription of a word
	// is considered common. For example, when a word can be read in multiple ways,
	// some of them may be more common than others.
	Common bool `json:"common"`

	// Text is kana-only writing, may only accidentally contain middle-dot
	// and other punctuation-like characters.
	Text string `json:"text"`

	// Tags is same as JMdictKanji.Tags
	Tags []Tag `json:"tags"`

	// AppliesToKanji is list of kanji spellings of this word which this particular kana version applies to.
	// "*" means "all", an empty array means "none".
	// This field is useful for words will multiple kanji variants - some of them may be read
	// differently than others.
	AppliesToKanji []string `json:"appliesToKanji"`
}

// JMdictSense represents a sense/meaning of a word
type JMdictSense struct {
	// PartOfSpeech contains parts of speech for this sense.
	//
	// In the original files, part-of-speech from the previous sense elements
	// may apply to the subsequent elements: e.g. if the 1st and 2nd elements
	// are both nouns, then only the 1st will state that explicitly.
	// This requires users to check the whole list of senses to correctly
	// determine part of speech for any particular sense.
	//
	// Unlike the original XML files, this field is never empty/missing.
	// Here, this field is "normalized" - parts of speech are present
	// in every element, even if they are all the same.
	PartOfSpeech []Tag `json:"partOfSpeech"`

	// AppliesToKanji is list of kanji writings within this word which this sense applies to.
	// Works in conjunction with the next AppliesToKana field.
	// "*" means "all". This is never empty, unlike JMdictKana.AppliesToKanji.
	AppliesToKanji []string `json:"appliesToKanji"`

	// AppliesToKana is list of kana writings within this word which this sense applies to.
	// Works in conjunction with the previous AppliesToKanji field.
	// "*" means "all". This is never empty, unlike JMdictKana.AppliesToKanji.
	AppliesToKana []string `json:"appliesToKana"`

	// Related contains references to related words
	Related []Xref `json:"related"`

	// Antonym contains references to antonyms of this word
	Antonym []Xref `json:"antonym"`

	// Field contains list of fields of application of this word.
	// E.g. "math" means that this word is related to or used in Mathematics.
	Field []Tag `json:"field"`

	// Dialect contains list of dialects where this word is used
	Dialect []Tag `json:"dialect"`

	// Misc contains miscellanea - list of other tags which don't fit into other tag fields
	Misc []Tag `json:"misc"`

	// Info contains other information about this word
	Info []string `json:"info"`

	// LanguageSource contains source language information for borrowed words and wasei-eigo.
	// Will be empty for words with Japanese origin (most of JMdict entries)
	LanguageSource []JMdictLanguageSource `json:"languageSource"`

	// Gloss contains translations of this word
	Gloss []JMdictGloss `json:"gloss"`
}

// JMdictLanguageSource contains source language information for borrowed words and wasei-eigo.
// For borrowed words this will contain the original word/phrase,
// in the source language
type JMdictLanguageSource struct {
	// Lang is language of this translation
	Lang Language3Letter `json:"lang"`

	// Full indicates whether the sense element fully or partially
	// describes the source word or phrase of the loanword
	Full bool `json:"full"`

	// Wasei indicates that the word is wasei-eigo.
	// @see <https://en.wikipedia.org/wiki/Wasei-eigo>
	Wasei bool `json:"wasei"`

	// Text in the language defined by a Lang field, or null
	Text *string `json:"text"`
}

// JMdictGender represents gender
// Possible values: "masculine", "feminine", "neuter"
type JMdictGender string

// JMdictGlossType represents type of translation
// Possible values: "literal", "figurative", "explanation", "trademark" (e.g. name of a company or a product)
type JMdictGlossType string

// JMdictGloss represents translation of a word
type JMdictGloss struct {
	// Lang is language of this translation
	Lang Language3Letter `json:"lang"`

	// Gender is typically for a noun in the target language.
	// When null, the gender is either not relevant or hasn't been provided.
	Gender *JMdictGender `json:"gender"`

	// Type is type of translation.
	// Most words have null values, meaning this attribute was absent in the original XML entry.
	// Jmdict documentation does not describe the meaning of this attribute being absent.
	Type *JMdictGlossType `json:"type"`

	// Text is a translation word/phrase
	Text string `json:"text"`
}

////////////////////
// Jmnedict types //
////////////////////

// JMnedict represents root object
//
// Differences from JMdict format (in JMdictWord):
//
//  1. kanji and kana have no common flag because in this dictionary
//     priority data is missing (ke_pri and re_pri fields in JMdict,
//     see JMdictKanji.Common and JMdictKana.Common)
//  2. translation instead of gloss
//  3. translation->translation->lang seems to be always empty because
//     the original XML files have no data in corresponding attributes,
//     even though documentation says otherwise. In this JSON version,
//     "eng" (English) is always present as a default
type JMnedict struct {
	JMdictDictionaryMetadata

	// Words contains list of dictionary entries/words
	Words []JMnedictWord `json:"words"`
}

// JMnedictWord represents JMnedict entry/word
type JMnedictWord struct {
	// ID is unique identifier of an entry
	ID string `json:"id"`

	// Kanji contains kanji (and other non-kana) writings.
	// Note that some words are only spelled with kana, so this may be empty.
	Kanji []JMnedictKanji `json:"kanji"`

	// Kana contains kana-only writings of words.
	// If a kanji is also present, these can be considered as "readings",
	// but there are words written with kana only.
	Kana []JMnedictKana `json:"kana"`

	// Translation contains translations + some related data
	Translation []JMnedictTranslation `json:"translation"`
}

// JMnedictKanji represents kanji writing in JMnedict
type JMnedictKanji struct {
	// Text is the word itself, as spelled with any non-kana-only writing.
	// @see JMdictKanji.Text
	Text string `json:"text"`

	// Tags contains tags applicable to this writing
	Tags []Tag `json:"tags"`
}

// JMnedictKana represents kana writing in JMnedict
type JMnedictKana struct {
	// Text is kana-only writing, may only accidentally contain middle-dot
	// and other punctuation-like characters.
	Text string `json:"text"`

	// Tags is same as JMnedictKanji.Tags
	Tags []Tag `json:"tags"`

	// AppliesToKanji is list of kanji spellings of this word which this particular kana version applies to.
	// "*" means "all", an empty array means "none".
	// This field is useful for words will multiple kanji variants - some of them may be read
	// differently than others.
	AppliesToKanji []string `json:"appliesToKanji"`
}

// JMnedictTranslation represents translation data
type JMnedictTranslation struct {
	// Type contains name types, as specified in JMnedict.Tags
	Type []Tag `json:"type"`

	// Related contains references to related words
	Related []Xref `json:"related"`

	// Translation contains translations
	Translation []JMnedictTranslationTranslation `json:"translation"`
}

// JMnedictTranslationTranslation represents individual translation
type JMnedictTranslationTranslation struct {
	// Lang is language of this translation
	Lang Language3Letter `json:"lang"`

	// Text is a translation word/phrase
	Text string `json:"text"`
}

////////////////////
// Kanjidic types //
////////////////////

// Kanjidic2DictionaryMetadata represents metadata for Kanjidic2
type Kanjidic2DictionaryMetadata struct {
	DictionaryMetadata

	// FileVersion is version of the file, ordinal number.
	// The original XML file doesn't specify the meaning of this field.
	FileVersion int `json:"fileVersion"`

	// DatabaseVersion format: YYYY-NN, where YYYY is a year, and NN is a zero-padded ordinal number (01, 02, ..., 99)
	DatabaseVersion string `json:"databaseVersion"`
}

// Kanjidic2 represents root object
type Kanjidic2 struct {
	Kanjidic2DictionaryMetadata

	// Characters contains list of dictionary entries/characters
	Characters []Kanjidic2Character `json:"characters"`
}

// Kanjidic2Character represents a kanji character entry
type Kanjidic2Character struct {
	// Literal is kanji itself
	Literal string `json:"literal"`

	// Codepoints contains kanji code in various encoding systems, such as Unicode or JIS
	Codepoints []Kanjidic2Codepoint `json:"codepoints"`

	// Radicals contains radicals (i.e. "components" used for looking up kanji in dictionaries) of this kanji
	// Note that radicals don't necessarily represent all the component parts of a kanji,
	// but instead only describe some more distinctive parts. Radicals are used
	// to create indexes of kanji in dictionaries.
	Radicals []Kanjidic2Radical `json:"radicals"`

	// Misc contains miscellanea data, such as school grade, JLPT level, usage frequency, etc.
	Misc Kanjidic2Misc `json:"misc"`

	// DictionaryReferences contains references to find this kanji in various dictionaries
	DictionaryReferences []Kanjidic2DictionaryReference `json:"dictionaryReferences"`

	// QueryCodes contains query codes to find this kanji in various (typically electronic) dictionaries.
	// Query code is typically a unique sequence of numbers and/or letters which
	// describes the shape of a kanji w/o relying on the knowledge of its
	// reading or meaning.
	QueryCodes []Kanjidic2QueryCode `json:"queryCodes"`

	// ReadingMeaning contains reading and meaning of a kanji, split into groups because different
	// readings can have different meanings.
	ReadingMeaning *Kanjidic2ReadingMeaning `json:"readingMeaning"`
}

// Kanjidic2Codepoint represents codepoint information
type Kanjidic2Codepoint struct {
	// Type possible values:
	// - "jis208" - JIS X 0208-1997 - kuten coding, value format: nn-nn
	// - "jis212" - JIS X 0212-1990 - kuten coding, value format: nn-nn
	// - "jis213" - JIS X 0213-2000 - kuten coding, value format: p-nn-nn
	// - "ucs" - Unicode 4.0 - hex coding, value format: 4 or 5 hexadecimal digits
	Type  string `json:"type"`
	Value string `json:"value"`
}

// Kanjidic2Radical represents radical information
type Kanjidic2Radical struct {
	// Type possible values:
	// - "classical" - based on the system first used in the KangXi Zidian.
	//   The Shibano "JIS Kanwa Jiten" is used as the reference source.
	// - "nelson_c" - as used in the Nelson "Modern Japanese-English
	//   Character Dictionary" (i.e. the Classic, not the New Nelson).
	//   This will only be used where Nelson reclassified the kanji.
	Type  string `json:"type"`
	Value int    `json:"value"`
}

// Kanjidic2Misc represents miscellaneous information about kanji
type Kanjidic2Misc struct {
	Grade *int `json:"grade"`

	// StrokeCounts first value is the right count, the rest are common miscounts
	StrokeCounts []int `json:"strokeCounts"`

	// Variants contains list of variants of this kanji. "Variants" typically kanji with the same
	// meaning but different shape, e.g. language-specific or simplified versions.
	Variants []Kanjidic2Variant `json:"variants"`

	// Frequency is the rank of the character based on its frequency.
	// Only first 2,500 most used kanji, based on data of Japanese newspapers.
	Frequency *int `json:"frequency"`

	// RadicalNames contains human-readable names of radical, if this kanji is also known as a radical
	// for other kanji. Most of the time this list is empty.
	RadicalNames []string `json:"radicalNames"`

	// JlptLevel is the (former) Japanese Language Proficiency Test (JLPT) level for this kanji.
	// 1 (most advanced) to 4 (most elementary).
	// Some kanji are not listed in JLPT.
	//
	// "Note that the JLPT test levels changed in 2010, with a new 5-level
	// system (N1 to N5) being introduced. No official kanji lists are
	// available for the new levels. The new levels are regarded as
	// being similar to the old levels except that the old level 2 is
	// now divided between N2 and N3."
	JlptLevel *int `json:"jlptLevel"`
}

// Kanjidic2Variant represents variant information
type Kanjidic2Variant struct {
	// Type possible values:
	// - "jis208" - in JIS X 0208 - kuten coding
	// - "jis212" - in JIS X 0212 - kuten coding
	// - "jis213" - in JIS X 0213 - kuten coding
	// - "deroo" - De Roo number - numeric
	// - "njecd" - Halpern NJECD index number - numeric
	// - "s_h" - The Kanji Dictionary (Spahn & Hadamitzky) - descriptor
	// - "nelson_c" - "Classic" Nelson - numeric
	// - "oneill" - Japanese Names (O'Neill) - numeric
	// - "ucs" - Unicode codepoint - hexadecimal
	Type  string `json:"type"`
	Value string `json:"value"`
}

// Kanjidic2DictionaryReference represents dictionary reference information
// This is implemented as an interface to handle both Morohashi and non-Morohashi types
type Kanjidic2DictionaryReference struct {
	// Type for Morohashi: "moro"
	// For non-Morohashi types possible values:
	// - "nelson_c", "nelson_n", "halpern_njecd", "halpern_kkd", "halpern_kkld", "halpern_kkld_2ed"
	// - "heisig", "heisig6", "gakken", "oneill_names", "oneill_kk", "henshall", "sh_kk", "sh_kk2"
	// - "sakade", "jf_cards", "henshall3", "tutt_cards", "crowley", "kanji_in_context"
	// - "busy_people", "kodansha_compact", "maniette"
	Type string `json:"type"`

	// Morohashi is special case for reference: Morohashi
	// For "moro" type: contains volume and page information
	// For other types: null
	Morohashi *struct {
		Volume int `json:"volume"`
		Page   int `json:"page"`
	} `json:"morohashi"`

	Value string `json:"value"`
}

// Kanjidic2QueryCode represents query code information
type Kanjidic2QueryCode struct {
	// Type for skip: "skip"
	// For non-skip types possible values:
	// - "sh_desc", "four_corner", "deroo", "misclass"
	Type string `json:"type"`

	// SkipMisclassification for "skip" type, possible values:
	// - "posn" - a mistake in the division of the kanji
	// - "stroke_count" - a mistake in the number of strokes
	// - "stroke_and_posn" - mistakes in both division and strokes
	// - "stroke_diff" - ambiguous stroke counts depending on glyph
	// For non-skip types: null
	SkipMisclassification *string `json:"skipMisclassification"`

	Value string `json:"value"`
}

// Kanjidic2ReadingMeaning represents readings and meanings of kanji, split by groups
type Kanjidic2ReadingMeaning struct {
	// Groups are required because different readings can have
	// different meanings.
	Groups []Kanjidic2ReadingMeaningGroup `json:"groups"`

	// Nanori contains Japanese readings that are now only associated with names.
	// (from jap. "名乗り", "to say or give one's own name")
	Nanori []string `json:"nanori"`
}

// Kanjidic2ReadingMeaningGroup represents reading/meaning group.
// Groups are required because different readings can have different meanings.
type Kanjidic2ReadingMeaningGroup struct {
	Readings []Kanjidic2Reading `json:"readings"`
	Meanings []Kanjidic2Meaning `json:"meanings"`
}

// Kanjidic2Reading represents reading information
type Kanjidic2Reading struct {
	// Type possible values:
	// - "pinyin" - the modern PinYin romanization of the Chinese reading
	//   of the kanji. The tones are represented by a concluding digit.
	// - "korean_r" - the romanized form of the Korean reading(s) of the
	//   kanji. The readings are in the (Republic of Korea) Ministry
	//   of Education style of romanization.
	// - "korean_h" - the Korean reading(s) of the kanji in hangul.
	// - "vietnam" - the Vietnamese readings supplied by Minh Chau Pham.
	// - "ja_on" - the "on" Japanese reading of the kanji, in katakana.
	//   Another attribute r_status, if present, will indicate with
	//   a value of "jy" whether the reading is approved for a
	//   "Jouyou kanji". (The r_status attribute is not currently used.)
	//   A further attribute on_type, if present, will indicate with
	//   a value of kan, go, tou or kan'you the type of on-reading.
	//   (The on_type attribute is not currently used.)
	// - "ja_kun" - the "kun" Japanese reading of the kanji, usually in hiragana.
	//   Where relevant the okurigana is also included separated by a
	//   "." (dot). Readings associated with prefixes and suffixes are
	//   marked with a "-" (minus/hyphen). A second attribute r_status, if present,
	//   will indicate with a value of "jy" whether the reading is
	//   approved for a "Jouyou kanji". (The r_status attribute is not currently used.)
	Type string `json:"type"`

	// OnType indicates the type of on-reading: "kan", "go", "tou" or "kan'you".
	// Currently not used.
	OnType *string `json:"onType"`

	// Status "jy" indicates the reading is approved for a "Jouyou kanji"
	// Currently not used.
	Status *string `json:"status"`

	Value string `json:"value"`
}

// Kanjidic2Meaning represents meaning information
// Meaning usually refers to a historical usage of a kanji.
// This sometimes doesn't represent the current usage.
// For example, some kanji are not used as standalone words anymore,
// or used in multiple words with unrelated meanings.
type Kanjidic2Meaning struct {
	Lang  Language2Letter `json:"lang"`
	Value string          `json:"value"`
}

//////////////////////////////
// KRADFILE+KRADFILE2 types //
//////////////////////////////

// Kradfile represents KRADFILE and KRADFILE2 combined into a single file.
// This is the only type you'll need.
type Kradfile struct {
	// Version of jmdict-simplified project
	Version string `json:"version"`

	// Kanji map of: Kanji -> list of radicals/components
	Kanji map[string][]string `json:"kanji"`
}

//////////////////////////////
// RADKFILE+RADKFILE2 types //
//////////////////////////////

// Radkfile represents RADKFILE and RADKFILE2 combined into a single file.
// (The "radkfilex" file from the source archive is used.)
type Radkfile struct {
	// Version of jmdict-simplified project
	Version string `json:"version"`

	// Radicals map of: radical -> radical info
	Radicals map[string]RadkfileRadicalInfo `json:"radicals"`
}

// RadkfileRadicalInfo represents radical information
type RadkfileRadicalInfo struct {
	// StrokeCount stroke count, integer > 0
	StrokeCount int `json:"strokeCount"`

	// Code one of:
	// - the JIS X 0212 code of the kanji whose glyph better depicts the element in question
	// - the name of an image file (used by the WWWJDIC server)
	Code *string `json:"code"`

	// Kanji which use this radical.
	Kanji []string `json:"kanji"`
}
