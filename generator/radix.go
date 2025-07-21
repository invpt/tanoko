package main

import (
	"fmt"
	"sort"
)

// RadixNode represents a node in the radix tree (compressed trie).
type RadixNode struct {
	edge     string
	children map[byte]*RadixNode
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
	fmt.Println("=== Radix Tree Statistics ===")
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
	fmt.Println("=============================")
}
