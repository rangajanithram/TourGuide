# Hyderabad place supplement

`hyderabad_curated.json` adds 42 researched venues to the original eight entries:
32 attractions, 11 food stops and 7 stay candidates in the combined catalog.
The same supplement is used after successful JSON or Supabase catalog reads.
It is not a replacement for a failed database connection or an exhaustive city
directory. Existing saved place IDs remain stable.

Each addition has an identity/map source URL. Official tourism and operator
references identify visitor destinations; no descriptions, photos or platform
review text have been copied. Locations were cross-checked on 26 October 2026.
Some centers in Wikidata were inaccurate: Snow World, Birla Mandir, NTR Gardens
and the State Museum use OpenStreetMap locations instead. Lake visits use a
shore access point rather than routing into the lake. Coordinate precision does
not guarantee a verified entrance or pedestrian access.

- OpenStreetMap coordinates: © OpenStreetMap contributors, under the
  [Open Database License](https://www.openstreetmap.org/copyright). The minimal
  published coordinate extraction remains attributable through per-row URLs.
- Wikidata structured coordinates: [CC0 structured data](https://www.wikidata.org/wiki/Wikidata:Licensing),
  with each used entity linked in the row.
- Venue identity: Hyderabad district tourism, Telangana Tourism, Airports
  Authority of India, and named operator pages linked per row.
- Four added hotel room-rate estimates: numerical observations from the
  user-supplied `Hotel Price Data of Cities in India (MakeMyTrip)/hyderabad.csv`.
  Collection dates, taxes and room capacity are unknown. No platform ratings,
  reviews, hotel descriptions or imagery from that file are republished. These
  are historical estimates and do not establish current offers or availability.

## Planning assumptions

`featured` means selected for this researched visitor catalog. It does not mean
a verified popularity rank, current rating or platform endorsement. Pinned stops
and feasibility rules always take precedence over the small preference bonus.

All added records remain `estimated` and `last_verified_date` is null.
`catalog_reviewed_date` records review of identity/location sources only.
Unless a published visit window is recorded, 09:00–20:00 is an explicit planning
window, not opening hours. Costs and visit lengths are planning allowances.
The existing discovery allowance of ₹200 is used for missing prices; this is
not an invented venue fee. Ramoji and Wonderla use published reference amounts
as estimates and substantial day allocations, not short city stops. A restricted
afternoon window avoids Birla Mandir's documented midday closure. Zoo Monday
closure follows its operator, overriding the district page's older daily listing.
Unknown closures, booking access and special food needs still need confirmation.
Snack-only bakeries/cafés do not replace full meals.

## Reviews and ratings

`reference/rating_samples.json` already contains numerical aggregates from the
user-supplied `ToursitPlaces-Hyderabad/reviews.csv`: 1,055 responses for exactly
ten attractions. The new catalog connects all ten. Explicit aliases join
`NTR Garden`, `Cable Bridge` and `Wonderla` to their correct Hyderabad venue.
These are sample means and sample counts, not current Google/Tripadvisor scores
or a total count of all visitor reviews. Restaurant chains are never joined to
branches by name alone. Missing scores remain unknown.

No new review text, names or visit-party information is published. The user was
asked for the original Kaggle page/source/license and any broader Hyderabad
review dataset before further review content is added. Files alone do not prove
reuse permission. An independent, licensed branch/address crosswalk is needed
before attaching the downloaded restaurant or hotel platform reviews.

## Maintaining the list

Add only identifiable visitor destinations and real branches, with independently
checked map pins and sources. Keep hours/fees separate from allowances. Never
copy bulk Google/Tripadvisor data, pretend collection dates are current or create
ratings for missing venues. Run `test_hyderabad_catalog.py` and the full planner
regression gates after changes. New places must reach catalog search, automatic
selection, meals, edits, verification and saved plans through the shared provider.
