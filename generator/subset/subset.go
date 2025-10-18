package subset

import "strings"

type RuneSet map[rune]struct{}

type Scripts int

const (
	ScriptsSC Scripts = 1 << iota
	ScriptsTC
	ScriptsJP
)

var ScriptsOrdered = [...]Scripts{ScriptsSC, ScriptsTC, ScriptsJP}

func (s Scripts) Names() string {
	name := strings.Builder{}
	for _, o := range ScriptsOrdered {
		if s&o != 0 {
			switch o {
			case ScriptsSC:
				name.WriteString("SC")
			case ScriptsTC:
				name.WriteString("TC")
			case ScriptsJP:
				name.WriteString("JP")
			}
		}
	}
	return name.String()
}

func (s Scripts) First() Scripts {
	for _, o := range ScriptsOrdered {
		if s&o != 0 {
			return o
		}
	}
	return 0
}
