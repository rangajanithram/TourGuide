'use client';
import { plannerFetch } from '@/lib/planner-fetch';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { travelPreferences } from '@/lib/travel-preferences';
import Header from '../components/Header';
import TripForm from '../components/TripForm';
import VariantSwitcher from '../components/VariantSwitcher';
import ItineraryView from '../components/ItineraryView';
import SharedTripOverview from '../components/SharedTripOverview';
import { MultiVariantTripPlan, TripPlan, TripFormData } from '../types/trip';
import { AlertCircle, Compass, Sparkles } from 'lucide-react';

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

export default function Home({ preferences }: { preferences?: unknown }) {
  const defaults = useRef(travelPreferences(preferences));
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { requestVersion.current += 1; activeRequest.current?.abort(); }, []);
  const [multiPlan, setMultiPlan] = useState<MultiVariantTripPlan | null>(null);
  const [activeVariant, setActiveVariant] = useState<'budget' | 'balanced' | 'comfort'>('balanced');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFormData, setActiveFormData] = useState<TripFormData | null>(null);
  const [isSharedView, setIsSharedView] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const fetchTripPlan = async (formData: TripFormData) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 120000);
    const version = ++requestVersion.current;
    setIsLoading(true);
    setError(null);
    setMultiPlan(null);
    setSelectedDay('all');
    setActiveFormData(formData);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
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

      const data: MultiVariantTripPlan = await response.json();
      if (version === requestVersion.current) setMultiPlan(data);
    } catch (err: unknown) {
      console.error('Failed to generate trip:', err);
      const message = controller.signal.aborted ? 'Planning took too long. Please try again; the service may be waking up.' : err instanceof Error ? err.message : 'Could not reach the trip planning service. Check your connection and try again.';
      if (version === requestVersion.current) setError(message);
    } finally {
      clearTimeout(timeout);
      if (version === requestVersion.current) setIsLoading(false);
    }
  };

  // Initial load with curated default values or URL query params
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

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dest') || params.get('destination') || params.get('pins') || params.get('budget') || params.get('start') || params.get('origin')) {
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
        setActiveVariant(urlVariant.toLowerCase() as 'budget' | 'balanced' | 'comfort');
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

    if (shared) {
      setIsSharedView(true);
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
    if (shared) void fetchTripPlan(initialData);
  }, []);

  const handleUpdatePlan = (updatedPlan: TripPlan) => {
    if (!multiPlan) return;
    setMultiPlan({
      ...multiPlan,
      variants: {
        ...multiPlan.variants,
        [activeVariant]: updatedPlan
      }
    });
  };

  const handleReoptimize = (pinnedActivities: string[]) => {
    if (!activeFormData) return;
    const combinedPins = Array.from(new Set([...(activeFormData.locked_activities || []), ...pinnedActivities]));
    const updatedForm: TripFormData = {
      ...activeFormData,
      locked_activities: combinedPins
    };
    setActiveFormData(updatedForm);
    fetchTripPlan(updatedForm);
  };

  const currentPlan: TripPlan | undefined = multiPlan?.variants[activeVariant];

  return (
    <div className="planner-theme min-h-screen bg-[#f3f4ea] text-[#243e33] flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section (Only in standard builder view) */}
        {!isSharedView && (
          <div className="mb-8">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[#89532d] text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>YOUR NEXT JOURNEY</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#243e33] mb-2">
              A trip that feels <span className="text-[#89532d]">like you</span>.
            </h1>
            <p className="text-sm sm:text-base text-[#526653] max-w-2xl leading-relaxed">
              Choose your dates and travel style. Compare three estimated itineraries, then explore each day. Confirm prices and opening hours before traveling.
            </p>
          </div>
        )}

        {isLoading && <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c6d2c0] bg-[#fffdf5] p-4 text-sm"><span>Creating your itinerary. The service may take about a minute to wake up.</span><button type="button" className="underline font-semibold" onClick={() => { requestVersion.current += 1; activeRequest.current?.abort(); setIsLoading(false); }}>Cancel</button></div>}
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
          /* Shared View: Full width presentation focusing on the shared itinerary & overview */
          <div className="space-y-6">
            <SharedTripOverview
              formData={activeFormData}
              currentPlan={currentPlan}
              activeVariant={activeVariant}
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
                  onSubmit={fetchTripPlan}
                  isLoading={isLoading}
                  initialValues={activeFormData}
                />
              </div>
            )}

            {multiPlan && (
              <VariantSwitcher
                multiPlan={multiPlan}
                activeVariant={activeVariant}
                onSelectVariant={(v) => {
                  setActiveVariant(v);
                  setSelectedDay('all');
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
                <ItineraryView
                  plan={currentPlan}
                  destination={multiPlan?.destination || 'City'}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                  formData={activeFormData}
                  onUpdatePlan={handleUpdatePlan}
                  onReoptimize={handleReoptimize}
                />
              </>
            ) : (
              isLoading && (
                <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-16 text-center text-[#526653] space-y-4">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <h3 className="text-lg font-bold text-[#243e33]">Creating your itinerary…</h3>
                  <p className="text-xs text-[#526653] max-w-md mx-auto">
                    Comparing suitable places, travel time and estimated costs. The service may take about a minute to wake up.
                  </p>
                </div>
              )
            )}
          </div>
        ) : (
          /* Dual Column Layout: Left Cockpit Form, Right Visual Results */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Form */}
            <div className="lg:col-span-5">
              <TripForm onSubmit={fetchTripPlan} isLoading={isLoading} initialValues={activeFormData} />
            </div>

            {/* Right Column: Interactive Map, Variants & Schedule */}
            <div className="lg:col-span-7 space-y-6">
              {multiPlan && (
                <VariantSwitcher
                  multiPlan={multiPlan}
                  activeVariant={activeVariant}
                  onSelectVariant={(v) => {
                    setActiveVariant(v);
                    setSelectedDay('all');
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
                  <ItineraryView
                    plan={currentPlan}
                    destination={multiPlan?.destination || 'City'}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                    formData={activeFormData}
                    onUpdatePlan={handleUpdatePlan}
                    onReoptimize={handleReoptimize}
                  />
                </>
              ) : (
                !isLoading && (
                  <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-12 text-center text-[#596b57] space-y-3">
                    <Compass className="w-10 h-10 text-gray-600 mx-auto" />
                    <h3 className="text-base font-bold text-[#425d4c]">Your journey starts here</h3>
                    <p className="text-xs text-[#596b57] max-w-sm mx-auto">
                      Choose your trip details and select Create my trip. Your options, route map, and daily schedule will appear here.
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
