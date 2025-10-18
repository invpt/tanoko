package subset

import (
	"math/rand"
	"sort"
)

type ClusteringConfig struct {
	NumClusters   int
	MaxIterations int
	Tolerance     float64
	RandomSeed    int64
}

type balancedKMeans struct {
	ClusteringConfig

	matrix       CooccurrenceMatrix
	runes        []rune
	clusterSizes []int
	clusters     []RuneSet
	centroids    []CooccurenceVector

	assignments []assignment
}

type assignment struct {
	runeIdx    int
	clusterIdx int
	similarity float64
}

func Cluster(matrix CooccurrenceMatrix, config ClusteringConfig) []RuneSet {
	if len(matrix) < config.NumClusters {
		panic("Not enough runes for the requested number of clusters")
	}

	matrix.normalize()

	runes := matrix.runesOrdered()

	targetSize := len(runes) / config.NumClusters
	remainder := len(runes) % config.NumClusters
	clusterSizes := make([]int, config.NumClusters)
	for i := 0; i < config.NumClusters; i++ {
		clusterSizes[i] = targetSize
		if i < remainder {
			clusterSizes[i]++
		}
	}

	clusters := make([]RuneSet, config.NumClusters)
	centroids := make([]CooccurenceVector, config.NumClusters)
	for i := range clusters {
		clusters[i] = make(RuneSet)
	}
	for i := range centroids {
		centroids[i] = make(CooccurenceVector)
	}

	assignments := make([]assignment, 0, len(runes)*config.NumClusters)

	k := balancedKMeans{
		ClusteringConfig: config,
		matrix:           matrix,
		runes:            runes,
		clusterSizes:     clusterSizes,
		clusters:         clusters,
		centroids:        centroids,
		assignments:      assignments,
	}

	k.run()

	return k.clusters
}

func (k *balancedKMeans) run() {
	k.initRandomCentroids()

	prevCentroids := make([]CooccurenceVector, k.NumClusters)
	for i := range prevCentroids {
		prevCentroids[i] = make(CooccurenceVector)
	}

	for range k.MaxIterations {
		for i, centroid := range k.centroids {
			clear(prevCentroids[i])
			for r, val := range centroid {
				prevCentroids[i][r] = val
			}
		}

		k.balancedAssignment()

		k.updateCentroids()

		if k.hasConverged(prevCentroids) {
			break
		}
	}
}

func (k *balancedKMeans) initRandomCentroids() {
	r := rand.New(rand.NewSource(k.RandomSeed))

	selectedIndices := make(map[int]struct{})
	for i := 0; i < len(k.centroids); i++ {
		var idx int
		for {
			idx = r.Intn(len(k.runes))
			if _, exists := selectedIndices[idx]; !exists {
				break
			}
		}
		selectedIndices[idx] = struct{}{}

		for r, val := range k.matrix[k.runes[idx]] {
			k.centroids[i][r] = val
		}
	}
}

func (k *balancedKMeans) balancedAssignment() {
	for i := range k.clusters {
		clear(k.clusters[i])
	}

	k.assignments = k.assignments[:0]
	for runeIdx, r := range k.runes {
		for clusterIdx, centroid := range k.centroids {
			similarity := k.matrix[r].cosineSimilarity(centroid)

			k.assignments = append(k.assignments, assignment{
				runeIdx:    runeIdx,
				clusterIdx: clusterIdx,
				similarity: similarity,
			})
		}
	}

	sort.Slice(k.assignments, func(i, j int) bool {
		return k.assignments[i].similarity > k.assignments[j].similarity
	})

	assigned := make([]bool, len(k.runes))
	for _, a := range k.assignments {
		if assigned[a.runeIdx] || len(k.clusters[a.clusterIdx]) >= k.clusterSizes[a.clusterIdx] {
			continue
		}

		// Assign rune to cluster
		k.clusters[a.clusterIdx][k.runes[a.runeIdx]] = struct{}{}
		assigned[a.runeIdx] = true
	}

	for _, assigned := range assigned {
		if !assigned {
			// this shouldn't ever happen
			panic("failed to assign all runes")
		}
	}
}

// updates centroids to be averages of all vectors in each cluster
func (k *balancedKMeans) updateCentroids() {
	for i, cluster := range k.clusters {
		clear(k.centroids[i])

		for r := range cluster {
			for dim, val := range k.matrix[r] {
				k.centroids[i][dim] += val
			}
		}

		for dim, sum := range k.centroids[i] {
			k.centroids[i][dim] = sum / float64(len(cluster))
		}
	}
}

func (k *balancedKMeans) hasConverged(previousCentroids []CooccurenceVector) bool {
	if len(k.centroids) != len(previousCentroids) {
		return false
	}

	for i := range k.centroids {
		distance := k.centroids[i].euclideanDistance(previousCentroids[i])
		if distance > k.Tolerance {
			return false
		}
	}

	return true
}
