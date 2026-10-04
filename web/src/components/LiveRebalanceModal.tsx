'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Zap, Coffee, Bed, Footprints, Clock, ArrowRight,
  Sparkles, Check, AlertCircle, Compass, HeartHandshake, ShieldCheck
} from 'lucide-react';
import { 
  TripPlan, DayPlan, TirednessSeverity, 
  RebalanceTiredRequest, RebalanceTiredResponse 
} from '../types/trip';

interface LiveRebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: string;
  plan: TripPlan;
  initialDayNumber?: number;
  peopleCount: number;
  transportMode: 'cab' | 'auto' | 'metro' | 'walk';
  onApplyUpdate: (updatedDay: DayPlan) => void;
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
    desc: 'Keep all planned attractions. Insert a 30-min scenic tea break and relax visit durations.',
    icon: Coffee,
  },
  {
    id: 'moderate',
    title: 'Moderate • Recommended',
    badge: 'Drop 1 Stop + 45m Break',
    desc: 'Legs are tired. Drop 1 heavy walking stop, add 45-min cafe pause, and protect sunset & dinner.',
    icon: Footprints,
  },
  {
    id: 'exhausted',
    title: 'Exhausted • Early Rest',
    badge: 'Hotel Base Early',
    desc: 'Done with sightseeing. Skip afternoon attractions and head back to hotel base or straight to dinner.',
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
  onApplyUpdate,
}: LiveRebalanceModalProps) {
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(initialDayNumber);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('02:30 PM');
  const [currentActivityIndex, setCurrentActivityIndex] = useState<number>(0);
  const [tirednessLevel, setTirednessLevel] = useState<TirednessSeverity>('moderate');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<RebalanceTiredResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync day selection when initialDayNumber changes
  useEffect(() => {
    if (initialDayNumber) {
      setSelectedDayNumber(initialDayNumber);
    }
  }, [initialDayNumber]);

  const targetDay = plan.days.find(d => d.day_number === selectedDayNumber) || plan.days[0];

  // Helper to fetch live rebalance simulation from backend
  const fetchRebalancePreview = async () => {
    if (!targetDay) return;
    setIsLoading(true);
    setError(null);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const payload: RebalanceTiredRequest = {
        destination,
        plan,
        day_number: selectedDayNumber,
        current_time_str: currentTimeStr,
        current_activity_index: currentActivityIndex,
        tiredness_level: tirednessLevel,
        people_count: peopleCount,
        transport_mode: transportMode,
      };

      const res = await fetch(`${apiBase}/api/itinerary/rebalance-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned ${res.status}`);
      }

      const data: RebalanceTiredResponse = await res.json();
      setPreviewData(data);
    } catch (err: unknown) {
      console.error('Failed to simulate mid-trip rebalance:', err);
      const msg = err instanceof Error ? err.message : 'Could not reach optimization engine.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch simulation preview whenever inputs change
  useEffect(() => {
    if (isOpen) {
      fetchRebalancePreview();
    }
  }, [isOpen, selectedDayNumber, currentTimeStr, currentActivityIndex, tirednessLevel]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!previewData?.revised_day) return;
    onApplyUpdate(previewData.revised_day);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#11131b] border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl text-gray-100 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#1e2230] relative z-10 shrink-0">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping mr-0.5"></span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Live In-Trip Mode</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              I&apos;m Tired / Running Late
            </h2>
            <p className="text-xs text-gray-400 max-w-md">
              Mid-trip adaptive optimizer: Drops heavy walking, inserts refreshment pauses, and protects dinner &amp; sunset without zigzagging.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-[#161922] border border-[#222736] text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-5 relative z-10 text-xs">
          {/* Day Selector */}
          <div>
            <label className="block text-gray-400 font-semibold uppercase tracking-wider text-[11px] mb-2">
              Select Active Day
            </label>
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              {plan.days.map(d => (
                <button
                  key={d.day_number}
                  type="button"
                  onClick={() => {
                    setSelectedDayNumber(d.day_number);
                    setCurrentActivityIndex(0);
                  }}
                  className={`px-3 py-1.5 rounded-xl border font-bold transition-all ${
                    selectedDayNumber === d.day_number
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md scale-105'
                      : 'bg-[#161922] border-[#222736] text-gray-300 hover:border-gray-500'
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
              <label className="block text-gray-400 font-semibold uppercase tracking-wider text-[11px] mb-1.5">
                Current Location / Last Completed
              </label>
              <select
                value={currentActivityIndex}
                onChange={e => setCurrentActivityIndex(Number(e.target.value))}
                className="w-full bg-[#161922] border border-[#222736] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                {targetDay?.activities.map((act, i) => (
                  <option key={i} value={i}>
                    Stop {i + 1}: {act.place_name} ({act.start_time})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-400 font-semibold uppercase tracking-wider text-[11px] mb-1.5">
                Current Time
              </label>
              <div className="flex items-center space-x-1.5">
                <input
                  type="text"
                  value={currentTimeStr}
                  onChange={e => setCurrentTimeStr(e.target.value)}
                  placeholder="e.g. 02:30 PM"
                  className="w-full bg-[#161922] border border-[#222736] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setCurrentTimeStr('02:30 PM')}
                  className="px-2 py-2 rounded-lg bg-[#1e2230] text-[10px] text-gray-300 hover:text-white shrink-0"
                  title="Preset 02:30 PM"
                >
                  2:30 PM
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTimeStr('03:30 PM')}
                  className="px-2 py-2 rounded-lg bg-[#1e2230] text-[10px] text-gray-300 hover:text-white shrink-0"
                  title="Preset 03:30 PM"
                >
                  3:30 PM
                </button>
              </div>
            </div>
          </div>

          {/* Tiredness Level Selector */}
          <div>
            <label className="block text-gray-400 font-semibold uppercase tracking-wider text-[11px] mb-2 flex items-center justify-between">
              <span>Select Fatigue Relief Level</span>
              <span className="text-[10px] text-amber-400/90 font-normal">Calibrated for {plan.fatigue_report?.group_profile || 'general group'}</span>
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
                        ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/40 text-white'
                        : 'bg-[#161922] border-[#222736] text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <IconComp className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-gray-400'}`} />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isSelected ? 'bg-amber-400 text-black' : 'bg-[#1e2230] text-gray-400'
                      }`}>
                        {opt.badge}
                      </span>
                    </div>
                    <span className="font-bold text-xs block text-white mb-0.5">{opt.title}</span>
                    <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Live Preview & Simulation Results */}
          {isLoading ? (
            <div className="p-8 rounded-2xl bg-[#161922] border border-[#222736] text-center space-y-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <span className="text-gray-400 text-xs font-medium">Re-calculating physics, travel distances &amp; time windows...</span>
            </div>
          ) : previewData ? (
            <div className="space-y-3.5 bg-[#161922] border border-amber-500/30 rounded-2xl p-4 animate-in fade-in duration-200">
              {/* Summary Headline */}
              <div className="flex items-start space-x-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200 font-medium leading-relaxed">
                  {previewData.summary_message}
                </p>
              </div>

              {/* Metrics Row */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#222736]">
                <div className="bg-[#11131b] border border-[#222736] rounded-xl p-2.5 text-center">
                  <span className="text-[10px] text-gray-400 block uppercase">Fatigue Reduction</span>
                  <span className="text-sm font-extrabold text-emerald-400 block mt-0.5">
                    {previewData.old_fatigue_score} → {previewData.new_fatigue_score}
                  </span>
                  <span className="text-[10px] text-emerald-400/80">-{previewData.fatigue_reduction_pct}% relief</span>
                </div>

                <div className="bg-[#11131b] border border-[#222736] rounded-xl p-2.5 text-center">
                  <span className="text-[10px] text-gray-400 block uppercase">Walking / Distance</span>
                  <span className="text-sm font-extrabold text-amber-400 block mt-0.5">
                    -{previewData.saved_walking_km.toFixed(1)} km
                  </span>
                  <span className="text-[10px] text-gray-400">saved travel</span>
                </div>

                <div className="bg-[#11131b] border border-[#222736] rounded-xl p-2.5 text-center">
                  <span className="text-[10px] text-gray-400 block uppercase">Transit Cushion</span>
                  <span className="text-sm font-extrabold text-sky-400 block mt-0.5">
                    +{previewData.saved_transit_minutes} min
                  </span>
                  <span className="text-[10px] text-gray-400">breathing room</span>
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
              <div className="pt-2 border-t border-[#222736]">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
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
                            ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300 font-semibold' 
                            : 'bg-[#11131b] border border-[#222736] text-gray-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="font-mono text-[10px] text-gray-400">{act.start_time} - {act.end_time}</span>
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
        <div className="pt-4 border-t border-[#1e2230] flex items-center justify-between gap-3 relative z-10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#161922] border border-[#222736] text-xs font-semibold text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            Cancel / Keep Original
          </button>

          <button
            type="button"
            disabled={!previewData?.is_feasible || isLoading}
            onClick={handleApply}
            className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-lg transition-all active:scale-95 ${
              previewData?.is_feasible && !isLoading
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:brightness-105 cursor-pointer'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
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
