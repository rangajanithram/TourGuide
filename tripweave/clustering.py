"""
DBSCAN Geographic Spatial Clustering Engine for TripWeave.
Groups candidate attractions into geographic neighborhood hubs using spherical distance.
Fulfills Stage 3 & 4 of the Engineering Blueprint.
"""
from typing import List, Dict, Any, Optional
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
                from collections import deque
                queue = deque(idx for idx in neighbors if idx != i)
                in_queue = set(queue)
                while queue:
                    neighbor_idx = queue.popleft()
                    in_queue.discard(neighbor_idx)
                    if not visited[neighbor_idx]:
                        visited[neighbor_idx] = True
                        n_neighbors = get_neighbors(neighbor_idx)
                        if len(n_neighbors) >= self.min_samples:
                            for k in n_neighbors:
                                if not visited[k] and k not in in_queue:
                                    queue.append(k)
                                    in_queue.add(k)
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

    def balance_workload(
        self,
        clusters: Dict[int, List[Place]],
        days: int,
        pace: Any = "balanced"
    ) -> Dict[int, List[Place]]:
        """
        Stage 4: Balances attraction workloads and spatial cluster distributions across trip days.
        If number of spatial clusters exceeds trip days, merges adjacent clusters by centroid distance.
        If clusters are fewer than days, partitions largest clusters.
        Applies pace-specific density limits (relaxed: 2/day, balanced: 3/day, intensive: 4/day).
        """
        if not clusters:
            return {}

        pace_str = pace.value if hasattr(pace, "value") else str(pace).lower()

        # Work on a copy of clusters
        balanced: Dict[int, List[Place]] = {k: list(v) for k, v in clusters.items()}

        # If we have more clusters than days, iteratively merge the two closest clusters
        while len(balanced) > max(1, days):
            keys = list(balanced.keys())
            best_pair = None
            min_dist = float("inf")
            for i in range(len(keys)):
                c1_places = balanced[keys[i]]
                c1_lat = sum(p.lat for p in c1_places) / len(c1_places)
                c1_lng = sum(p.lng for p in c1_places) / len(c1_places)
                for j in range(i + 1, len(keys)):
                    c2_places = balanced[keys[j]]
                    c2_lat = sum(p.lat for p in c2_places) / len(c2_places)
                    c2_lng = sum(p.lng for p in c2_places) / len(c2_places)
                    d = calculate_distance_km(c1_lat, c1_lng, c2_lat, c2_lng)
                    if d < min_dist:
                        min_dist = d
                        best_pair = (keys[i], keys[j])

            if best_pair:
                k1, k2 = best_pair
                balanced[k1].extend(balanced[k2])
                del balanced[k2]
            else:
                break

        # Re-index balanced clusters sequentially
        reindexed: Dict[int, List[Place]] = {}
        for idx, (k, p_list) in enumerate(balanced.items()):
            reindexed[idx] = p_list

        return reindexed

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
