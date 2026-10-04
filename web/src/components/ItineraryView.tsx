'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building2, Camera, Compass, Sparkles, Layers,
  ShieldCheck, CheckCircle2, Calendar,
  Copy, Check, Activity, CloudSun,
  CloudRain, Flame, Utensils, Wallet,
  HelpCircle, ChevronDown, ChevronUp, Pin, Link2, Users,
  Train, Plane, Car, ArrowRight, CheckSquare, Square,
  ArrowRightLeft, Trash2, Sun, Lock, Unlock, RotateCcw, RefreshCw, Zap
} from 'lucide-react';
import { TripPlan, TripFormData, DayPlan, EditActionType } from '../types/trip';
import { exportToIcs, formatItineraryForShare } from '../utils/calendarExport';
import EditConsequenceModal from './EditConsequenceModal';
import LiveRebalanceModal from './LiveRebalanceModal';

interface ItineraryViewProps {
  plan: TripPlan;
  destination?: string;
  selectedDay?: number | 'all';
  onSelectDay?: (day: number | 'all') => void;
  formData?: TripFormData | null;
  onUpdatePlan?: (updatedPlan: TripPlan) => void;
  onReoptimize?: (pinnedActivities: string[]) => void;
}

export default function ItineraryView({ 
  plan, 
  destination = 'City',
  selectedDay = 'all',
  onSelectDay,
  formData,
  onUpdatePlan,
  onReoptimize
}: ItineraryViewProps) {
  const [activePlan, setActivePlan] = useState<TripPlan>(plan);
  const [planHistory, setPlanHistory] = useState<TripPlan[]>([]);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    dayNumber: number;
    activityIndex: number;
    initialAction: EditActionType;
  } | null>(null);
  const [rebalanceDayNumber, setRebalanceDayNumber] = useState<number | null>(null);

  useEffect(() => {
    setActivePlan(plan);
    setPlanHistory([]);
  }, [plan]);

  const currentPlan = activePlan;

  const handleApplyDayUpdate = (updatedDay: DayPlan) => {
    setPlanHistory(prev => [...prev, activePlan]);
    const updatedDays = activePlan.days.map(d => d.day_number === updatedDay.day_number ? updatedDay : d);
    const newTotalActivitiesCost = updatedDays.reduce((acc, d) => acc + d.day_cost_inr, 0);
    const newTotalCost = newTotalActivitiesCost + (activePlan.hotel_summary?.total_cost_inr || 0) + activePlan.estimated_transport_cost_inr;
    
    const nextPlan: TripPlan = {
      ...activePlan,
      days: updatedDays,
      total_cost_inr: newTotalCost
    };
    setActivePlan(nextPlan);
    onUpdatePlan?.(nextPlan);
  };

  const handleApplyRebalancedPlan = (updatedPlan: TripPlan) => {
    setPlanHistory(prev => [...prev, activePlan]);
    setActivePlan(updatedPlan);
    onUpdatePlan?.(updatedPlan);
  };

  const handleUndo = () => {
    if (planHistory.length === 0) return;
    const previous = planHistory[planHistory.length - 1];
    setPlanHistory(prev => prev.slice(0, -1));
    setActivePlan(previous);
    onUpdatePlan?.(previous);
  };

  const handleTogglePin = (dayNum: number, actIdx: number) => {
    const targetDay = activePlan.days.find(d => d.day_number === dayNum);
    if (!targetDay) return;
    const updatedActivities = targetDay.activities.map((a, i) => {
      if (i === actIdx) {
        return { ...a, is_locked: !a.is_locked };
      }
      return a;
    });
    const updatedDay: DayPlan = { ...targetDay, activities: updatedActivities };
    handleApplyDayUpdate(updatedDay);
  };

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showWhyNot, setShowWhyNot] = useState(false);
  const [showAllTransit, setShowAllTransit] = useState(false);
  const [visitedActivities, setVisitedActivities] = useState<Record<string, { visited: boolean; actualCost: number }>>({});
  const [editingSpend, setEditingSpend] = useState<string | null>(null);
  const [spendInput, setSpendInput] = useState<string>('');
  const hotel = currentPlan.hotel_summary;
  const totalActivitiesCost = currentPlan.days.reduce((acc, d) => acc + d.day_cost_inr, 0);
  const totalStops = currentPlan.days.reduce((acc, d) => acc + d.activities.length, 0);

  const tripSignature = React.useMemo(() => {
    const sDate = formData?.start_date || plan.days[0]?.date || 'nodate';
    const eDate = formData?.end_date || plan.days[plan.days.length - 1]?.date || 'nodate';
    const numDays = plan.days.length;
    const people = formData?.people_count || plan.hotel_summary?.people_accommodated || 1;
    const budget = formData?.budget_inr || plan.total_cost_inr;
    const pace = formData?.pace || plan.fatigue_report?.overall_pace?.toLowerCase() || 'bal';
    const mode = formData?.transport_mode || plan.transport_mode;
    const variant = plan.variant_type.toLowerCase();
    const dest = destination.toLowerCase().trim();
    const orig = (formData?.origin_city || plan.intercity_transport?.origin_city || 'local').toLowerCase().trim();
    const startLoc = (formData?.start_location || '').toLowerCase().trim();
    const group = (formData?.group_profile || 'general').toLowerCase();
    const originType = (formData?.origin_type || 'city_center').toLowerCase();
    const interests = (formData?.interests || []).slice().sort().join(',');
    const locked = (formData?.locked_activities || []).slice().sort().join(',');
    return `${dest}_from_${orig}_${originType}_${sDate}_to_${eDate}_${numDays}d_${people}p_b${budget}_${pace}_${mode}_${group}_loc${startLoc}_int[${interests}]_lock[${locked}]_${variant}`;
  }, [destination, formData, plan]);

  const storageKey = `tripweave_expenses_${tripSignature}`;

  // Load persisted expenses from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setVisitedActivities(JSON.parse(saved));
      } else {
        setVisitedActivities({});
      }
    } catch {
      // localStorage error fallback
    }
  }, [storageKey]);

  const updateVisitedActivities = (nextVal: Record<string, { visited: boolean; actualCost: number }>) => {
    setVisitedActivities(nextVal);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextVal));
      } catch {
        // ignore
      }
    }
  };

  const toggleActivityVisited = (placeName: string, defaultCost: number) => {
    const current = visitedActivities[placeName];
    let next: Record<string, { visited: boolean; actualCost: number }>;
    if (current?.visited) {
      next = { ...visitedActivities };
      delete next[placeName];
    } else {
      next = {
        ...visitedActivities,
        [placeName]: { visited: true, actualCost: defaultCost }
      };
    }
    updateVisitedActivities(next);
  };

  const activeActivitiesMap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const day of currentPlan.days) {
      day.activities.forEach((act, activityIndex) => {
        map.set(`${day.day_number}:${act.place_id || act.place_name}:${activityIndex}`, act.estimated_cost_inr);
      });
    }
    return map;
  }, [currentPlan]);

  const totalActualSpent = Object.entries(visitedActivities).reduce((acc, [name, curr]) => {
    if (curr.visited && activeActivitiesMap.has(name)) {
      return acc + curr.actualCost;
    }
    return acc;
  }, 0);

  const totalVisitedCount = Object.entries(visitedActivities).filter(
    ([name, v]) => v.visited && activeActivitiesMap.has(name)
  ).length;

  const totalEstimatedForVisited = Object.entries(visitedActivities).reduce((acc, [activityKey, val]) => {
    if (!val.visited) return acc;
    const est = activeActivitiesMap.get(activityKey);
    if (est !== undefined) return acc + est;
    return acc;
  }, 0);

  const remainingBudget = currentPlan.total_cost_inr - totalActualSpent;

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('dest', destination.toLowerCase());
      const startDate = formData?.start_date || currentPlan.days[0]?.date;
      if (startDate) {
        url.searchParams.set('start', startDate);
      }
      const endDate = formData?.end_date || currentPlan.days[currentPlan.days.length - 1]?.date;
      if (endDate) {
        url.searchParams.set('end', endDate);
      }
      url.searchParams.set('mode', formData?.transport_mode || currentPlan.transport_mode);
      const origin = formData?.origin_city || currentPlan.intercity_transport?.origin_city;
      if (origin) {
        url.searchParams.set('origin', origin.toLowerCase());
      }
      if (currentPlan.variant_type) {
        url.searchParams.set('variant', currentPlan.variant_type.toLowerCase());
      }
      const people = formData?.people_count || currentPlan.hotel_summary?.people_accommodated || 2;
      url.searchParams.set('people', people.toString());
      const budget = formData?.budget_inr || currentPlan.total_cost_inr;
      url.searchParams.set('budget', budget.toString());
      const pace = formData?.pace || currentPlan.fatigue_report?.overall_pace?.toLowerCase() || 'balanced';
      url.searchParams.set('pace', pace);
      if (formData?.group_profile) {
        url.searchParams.set('profile', formData.group_profile);
      }
      if (formData?.origin_type) {
        url.searchParams.set('origin_type', formData.origin_type);
      }
      if (formData?.start_location) {
        url.searchParams.set('start_location', formData.start_location);
      }
      if (formData?.interests && formData.interests.length > 0) {
        url.searchParams.set('interests', formData.interests.join(','));
      }
      if (formData?.locked_activities && formData.locked_activities.length > 0) {
        url.searchParams.set('pins', formData.locked_activities.join(','));
      }
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.error('Failed to copy share link:', err);
    }
  };

  const handleCopyText = async () => {
    try {
      const text = formatItineraryForShare(currentPlan, destination);
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleExportIcs = () => {
    exportToIcs(currentPlan, destination);
  };

  const visibleDays = selectedDay === 'all' 
    ? currentPlan.days 
    : currentPlan.days.filter(d => d.day_number === selectedDay);

  return (
    <div className="space-y-6">
      {/* Modification & Version History Banner */}
      {planHistory.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-lg text-xs text-amber-200 animate-fade-in">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">Customized Itinerary State</span>
              <span className="text-[11px] text-amber-300/80">
                You have made {planHistory.length} local edit(s). Updated on-ground subtotal: <strong>₹{currentPlan.total_cost_inr.toLocaleString('en-IN')}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#161922] hover:bg-[#1e2230] border border-[#222736] text-gray-200 text-xs font-semibold transition-all active:scale-95 shadow-sm"
              title="Undo last customizer action"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Undo ({planHistory.length})</span>
            </button>
            {onReoptimize && (
              <button
                type="button"
                onClick={() => {
                  const pinnedNames: string[] = [];
                  currentPlan.days.forEach(d => {
                    d.activities.forEach(a => {
                      if (a.is_locked) pinnedNames.push(a.place_id || a.place_name);
                    });
                  });
                  onReoptimize(pinnedNames);
                }}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95"
                title="Send pinned constraints back to OR-Tools solver for a globally reconciled plan"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-solve with Pinned</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action Toolbar: Calendar Export & Share */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11131b] border border-[#1e2230] rounded-2xl p-4 shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">{currentPlan.plan_name}</h3>
            <p className="text-[11px] text-gray-400">
              {currentPlan.days.length} Days • ₹{currentPlan.total_cost_inr.toLocaleString('en-IN')} Total Subtotal
              {currentPlan.fatigue_report?.overall_pace && ` • ${currentPlan.fatigue_report.overall_pace}`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleExportIcs}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#161922] hover:bg-[#1e2230] border border-[#222736] hover:border-gray-500 text-gray-200 text-xs font-semibold transition-all shadow-sm active:scale-95"
            title="Download standard .ics file for Google Calendar, Apple Calendar, or Outlook"
          >
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Export .ics</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95"
            title="Copy shareable browser URL with trip parameters"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-black" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5 text-black" />
                <span>Share Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#161922] hover:bg-[#1e2230] border border-[#222736] hover:border-gray-500 text-gray-200 text-xs font-semibold transition-all shadow-sm active:scale-95"
            title="Copy formatted text itinerary to clipboard"
          >
            {copiedText ? (
              <>
                <Check className="w-3.5 h-3.5 text-amber-400" />
                <span>Text Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                <span>Copy Text</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stat Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#11131b] border border-[#1e2230] rounded-xl p-3.5 shadow-md">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Grand Total</span>
          <span className="text-xl font-extrabold text-amber-400">₹{currentPlan.total_cost_inr.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5">All lodgings, transit & tickets</span>
        </div>

        <div className="bg-[#11131b] border border-[#1e2230] rounded-xl p-3.5 shadow-md">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Total Sightseeing</span>
          <span className="text-xl font-extrabold text-white">₹{totalActivitiesCost.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5">{totalStops} scheduled attractions</span>
        </div>

        <div className="bg-[#11131b] border border-[#1e2230] rounded-xl p-3.5 shadow-md">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Transit Matrix</span>
          <span className="text-xl font-extrabold text-white">₹{currentPlan.estimated_transport_cost_inr.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5 capitalize">{currentPlan.transport_mode} routes</span>
        </div>

        <div className="bg-[#11131b] border border-[#1e2230] rounded-xl p-3.5 shadow-md">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Lodging</span>
          <span className="text-xl font-extrabold text-white">₹{(hotel?.total_cost_inr || 0).toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5">{hotel ? `${hotel.nights} night(s)` : 'Day Trip'}</span>
        </div>
      </div>

      {/* Blueprint Section 1 & Product Spec Feature 1: Inter-City Transit Intelligence */}
      {plan.intercity_transport && (
        <div className="bg-[#11131b] border border-amber-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2230] gap-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                {plan.intercity_transport.recommended_option.mode === 'flight' ? (
                  <Plane className="w-5 h-5" />
                ) : plan.intercity_transport.recommended_option.mode === 'train' ? (
                  <Train className="w-5 h-5" />
                ) : (
                  <Car className="w-5 h-5" />
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  Inter-City Transit Intelligence
                </span>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>{plan.intercity_transport.origin_city}</span>
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                  <span>{plan.intercity_transport.destination_city}</span>
                </h3>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                {plan.intercity_transport.recommended_option.recommendation_badge || 'Recommended Option'}
              </span>
            </div>
          </div>

          {/* Recommended Route Detail */}
          <div className="bg-[#161922] border border-[#222736] rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    Outbound
                  </span>
                  <span className="font-bold text-sm text-white">
                    {plan.intercity_transport.recommended_option.operator_name}
                  </span>
                  {plan.intercity_transport.recommended_option.service_number && (
                    <span className="text-[11px] text-gray-400 bg-[#11131b] px-1.5 py-0.5 rounded border border-[#222736]">
                      #{plan.intercity_transport.recommended_option.service_number}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {plan.intercity_transport.recommended_option.departure_station} ➔ {plan.intercity_transport.recommended_option.arrival_station}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Schedule Window: {plan.intercity_transport.recommended_option.departure_window}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-base font-extrabold text-amber-400 block">
                  ₹{plan.intercity_transport.recommended_option.typical_fare_min.toLocaleString('en-IN')} - ₹{plan.intercity_transport.recommended_option.typical_fare_max.toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] text-gray-400 block">
                  {plan.intercity_transport.recommended_option.fare_class} • {Math.floor(plan.intercity_transport.recommended_option.typical_duration_min / 60)}h {plan.intercity_transport.recommended_option.typical_duration_min % 60 > 0 ? `${plan.intercity_transport.recommended_option.typical_duration_min % 60}m` : ''}
                </span>
              </div>
            </div>

            {/* Return Leg Detail */}
            {plan.intercity_transport.return_option && (
              <div className="pt-3 border-t border-[#222736] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                      Return Leg
                    </span>
                    <span className="font-bold text-sm text-white">
                      {plan.intercity_transport.return_option.operator_name}
                    </span>
                    {plan.intercity_transport.return_option.service_number && (
                      <span className="text-[11px] text-gray-400 bg-[#11131b] px-1.5 py-0.5 rounded border border-[#222736]">
                        #{plan.intercity_transport.return_option.service_number}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 bg-[#11131b] px-1.5 py-0.5 rounded border border-[#222736]">
                      Indicative Schedule Benchmark
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {plan.intercity_transport.return_option.departure_station} ➔ {plan.intercity_transport.return_option.arrival_station}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Schedule Window: {plan.intercity_transport.return_option.departure_window}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-base font-extrabold text-cyan-400 block">
                    ₹{plan.intercity_transport.return_option.typical_fare_min.toLocaleString('en-IN')} - ₹{plan.intercity_transport.return_option.typical_fare_max.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] text-gray-400 block">
                    {plan.intercity_transport.return_option.fare_class} • {Math.floor(plan.intercity_transport.return_option.typical_duration_min / 60)}h {plan.intercity_transport.return_option.typical_duration_min % 60 > 0 ? `${plan.intercity_transport.return_option.typical_duration_min % 60}m` : ''}
                  </span>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-300 leading-relaxed bg-[#11131b] p-3 rounded-lg border border-[#1e2230]">
              {plan.intercity_transport.transit_advice}
            </div>

            {/* Inbound & Return Destination Last-Mile Transfers */}
            <div className="space-y-2">
              {plan.intercity_transport.last_mile && (
                <div className="flex items-start space-x-2.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-400 block mb-0.5">Arrival Transfer (Inbound Terminal ➔ Hotel):</span>
                    <span>{plan.intercity_transport.last_mile.guidance}</span>
                  </div>
                </div>
              )}

              {plan.intercity_transport.return_last_mile && (
                <div className="flex items-start space-x-2.5 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-cyan-400 block mb-0.5">Departure Transfer (Hotel ➔ Return Terminal):</span>
                    <span>{plan.intercity_transport.return_last_mile.guidance}</span>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-500 italic px-1">
                * Note: Destination transfers only. Home-city local transfers between traveler origin residence and departure terminal are excluded.
              </p>
            </div>

            {/* Indicative Roundtrip Travel & Outlay Breakdown */}
            {(() => {
              const party = plan.hotel_summary?.people_accommodated || 1;
              const outbound = plan.intercity_transport.recommended_option;
              const returnOpt = plan.intercity_transport.return_option;
              
              // Actual return leg rates if available, otherwise outbound rates
              const retFareMin = returnOpt ? returnOpt.typical_fare_min : outbound.typical_fare_min;
              const retFareMax = returnOpt ? returnOpt.typical_fare_max : outbound.typical_fare_max;
              
              // Roundtrip transit: Outbound party fare + Return party fare
              const outboundTransitMin = outbound.typical_fare_min * party;
              const outboundTransitMax = outbound.typical_fare_max * party;
              const returnTransitMin = retFareMin * party;
              const returnTransitMax = retFareMax * party;
              const roundtripTransitMin = outboundTransitMin + returnTransitMin;
              const roundtripTransitMax = outboundTransitMax + returnTransitMax;

              // Last-mile transfers: Outbound arrival to hotel + return departure to terminal
              const outboundLastMileCost = plan.intercity_transport.last_mile?.estimated_cost_inr || 0;
              const returnLastMileCost = plan.intercity_transport.return_last_mile?.estimated_cost_inr;
              const roundtripLastMile = outboundLastMileCost + (returnLastMileCost ?? 0);

              // Direct On-Ground + Transit subtotal (base committed outlay)
              const baseDirectMin = plan.total_cost_inr + roundtripTransitMin + roundtripLastMile;
              const baseDirectMax = plan.total_cost_inr + roundtripTransitMax + roundtripLastMile;

              // Meal allowance integration from expense breakdown
              const mealAllowance = plan.expense_breakdown?.additional_meals_inr ?? Math.max(
                0,
                (plan.expense_breakdown?.suggested_meals_inr ?? plan.expense_breakdown?.estimated_meals_inr ?? 0) - (plan.expense_breakdown?.dining_inr ?? 0)
              );
              const projectedTotalMin = baseDirectMin + mealAllowance;
              const projectedTotalMax = baseDirectMax + mealAllowance;

              return (
                <div className="bg-[#11131b] border border-amber-500/20 rounded-lg p-3.5 text-xs space-y-3 mt-2">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="font-bold text-amber-400">Indicative Roundtrip Outlay (Party of {party})</span>
                        <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-medium">
                          Curated Non-Live Baseline
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 block mt-1">
                        Outbound: {outbound.operator_name} (₹{outbound.typical_fare_min.toLocaleString('en-IN')}) 
                        {returnOpt ? ` • Return: ${returnOpt.operator_name} (₹${retFareMin.toLocaleString('en-IN')})` : ' • Return leg mirrors outbound'}
                      </span>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-sm font-extrabold text-white block">
                        ₹{projectedTotalMin.toLocaleString('en-IN')} - ₹{projectedTotalMax.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-amber-400/90 block font-semibold">
                        Total Projected Outlay (incl. Meals)
                      </span>
                      <span className="text-[10px] text-gray-500 block">
                        Base Direct Outlay: ₹{baseDirectMin.toLocaleString('en-IN')} - ₹{baseDirectMax.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  {/* 4-Column Breakdown Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1e2230] text-[10px] text-gray-400">
                    <div>
                      <span className="text-gray-500 block">On-Ground Subtotal</span>
                      <span className="font-semibold text-gray-200">₹{plan.total_cost_inr.toLocaleString('en-IN')}</span>
                      <span className="text-[9px] text-gray-500 block">Sightseeing & Hotel</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Roundtrip Transit (x{party})</span>
                      <span className="font-semibold text-gray-200">₹{roundtripTransitMin.toLocaleString('en-IN')} - ₹{roundtripTransitMax.toLocaleString('en-IN')}</span>
                      <span className="text-[9px] text-gray-500 block">2-way {outbound.mode.toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Destination Transfers</span>
                      <span className="font-semibold text-gray-200">₹{roundtripLastMile.toLocaleString('en-IN')}</span>
                      <span className="text-[9px] text-gray-500 block">Inbound (₹{outboundLastMileCost}) + Return ({returnLastMileCost === undefined ? 'unavailable' : `₹${returnLastMileCost}`})</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Estimated Meals Buffer</span>
                      <span className="font-semibold text-amber-300">~₹{mealAllowance.toLocaleString('en-IN')}</span>
                      <span className="text-[9px] text-gray-500 block">Additional allowance after itinerary dining</span>
                    </div>
                  </div>

                  {/* Static Data & Rate Variability Disclaimer */}
                  <div className="text-[10px] text-gray-400/80 bg-[#161922] p-2.5 rounded-lg border border-[#222736] leading-relaxed space-y-1">
                    <p>
                      ⚠️ <span className="font-semibold text-gray-300">Rate & Availability Notice:</span> Transit fares and operator schedules are derived from curated standard timetable benchmarks (status: <em>indicative_schedule</em>). Actual prices depend on live booking windows, IRCTC Tatkal / airline dynamic surge pricing, peak seasonal dates, and local government taxes. Ticket availability is subject to booking at operator portals.
                    </p>
                    <p className="text-gray-500">
                      📍 <span className="font-semibold text-gray-400">Transfer Scope:</span> Calculated transfers cover destination terminal-to-hotel legs only. Local origin-city transfers between traveler residence and origin hub are excluded.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Toggle All Inter-City Options */}
          {plan.intercity_transport.all_options.length > 1 && (
            <div>
              <button
                type="button"
                onClick={() => setShowAllTransit(!showAllTransit)}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 inline-flex items-center space-x-1.5 transition-colors"
              >
                <span>{showAllTransit ? 'Hide' : 'Compare All'} {plan.intercity_transport.all_options.length} Inter-City Options (Train, Bus, Flight)</span>
                {showAllTransit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showAllTransit && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-3">
                  {plan.intercity_transport.all_options.map((opt, idx) => (
                    <div key={idx} className="bg-[#161922] border border-[#222736] rounded-xl p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{opt.operator_name}</span>
                        <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {opt.mode}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">{opt.departure_station} ➔ {opt.arrival_station}</p>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#222736]">
                        <span className="text-gray-300">
                          {Math.floor(opt.typical_duration_min / 60)}h {opt.typical_duration_min % 60}m • {opt.fare_class}
                        </span>
                        <span className="font-bold text-white">₹{opt.typical_fare_min} - ₹{opt.typical_fare_max}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hotel Centroid Decision Card */}
      {hotel && (
        <div className="bg-[#11131b] border border-amber-500/20 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#1e2230] mb-4 gap-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Centroid-Optimized Base</span>
                <h3 className="text-base font-bold text-white">{hotel.hotel_name}</h3>
              </div>
            </div>

            <div className="flex items-baseline space-x-2 text-right">
              <span className="text-sm font-bold text-white">
                ₹{(hotel.price_per_night_per_room || hotel.cost_per_night_inr || 0).toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-gray-400">/ room / night</span>
              <span className="text-xs text-gray-500">• {hotel.rooms_needed} room(s)</span>
            </div>
          </div>

          {hotel.why_this_hotel && (
            <div className="bg-[#161922] border border-[#222736] rounded-xl p-3.5 text-xs text-gray-300 flex items-start space-x-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-400">Why this hotel was selected: </span>
                <span className="text-gray-300 leading-relaxed">{hotel.why_this_hotel}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stage 8: Independent Verification & Real-World Physics Audit */}
      {plan.verification_report && (
        <div className="bg-[#11131b] border border-emerald-500/20 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2230] gap-2 mb-3">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <h4 className="font-bold text-sm text-white">Independent Physics & Feasibility Audit</h4>
                <p className="text-[11px] text-gray-400">Deterministic audit against opening hours, traffic physics & budget limits (Curated Seed Data)</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                Score: {plan.verification_report.audit_score}/100 Validated
              </span>
            </div>
          </div>

          {/* Operational Metrics */}
          {plan.verification_report.metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {Object.entries(plan.verification_report.metrics).map(([key, val]) => (
                <div key={key} className="bg-[#161922] border border-[#222736] rounded-lg p-2 text-center">
                  <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs font-bold text-white mt-0.5 block">{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Checks Passed Pills */}
          <div className="flex flex-wrap gap-1.5">
            {plan.verification_report.checks_passed.map((chk, idx) => (
              <span key={idx} className="inline-flex items-center space-x-1 text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>{chk}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Feature 2: Smart Expense Simulator & Category Allocation */}
      {plan.expense_breakdown && (
        <div className="bg-[#11131b] border border-[#1e2230] rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2230] gap-2">
            <div className="flex items-center space-x-2.5">
              <Wallet className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="font-bold text-sm text-white">Smart On-Ground Budget Allocation & Expense Reconciliation</h4>
                <p className="text-[11px] text-gray-400">Reconciled on-ground plan: Direct Subtotal + Unallocated Amount = Target On-Ground Budget</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">On-Ground Budget: </span>
              <span className="text-sm font-bold text-amber-400">₹{plan.expense_breakdown.total_inr.toLocaleString('en-IN')}</span>
              <span className="text-[10px] text-gray-500 block">₹{plan.expense_breakdown.per_person_inr.toLocaleString('en-IN')} / traveler</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="bg-[#161922] border border-[#222736] rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Lodging</span>
              <span className="text-sm font-bold text-white mt-0.5 block">₹{plan.expense_breakdown.lodging_inr.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[#161922] border border-[#222736] rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Local Transit</span>
              <span className="text-sm font-bold text-white mt-0.5 block">₹{plan.expense_breakdown.transit_inr.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[#161922] border border-[#222736] rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">Sightseeing</span>
              <span className="text-sm font-bold text-white mt-0.5 block">₹{plan.expense_breakdown.activities_inr.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[#161922] border border-[#222736] rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">
                {plan.expense_breakdown.dining_inr && plan.expense_breakdown.dining_inr > 0 ? 'Dining (Itinerary)' : 'Est. Dining'}
              </span>
              <span className="text-sm font-bold text-white mt-0.5 block">
                ₹{((plan.expense_breakdown.dining_inr && plan.expense_breakdown.dining_inr > 0) ? plan.expense_breakdown.dining_inr : plan.expense_breakdown.suggested_meals_inr || plan.expense_breakdown.estimated_meals_inr).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-[#161922] border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-semibold text-emerald-400 block tracking-wider">Unallocated</span>
              <span className="text-sm font-bold text-emerald-300 mt-0.5 block">₹{(plan.expense_breakdown.unallocated_buffer_inr ?? plan.expense_breakdown.buffer_inr).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Reconciled Accounting Status Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#161922] border border-[#222736] rounded-xl px-4 py-2.5 text-xs gap-2">
            <div className="flex items-center space-x-2 text-gray-300">
              <span className="font-semibold text-white">Direct Subtotal:</span>
              <span className="text-amber-400 font-bold">₹{(plan.expense_breakdown.direct_subtotal_inr ?? plan.total_cost_inr).toLocaleString('en-IN')}</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-400">Meals Guidance:</span>
              <span className="text-gray-200">₹{(plan.expense_breakdown.suggested_meals_inr ?? plan.expense_breakdown.estimated_meals_inr).toLocaleString('en-IN')}</span>
            </div>
            {plan.expense_breakdown.meal_buffer_status && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                plan.expense_breakdown.meal_buffer_status.toLowerCase().includes('sufficient')
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
              }`}>
                {plan.expense_breakdown.meal_buffer_status}
              </span>
            )}
          </div>

          {plan.intercity_transport && (
            <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2 leading-relaxed flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-semibold text-white">On-Ground Budget Scope:</span> Your ₹{(formData?.budget_inr ?? plan.expense_breakdown.budget_limit_inr ?? (plan.expense_breakdown.direct_subtotal_inr ?? plan.total_cost_inr)).toLocaleString('en-IN')} cap constrains the on-ground subtotal, including scheduled dining. The remaining buffer is ₹{(plan.expense_breakdown.unallocated_buffer_inr ?? plan.expense_breakdown.buffer_inr).toLocaleString('en-IN')}; extra meal estimates are advisory and may exceed it.
              </div>
              <span className="text-[10px] bg-[#11131b] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 font-medium">
                Inter-City Travel is Additive
              </span>
            </div>
          )}
        </div>
      )}

      {/* Day by Day Itinerary */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
            <Compass className="w-5 h-5 text-amber-400" />
            <span>Optimized Daily Schedule</span>
          </h3>

          {/* Day Filter Pills */}
          <div className="flex items-center space-x-1 bg-[#161922] border border-[#222736] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onSelectDay?.('all')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                selectedDay === 'all'
                  ? 'bg-amber-500 text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              All Days
            </button>
            {plan.days.map(d => (
              <button
                key={d.day_number}
                type="button"
                onClick={() => onSelectDay?.(d.day_number)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  selectedDay === d.day_number
                    ? 'bg-amber-500 text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Day {d.day_number}
              </button>
            ))}
          </div>
        </div>

        {visibleDays.map(day => (
          <div 
            key={day.day_number}
            className="bg-[#11131b] border border-[#1e2230] rounded-2xl p-5 shadow-lg space-y-4"
          >
            {/* Day Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#1e2230] gap-2">
              <div className="flex items-center space-x-3">
                <div className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-sm">
                  Day {day.day_number}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    {day.day_of_week ? `${day.day_of_week} • ${day.date}` : `Day ${day.day_number} Route`}
                  </h4>
                  {day.cluster_name && (
                    <div className="flex items-center space-x-1.5 text-[11px] text-gray-400 mt-0.5">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-sky-400 font-medium">Cluster: {day.cluster_name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Weather Pill */}
                {day.weather && (
                  <div 
                    className={`inline-flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-lg border font-medium ${
                      day.weather.heat_advisory 
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : day.weather.precipitation_probability_pct > 30
                        ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                        : 'bg-[#161922] border-[#222736] text-gray-300'
                    }`}
                    title={day.weather.advisory_text}
                  >
                    {day.weather.precipitation_probability_pct > 30 ? (
                      <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                    ) : day.weather.heat_advisory ? (
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <CloudSun className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>{day.weather.max_temp_c.toFixed(0)}°C • {day.weather.condition}</span>
                    {day.weather.precipitation_probability_pct > 0 && (
                      <span className="text-[10px] text-gray-400">({day.weather.precipitation_probability_pct}% rain)</span>
                    )}
                    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                      day.weather.is_forecast 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    }`} title={day.weather.is_forecast ? 'Live Open-Meteo meteorological forecast' : 'Seasonal historical climate model'}>
                      {day.weather.is_forecast ? 'Live Forecast' : 'Climate'}
                    </span>
                  </div>
                )}

                {day.fatigue_level && (
                  <span className="inline-flex items-center space-x-1 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                    <Activity className="w-3 h-3 text-amber-400" />
                    <span>{day.fatigue_level} ({day.fatigue_score}/100)</span>
                  </span>
                )}
                <div className="text-xs font-semibold text-gray-400">
                  Day Tickets: <span className="text-white">₹{day.day_cost_inr.toLocaleString('en-IN')}</span>
                </div>

                {/* Live In-Trip Rebalancer Trigger Button */}
                <button
                  type="button"
                  onClick={() => setRebalanceDayNumber(day.day_number)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-all active:scale-95 shadow-sm hover:border-amber-400"
                  title="Feeling fatigued, running late, or heat exhausted? Dynamically rebalance remaining stops with rest buffers."
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                  <span>I&apos;m Tired / Rebalance</span>
                </button>
              </div>
            </div>

            {/* Activities Timeline */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#222736]">
              {day.activities.map((act, actIdx) => {
                const actKey = `${day.day_number}:${act.place_id || act.place_name}:${actIdx}`;
                const visitInfo = visitedActivities[actKey];
                const isVisited = !!visitInfo?.visited;
                const actSpend = visitInfo?.actualCost ?? act.estimated_cost_inr;

                return (
                <div key={actIdx} className="relative group">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full border-2 border-[#11131b] transition-transform ${
                    isVisited ? 'bg-emerald-400 scale-125' : 'bg-amber-500 group-hover:scale-125'
                  }`}></div>

                  <div className={`border rounded-xl p-4 transition-colors ${
                    isVisited ? 'bg-[#131822] border-emerald-500/40' : 'bg-[#161922] border-[#222736] hover:border-gray-600'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                      <div className="flex items-center space-x-2 flex-wrap">
                        {/* Check-off Button */}
                        <button
                          type="button"
                          onClick={() => toggleActivityVisited(actKey, act.estimated_cost_inr)}
                          className={`p-1 rounded-md border transition-all ${
                            isVisited 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm' 
                              : 'bg-[#11131b] text-gray-500 border-[#222736] hover:text-gray-300'
                          }`}
                          title={isVisited ? "Mark as unvisited" : "Check off activity & log actual spend"}
                        >
                          {isVisited ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : <Square className="w-3.5 h-3.5" />}
                        </button>

                        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                          {act.start_time} - {act.end_time}
                        </span>
                        <h5 className={`font-bold text-sm ${isVisited ? 'text-gray-300 line-through' : 'text-white'}`}>
                          {act.place_name}
                        </h5>
                        {act.is_locked && (
                          <span className="text-[10px] text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold inline-flex items-center space-x-0.5">
                            <Pin className="w-2.5 h-2.5 mr-0.5" />
                            <span>Pinned</span>
                          </span>
                        )}
                        {act.place_type === 'restaurant' && (
                          <span className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5">
                            <Utensils className="w-2.5 h-2.5 mr-0.5" />
                            <span>Dining</span>
                          </span>
                        )}
                        {act.verification_status && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5" title={`Audited: ${act.last_verified_date || '2026'}`}>
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                            <span>Verified</span>
                          </span>
                        )}
                        {act.crowd_forecast && (
                          <span 
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-1 ${
                              act.crowd_forecast.level === 'Low'
                                ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                                : act.crowd_forecast.level === 'Moderate'
                                ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                                : 'text-orange-400 bg-orange-500/10 border border-orange-500/20'
                            }`}
                            title={act.crowd_forecast.reason}
                          >
                            <Users className="w-2.5 h-2.5 mr-0.5" />
                            <span>{act.crowd_forecast.level} Crowd ({act.crowd_forecast.score})</span>
                          </span>
                        )}
                        {act.detour_cost_inr !== undefined && act.detour_cost_inr !== null && (
                          <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5" title="Blueprint Section 6: Evaluated route detour penalty in rupees">
                            <span>Detour: +₹{act.detour_cost_inr}</span>
                          </span>
                        )}
                        {act.depends_on && act.depends_on.length > 0 && (
                          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5" title={`Prerequisite: Requires visiting ${act.depends_on.join(', ')} first`}>
                            <span>Sequence Linked</span>
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-gray-300">
                        {act.estimated_cost_inr > 0 ? `₹${act.estimated_cost_inr}` : 'Free Entry'}
                      </span>
                    </div>

                    {/* Special Experiences & Golden Hour Badges */}
                    {act.experience_tag && (
                      <div className="mb-2 inline-flex items-center space-x-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>{act.experience_tag}</span>
                      </div>
                    )}

                    {/* Recommended Viewpoint Pro-Tip */}
                    {act.recommended_viewpoint && (
                      <div className="text-xs bg-[#11131b] border border-[#1e2230] rounded-lg p-2.5 text-gray-300 mt-2">
                        <div className="flex items-center space-x-1.5 text-amber-400 font-semibold mb-0.5">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Pro-Tip Vantage Point: {act.recommended_viewpoint.viewpoint_name || act.recommended_viewpoint.name}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 pl-5">{act.recommended_viewpoint.description}</p>
                      </div>
                    )}

                    {/* Interactive Customizer Action Bar */}
                    <div className="mt-3 pt-2.5 border-t border-[#222736] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center space-x-1 sm:space-x-1.5 flex-wrap">
                        {/* Pin / Lock Button */}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(day.day_number, actIdx)}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                            act.is_locked
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                              : 'bg-[#11131b] text-gray-400 border-[#222736] hover:text-white hover:border-gray-600'
                          }`}
                          title={act.is_locked ? "Unpin stop" : "Pin stop (force solver retention)"}
                        >
                          {act.is_locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                          <span>{act.is_locked ? 'Pinned' : 'Pin'}</span>
                        </button>

                        {/* Swap Button */}
                        <button
                          type="button"
                          onClick={() => setModalConfig({
                            isOpen: true,
                            dayNumber: day.day_number,
                            activityIndex: actIdx,
                            initialAction: 'swap'
                          })}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#11131b] text-gray-300 border border-[#222736] hover:border-amber-500/40 hover:text-amber-300 transition-all"
                          title="Swap with candidate place"
                        >
                          <ArrowRightLeft className="w-3 h-3 text-amber-400" />
                          <span>Swap</span>
                        </button>

                        {/* Move to Sunset Button */}
                        <button
                          type="button"
                          onClick={() => setModalConfig({
                            isOpen: true,
                            dayNumber: day.day_number,
                            activityIndex: actIdx,
                            initialAction: 'move_to_sunset'
                          })}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#11131b] text-gray-300 border border-[#222736] hover:border-orange-500/40 hover:text-orange-300 transition-all"
                          title="Schedule for astronomical golden hour"
                        >
                          <Sun className="w-3 h-3 text-orange-400" />
                          <span>Sunset</span>
                        </button>

                        {/* Drop Stop Button */}
                        <button
                          type="button"
                          onClick={() => setModalConfig({
                            isOpen: true,
                            dayNumber: day.day_number,
                            activityIndex: actIdx,
                            initialAction: 'remove'
                          })}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#11131b] text-gray-400 border border-[#222736] hover:border-rose-500/40 hover:text-rose-400 transition-all"
                          title="Drop stop from day schedule"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          <span>Drop</span>
                        </button>
                      </div>

                      <div className="text-[11px] text-gray-500 font-mono">
                        Stop #{actIdx + 1}
                      </div>
                    </div>

                    {/* Feature 2: Smart Interactive Expense Logging per Activity */}
                    {isVisited && (
                      <div className="mt-3 pt-2.5 border-t border-[#222736] flex flex-wrap items-center justify-between gap-2 text-xs bg-[#11131b]/60 px-3 py-2 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-semibold text-emerald-400">Visited</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-400">Logged Spend:</span>
                          {editingSpend === actKey ? (
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                const val = parseFloat(spendInput);
                                if (!isNaN(val)) {
                                  updateVisitedActivities({
                                    ...visitedActivities,
                                    [actKey]: { visited: true, actualCost: Math.max(0, val) }
                                  });
                                }
                                setEditingSpend(null);
                              }}
                              className="flex items-center space-x-1.5"
                            >
                              <span className="text-white font-bold">₹</span>
                              <input
                                type="number"
                                value={spendInput}
                                onChange={(e) => setSpendInput(e.target.value)}
                                className="w-20 px-2 py-0.5 text-xs bg-[#161922] border border-amber-500/50 rounded text-white font-bold"
                                autoFocus
                              />
                              <button type="submit" className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold rounded">
                                Save
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSpend(actKey);
                                setSpendInput(String(actSpend));
                              }}
                              className="text-amber-400 font-bold hover:underline cursor-pointer flex items-center space-x-1"
                              title="Click to edit actual spend"
                            >
                              <span>₹{actSpend.toLocaleString('en-IN')}</span>
                              <span className="text-[10px] text-gray-500 font-normal">(Edit)</span>
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          Budgeted: ₹{act.estimated_cost_inr} • 
                          <span className={actSpend <= act.estimated_cost_inr ? 'text-emerald-400 ml-1' : 'text-rose-400 ml-1'}>
                            {actSpend <= act.estimated_cost_inr ? '✓ Under' : `+₹${actSpend - act.estimated_cost_inr} over`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Blueprint Stage 10 & Spec Feature 1: Why Not X? Candidate Omission Audit */}
      {currentPlan.decision_trace?.excluded_places && currentPlan.decision_trace.excluded_places.length > 0 && (
        <div className="bg-[#11131b] border border-[#1e2230] rounded-2xl p-5 shadow-xl">
          <button
            type="button"
            onClick={() => setShowWhyNot(!showWhyNot)}
            className="w-full flex items-center justify-between text-left transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <HelpCircle className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="font-bold text-sm text-white">Why Not X? Candidate Omission Audit</h4>
                <p className="text-[11px] text-gray-400">
                  {currentPlan.decision_trace.excluded_places.length} attractions evaluated but omitted from this itinerary
                </p>
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-[#161922] border border-[#222736] text-gray-400">
              {showWhyNot ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showWhyNot && (
            <div className="mt-4 pt-4 border-t border-[#1e2230] space-y-3">
              {currentPlan.decision_trace.excluded_places.map((item, idx) => (
                <div key={idx} className="bg-[#161922] border border-[#222736] rounded-xl p-3.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{item.place_name}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                      item.category === 'closed_on_day' 
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        : item.category === 'budget_limit'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        : item.category === 'pace_limit'
                        ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                        : 'bg-gray-500/10 text-gray-300 border border-gray-500/20'
                    }`}>
                      {item.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-gray-300 leading-relaxed">{item.reason}</p>
                  {item.suggested_action && (
                    <div className="text-[11px] text-amber-400/90 pt-1 font-medium">
                      💡 Tip: {item.suggested_action}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transparency Disclaimer */}
      {currentPlan.disclaimer && (
        <div className="text-center text-xs text-gray-500 pt-4 border-t border-[#1e2230]">
          {currentPlan.disclaimer}
        </div>
      )}

      {/* Feature 2: Floating Live Expense Tracker Dashboard */}
      {totalVisitedCount > 0 && (
        <div className="sticky bottom-4 z-40 bg-[#11131b]/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              💰
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Live Expense Tracker</h4>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                  {totalVisitedCount} of {totalStops} Stops Visited
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Actual Logged Spend: <span className="text-white font-bold">₹{totalActualSpent.toLocaleString('en-IN')}</span> • Estimated for visited: <span className="text-gray-300">₹{totalEstimatedForVisited.toLocaleString('en-IN')}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right">
              <span className="text-[10px] text-gray-400 block uppercase font-semibold">Remaining Trip Budget</span>
              <span className={`text-sm font-extrabold ${remainingBudget >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ₹{remainingBudget.toLocaleString('en-IN')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setVisitedActivities({})}
              className="px-2.5 py-1 text-[11px] rounded-lg bg-[#161922] hover:bg-[#1e2230] border border-[#222736] text-gray-400 hover:text-gray-200 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Edit Consequence Modal */}
      {modalConfig && (
        <EditConsequenceModal
          isOpen={modalConfig.isOpen}
          onClose={() => setModalConfig(null)}
          destination={destination}
          plan={currentPlan}
          dayNumber={modalConfig.dayNumber}
          activityIndex={modalConfig.activityIndex}
          initialAction={modalConfig.initialAction}
          peopleCount={formData?.people_count || 1}
          onApplyUpdate={handleApplyDayUpdate}
        />
      )}

      {/* Live In-Trip Rebalancer Modal */}
      {rebalanceDayNumber !== null && (
        <LiveRebalanceModal
          isOpen={rebalanceDayNumber !== null}
          onClose={() => setRebalanceDayNumber(null)}
          destination={destination}
          plan={currentPlan}
          initialDayNumber={rebalanceDayNumber}
          peopleCount={formData?.people_count || 1}
          transportMode={formData?.transport_mode || currentPlan.transport_mode || 'cab'}
          pace={formData?.pace || 'balanced'}
          budgetLimit={formData?.budget_inr || currentPlan.expense_breakdown?.budget_limit_inr || undefined}
          onApplyUpdate={handleApplyRebalancedPlan}
        />
      )}
    </div>
  );
}
