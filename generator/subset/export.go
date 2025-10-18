package subset

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func Export(outputDir string, name string, fontIndex int, runes RuneSet) error {
	chars := strings.Builder{}
	for r := range runes {
		chars.WriteRune(r)
	}

	tempFile, err := os.CreateTemp("", "chars-*.txt")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %v", err)
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	if _, err := tempFile.WriteString(chars.String()); err != nil {
		return fmt.Errorf("failed to write to temp file: %v", err)
	}

	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("failed to close temp file: %v", err)
	}

	otfFile := filepath.Join(outputDir, name+".otf")

	cmd := exec.Command("hb-subset",
		"--font-file", ttcPath,
		"--face-index", strconv.Itoa(fontIndex),
		"--text-file", tempFile.Name(),
		"--output-file", otfFile,
	)

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create subset: %v", err)
	}

	defer os.Remove(otfFile)

	cmd = exec.Command("woff2_compress", otfFile)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to compress to woff2: %v", err)
	}

	return nil
}
