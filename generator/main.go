package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/invpt/tanoko/generator/fileset"
	"github.com/invpt/tanoko/generator/subset"
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

	genAssetDir := filepath.Join("..", "src", "assets", "gen")
	if err := os.RemoveAll(genAssetDir); err != nil {
		panic(err)
	}
	if err := os.MkdirAll(genAssetDir, 0755); err != nil && !os.IsExist(err) {
		panic(err)
	}

	genSrcDir := filepath.Join("..", "src", "gen")
	if err := os.RemoveAll(genSrcDir); err != nil {
		panic(err)
	}
	if err := os.MkdirAll(genSrcDir, 0755); err != nil && !os.IsExist(err) {
		panic(err)
	}

	fmt.Println("Fetching dictionary data...")

	ce, err := fetchCEDICT()
	if err != nil {
		panic(err)
	}

	jm, jmne, kanjidic, err := fetchJMdict()
	if err != nil {
		panic(err)
	}

	_ = kanjidic

	fmt.Println("Generating files...")

	if err := fileset.Export(genAssetDir, "ce", ce, 0); err != nil {
		panic(err)
	}

	if err := fileset.Export(genAssetDir, "jm", jm.Words, 0); err != nil {
		panic(err)
	}

	if err := fileset.Export(genAssetDir, "jmne", jmne.Words, 200_000); err != nil {
		panic(err)
	}

	fmt.Println("Dictionary files generated.")

	fmt.Println("Subsetting fonts...")

	scriptSets := map[subset.Scripts]subset.RuneSet{
		subset.ScriptsSC: subset.CEDICTCodepoints(ce, true),
		subset.ScriptsTC: subset.CEDICTCodepoints(ce, false),
		subset.ScriptsJP: subset.JMdictCodepoints(jm.Words),
	}

	dedupSubsets, err := subset.CreateDedupSubsets(scriptSets)
	if err != nil {
		panic(err)
	}

	fmt.Println("Created deduplicated font subsets.")

	fmt.Println("Starting clustering...")

	totalGlyphs := 0
	for _, subset := range dedupSubsets {
		totalGlyphs += len(subset.RuneSet)
	}

	approxTotalClusters := 200

	type exportedCluster struct {
		name    string
		runes   subset.RuneSet
		scripts subset.Scripts
	}

	exportedClusters := []exportedCluster{}
	for scripts, dedupSubset := range dedupSubsets {
		if len(dedupSubset.RuneSet) == 0 {
			// this shouldn't ever happen if everything went right
			panic("empty rune set")
		}

		numClusters := approxTotalClusters * len(dedupSubset.RuneSet) / totalGlyphs
		if numClusters == 0 {
			numClusters = 1
		}

		m := subset.NewCooccurrenceMatrix()
		if scripts&subset.ScriptsSC != 0 || scripts&subset.ScriptsTC != 0 {
			m.FillFromCEDICT(ce, scripts&subset.ScriptsSC != 0, scripts&subset.ScriptsTC != 0, dedupSubset.RuneSet)
		}
		if scripts&subset.ScriptsJP != 0 {
			m.FillFromJMdict(jm.Words, dedupSubset.RuneSet)
		}

		fmt.Println("Clustering", scripts.Names(), "...")

		clusters := subset.Cluster(m, subset.ClusteringConfig{
			NumClusters:   numClusters,
			MaxIterations: 100,
			Tolerance:     1e-6,
			RandomSeed:    42 * int64(scripts),
		})

		fmt.Println("Finished clustering", scripts.Names())

		for _, cluster := range clusters {
			name := fmt.Sprintf("NotoSerif-C%03d-%s", len(exportedClusters), scripts.Names())
			subset.Export(genAssetDir, name, dedupSubset.FontIndex, cluster)
			fmt.Println("Exported subcluster", name)
			exportedClusters = append(exportedClusters, exportedCluster{
				name:    name,
				runes:   cluster,
				scripts: scripts,
			})
		}
	}

	fmt.Println("Exported all clusters.")

	css := strings.Builder{}
	for _, cluster := range exportedClusters {
		for _, script := range subset.ScriptsOrdered {
			if cluster.scripts&script == 0 {
				continue
			}

			css.WriteString("@font-face{font-family:\"Noto Serif ")
			css.WriteString(script.Names())
			css.WriteString("\";font-style:normal;")
			css.WriteString("font-weight:400;")
			css.WriteString("font-display:swap;")
			css.WriteString("src:url(/src/assets/gen/")
			css.WriteString(cluster.name)
			css.WriteString(".woff2)format(\"woff2\");")
			css.WriteString("unicode-range:")

			// Convert map to sorted slice for range generation
			runes := make([]rune, 0, len(cluster.runes))
			for r := range cluster.runes {
				runes = append(runes, r)
			}

			// Sort the runes
			for i := 0; i < len(runes); i++ {
				for j := i + 1; j < len(runes); j++ {
					if runes[i] > runes[j] {
						runes[i], runes[j] = runes[j], runes[i]
					}
				}
			}

			first := true
			rangeStart := rune(0)
			prev := rune(0)

			for i, r := range runes {
				if i == 0 {
					rangeStart = r
					prev = r
					continue
				}

				if r == prev+1 {
					prev = r
					continue
				}

				// End of a range, write it out
				if !first {
					css.WriteRune(',')
				}
				first = false

				css.WriteString("U+")
				css.WriteString(strings.ToUpper(strconv.FormatInt(int64(rangeStart), 16)))

				if rangeStart != prev {
					css.WriteString("-")
					css.WriteString(strings.ToUpper(strconv.FormatInt(int64(prev), 16)))
				}

				rangeStart = r
				prev = r
			}

			// Write the final range
			if len(runes) > 0 {
				if !first {
					css.WriteRune(',')
				}
				css.WriteString("U+")
				css.WriteString(strings.ToUpper(strconv.FormatInt(int64(rangeStart), 16)))

				if rangeStart != prev {
					css.WriteString("-")
					css.WriteString(strings.ToUpper(strconv.FormatInt(int64(prev), 16)))
				}
			}

			css.WriteString(";}\n")
		}
	}

	cssFilePath := filepath.Join(genSrcDir, "fonts.css")
	if err := os.WriteFile(cssFilePath, []byte(css.String()), 0644); err != nil {
		panic(err)
	}

	fmt.Println("Wrote fonts CSS file.")
}
