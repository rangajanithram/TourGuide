'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Header from '../components/Header';
import TripForm from '../components/TripForm';
import VariantSwitcher from '../components/VariantSwitcher';
import ItineraryView from '../components/ItineraryView';
import { MultiVariantTripPlan, TripPlan, TripFormData } from '../types/trip';
import { AlertCircle, Compass, Sparkles } from 'lucide-react';

// Dynamically import Leaflet Map with SSR disabled
const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-2xl bg-[#11131b] border border-[#1e2230] flex flex-col items-center justify-center text-gray-500 space-y-2">
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-xs">Initializing Interactive Map...</span>
    </div>
  )
});

export default function Home() {
  const [multiPlan, setMultiPlan] = useState<MultiVariantTripPlan | null>(null);
  const [activeVariant, setActiveVariant] = useState<'budget' | 'balanced' | 'comfort'>('balanced');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFormData, setActiveFormData] = useState<TripFormData | null>(null);

  const fetchTripPlan = async (formData: TripFormData) => {
    setIsLoading(true);
    setError(null);
    setSelectedDay('all');
    setActiveFormData(formData);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const response = await fetch(`${apiBase}/api/itinerary/generate-variants`, {
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
        throw new Error(errData.detail || `Server returned status ${response.status}`);
      }

      const data: MultiVariantTripPlan = await response.json();
      setMultiPlan(data);
    } catch (err: unknown) {
      console.error('Failed to generate trip:', err);
      const message = err instanceof Error ? err.message : 'Could not connect to TripWeave optimization engine. Ensure the FastAPI backend is running on port 8000.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load with curated default values or URL query params
  useEffect(() => {
    const getFutureDate = (daysAhead: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + daysAhead);
      return d.toISOString().split('T')[0];
    };

    let dest = 'hyderabad';
    let orig: string | undefined = undefined;
    let sDate = getFutureDate(7);
    let eDate = getFutureDate(9);
    let mode: 'cab' | 'auto' | 'metro' | 'walk' = 'cab';
    let budget = 15000;
    let people = 2;
    let pace: 'relaxed' | 'balanced' | 'intensive' = 'balanced';
    let profile: 'default' | 'young_solo' | 'family' | 'elderly' = 'default';
    let interests = ['unesco', 'history', 'sunset'];
    let lockedActs: string[] = [];
    let originType: 'hotel' | 'center' | 'station' | 'airport' = 'hotel';

    let startLocation: string | undefined = undefined;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
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
      if (urlOriginType && ['hotel', 'center', 'station', 'airport'].includes(urlOriginType)) {
        originType = urlOriginType as any;
      }
      const urlStartLoc = params.get('start_location') || params.get('hub');
      if (urlStartLoc) {
        startLocation = urlStartLoc.trim();
      }
    }

    fetchTripPlan({
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
    });
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
    <div className="min-h-screen bg-[#090a0f] text-gray-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Deterministic Travel Optimization Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-2">
            Plan without <span className="text-amber-400">hallucinations</span>.
          </h1>
          <p className="text-sm sm:text-base text-gray-400 max-w-2xl leading-relaxed">
            Every route is optimized with Google OR-Tools time-window routing, DBSCAN neighborhood clustering, strict budget conservation, and NOAA astronomical sunset calculations.
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start space-x-3 text-red-300 text-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Optimization Engine Notice</span>
              <p className="text-xs text-red-300/90 mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Dual Column Layout: Left Cockpit Form, Right Visual Results */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form */}
          <div className="lg:col-span-5 sticky top-24">
            <TripForm onSubmit={fetchTripPlan} isLoading={isLoading} />
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
                <div className="bg-[#11131b] border border-[#1e2230] rounded-2xl p-12 text-center text-gray-500 space-y-3">
                  <Compass className="w-10 h-10 text-gray-600 mx-auto" />
                  <h3 className="text-base font-bold text-gray-300">Ready to synthesize your itinerary</h3>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Fill out the parameters on the left and click Synthesize to generate feasible, mathematically optimal routes.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e2230] py-6 mt-12 bg-[#090a0f] text-center text-xs text-gray-500">
        <p>TripWeave Travel Engine • OR-Tools VRP & DBSCAN Geo-Clustering</p>
      </footer>
    </div>
  );
}
