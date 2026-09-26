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
        Noise points are merged into their nearest cluster centroid.
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

        # Group core clusters
        clusters: Dict[int, List[Place]] = {}
        for idx, c_id in enumerate(cluster_assignments):
            if c_id != -1:
                if c_id not in clusters:
                    clusters[c_id] = []
                clusters[c_id].append(sightseeing[idx])

        if not clusters:
            clusters[0] = sightseeing
            return clusters

        # Assign noise points to nearest cluster centroid
        for idx, c_id in enumerate(cluster_assignments):
            if c_id == -1:
                p = sightseeing[idx]
                best_c = min(
                    clusters.keys(),
                    key=lambda c: sum(calculate_distance_km(p.lat, p.lng, cp.lat, cp.lng) for cp in clusters[c]) / len(clusters[c])
                )
                clusters[best_c].append(p)

        return clusters

    def get_cluster_name(self, places: List[Place]) -> str:
        """
        Generates a geographically grounded and thematically accurate neighborhood label.
        Evaluates the coordinates of the places alongside dominant attraction characteristics.
        """
        if not places:
            return "Central City Exploration"

        c_lat = sum(p.lat for p in places) / len(places)
        c_lng = sum(p.lng for p in places) / len(places)

        # 1. Hyderabad (lat ~17.2 - 17.6, lng ~78.2 - 78.6)
        if 17.2 <= c_lat <= 17.6 and 78.2 <= c_lng <= 78.7:
            if c_lat < 17.37:
                return "Old City & Charminar Heritage District"
            elif c_lng < 78.43:
                return "Golconda Citadel & West Tech District"
            else:
                return "Central Hussain Sagar & Lakefront Quarter"

        # 2. Delhi (lat ~28.4 - 28.8, lng ~76.9 - 77.4)
        if 28.4 <= c_lat <= 28.8 and 76.9 <= c_lng <= 77.4:
            if c_lat > 28.64:
                return "Old Delhi & Walled City Quarter"
            elif c_lat < 28.56:
                return "South Delhi & Qutub Monument Quarter"
            else:
                return "Central Imperial & Connaught District"

        # 3. Jaipur (lat ~26.8 - 27.1, lng ~75.6 - 76.0)
        if 26.8 <= c_lat <= 27.1 and 75.6 <= c_lng <= 76.0:
            if c_lat > 26.96:
                return "Amer & Nahargarh Fortresses"
            elif c_lat > 26.91:
                return "Pink City Walled Quarter & Bazaars"
            else:
                return "South Jaipur & Modern District"

        # Universal fallback using majority tag count
        from collections import Counter
        tag_counts = Counter(tag for p in places for tag in p.tags)
        top_tag = tag_counts.most_common(1)[0][0] if tag_counts else "sightseeing"
        return f"{top_tag.capitalize()} Neighborhood Hub"
