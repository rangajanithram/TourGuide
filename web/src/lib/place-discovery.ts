import type { SearchOption } from '@/components/PlaceSearch';
export type CatalogPlace = SearchOption & {
  type?: string; duration?: number; lat?: number; lng?: number; cost?: number;
  open_time_mins?: number | null; close_time_mins?: number | null; closed_days?: string[];
  rating?: number | null; review_count?: number | null; rating_evidence?: string | null;
  formatted_address?: string | null; source_reference?: string | null; last_verified_date?: string | null;
  tags?: string[];
  featured?: boolean; search_aliases?: string[]; source_urls?: string[];
  catalog_reviewed_date?: string | null; planning_window_estimated?: boolean;
};
export type DiscoveryPlace = { id: string; name: string; address: string; lat: number; lng: number; category: string; osm_url?: string; formatted_address?: string };
export type BrowsePlace = { id: string; name: string; address: string; category: string; lat?: number; lng?: number; live?: DiscoveryPlace; catalog?: CatalogPlace };
export const planningTime = (minutes?: number | null) => minutes == null ? 'Not confirmed' : `${String(Math.floor((minutes + 480) / 60)).padStart(2, '0')}:${String((minutes + 480) % 60).padStart(2, '0')}`;
export const priceLabel = (cost?: number) => cost == null ? 'Cost not confirmed' : cost === 0 ? 'Free · estimate' : `₹${cost.toLocaleString('en-IN')} / person · estimate`;
