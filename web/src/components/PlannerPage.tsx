'use client';
import { plannerFetch } from '@/lib/planner-fetch';
import { apiBaseUrl, checkPlannerReadiness } from '@/lib/planner-network';
import { validateSnapshot } from '@/lib/snapshot-validation';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { travelPreferences } from '@/lib/travel-preferences';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  createTripsService,
  resolveSelectedVariant,
  isValidUuid,
  TripPersistenceError,
  type SupabasePersistenceClient,
} from '@/lib/trips-service';
import Header from '../components/Header';
import PlannerLandscape from './PlannerLandscape';
import PlanningScene from './PlanningScene';
import TripForm from '../components/TripForm';
import VariantSwitcher from '../components/VariantSwitcher';
import ItineraryView from '../components/ItineraryView';
import SharedTripOverview from '../components/SharedTripOverview';
import {
  MultiVariantTripPlan,
  TripPlan,
  TripFormData,
  SavedTripRecord,
  PlanVersionRecord,
  PlanVersionChangeType,
  VariantKey,
} from '../types/trip';
import {
  AlertCircle,
  BookmarkCheck,
  CheckCircle2,
  Compass,
  FolderOpen,
  History,
  Loader2,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';

// Dynamically import Leaflet Map with SSR disabled
const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-2xl bg-[#fffdf5] border border-[#d6dfd0] flex flex-col items-center justify-center text-[#596b57] space-y-2">
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-xs">Initializing Interactive Map...</span>
    </div>
  )
});

function pinnedStopIds(plan?: TripPlan): string[] {
  return plan?.days.flatMap(day => day.activities
    .filter(activity => activity.is_locked && activity.place_type !== 'rest_break')
    .map(activity => activity.place_id || activity.place_name)) || [];
}

export default function Home({ preferences }: { preferences?: unknown }) {
  const defaults = useRef(travelPreferences(preferences));
  const requestVersion = useRef(0);
  const historyVersion = useRef(0);
  const creationKey = useRef<string | null>(null);
  const persistenceBusy = useRef(false);
  const [planEpoch, setPlanEpoch] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { requestVersion.current += 1; historyVersion.current += 1; activeRequest.current?.abort(); }, []);

  const [multiPlan, setMultiPlan] = useState<MultiVariantTripPlan | null>(null);
  const [activeVariant, setActiveVariant] = useState<VariantKey>('balanced');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [planningPhase, setPlanningPhase] = useState<'connecting' | 'generating'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [activeFormData, setActiveFormData] = useState<TripFormData | null>(null);
  const [isSharedView, setIsSharedView] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  // Saved trip & version history state
  const [savedTrip, setSavedTrip] = useState<SavedTripRecord | null>(null);
  const [versions, setVersions] = useState<PlanVersionRecord[]>([]);
  const [isLoadingSavedTrip, setIsLoadingSavedTrip] = useState(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isConcurrencyConflict, setIsConcurrencyConflict] = useState(false);
  const [tripTitleInput, setTripTitleInput] = useState('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [pendingRevision, setPendingRevision] = useState<{
    changeType: PlanVersionChangeType;
    summary: string;
  } | null>(null);

  useEffect(() => {
    if (!pendingRevision && (!multiPlan || savedTrip)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingRevision, multiPlan, savedTrip]);

  const tripsService = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    return createTripsService(getBrowserSupabase() as unknown as SupabasePersistenceClient);
  }, []);

  const refreshHistory = useCallback(async (tripId: string) => {
    if (!tripsService) return;
    const version = ++historyVersion.current;
    try { const history = await tripsService.listTripVersions(tripId); if (version === historyVersion.current) setVersions(history); }
    catch { if (version === historyVersion.current) setSaveError('Your trip is saved, but history could not refresh. Reopen history to retry.'); }
  }, [tripsService]);

  const loadSavedTripById = useCallback(
    async (tripId: string, openHistory = false) => {
      if (!tripsService) {
        setError('Supabase persistence is not configured in this environment.');
        return;
      }
      if (persistenceBusy.current) return;
      activeRequest.current?.abort();
      const loadVersion = ++requestVersion.current;
      historyVersion.current += 1;
      setIsLoadingSavedTrip(true);
      setError(null);
      setSaveError(null);
      setIsConcurrencyConflict(false);
      try {
        const trip = await tripsService.getSavedTrip(tripId);
        if (loadVersion !== requestVersion.current) return;
        setPlanEpoch(value => value + 1);
        const resolvedVar = resolveSelectedVariant(
          trip.itinerary_data.variants,
          trip.selected_variant
        );
        setSavedTrip(trip);
        setVersions([]);
        void refreshHistory(tripId);
        setMultiPlan(trip.itinerary_data);
        setActiveVariant(resolvedVar);
        setTripTitleInput(trip.title);
        setPendingRevision(null);
        setSelectedDay('all');
        if (openHistory) {
          setShowHistoryDrawer(true);
        }

        const req = trip.request_data || {};
        const fallbackPlanDays = trip.itinerary_data.variants[resolvedVar]?.days || [];
        const fallbackStart = fallbackPlanDays[0]?.date || '';
        const fallbackEnd = fallbackPlanDays[fallbackPlanDays.length - 1]?.date || fallbackStart;
        setActiveFormData({
          origin_city: req.origin_city || undefined,
          destination: (req.destination || trip.destination || 'hyderabad').toLowerCase(),
          origin_type: req.origin_type || 'hotel',
          start_location: req.start_location || undefined,
          start_date: req.start_date || trip.start_date || fallbackStart,
          end_date: req.end_date || trip.end_date || fallbackEnd,
          budget_inr: req.budget_inr || trip.budget_inr || 15000,
          people_count: req.people_count || 2,
          group_profile: req.group_profile || 'default',
          pace: req.pace || 'balanced',
          transport_mode: req.transport_mode || 'cab',
          locked_activities: req.locked_activities || [],
          interests: req.interests || ['unesco', 'history', 'sunset'],
        });
      } catch (err: unknown) {
        if (loadVersion === requestVersion.current) setError(err instanceof Error ? err.message : 'Could not reopen the saved trip.');
      } finally {
        if (loadVersion === requestVersion.current) setIsLoadingSavedTrip(false);
      }
    },
    [tripsService, refreshHistory]
  );

  const fetchTripPlan = useCallback(async (
    formData: TripFormData,
    options?: { keepSavedTripContext?: boolean; revisionSummary?: string }
  ) => {
    if (persistenceBusy.current) return;
    historyVersion.current += 1;
    setIsLoadingSavedTrip(false);
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const version = ++requestVersion.current;
    setIsLoading(true);
    setPlanningPhase('connecting');
    setError(null);
    setSaveStatus(null);
    setSaveError(null);
    setIsConcurrencyConflict(false);
    setSelectedDay('all');


    try {
      const apiBase = apiBaseUrl();
      await checkPlannerReadiness(controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setPlanningPhase('generating');
      const response = await plannerFetch(`${apiBase}/api/itinerary/generate-variants`, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          origin_city: formData.origin_city,
          destination: formData.destination,
          origin_type: formData.origin_type,
          start_location: formData.start_location,
          start_date: formData.start_date,
          end_date: formData.end_date,
          budget_inr: formData.budget_inr,
          people_count: formData.people_count,
          group_profile: formData.group_profile || 'default',
          locked_activities: formData.locked_activities || [],
          pace: formData.pace,
          transport_mode: formData.transport_mode,
          interests: formData.interests
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const detail = typeof errData.detail === 'string' ? errData.detail : Array.isArray(errData.detail) ? errData.detail.map((item: { msg?: string }) => item.msg || 'Check your trip details.').join(' ') : `Could not create the trip (status ${response.status}). Please try again.`;
        throw new Error(detail);
      }

      const data: unknown = await response.json();
      try { validateSnapshot(data); }
      catch { throw new Error('The planning service returned an incomplete itinerary. Your existing trip is unchanged. Please try again.'); }
      if (version === requestVersion.current) {
        setActiveFormData(formData);
        setPlanEpoch(value => value + 1);
        if (!options?.keepSavedTripContext) {
          creationKey.current = crypto.randomUUID();
          setSavedTrip(null); setVersions([]); setPendingRevision(null); setShowHistoryDrawer(false);
          window.history.replaceState({}, '', '/planner');
        }
        setActiveVariant((prevVar) => {
          const resolved = resolveSelectedVariant(data.variants, prevVar);
          const daysLen = data.variants[resolved]?.days?.length || 2;
          if (!options?.keepSavedTripContext) {
            setTripTitleInput(
              `${data.destination} • ${daysLen} Day${daysLen > 1 ? 's' : ''} (${resolved[0].toUpperCase() + resolved.slice(1)})`
            );
          }
          return resolved;
        });
        setMultiPlan(data);
        if (options?.keepSavedTripContext && options?.revisionSummary) {
          setPendingRevision({
            changeType: 'edit',
            summary: options.revisionSummary,
          });
        }
      }
    } catch (err: unknown) {
      console.error('Failed to generate trip:', err);
      const message = controller.signal.aborted ? 'Planning took too long. Please try again; the service may be waking up.' : err instanceof Error ? err.message : 'Could not reach the trip planning service. Check your connection and try again.';
      if (version === requestVersion.current) setError(message);
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, []);

  // Initial load with curated default values, saved tripId, or URL query params
  useEffect(() => {
    const getFutureDate = (daysAhead: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + daysAhead);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    let dest = 'hyderabad';
    let orig: string | undefined = undefined;
    let sDate = getFutureDate(7);
    let eDate = getFutureDate(9);
    let mode = defaults.current.transport_mode;
    let budget = 15000;
    let people = 2;
    let pace = defaults.current.pace;
    let profile = defaults.current.group_profile;
    let interests = ['unesco', 'history', 'sunset'];
    let lockedActs: string[] = [];
    let originType: 'hotel' | 'center' | 'station' | 'airport' = 'hotel';
    let startLocation: string | undefined = undefined;
    let shared = false;
    let savedTripIdFromUrl: string | null = null;
    let openHistoryFromUrl = false;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const rawTripId = params.get('tripId');
      if (rawTripId && isValidUuid(rawTripId)) {
        savedTripIdFromUrl = rawTripId.trim();
        openHistoryFromUrl = params.get('history') === '1';
      } else if (params.get('dest') || params.get('destination') || params.get('pins') || params.get('budget') || params.get('start') || params.get('origin')) {
        shared = true;
      }
      const urlDest = params.get('dest') || params.get('destination');
      if (urlDest && ['hyderabad', 'delhi', 'jaipur', 'bengaluru', 'mumbai'].includes(urlDest.toLowerCase())) {
        dest = urlDest.toLowerCase();
      }
      const urlOrigin = params.get('origin') || params.get('from');
      if (urlOrigin && ['hyderabad', 'delhi', 'jaipur', 'bengaluru', 'mumbai'].includes(urlOrigin.toLowerCase())) {
        orig = urlOrigin.toLowerCase();
      }
      const urlStart = params.get('start') || params.get('start_date');
      if (urlStart && /^\d{4}-\d{2}-\d{2}$/.test(urlStart)) {
        sDate = urlStart;
      }
      const urlEnd = params.get('end') || params.get('end_date');
      if (urlEnd && /^\d{4}-\d{2}-\d{2}$/.test(urlEnd)) {
        eDate = urlEnd;
      }
      const urlMode = params.get('mode');
      if (urlMode && ['cab', 'auto', 'metro', 'walk'].includes(urlMode)) {
        mode = urlMode as 'cab' | 'auto' | 'metro' | 'walk';
      }
      const urlBudget = params.get('budget');
      if (urlBudget && !isNaN(Number(urlBudget))) {
        budget = Number(urlBudget);
      }
      const urlPeople = params.get('people');
      if (urlPeople && !isNaN(Number(urlPeople))) {
        people = Number(urlPeople);
      }
      const urlPace = params.get('pace');
      if (urlPace && ['relaxed', 'balanced', 'intensive'].includes(urlPace)) {
        pace = urlPace as 'relaxed' | 'balanced' | 'intensive';
      }
      const urlProfile = params.get('profile');
      if (urlProfile && ['default', 'young_solo', 'family', 'elderly'].includes(urlProfile)) {
        profile = urlProfile as 'default' | 'young_solo' | 'family' | 'elderly';
      }
      const urlVariant = params.get('variant');
      if (urlVariant && ['budget', 'balanced', 'comfort'].includes(urlVariant.toLowerCase())) {
        setActiveVariant(urlVariant.toLowerCase() as VariantKey);
      }
      const urlInterests = params.get('interests');
      if (urlInterests) {
        interests = urlInterests.split(',').map(s => s.trim()).filter(Boolean);
      }
      const urlPins = params.get('pins') || params.get('locked');
      if (urlPins) {
        lockedActs = urlPins.split(',').map(s => s.trim()).filter(Boolean);
      }
      const urlOriginType = params.get('origin_type');
      if (urlOriginType === 'hotel' || urlOriginType === 'center' || urlOriginType === 'station' || urlOriginType === 'airport') {
        originType = urlOriginType;
      }
      const urlStartLoc = params.get('start_location') || params.get('hub');
      if (urlStartLoc) {
        startLocation = urlStartLoc.trim();
      }
    }

    const initialData: TripFormData = {
      origin_city: orig && orig !== dest ? orig : undefined,
      destination: dest,
      origin_type: originType,
      start_location: startLocation,
      start_date: sDate,
      end_date: eDate,
      budget_inr: budget,
      people_count: people,
      group_profile: profile,
      pace: pace,
      transport_mode: mode,
      locked_activities: lockedActs,
      interests: interests
    };

    setActiveFormData(initialData);

    // Reopening a saved trip displays the saved snapshot without regenerating
    if (savedTripIdFromUrl) {
      void loadSavedTripById(savedTripIdFromUrl, openHistoryFromUrl);
      return;
    }

    if (shared) {
      setIsSharedView(true);
      void fetchTripPlan(initialData);
    }
  }, [loadSavedTripById, fetchTripPlan]);

  const resolvedVariant: VariantKey = multiPlan
    ? resolveSelectedVariant(multiPlan.variants, activeVariant)
    : activeVariant;

  const currentPlan: TripPlan | undefined = multiPlan?.variants[resolvedVariant];

  const handleUpdatePlan = (
    updatedPlan: TripPlan,
    changeMeta?: { changeType: 'edit' | 'rebalance'; summary: string }
  ) => {
    if (!multiPlan || persistenceBusy.current) return;
    setActiveFormData(current => current ? { ...current, locked_activities: pinnedStopIds(updatedPlan) } : current);
    setMultiPlan({
      ...multiPlan,
      variants: {
        ...multiPlan.variants,
        [resolvedVariant]: updatedPlan
      }
    });
    setSaveStatus(null);
    setSaveError(null);
    if (savedTrip) {
      setPendingRevision({
        changeType: changeMeta?.changeType || 'edit',
        summary: changeMeta?.summary || 'Updated itinerary schedule',
      });
    }
  };

  const handleReoptimize = (pinnedActivities: string[]) => {
    if (!activeFormData) return;
    const combinedPins = Array.from(new Set([...(activeFormData.locked_activities || []), ...pinnedActivities]));
    const updatedForm: TripFormData = {
      ...activeFormData,
      locked_activities: combinedPins
    };
    void fetchTripPlan(updatedForm, {
      keepSavedTripContext: Boolean(savedTrip),
      revisionSummary: `Re-solved itinerary with ${combinedPins.length} pinned stop(s)`,
    });
  };

  const handleSaveNewTrip = async () => {
    if (!tripsService || !multiPlan || !activeFormData || persistenceBusy.current) return;
    persistenceBusy.current = true;
    creationKey.current ||= crypto.randomUUID();
    setIsSavingTrip(true);
    setSaveError(null);
    setSaveStatus(null);
    try {
      const created = await tripsService.saveNewTrip({
        creationKey: creationKey.current,
        title: tripTitleInput,
        formData: activeFormData,
        multiPlan,
        selectedVariant: resolvedVariant,
      });
      setSavedTrip(created);
      setMultiPlan(created.itinerary_data);
      setActiveVariant(created.selected_variant);
      setTripTitleInput(created.title);
      void refreshHistory(created.id);
      setTripTitleInput(created.title);
      setPendingRevision(null);
      setSaveStatus(`Saved "${created.title}" to My trips (v1).`);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', `/planner?tripId=${created.id}`);
      }
    } catch (err: unknown) {
      // Preserve current itinerary on screen when saving fails
      setSaveError(err instanceof Error ? err.message : 'Could not save this trip. Your current itinerary is still preserved on screen.');
    } finally {
      persistenceBusy.current = false;
      setIsSavingTrip(false);
    }
  };

  const handleCommitRevision = async () => {
    if (!tripsService || !savedTrip || !multiPlan || !activeFormData || persistenceBusy.current) return;
    persistenceBusy.current = true;
    const changeType = pendingRevision?.changeType || 'edit';
    const changeSummary =
      pendingRevision?.summary ||
      `Saved ${resolvedVariant} variant snapshot`;

    setIsSavingTrip(true);
    setSaveError(null);
    setSaveStatus(null);
    setIsConcurrencyConflict(false);
    try {
      const result = await tripsService.commitTripRevision({
        tripId: savedTrip.id,
        expectedVersion: savedTrip.current_version,
        formData: activeFormData,
        changeType,
        changeSummary,
        selectedVariant: resolvedVariant,
        multiPlan,
      });
      setSavedTrip(result.trip);
      void refreshHistory(result.trip.id);
      setPendingRevision(null);
      setSaveStatus(`Saved revision v${result.version.version_number}: ${result.version.change_summary}`);
    } catch (err: unknown) {
      if (err instanceof TripPersistenceError && err.code === 'CONCURRENCY_CONFLICT') {
        setIsConcurrencyConflict(true);
      }
      setSaveError(err instanceof Error ? err.message : 'Could not save revision. Your current edits remain on screen.');
    } finally {
      persistenceBusy.current = false;
      setIsSavingTrip(false);
    }
  };

  const handleRestoreVersion = async (targetVersionNumber: number) => {
    if (!tripsService || !savedTrip || persistenceBusy.current) return;
    if (pendingRevision && !window.confirm('Restoring will replace your unsaved edits. Continue?')) return;
    persistenceBusy.current = true;
    setRestoringVersion(targetVersionNumber);
    setSaveError(null);
    setSaveStatus(null);
    setIsConcurrencyConflict(false);
    try {
      const result = await tripsService.restoreTripVersion({
        tripId: savedTrip.id,
        targetVersionNumber,
        expectedVersion: savedTrip.current_version,
      });
      const nextVar = resolveSelectedVariant(
        result.trip.itinerary_data.variants,
        result.trip.selected_variant
      );
      setSavedTrip(result.trip);
      void refreshHistory(result.trip.id);
      setActiveFormData(result.trip.request_data as TripFormData);
      setPlanEpoch(value => value + 1);
      setMultiPlan(result.trip.itinerary_data);
      setActiveVariant(nextVar);
      setPendingRevision(null);
      setSelectedDay('all');
      setSaveStatus(
        `Restored v${targetVersionNumber} as new current version v${result.version.version_number}. Earlier history is preserved.`
      );
    } catch (err: unknown) {
      if (err instanceof TripPersistenceError && err.code === 'CONCURRENCY_CONFLICT') {
        setIsConcurrencyConflict(true);
      }
      setSaveError(err instanceof Error ? err.message : `Could not restore version v${targetVersionNumber}.`);
    } finally {
      persistenceBusy.current = false;
      setRestoringVersion(null);
    }
  };

  const renderSavedTripPersistenceBar = () => {
    if (!multiPlan) return null;

    return (
      <section
        aria-label="Trip persistence and version history"
        className="bg-[#fffdf5] border border-[#c6d2c0] rounded-2xl p-4 sm:p-5 shadow-md space-y-3"
      >
        {!savedTrip ? (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#89532d] bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>Unsaved Itinerary</span>
                </span>
                <span className="text-xs text-[#526653]">
                  Save this snapshot to reopen it anytime, track revisions, or restore earlier versions.
                </span>
              </div>
              <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor="save-trip-title-input" className="sr-only">
                  Trip Title
                </label>
                <input
                  id="save-trip-title-input"
                  type="text"
                  maxLength={120}
                  value={tripTitleInput}
                  onChange={(e) => setTripTitleInput(e.target.value)}
                  placeholder="Enter a name for this trip..."
                  className="w-full sm:max-w-md rounded-xl border border-[#8da18b] bg-[#f4f7f0] px-3 py-1.5 text-sm font-semibold text-[#243e33] focus:border-[#243e33] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                type="button"
                onClick={handleSaveNewTrip}
                disabled={isSavingTrip || restoringVersion !== null || isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#243e33] px-4 py-2 text-xs font-bold text-[#fffdf5] hover:bg-[#1b3027] disabled:opacity-50 transition shadow-sm"
              >
                {isSavingTrip ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving trip…</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save trip</span>
                  </>
                )}
              </button>

              <Link
                href="/trips"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#c6d2c0] bg-[#f4f7f0] px-3.5 py-2 text-xs font-semibold text-[#243e33] hover:bg-[#e7efe1] transition"
              >
                <FolderOpen className="w-4 h-4 text-[#89532d]" />
                <span>My trips</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>Saved Trip • v{savedTrip.current_version}</span>
                  </span>
                  {pendingRevision ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#89532d] bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                      <span>Unsaved edit: {pendingRevision.summary}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-[#526653]">
                      Viewing saved snapshot (reopened without regenerating)
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#243e33]">
                  {savedTrip.title}
                </h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={handleCommitRevision}
                  disabled={isSavingTrip || restoringVersion !== null || isLoading || !pendingRevision}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-sm ${
                    pendingRevision
                      ? 'bg-amber-500 text-black hover:bg-amber-400'
                      : 'bg-[#eef1e5] text-[#526653] border border-[#c6d2c0] opacity-70 cursor-not-allowed'
                  }`}
                  title={
                    pendingRevision
                      ? `Commit "${pendingRevision.summary}" as v${savedTrip.current_version + 1}`
                      : 'Edit a stop, rebalance a day, or switch tiers to save a new revision'
                  }
                >
                  {isSavingTrip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving revision…</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>
                        Save revision{pendingRevision ? ` (v${savedTrip.current_version + 1})` : ''}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowHistoryDrawer(prev => !prev); void refreshHistory(savedTrip.id); }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                    showHistoryDrawer
                      ? 'border-[#243e33] bg-[#243e33] text-[#fffdf5]'
                      : 'border-[#c6d2c0] bg-[#f4f7f0] text-[#243e33] hover:bg-[#e7efe1]'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>View history ({versions.length || savedTrip.current_version})</span>
                </button>

                <Link
                  href="/trips"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#c6d2c0] bg-[#f4f7f0] px-3.5 py-2 text-xs font-semibold text-[#243e33] hover:bg-[#e7efe1] transition"
                >
                  <FolderOpen className="w-4 h-4 text-[#89532d]" />
                  <span>My trips</span>
                </Link>

                <button
                  type="button"
                  disabled={isSavingTrip || restoringVersion !== null || isLoading}
                  onClick={() => {
                    if (persistenceBusy.current || (pendingRevision && !window.confirm('Discard unsaved edits and start a new trip?'))) return;
                    historyVersion.current += 1;
                    requestVersion.current += 1;
                    creationKey.current = null;
                    setPlanEpoch(value => value + 1);
                    setSavedTrip(null);
                    setVersions([]);
                    setPendingRevision(null);
                    setShowHistoryDrawer(false);
                    setMultiPlan(null);
                    setSaveStatus(null);
                    setSaveError(null);
                    if (typeof window !== 'undefined') {
                      window.history.replaceState({}, '', '/planner');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#c6d2c0] bg-[#fffdf5] px-3 py-2 text-xs font-semibold text-[#526653] hover:text-[#243e33] hover:bg-[#e7efe1] transition"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>New trip</span>
                </button>
              </div>
            </div>

            {/* Collapsible Version History Drawer */}
            {showHistoryDrawer && (
              <div className="border-t border-[#d6dfd0] pt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#526653]">
                    Saved Version History ({versions.length} revision{versions.length === 1 ? '' : 's'})
                  </h3>
                  <span className="text-[11px] text-[#526653]">
                    Restoring an earlier version creates a new revision so history is never lost.
                  </span>
                </div>

                {versions.length === 0 ? (
                  <p className="text-xs text-[#526653] py-2">No version records found.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {versions.map((ver) => {
                      const isCurrent = ver.version_number === savedTrip.current_version;
                      const isRestoringThis = restoringVersion === ver.version_number;
                      return (
                        <div
                          key={ver.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border p-3 text-xs ${
                            isCurrent
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : 'border-[#c6d2c0] bg-[#f4f7f0]'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-[#243e33]">
                                v{ver.version_number}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-emerald-700 px-2 py-0.2 text-[10px] font-bold text-white">
                                  Current
                                </span>
                              )}
                              <span className="rounded-md border border-[#c6d2c0] bg-[#fffdf5] px-2 py-0.2 text-[10px] font-semibold uppercase text-[#89532d]">
                                {ver.change_type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[11px] text-[#526653] capitalize">
                                Tier: {ver.selected_variant}
                              </span>
                              <span className="text-[11px] text-[#596b57]">
                                • {new Date(ver.created_at).toLocaleString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="text-[#243e33] font-medium">
                              {ver.change_summary}
                              {ver.restored_from_version
                                ? ` (Restored from v${ver.restored_from_version})`
                                : ''}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {(!isCurrent || pendingRevision) && (
                              <button
                                type="button"
                                disabled={restoringVersion !== null || isSavingTrip || isLoading}
                                onClick={() => handleRestoreVersion(ver.version_number)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#243e33]/30 bg-[#fffdf5] px-3 py-1.5 text-xs font-bold text-[#243e33] hover:bg-[#e7efe1] disabled:opacity-50 transition"
                              >
                                {isRestoringThis ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Restoring…</span>
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw className="w-3.5 h-3.5 text-[#89532d]" />
                                    <span>Restore this version</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {saveStatus && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-700/30 bg-emerald-50/90 px-3.5 py-2.5 text-xs font-medium text-emerald-950"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{saveStatus}</span>
          </div>
        )}

        {saveError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-700/30 bg-red-50/90 px-3.5 py-2.5 text-xs font-medium text-red-950"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
              <span>{saveError}</span>
            </div>
            {isConcurrencyConflict && savedTrip && (
              <button
                type="button"
                onClick={() => void loadSavedTripById(savedTrip.id, true)}
                className="inline-flex items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-900"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload latest version</span>
              </button>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="planner-theme min-h-screen bg-[#f3f4ea] text-[#243e33] flex flex-col font-sans">
      <PlannerLandscape />
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section (Only in standard builder view) */}
        {!isSharedView && (
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[#89532d] text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>YOUR NEXT JOURNEY</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#243e33] mb-2">
                A trip that feels <span className="text-[#89532d]">like you</span>.
              </h1>
              <p className="text-sm sm:text-base text-[#526653] max-w-2xl leading-relaxed">
                Choose your dates, local on-ground budget, and travel style. Compare distinct feasible itineraries, customize stops, and save your trip with full version history. Confirm live prices and opening hours before traveling.
              </p>
            </div>
            <Link
              href="/trips"
              className="inline-flex items-center gap-2 self-start sm:self-auto rounded-full border border-[#c6d2c0] bg-[#fffdf5] px-4 py-2 text-xs font-bold text-[#243e33] hover:bg-[#e7efe1] transition shadow-sm"
            >
              <FolderOpen className="w-4 h-4 text-[#89532d]" />
              <span>Open saved trip (My trips)</span>
            </Link>
          </div>
        )}

        {isLoadingSavedTrip && (
          <div
            role="status"
            className="mb-6 flex items-center gap-3 rounded-xl border border-[#c6d2c0] bg-[#fffdf5] p-4 text-sm font-medium text-[#243e33]"
          >
            <Loader2 className="w-5 h-5 animate-spin text-[#89532d]" />
            <span>Reopening your saved itinerary snapshot…</span>
          </div>
        )}

        {isLoading && <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c6d2c0] bg-[#fffdf5] p-4 text-sm"><span>{planningPhase === 'connecting' ? 'Checking the planning service. It may take about a minute to wake up.' : 'The backend is creating your itinerary. Your existing trip is kept until the new plan is ready.'}</span><button type="button" className="underline font-semibold" onClick={() => { requestVersion.current += 1; historyVersion.current += 1; activeRequest.current?.abort(); setIsLoading(false); }}>Cancel</button></div>}
        {/* Global Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-500/30 flex items-start space-x-3 text-red-800 text-sm">
            <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Trip planning notice</span>
              <p className="text-xs text-red-800/90 mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {isSharedView ? (
          /* Parameter-Generated View: Full width presentation focusing on the itinerary & overview */
          <div className="space-y-6">
            <SharedTripOverview
              formData={activeFormData}
              currentPlan={currentPlan}
              activeVariant={resolvedVariant}
              onToggleEditor={() => setShowEditor(prev => !prev)}
              showEditor={showEditor}
            />

            {showEditor && (
              <div className="bg-[#fffdf5] border border-amber-500/30 rounded-2xl p-6 shadow-xl animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#d6dfd0]">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#89532d]" />
                    <h3 className="text-base font-bold text-[#243e33]">Customize Itinerary Settings</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEditor(false)}
                    className="text-xs text-[#526653] hover:text-[#243e33] px-2.5 py-1 rounded-lg bg-[#eef1e5] border border-[#c6d2c0]"
                  >
                    Close Settings Form
                  </button>
                </div>
                <TripForm
                  onSubmit={(fd) => void fetchTripPlan(fd)}
                  isLoading={isLoading || isSavingTrip || restoringVersion !== null}
                  initialValues={activeFormData}
                />
              </div>
            )}

            {renderSavedTripPersistenceBar()}

            {multiPlan && (
              <VariantSwitcher
                multiPlan={multiPlan}
                activeVariant={resolvedVariant}
                onSelectVariant={(v) => {
                  if (persistenceBusy.current) return;
                  setActiveVariant(v);
                  setActiveFormData(current => current ? { ...current, locked_activities: pinnedStopIds(multiPlan.variants[v]) } : current);
                  setSelectedDay('all');
                  if (savedTrip && v !== savedTrip.selected_variant && !pendingRevision) {
                    setPendingRevision({
                      changeType: 'variant_switch',
                      summary: `Switched active variant to ${v}`,
                    });
                  }
                }}
              />
            )}

            {currentPlan ? (
              <>
                {/* Interactive Leaflet Map */}
                <div className="w-full h-[460px]">
                  <MapComponent
                    plan={currentPlan}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                  />
                </div>

                {/* Itinerary Schedule and Hotel Details */}
                <fieldset disabled={isSavingTrip || restoringVersion !== null} className="min-w-0">
                <ItineraryView
                  key={`${savedTrip?.id || 'new'}:${resolvedVariant}:${planEpoch}`}
                  plan={currentPlan}
                  destination={multiPlan?.destination || 'City'}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                  formData={activeFormData}
                  onUpdatePlan={handleUpdatePlan}
                  onReoptimize={handleReoptimize}
                />
                </fieldset>
              </>
            ) : (
              isLoading && (
                <PlanningScene phase={planningPhase} />
              )
            )}
          </div>
        ) : (
          /* Guided setup followed by full-width results */
          <div className="planner-workspace grid grid-cols-1 gap-6 items-start">
            {/* Trip setup */}
            <div className="planner-settings">
              <TripForm onSubmit={(fd) => void fetchTripPlan(fd)} isLoading={isLoading || isSavingTrip || restoringVersion !== null} initialValues={activeFormData} />
            </div>

            {/* Interactive map, variants and schedule */}
            <div className="planner-results space-y-6" aria-busy={isLoading || isLoadingSavedTrip}>
              {isLoading && <PlanningScene phase={planningPhase} />}
              {renderSavedTripPersistenceBar()}
              {multiPlan && (
                <VariantSwitcher
                  multiPlan={multiPlan}
                  activeVariant={resolvedVariant}
                  onSelectVariant={(v) => {
                    if (persistenceBusy.current) return;
                    setActiveVariant(v);
                    setActiveFormData(current => current ? { ...current, locked_activities: pinnedStopIds(multiPlan.variants[v]) } : current);
                    setSelectedDay('all');
                    if (savedTrip && v !== savedTrip.selected_variant && !pendingRevision) {
                      setPendingRevision({
                        changeType: 'variant_switch',
                        summary: `Switched active variant to ${v}`,
                      });
                    }
                  }}
                />
              )}

              {currentPlan ? (
                <>
                  {/* Interactive Leaflet Map */}
                  <div className="w-full h-[460px]">
                    <MapComponent
                      plan={currentPlan}
                      selectedDay={selectedDay}
                      onSelectDay={setSelectedDay}
                    />
                  </div>

                  {/* Itinerary Schedule and Hotel Details */}
                  <fieldset disabled={isSavingTrip || restoringVersion !== null} className="min-w-0">
                <ItineraryView
                  key={`${savedTrip?.id || 'new'}:${resolvedVariant}:${planEpoch}`}
                    plan={currentPlan}
                    destination={multiPlan?.destination || 'City'}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                    formData={activeFormData}
                    onUpdatePlan={handleUpdatePlan}
                    onReoptimize={handleReoptimize}
                  />
                  </fieldset>
                </>
              ) : (
                !isLoading && !isLoadingSavedTrip && (
                  <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-12 text-center text-[#596b57] space-y-3">
                    <Compass className="w-10 h-10 text-gray-600 mx-auto" />
                    <h3 className="text-base font-bold text-[#425d4c]">Your journey starts here</h3>
                    <p className="text-xs text-[#596b57] max-w-sm mx-auto">
                      Choose your trip details and select Create my trip, or open one of your saved itineraries from My trips.
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#d6dfd0] py-6 mt-12 bg-[#f3f4ea] text-center text-xs text-[#596b57]">
        <p>TripWeave · A little planning. A world of possibility.</p>
      </footer>
    </div>
  );
}
