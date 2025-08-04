package radix

import (
	"fmt"
	"io"
	"slices"

	"github.com/invpt/tanoko/generator/encode"
	"github.com/invpt/tanoko/generator/util"
)

type Tree struct {
	root *node
}

type node struct {
	edge     string
	children map[byte]*node
	results  []uint32
}

func New() *Tree {
	return &Tree{
		root: &node{
			edge:     "",
			children: map[byte]*node{},
			results:  []uint32{},
		},
	}
}

func (t *Tree) Add(text string, id uint32) {
	t.root.insert(text, id)
}

func (n *node) insert(key string, resultID uint32) {
	if len(key) == 0 {
		n.results = util.AppendUniqueSorted(n.results, resultID)
		return
	}

	firstByte := key[0]
	child, exists := n.children[firstByte]

	if !exists {
		// No child with this first byte, create new node
		newNode := &node{
			edge:     key,
			children: map[byte]*node{},
			results:  []uint32{resultID},
		}
		n.children[firstByte] = newNode
		return
	}

	// Find common prefix between key and child's edge
	commonPrefixLen := 0
	for i := range min(len(key), len(child.edge)) {
		if key[i] == child.edge[i] {
			commonPrefixLen++
		} else {
			break
		}
	}

	if commonPrefixLen == len(child.edge) {
		// Child's edge is a prefix of key, continue recursively
		child.insert(key[commonPrefixLen:], resultID)
	} else if commonPrefixLen == len(key) {
		// Key is a prefix of child's edge, need to split the child
		splitNode := &node{
			edge:     key,
			children: map[byte]*node{},
			results:  []uint32{resultID},
		}

		// Update child's edge to remaining part
		remainingEdge := child.edge[commonPrefixLen:]
		child.edge = remainingEdge

		// Set child as a child of split node
		if len(remainingEdge) > 0 {
			splitNode.children[remainingEdge[0]] = child
		}

		n.children[firstByte] = splitNode
	} else {
		// Need to split at common prefix
		splitNode := &node{
			edge:     key[:commonPrefixLen],
			children: map[byte]*node{},
			results:  []uint32{},
		}

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
			newNode := &node{
				edge:     remainingKey,
				children: map[byte]*node{},
				results:  []uint32{resultID},
			}
			splitNode.children[remainingKey[0]] = newNode
		} else {
			// Remaining key is empty, add result to split node
			splitNode.results = util.AppendUniqueSorted(splitNode.results, resultID)
		}

		n.children[firstByte] = splitNode
	}
}

func (t *Tree) PrintStats(name string) {
	nodeCount := 0
	totalResults := 0
	t.root.countStats(&nodeCount, &totalResults)
	fmt.Printf("%s: %d nodes, %d results\n", name, nodeCount, totalResults)
}

func (n *node) countStats(nodeCount *int, totalResults *int) {
	*nodeCount++
	*totalResults += len(n.results)
	for _, child := range n.children {
		child.countStats(nodeCount, totalResults)
	}
}

func (t *Tree) Export(w io.Writer) error {
	b := encode.NewBuffer()
	encode.Uint32(b, t.root.encode(b, make(map[*node]uint32)))
	encode.Uint32(b, uint32(len(t.root.edge)))
	_, err := w.Write(b.Finish())
	return err
}

func (n *node) encode(b *encode.Buffer, encodedOffsets map[*node]uint32) uint32 {
	if offset, alreadyEncoded := encodedOffsets[n]; alreadyEncoded {
		return offset
	}

	sortedChildren := make([]*node, 0, len(n.children))
	for _, child := range n.children {
		sortedChildren = append(sortedChildren, child)
	}
	slices.SortFunc(sortedChildren, func(a *node, b *node) int { return int(a.edge[0] - b.edge[0]) })

	// Children are encoded first since we need their offsets
	childOffsets := make([]uint32, len(sortedChildren))
	for i, child := range sortedChildren {
		childNode := n.children[child.edge[0]]
		childOffsets[i] = childNode.encode(b, encodedOffsets)
	}

	// Now encode this node
	encodedOffset := uint32(b.Offset())
	encodedOffsets[n] = encodedOffset

	encode.Raw(b, n.edge)
	for i, child := range encode.Array(b, sortedChildren) {
		encode.Uint8(b, child.edge[0])
		encode.Uint8(b, uint8(len(child.edge)))
		encode.Uvarint(b, childOffsets[i])
	}
	for _, resultID := range encode.Array(b, n.results) {
		encode.Uvarint(b, resultID)
	}

	return encodedOffset
}
