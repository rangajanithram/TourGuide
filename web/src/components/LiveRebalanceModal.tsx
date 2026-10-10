'use client';
import { plannerFetch } from '@/lib/planner-fetch';

import React, { useState, useEffect } from 'react';
import { X, Zap, Coffee, Bed, Footprints, Sparkles, AlertCircle, MapPin } from 'lucide-react';
import { TripPlan, TirednessSeverity, RebalanceTiredRequest, RebalanceTiredResponse } from '../types/trip';

interface LiveRebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: string;
  plan: TripPlan;
  initialDayNumber?: number;
  peopleCount: number;
  transportMode: 'cab' | 'auto' | 'metro' | 'walk';
  pace: 'relaxed' | 'balanced' | 'intensive';
  budgetLimit?: number;
  onApplyUpdate: (updatedPlan: TripPlan) => void;
}

const TIREDNESS_OPTIONS: {
  id: TirednessSeverity;
  title: string;
  badge: string;
  desc: string;
  icon: typeof Coffee;
}[] = [
  {
    id: 'mild',
    title: 'Mild • Relax Pacing',
    badge: '30m Rest Buffer',
    desc: 'Keep planned stops, shorten visits longer than 90 minutes by about 20%, and add a 30-minute rest.',
    icon: Coffee,
  },
  {
    id: 'moderate',
    title: 'Moderate • Recommended',
    badge: 'Drop 1 Stop + 45m Break',
    desc: 'Remove the stop with the greatest estimated dwell and detour burden, then add a 45-minute rest.',
    icon: Footprints,
  },
  {
    id: 'exhausted',
    title: 'Exhausted • Early Rest',
    badge: 'Hotel Base Early',
    desc: 'Remove optional stops, estimate travel back to the hotel, and retain pinned stops and evening meals.',
    icon: Bed,
  },
];

export default function LiveRebalanceModal({
  isOpen,
  onClose,
  destination,
  plan,
  initialDayNumber = 1,
  peopleCount,
  transportMode,
  pace,
  budgetLimit,
  onApplyUpdate,
}: LiveRebalanceModalProps) {
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(initialDayNumber);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [currentActivityIndex, setCurrentActivityIndex] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [tirednessLevel, setTirednessLevel] = useState<TirednessSeverity>('moderate');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<RebalanceTiredResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync day selection when initialDayNumber changes
  useEffect(() => {
    if (initialDayNumber) {
      setSelectedDayNumber(initialDayNumber);
      setCurrentActivityIndex(null);
    }
  }, [initialDayNumber]);

  const targetDay = plan.days.find(d => d.day_number === selectedDayNumber) || plan.days[0];

  // A changed input invalidates the old preview. Abort in-flight requests so
  // late responses cannot overwrite the result for the current selections.
  useEffect(() => {
    if (!isOpen || !targetDay) return;
    const controller = new AbortController();
    setPreviewData(null);
    setIsLoading(true);
    setError(null);

    const payload: RebalanceTiredRequest = {
      destination,
      plan,
      day_number: selectedDayNumber,
      current_time_str: currentTimeStr,
      current_activity_index: currentActivityIndex,
      current_location_lat: currentLocation?.lat,
      current_location_lng: currentLocation?.lng,
      tiredness_level: tirednessLevel,
      people_count: peopleCount,
      transport_mode: transportMode,
      pace,
      budget_limit_inr: budgetLimit || undefined,
    };

    const loadPreview = async () => {
      try {
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
        const res = await plannerFetch(`${apiBase}/api/itinerary/rebalance-day`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = typeof data.detail === 'string' ? data.detail : `Server returned ${res.status}`;
          throw new Error(detail);
        }
        if (!controller.signal.aborted) setPreviewData(data as RebalanceTiredResponse);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Could not reach the trip planning service.';
        setError(msg);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadPreview();
    return () => controller.abort();
  }, [isOpen, targetDay, destination, plan, selectedDayNumber, currentTimeStr, currentActivityIndex, currentLocation, tirednessLevel, peopleCount, transportMode, pace, budgetLimit]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!previewData?.is_feasible || !previewData.updated_plan || isLoading) return;
    onApplyUpdate(previewData.updated_plan);
    onClose();
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location is not available in this browser. Select your last completed stop instead.');
      return;
    }
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      position => setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setLocationError('Could not get your location. Select your last completed stop instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#fffdf5] border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl text-[#243e33] max-h-[92vh] flex flex-col overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#d6dfd0] relative z-10 shrink-0">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[#89532d] text-[11px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping mr-0.5"></span>
              <Zap className="w-3.5 h-3.5 text-[#89532d]" />
              <span>Mid-Trip Replan Preview</span>
            </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#243e33] tracking-tight">
                  I&apos;m Tired / Running Late
                </h2>
                <p className="text-xs text-[#526653] max-w-md">
                  Heuristic preview from your selected progress. Route, fatigue, and fare figures are estimates; known schedule conflicts block applying the revision.
                </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-[#eef1e5] border border-[#c6d2c0] text-[#526653] hover:text-[#243e33] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-5 relative z-10 text-xs">
          {/* Day Selector */}
          <div>
            <label className="block text-[#526653] font-semibold uppercase tracking-wider text-[11px] mb-2">
              Select Active Day
            </label>
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              {plan.days.map(d => (
                <button
                  key={d.day_number}
                  type="button"
                  onClick={() => {
                    setSelectedDayNumber(d.day_number);
                    setCurrentActivityIndex(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl border font-bold transition-all ${
                    selectedDayNumber === d.day_number
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md scale-105'
                      : 'bg-[#eef1e5] border-[#c6d2c0] text-[#425d4c] hover:border-gray-500'
                  }`}
                >
                  Day {d.day_number} ({d.activities.length} stops)
                </button>
              ))}
            </div>
          </div>

          {/* Current Progress & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[#526653] font-semibold uppercase tracking-wider text-[11px] mb-1.5">
                Current Location / Last Completed
              </label>
              <select
                value={currentActivityIndex ?? ''}
                onChange={e => setCurrentActivityIndex(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full bg-[#eef1e5] border border-[#c6d2c0] rounded-xl px-3 py-2 text-[#243e33] focus:outline-none focus:border-amber-500"
              >
                <option value="">Infer from the current time</option>
                <option value={-1}>No stops completed yet</option>
                {targetDay?.activities.map((act, i) => (
                  <option key={i} value={i}>
                    Stop {i + 1}: {act.place_name} ({act.start_time})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#526653] font-semibold uppercase tracking-wider text-[11px] mb-1.5">
                Current Time
              </label>
              <div className="flex items-center space-x-1.5">
                <input
                  type="time"
                  value={currentTimeStr}
                  onChange={e => setCurrentTimeStr(e.target.value)}
                  className="w-full bg-[#eef1e5] border border-[#c6d2c0] rounded-xl px-3 py-2 text-[#243e33] focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>
              <button type="button" onClick={requestCurrentLocation} className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-sky-300 hover:text-sky-200">
                <MapPin className="w-3 h-3" />
                {currentLocation ? 'GPS location attached to preview' : 'Use my current location'}
              </button>
              {currentLocation && (
                <button type="button" onClick={() => setCurrentLocation(null)} className="ml-2 text-[10px] text-[#596b57] hover:text-[#425d4c]">Clear GPS location</button>
              )}
              <p className="text-[10px] text-[#596b57] mt-1">Without GPS, the selected last stop is used as your approximate location. GPS is sent with the preview request for estimates; the saved break pin uses your last completed stop or hotel.</p>
              {locationError && <p className="text-[10px] text-rose-300 mt-1">{locationError}</p>}
            </div>
          </div>

          {/* Tiredness Level Selector */}
          <div>
            <label className="block text-[#526653] font-semibold uppercase tracking-wider text-[11px] mb-2 flex items-center justify-between">
              <span>Select Fatigue Relief Level</span>
              <span className="text-[10px] text-[#89532d]/90 font-normal">Fatigue score is a heuristic estimate</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {TIREDNESS_OPTIONS.map(opt => {
                const isSelected = tirednessLevel === opt.id;
                const IconComp = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTirednessLevel(opt.id)}
                    className={`p-3 text-left rounded-2xl border transition-all relative ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40 text-[#243e33]'
                        : 'bg-[#eef1e5] border-[#c6d2c0] text-[#425d4c] hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <IconComp className={`w-4 h-4 ${isSelected ? 'text-[#89532d]' : 'text-[#526653]'}`} />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isSelected ? 'bg-amber-400 text-black' : 'bg-[#d6dfd0] text-[#526653]'
                      }`}>
                        {opt.badge}
                      </span>
                    </div>
                    <span className="font-bold text-xs block text-[#243e33] mb-0.5">{opt.title}</span>
                    <p className="text-[10px] text-[#526653] line-clamp-2 leading-relaxed">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-500/30 text-red-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Live Preview & Simulation Results */}
          {isLoading ? (
            <div className="p-8 rounded-2xl bg-[#eef1e5] border border-[#c6d2c0] text-center space-y-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <span className="text-[#526653] text-xs font-medium">Re-calculating physics, travel distances &amp; time windows...</span>
            </div>
          ) : previewData ? (
            <div className="space-y-3.5 bg-[#eef1e5] border border-amber-500/30 rounded-2xl p-4 animate-in fade-in duration-200">
              {/* Summary Headline */}
              <div className="flex items-start space-x-2.5">
                <Sparkles className="w-4 h-4 text-[#89532d] shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200 font-medium leading-relaxed">
                  {previewData.summary_message}
                </p>
              </div>

              <div className={`rounded-lg border px-3 py-2 text-[11px] ${previewData.is_feasible ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200'}`}>
                {previewData.is_feasible ? 'Known schedule and budget checks pass.' : 'This revision has a known feasibility or budget conflict and cannot be applied.'}
                {previewData.budget_within_limit === false && ' The revised on-ground estimate exceeds the budget cap.'}
                {previewData.transport_budget_within_limit === false && ' The revised local transport estimate exceeds the transport cap.'}
                {previewData.feasibility_notes.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {previewData.feasibility_notes.map((note, index) => <li key={index}>{note}</li>)}
                  </ul>
                )}
              </div>

              {/* Metrics Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-[#c6d2c0]">
                <div className="bg-[#fffdf5] border border-[#c6d2c0] rounded-xl p-2.5 text-center">
                  <span className="text-[10px] text-[#526653] block uppercase">Modeled Fatigue</span>
                  <span className="text-sm font-extrabold text-emerald-700 block mt-0.5">
                    {previewData.old_fatigue_score} → {previewData.new_fatigue_score}
                  </span>
                  <span className="text-[10px] text-emerald-700/80">
                    {previewData.fatigue_change_pct >= 0 ? `${previewData.fatigue_change_pct.toFixed(1)}% lower` : `${Math.abs(previewData.fatigue_change_pct).toFixed(1)}% higher`}
                  </span>
                </div>

                <div className="bg-[#fffdf5] border border-[#c6d2c0] rounded-xl p-2.5 text-center">
                  <span className="text-[10px] text-[#526653] block uppercase">Est. Route Distance Δ</span>
                  <span className="text-sm font-extrabold text-[#89532d] block mt-0.5">
                    {previewData.route_distance_delta_km >= 0 ? '+' : ''}{previewData.route_distance_delta_km.toFixed(1)} km
                  </span>
                  <span className="text-[10px] text-[#526653]">straight-line × road factor estimate</span>
                </div>

                <div className="bg-[#fffdf5] border border-[#c6d2c0] rounded-xl p-2.5 text-center">
                  <span className="text-[10px] text-[#526653] block uppercase">Est. Transit Time Δ</span>
                  <span className="text-sm font-extrabold text-sky-400 block mt-0.5">
                    {previewData.transit_time_delta_minutes >= 0 ? '+' : ''}{previewData.transit_time_delta_minutes} min
                  </span>
                  <span className="text-[10px] text-[#526653]">negative means less time</span>
                </div>

                <div className="bg-[#fffdf5] border border-[#c6d2c0] rounded-xl p-2.5 text-center">
                  <span className="text-[10px] text-[#526653] block uppercase">Local Fare Δ</span>
                  <span className="text-sm font-extrabold text-sky-400 block mt-0.5">
                    {previewData.transport_cost_delta_inr >= 0 ? '+' : '−'}₹{Math.abs(previewData.transport_cost_delta_inr).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-[#526653]">party estimate</span>
                </div>
              </div>

              {/* Dropped vs Inserted Details */}
              <div className="space-y-1.5 pt-1 text-[11px]">
                {previewData.dropped_activities.length > 0 && (
                  <div className="flex items-center space-x-2 text-rose-300">
                    <span className="font-bold">❌ Dropped:</span>
                    <span>{previewData.dropped_activities.join(', ')}</span>
                  </div>
                )}
                {previewData.inserted_breaks.length > 0 && (
                  <div className="flex items-center space-x-2 text-emerald-300">
                    <span className="font-bold">☕ Inserted:</span>
                    <span>{previewData.inserted_breaks.join(', ')}</span>
                  </div>
                )}
              </div>

              {/* Revised Day Itinerary Snippet */}
              <div className="pt-2 border-t border-[#c6d2c0]">
                <span className="text-[10px] font-semibold text-[#526653] uppercase tracking-wider block mb-1.5">
                  Revised Afternoon Timeline (Day {selectedDayNumber})
                </span>
                <div className="space-y-1.5">
                  {previewData.revised_day.activities.map((act, idx) => {
                    const isNew = previewData.inserted_breaks.some(b => act.place_name.includes(b.split('(')[0].trim()));
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                          isNew
                            ? 'bg-amber-500/10 border border-amber-500/40 text-[#89532d] font-semibold'
                            : 'bg-[#fffdf5] border border-[#c6d2c0] text-[#425d4c]'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="font-mono text-[10px] text-[#526653]">{act.start_time} - {act.end_time}</span>
                          <span className="truncate">{act.place_name}</span>
                        </div>
                        {isNew && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-black shrink-0">
                            Rest Break
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Action Footer */}
        <div className="pt-4 border-t border-[#d6dfd0] flex items-center justify-between gap-3 relative z-10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#eef1e5] border border-[#c6d2c0] text-xs font-semibold text-[#425d4c] hover:text-[#243e33] hover:border-gray-500 transition-colors"
          >
            Cancel / Keep Original
          </button>

          <button
            type="button"
            disabled={!previewData?.is_feasible || !previewData.updated_plan || isLoading}
            onClick={handleApply}
            className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-lg transition-all active:scale-95 ${
              previewData?.is_feasible && previewData.updated_plan && !isLoading
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:brightness-105 cursor-pointer'
                : 'bg-gray-800 text-[#596b57] cursor-not-allowed border border-gray-700'
            }`}
          >
            <Zap className="w-4 h-4 fill-black text-black" />
            <span>Apply Revised Schedule to Day {selectedDayNumber}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
