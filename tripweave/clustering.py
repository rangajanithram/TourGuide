"""
DBSCAN Geographic Spatial Clustering Engine for TripWeave.
Groups candidate attractions into geographic neighborhood hubs using spherical distance.
Fulfills Stage 3 & 4 of the Engineering Blueprint.
"""
from typing import List, Dict
from tripweave.models import Place
from tripweave.distance import calculate_distance_km

class GeoClusterer:
    def __init__(self, eps_km: float = 6.0, min_samples: int = 1):
        """
        eps_km: Maximum radius in kilometers to consider two attractions part of the same neighborhood cluster.
        min_samples: Minimum number of places to form a dense cluster.
        """
        self.eps_km = eps_km
        self.min_samples = min_samples

    def cluster_places(self, places: List[Place]) -> Dict[int, List[Place]]:
        """
        Performs DBSCAN clustering on sightseeing places.
        Returns: {cluster_id: [Place, Place, ...]}
        """
        # Exclude hotels from spatial clustering of activities
        sightseeing = [p for p in places if p.place_type != "hotel"]
        if not sightseeing:
            return {}

        n = len(sightseeing)
        visited = [False] * n
        cluster_assignments = [-1] * n
        cluster_id = 0

        # Build distance adjacency
        def get_neighbors(idx: int) -> List[int]:
            p1 = sightseeing[idx]
            neighbors = []
            for j in range(n):
                p2 = sightseeing[j]
                dist = calculate_distance_km(p1.lat, p1.lng, p2.lat, p2.lng)
                if dist <= self.eps_km:
                    neighbors.append(j)
            return neighbors

        for i in range(n):
            if visited[i]:
                continue
            visited[i] = True
            neighbors = get_neighbors(i)

            if len(neighbors) < self.min_samples:
                cluster_assignments[i] = -1  # noise/isolated
            else:
                cluster_assignments[i] = cluster_id
                # Expand cluster
                queue = [idx for idx in neighbors if idx != i]
                while queue:
                    neighbor_idx = queue.pop(0)
                    if not visited[neighbor_idx]:
                        visited[neighbor_idx] = True
                        n_neighbors = get_neighbors(neighbor_idx)
                        if len(n_neighbors) >= self.min_samples:
                            queue.extend([k for k in n_neighbors if k not in queue and not visited[k]])
                    if cluster_assignments[neighbor_idx] == -1:
                        cluster_assignments[neighbor_idx] = cluster_id

                cluster_id += 1

        # Group into clusters
        clusters: Dict[int, List[Place]] = {}
        for idx, c_id in enumerate(cluster_assignments):
            target_cluster = c_id if c_id != -1 else 0  # Map noise to nearest default cluster
            if target_cluster not in clusters:
                clusters[target_cluster] = []
            clusters[target_cluster].append(sightseeing[idx])

        return clusters

    def get_cluster_name(self, places: List[Place]) -> str:
        """Generates a human-friendly neighborhood label based on place tags."""
        all_tags = []
        for p in places:
            all_tags.extend(p.tags)
        
        if "architecture" in all_tags or "royal" in all_tags:
            return "Historic Heritage Hub"
        elif "unesco" in all_tags:
            return "UNESCO Monument Quarter"
        elif "fortress" in all_tags or "hilltop" in all_tags:
            return "Citadel & Fort District"
        elif "food" in all_tags:
            return "Bazaar & Culinary Hub"
        else:
            return "Central City Hub"
