# Hyderabad catalog and Places & food review

Inspected before implementation on 26 October 2026.

| File | Existing gap | Planned change |
| --- | --- | --- |
| `data/hyderabad_mock.json`, `tripweave/provider.py` | Only four attractions, one lunch restaurant and three stays. Public database mode reads the same small original catalog. | Add a sourced Hyderabad supplement after successful provider reads, keeping stable IDs and database outage handling. All planner, meal and edit paths must receive it. |
| `D:/TripWeave-Datasets/ToursitPlaces-Hyderabad/reviews.csv` | 1,055 responses for ten attractions; most are absent from the catalog. | Match the existing numerical sample summaries to actual venues, including explicit aliases for NTR Gardens, Wonderla Hyderabad and Durgam Cheruvu Cable Bridge. No invented ratings or reviewer identities. |
| `restaurants-hyderabad`, hotel CSV files | Many chain names, no reliable branch crosswalk; older scraped platform ratings are not automatically reusable. | Add identifiable real branches with independent source links. Do not attach chain-wide reviews to arbitrary branches. Request dataset page/license for further review content. |
| `tripweave/rating_evidence.py` | Exact name matching misses aliases. | Use explicit curated venue matches, keeping sample counts and historical source labels. |
| `tripweave/main.py` | Catalog interest choices include unrelated seaside/caves tags; no clear destination catalog coverage. | Return useful destination categories, source links and catalog counts. |
| `web/src/components/PlannerDiscovery.tsx` | Nearby live results are inserted before known attractions, default sorting says live first, source details are hard to inspect. | Rank sourced destination choices first, keep live search available, and show rating sample counts/source links. |
| `web/src/components/TripForm.tsx` | Automatic selection has a confusing surprise toggle; duplicate food controls and separate long details cards. | Treat filling available time and normal meal scheduling as built-in, show on/off status, and group adjustments into compact cards. Preserve pins and explicit dietary/travel choices. |
| `web/src/components/InterestPicker.tsx`, planner CSS | Many chips and controls stretch across the whole page. | Use a bounded responsive settings grid with short text, readable dark-mode colors and touch-sized controls. |
| Python and web tests | No expanded-catalog acceptance test. | Verify source coverage, alias rating matches, provider consistency, multi-day scheduling and compact/default control behavior, alongside existing required checks. |

Scope is a useful selection of well-known Hyderabad/metro visitor places,
restaurants and stays, not an exhaustive list of every business in Hyderabad.
Official tourism/operator references establish venue identity. Coordinates need
an attributable factual source. Missing hours, prices and ratings must not become
verified claims. Generic planning allowances must be clearly distinguished from
venue facts. The new supplement must not replace private data or alter RLS.

## Implementation and validation

The combined catalog now has 50 candidates: 32 attractions, 11 food venues and
7 stays. All ten existing tourist survey aggregates match real catalog venues;
they represent 1,055 historical responses. The 40 remaining review gaps are
listed in `HYDERABAD_REVIEW_DATASET_GAPS.md`. No extra review text or platform
scores were copied. Identity, map and timing sources are documented in
`../data/HYDERABAD_SOURCES.md` and in the per-place source links.

The larger pool exposed restaurant-only plans when reserved meals were off.
Unselected restaurants are now meal candidates rather than general sightseeing
slots. Snack-only venues do not replace meals. An insertion-based first solution
searches all usable days; pins, budgets and independent verification still apply.
The existing provenance regression was corrected to recognize estimates without
inventing a last-verified date.

Validation passed: 127 Python unittest cases, all 42 API checks, 7 security tests,
80 frontend tests, TypeScript checking, lint, and an isolated production build.
The catalog-specific tests cover source completeness, map bounds, exact rating
aliases, sample counts, storage-mode behavior, outage propagation, meal variety,
new required landmarks, verifier results and saved-plan round trips. Production
data counts and visual checks are separate post-push checks.
