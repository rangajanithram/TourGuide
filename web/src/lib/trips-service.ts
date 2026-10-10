import { validateSnapshot, validateTripRequest, validDate } from './snapshot-validation';
import type {
  MultiVariantTripPlan,
  PlanVersionChangeType,
  PlanVersionRecord,
  SavedTripRecord,
  TripFormData,
  TripPlan,
  TripProvenanceData,
  VariantKey,
} from '@/types/trip';

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const VALID_VARIANTS: VariantKey[] = ['budget', 'balanced', 'comfort'];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TripPersistenceError extends Error {
  code: string;
  constructor(message: string, code = 'PERSISTENCE_ERROR') {
    super(message);
    this.name = 'TripPersistenceError';
    this.code = code;
  }
}

export function isValidUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_REGEX.test(value.trim()));
}

export function getAvailableVariants(
  variants: Partial<Record<VariantKey, TripPlan>> | null | undefined
): VariantKey[] {
  if (!variants || typeof variants !== 'object') return [];
  return VALID_VARIANTS.filter((key) => {
    const plan = variants[key];
    return Boolean(plan && Array.isArray(plan.days) && plan.days.length > 0);
  });
}

export function resolveSelectedVariant(
  variants: Partial<Record<VariantKey, TripPlan>> | null | undefined,
  preferred?: string | null
): VariantKey {
  const available = getAvailableVariants(variants);
  if (preferred && VALID_VARIANTS.includes(preferred as VariantKey) && available.includes(preferred as VariantKey)) {
    return preferred as VariantKey;
  }
  if (available.includes('balanced')) return 'balanced';
  if (available.length > 0) return available[0];
  return 'balanced';
}

export function normalizeSavedSnapshot(raw: unknown): MultiVariantTripPlan {
  if (!raw || typeof raw !== 'object') {
    throw new TripPersistenceError('Saved itinerary snapshot is missing or invalid.', 'INVALID_SNAPSHOT');
  }
  const obj = raw as Record<string, unknown>;
  const destination = typeof obj.destination === 'string' ? obj.destination.trim() : '';
  if (!destination || destination.length > 80) {
    throw new TripPersistenceError('Saved itinerary snapshot is missing a valid destination.', 'INVALID_SNAPSHOT');
  }

  const rawVariants = obj.variants as Record<string, TripPlan> | undefined;
  if (!rawVariants || typeof rawVariants !== 'object') {
    throw new TripPersistenceError('Saved itinerary snapshot contains no plan variants.', 'INVALID_SNAPSHOT');
  }

  try { validateSnapshot(raw); } catch (error) {
    throw new TripPersistenceError(error instanceof Error ? error.message : 'Invalid snapshot.', 'INVALID_SNAPSHOT');
  }
  const cleanVariants = rawVariants as Partial<Record<VariantKey, TripPlan>>;

  const rawUnavailable = obj.unavailable_variants;
  const unavailable_variants: Record<string, string> = {};
  if (rawUnavailable && typeof rawUnavailable === 'object') {
    for (const [k, v] of Object.entries(rawUnavailable as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) {
        unavailable_variants[k] = v.trim();
      }
    }
  }

  const rawSchemaVersion = typeof obj.schema_version === 'number' ? obj.schema_version : SNAPSHOT_SCHEMA_VERSION;
  if (rawSchemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new TripPersistenceError(`Unsupported snapshot schema version: ${rawSchemaVersion}`, 'UNSUPPORTED_SCHEMA');
  }

  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    destination,
    origin_city: typeof obj.origin_city === 'string' ? obj.origin_city : null,
    travel_dates: typeof obj.travel_dates === 'string' ? obj.travel_dates : '',
    synthesis_stages: Array.isArray(obj.synthesis_stages) ? obj.synthesis_stages : [],
    variants: cleanVariants,
    unavailable_variants,
  };
}

export function buildTripProvenance(
  multiPlan: MultiVariantTripPlan,
  selectedVariant: VariantKey,
  lastModifiedReason: string
): TripProvenanceData {
  const available = getAvailableVariants(multiPlan.variants);
  const resolvedVariant = resolveSelectedVariant(multiPlan.variants, selectedVariant);
  const activePlan = multiPlan.variants[resolvedVariant];
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    saved_from_variant: resolvedVariant,
    available_variants: available,
    unavailable_variants: multiPlan.unavailable_variants || {},
    data_source:
      activePlan?.verification_report?.metrics?.data_provenance ||
      'Curated City Seed Dataset (not live inventory)',
    audit_score: activePlan?.verification_report?.audit_score ?? null,
    is_verified_valid: activePlan?.verification_report?.is_valid ?? null,
    last_modified_reason: lastModifiedReason.slice(0, 280),
  };
}

export function computeTripDays(startDate?: string | null, endDate?: string | null, fallbackDays = 2): number {
  if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate))) throw new TripPersistenceError('Invalid calendar date.', 'INVALID_DATES');
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (end < start) {
        throw new TripPersistenceError('Trip end date cannot be earlier than start date.', 'INVALID_DATES');
      }
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff < 1 || diff > 14) {
        throw new TripPersistenceError('Trip duration must be between 1 and 14 days.', 'INVALID_DATES');
      }
      return diff;
    }
  }
  return Math.max(1, Math.min(14, fallbackDays));
}

export interface SupabaseQueryResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

export interface SupabaseQueryChain extends PromiseLike<SupabaseQueryResult> {
  eq: (column: string, value: string) => SupabaseQueryChain;
  order: (column: string, opts: { ascending: boolean }) => SupabaseQueryChain;
  select: (columns?: string) => SupabaseQueryChain;
  single: () => PromiseLike<SupabaseQueryResult>;
}

// Minimal interface for Supabase client operations so unit tests can mock it cleanly
export interface SupabasePersistenceClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<SupabaseQueryResult>;
  from: (table: string) => {
    select: (columns?: string) => SupabaseQueryChain;
    insert: (values: Record<string, unknown>) => SupabaseQueryChain;
    update: (values: Record<string, unknown>) => SupabaseQueryChain;
    delete: () => SupabaseQueryChain;
  };
}

function normalizeError(error: { message?: string; code?: string } | null | undefined, fallback: string): TripPersistenceError {
  const msg = error?.message || fallback;
  const code = error?.code || 'PERSISTENCE_ERROR';
  if (code === '40001' || msg.includes('CONCURRENCY_CONFLICT')) {
    return new TripPersistenceError(
      'This trip was updated in another tab or session. Reload the latest version before saving your changes.',
      'CONCURRENCY_CONFLICT'
    );
  }
  if (code === '23505') {
    return new TripPersistenceError(
      'A conflicting version save occurred simultaneously. Please reload the trip history and try again.',
      'CONCURRENCY_CONFLICT'
    );
  }
  if (code === '42501') {
    return new TripPersistenceError('Please sign in with a verified account to manage saved trips.', 'UNAUTHORIZED');
  }
  if (code === 'P0002' || code === 'PGRST116') {
    return new TripPersistenceError('Saved trip not found or you do not have permission to access it.', 'NOT_FOUND');
  }
  return new TripPersistenceError(msg, code);
}

function normalizeTripRow(row: Record<string, unknown>): SavedTripRecord {
  if (row.schema_version !== undefined && row.schema_version !== SNAPSHOT_SCHEMA_VERSION) throw new TripPersistenceError('Unsupported saved schema.', 'UNSUPPORTED_SCHEMA');
  const itinerary = normalizeSavedSnapshot(row.itinerary_data);
  const selected = resolveSelectedVariant(itinerary.variants, row.selected_variant as string | undefined);
  return {
    id: String(row.id),
    user_id: String(row.user_id || ''),
    title: String(row.title || `${itinerary.destination} Trip`),
    destination: String(row.destination || itinerary.destination),
    days: typeof row.days === 'number' ? row.days : 2,
    budget_inr: typeof row.budget_inr === 'number' ? row.budget_inr : 15000,
    start_date: typeof row.start_date === 'string' ? row.start_date : null,
    end_date: typeof row.end_date === 'string' ? row.end_date : null,
    selected_variant: selected,
    schema_version: typeof row.schema_version === 'number' ? row.schema_version : SNAPSHOT_SCHEMA_VERSION,
    current_version: typeof row.current_version === 'number' ? row.current_version : 1,
    request_data: validateTripRequest(row.request_data as TripFormData, itinerary, selected),
    itinerary_data: itinerary,
    provenance_data: (row.provenance_data && typeof row.provenance_data === 'object' ? row.provenance_data : {}) as Partial<TripProvenanceData>,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

function normalizeVersionRow(row: Record<string, unknown>): PlanVersionRecord {
  if (row.schema_version !== undefined && row.schema_version !== SNAPSHOT_SCHEMA_VERSION) throw new TripPersistenceError('Unsupported saved schema.', 'UNSUPPORTED_SCHEMA');
  const itinerary = normalizeSavedSnapshot(row.itinerary_data);
  const selected = resolveSelectedVariant(itinerary.variants, row.selected_variant as string | undefined);
  return {
    id: String(row.id),
    trip_id: String(row.trip_id),
    user_id: String(row.user_id || ''),
    version_number: typeof row.version_number === 'number' ? row.version_number : 1,
    schema_version: typeof row.schema_version === 'number' ? row.schema_version : SNAPSHOT_SCHEMA_VERSION,
    change_type: (row.change_type as PlanVersionChangeType) || 'initial_save',
    change_summary: String(row.change_summary || 'Saved itinerary snapshot'),
    selected_variant: selected,
    request_data: validateTripRequest(row.request_data as TripFormData, itinerary, selected),
    itinerary_data: itinerary,
    provenance_data: (row.provenance_data && typeof row.provenance_data === 'object' ? row.provenance_data : {}) as Partial<TripProvenanceData>,
    restored_from_version: typeof row.restored_from_version === 'number' ? row.restored_from_version : null,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export function createTripsService(client: SupabasePersistenceClient) {
  const inFlightKeys = new Set<string>();
  const creationKeys = new Map<string, string>();

  async function withLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
    if (inFlightKeys.has(lockKey)) {
      throw new TripPersistenceError('A save operation is already in progress. Please wait a moment.', 'DUPLICATE_IN_FLIGHT');
    }
    inFlightKeys.add(lockKey);
    try {
      return await task();
    } finally {
      inFlightKeys.delete(lockKey);
    }
  }

  return {
    async saveNewTrip(params: {
      title?: string;
      formData: TripFormData;
      multiPlan: MultiVariantTripPlan;
      selectedVariant: VariantKey;
      creationKey?: string;
    }): Promise<SavedTripRecord> {
      const normalizedSnapshot = normalizeSavedSnapshot(params.multiPlan);
      const resolvedVariant = resolveSelectedVariant(normalizedSnapshot.variants, params.selectedVariant);
      const activePlan = normalizedSnapshot.variants[resolvedVariant];
      const fallbackDays = activePlan?.days?.length || 2;
      const days = computeTripDays(params.formData.start_date, params.formData.end_date, fallbackDays);
      const requestData = validateTripRequest(params.formData, normalizedSnapshot, resolvedVariant);
      const budgetInr = requestData.budget_inr;
      if (budgetInr < 1 || budgetInr > 5000000) {
        throw new TripPersistenceError('Local on-ground budget must be between ₹1 and ₹50,00,000.', 'INVALID_BUDGET');
      }

      const defaultTitle = `${normalizedSnapshot.destination} • ${days} Day${days > 1 ? 's' : ''} (${resolvedVariant[0].toUpperCase() + resolvedVariant.slice(1)})`;
      const cleanTitle = (params.title || defaultTitle).trim().slice(0, 120);
      if (!cleanTitle) {
        throw new TripPersistenceError('Trip title cannot be empty.', 'INVALID_TITLE');
      }

      const lockKey = `save-new:${normalizedSnapshot.destination.toLowerCase()}:${params.formData.start_date || ''}:${params.formData.end_date || ''}`;
      return withLock(lockKey, async () => {
        const provenance = buildTripProvenance(normalizedSnapshot, resolvedVariant, 'Initial saved itinerary snapshot');
        const sanitizedRequest = requestData;
        const identity = params.creationKey || JSON.stringify([cleanTitle, sanitizedRequest, normalizedSnapshot]);
        const creationKey = params.creationKey || creationKeys.get(identity) || crypto.randomUUID();
        creationKeys.set(identity, creationKey);
        if (creationKeys.size > 32) creationKeys.delete(creationKeys.keys().next().value!);

        const { data, error } = await client.rpc('create_saved_trip_with_version', {
          p_creation_key: creationKey,
          p_title: cleanTitle,
          p_destination: normalizedSnapshot.destination,
          p_days: days,
          p_budget_inr: budgetInr,
          p_start_date: params.formData.start_date || null,
          p_end_date: params.formData.end_date || null,
          p_selected_variant: resolvedVariant,
          p_request_data: sanitizedRequest,
          p_itinerary_data: normalizedSnapshot,
          p_provenance_data: provenance,
          p_schema_version: SNAPSHOT_SCHEMA_VERSION,
        });

        if (error) {
          throw normalizeError(error, 'Failed to save itinerary.');
        }
        if (!data || typeof data !== 'object') {
          throw new TripPersistenceError('Server returned an empty response when saving trip.');
        }
        return normalizeTripRow(data as Record<string, unknown>);
      });
    },

    async listSavedTrips(): Promise<SavedTripRecord[]> {
      const { data, error } = await client
        .from('saved_trips')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        throw normalizeError(error, 'Failed to load your saved trips.');
      }
      if (!Array.isArray(data)) return [];
      const results: SavedTripRecord[] = [];
      for (const row of data) {
        try {
          results.push(normalizeTripRow(row as Record<string, unknown>));
        } catch (error) {
          throw new TripPersistenceError(`A saved trip could not be read: ${error instanceof Error ? error.message : 'Invalid snapshot'}.`, 'INVALID_SNAPSHOT');
        }
      }
      return results;
    },

    async getSavedTrip(tripId: string): Promise<SavedTripRecord> {
      if (!isValidUuid(tripId)) {
        throw new TripPersistenceError('Invalid trip ID format.', 'INVALID_ID');
      }
      const { data, error } = await client
        .from('saved_trips')
        .select('*')
        .eq('id', tripId.trim())
        .single();

      if (error || !data) {
        throw normalizeError(error, 'Saved trip not found.');
      }
      return normalizeTripRow(data as Record<string, unknown>);
    },

    async renameSavedTrip(tripId: string, newTitle: string): Promise<SavedTripRecord> {
      if (!isValidUuid(tripId)) {
        throw new TripPersistenceError('Invalid trip ID format.', 'INVALID_ID');
      }
      const cleanTitle = newTitle.trim();
      if (!cleanTitle || cleanTitle.length > 120) {
        throw new TripPersistenceError('Trip title must be between 1 and 120 characters.', 'INVALID_TITLE');
      }
      return withLock(`rename:${tripId}`, async () => {
        const { data, error } = await client
          .from('saved_trips')
          .update({ title: cleanTitle, updated_at: new Date().toISOString() })
          .eq('id', tripId.trim())
          .select('*')
          .single();

        if (error || !data) {
          throw normalizeError(error, 'Failed to rename trip.');
        }
        return normalizeTripRow(data as Record<string, unknown>);
      });
    },

    async deleteSavedTrip(tripId: string): Promise<void> {
      if (!isValidUuid(tripId)) {
        throw new TripPersistenceError('Invalid trip ID format.', 'INVALID_ID');
      }
      return withLock(`delete:${tripId}`, async () => {
        const { error } = await client
          .from('saved_trips')
          .delete()
          .eq('id', tripId.trim());

        if (error) {
          throw normalizeError(error, 'Failed to delete trip.');
        }
      });
    },

    async listTripVersions(tripId: string): Promise<PlanVersionRecord[]> {
      if (!isValidUuid(tripId)) {
        throw new TripPersistenceError('Invalid trip ID format.', 'INVALID_ID');
      }
      const { data, error } = await client
        .from('plan_versions')
        .select('*')
        .eq('trip_id', tripId.trim())
        .order('version_number', { ascending: false });

      if (error) {
        throw normalizeError(error, 'Failed to load version history.');
      }
      if (!Array.isArray(data)) return [];
      const versions: PlanVersionRecord[] = [];
      for (const row of data) {
        try {
          versions.push(normalizeVersionRow(row as Record<string, unknown>));
        } catch (error) {
          throw new TripPersistenceError(`A history entry could not be read: ${error instanceof Error ? error.message : 'Invalid snapshot'}.`, 'INVALID_SNAPSHOT');
        }
      }
      return versions;
    },

    async commitTripRevision(params: {
      tripId: string;
      expectedVersion: number;
      changeType: PlanVersionChangeType;
      changeSummary: string;
      selectedVariant: VariantKey;
      multiPlan: MultiVariantTripPlan;
      formData: TripFormData;
    }): Promise<{ trip: SavedTripRecord; version: PlanVersionRecord }> {
      if (!isValidUuid(params.tripId)) {
        throw new TripPersistenceError('Invalid trip ID format.', 'INVALID_ID');
      }
      const normalizedSnapshot = normalizeSavedSnapshot(params.multiPlan);
      const resolvedVariant = resolveSelectedVariant(normalizedSnapshot.variants, params.selectedVariant);
      const cleanSummary = params.changeSummary.trim().slice(0, 280);
      if (!cleanSummary) {
        throw new TripPersistenceError('Revision summary cannot be empty.', 'INVALID_SUMMARY');
      }

      const requestData = validateTripRequest(params.formData, normalizedSnapshot, resolvedVariant);
      if (!Number.isSafeInteger(params.expectedVersion) || params.expectedVersion < 1) throw new TripPersistenceError('Expected version is required.', 'INVALID_VERSION');
      return withLock(`commit:${params.tripId}`, async () => {
        const provenance = buildTripProvenance(normalizedSnapshot, resolvedVariant, cleanSummary);
        const { data, error } = await client.rpc('commit_trip_version', {
          p_trip_id: params.tripId.trim(),
          p_expected_version: params.expectedVersion,
          p_request_data: requestData,
          p_change_type: params.changeType,
          p_change_summary: cleanSummary,
          p_selected_variant: resolvedVariant,
          p_itinerary_data: normalizedSnapshot,
          p_provenance_data: provenance,
          p_schema_version: SNAPSHOT_SCHEMA_VERSION,
          p_restored_from_version: null,
        });

        if (error || !data || typeof data !== 'object') {
          throw normalizeError(error, 'Failed to save itinerary revision.');
        }
        const payload = data as { trip: Record<string, unknown>; version: Record<string, unknown> };
        return {
          trip: normalizeTripRow(payload.trip),
          version: normalizeVersionRow(payload.version),
        };
      });
    },

    async restoreTripVersion(params: {
      tripId: string;
      targetVersionNumber: number;
      expectedVersion: number;
    }): Promise<{ trip: SavedTripRecord; version: PlanVersionRecord }> {
      if (!isValidUuid(params.tripId)) {
        throw new TripPersistenceError('Invalid trip ID format.', 'INVALID_ID');
      }
      if (!Number.isSafeInteger(params.expectedVersion) || params.expectedVersion < 1) throw new TripPersistenceError('Expected version is required.', 'INVALID_VERSION');
      if (!Number.isInteger(params.targetVersionNumber) || params.targetVersionNumber < 1) {
        throw new TripPersistenceError('Invalid target version number.', 'INVALID_VERSION');
      }
      return withLock(`commit:${params.tripId}`, async () => {
        const { data, error } = await client.rpc('restore_trip_version', {
          p_trip_id: params.tripId.trim(),
          p_target_version_number: params.targetVersionNumber,
          p_expected_version: params.expectedVersion,
        });

        if (error || !data || typeof data !== 'object') {
          throw normalizeError(error, 'Failed to restore earlier version.');
        }
        const payload = data as { trip: Record<string, unknown>; version: Record<string, unknown> };
        return {
          trip: normalizeTripRow(payload.trip),
          version: normalizeVersionRow(payload.version),
        };
      });
    },
  };
}
