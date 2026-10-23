'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, Compass, Sparkles, Layers,
  ShieldCheck, CheckCircle2, Calendar,
  Copy, Check, Activity, CloudSun,
  CloudRain, Flame, Utensils, Wallet,
  HelpCircle, ChevronDown, ChevronUp, Pin, Link2, Users,
  CheckSquare,
  ArrowRightLeft, Trash2, Sun, Lock, Unlock, RotateCcw, RefreshCw, Zap,
  MapPin
} from 'lucide-react';
import { TripPlan, TripFormData, DayPlan, EditActionType, GroupMember, TripExpenseLedger, ExpenseCategory } from '../types/trip';
import { exportToIcs, formatItineraryForShare } from '../utils/calendarExport';
import { calculateOptimalSettlements } from '../utils/settlement';
import EditConsequenceModal from './EditConsequenceModal';
import LiveRebalanceModal from './LiveRebalanceModal';
import GroupExpenseModal from './GroupExpenseModal';
import { plainPlannerText } from '../lib/planner-copy';
import PlanNotices from './PlanNotices';
import JourneyCostSummary from './JourneyCostSummary';
import TravelImage from './TravelImage';
import StaySummaryCard from './StaySummaryCard';
import IntercityTravel from './IntercityTravel';
import { isUnassignedMeal, timeBetweenStops } from '@/lib/itinerary-presentation';

interface ItineraryViewProps {
  actionsTargetId?: string;
  plan: TripPlan;
  destination?: string;
  selectedDay?: number | 'all';
  onSelectDay?: (day: number | 'all') => void;
  formData?: TripFormData | null;
  onUpdatePlan?: (updatedPlan: TripPlan, changeMeta?: { changeType: 'edit' | 'rebalance'; summary: string }) => void;
  onReoptimize?: (pinnedActivities: string[]) => void;
}

export default function ItineraryView({
  plan,
  actionsTargetId,
  destination = 'City',
  selectedDay = 'all',
  onSelectDay,
  formData,
  onUpdatePlan,
  onReoptimize
}: ItineraryViewProps) {
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setActionsTarget(actionsTargetId ? document.getElementById(actionsTargetId) : null); }, [actionsTargetId]);
  const [activePlan, setActivePlan] = useState<TripPlan>(plan);
  const [planHistory, setPlanHistory] = useState<TripPlan[]>([]);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    dayNumber: number;
    activityIndex: number;
    initialAction: EditActionType;
  } | null>(null);
  const [rebalanceDayNumber, setRebalanceDayNumber] = useState<number | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [initialExpenseToAdd, setInitialExpenseToAdd] = useState<{
    title: string;
    amount: number;
    category: ExpenseCategory;
    activityRef?: string;
  } | null>(null);

  useEffect(() => { setActivePlan(plan); }, [plan]);

  const currentPlan = activePlan;

  const handleApplyDayUpdate = (updatedDay: DayPlan, newPlan?: TripPlan, summaryReason?: string) => {
    setPlanHistory(prev => [...prev, activePlan]);
    if (newPlan) {
      setActivePlan(newPlan);
      onUpdatePlan?.(newPlan, {
        changeType: 'edit',
        summary: summaryReason || `Edited Day ${updatedDay.day_number} schedule`
      });
      return;
    }
    const updatedDays = activePlan.days.map(d => d.day_number === updatedDay.day_number ? updatedDay : d);
    const newTotalActivitiesCost = updatedDays.reduce((acc, d) => acc + d.day_cost_inr, 0);
    const newTotalCost = newTotalActivitiesCost + (activePlan.hotel_summary?.total_cost_inr || 0) + activePlan.estimated_transport_cost_inr;

    const nextPlan: TripPlan = {
      ...activePlan,
      days: updatedDays,
      total_cost_inr: newTotalCost
    };
    setActivePlan(nextPlan);
    onUpdatePlan?.(nextPlan, {
      changeType: 'edit',
      summary: summaryReason || `Updated Day ${updatedDay.day_number} stop`
    });
  };

  const handleApplyRebalancedPlan = (updatedPlan: TripPlan) => {
    setPlanHistory(prev => [...prev, activePlan]);
    setActivePlan(updatedPlan);
    onUpdatePlan?.(updatedPlan, {
      changeType: 'rebalance',
      summary: `Rebalanced Day ${rebalanceDayNumber ?? ''} schedule for traveler fatigue`.trim()
    });
  };

  const handleUndo = () => {
    if (planHistory.length === 0) return;
    const previous = planHistory[planHistory.length - 1];
    setPlanHistory(prev => prev.slice(0, -1));
    setActivePlan(previous);
    onUpdatePlan?.(previous, {
      changeType: 'edit',
      summary: 'Reverted local edit via Undo'
    });
  };

  const handleTogglePin = (dayNum: number, actIdx: number) => {
    const targetDay = activePlan.days.find(d => d.day_number === dayNum);
    if (!targetDay) return;
    const targetAct = targetDay.activities[actIdx];
    const nextLocked = !targetAct?.is_locked;
    const updatedActivities = targetDay.activities.map((a, i) => {
      if (i === actIdx) {
        return { ...a, is_locked: nextLocked };
      }
      return a;
    });
    const updatedDay: DayPlan = { ...targetDay, activities: updatedActivities };
    handleApplyDayUpdate(
      updatedDay,
      undefined,
      `${nextLocked ? 'Pinned' : 'Unpinned'} ${targetAct?.place_name || 'stop'} on Day ${dayNum}`
    );
  };

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showWhyNot, setShowWhyNot] = useState(false);

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

  const ledgerStorageKey = `tripweave_ledger_${tripSignature}`;
  const peopleCount = formData?.people_count || currentPlan.hotel_summary?.people_accommodated || 1;

  const defaultMembers: GroupMember[] = React.useMemo(() => {
    const list: GroupMember[] = [
      { id: 'm_host', name: 'You (Host)' }
    ];
    for (let i = 2; i <= peopleCount; i++) {
      list.push({ id: `m_${i}`, name: `Traveler ${i}` });
    }
    return list;
  }, [peopleCount]);

  const [ledger, setLedger] = useState<TripExpenseLedger>({
    members: defaultMembers,
    expenses: [],
    settlements: []
  });

  // Load persisted ledger from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(ledgerStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.members) && Array.isArray(parsed.expenses)) {
          setLedger(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setLedger({
      members: defaultMembers,
      expenses: [],
      settlements: []
    });
  }, [ledgerStorageKey, defaultMembers]);

  const handleUpdateLedger = (updatedLedger: TripExpenseLedger) => {
    setLedger(updatedLedger);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ledgerStorageKey, JSON.stringify(updatedLedger));
      } catch {
        // ignore
      }
    }
  };

  const pendingSettlements = React.useMemo(() => {
    return calculateOptimalSettlements(ledger.members, ledger.expenses, ledger.settlements);
  }, [ledger]);

  const totalLedgerSpent = React.useMemo(() => {
    return ledger.expenses.reduce((sum, e) => sum + e.amount_inr, 0);
  }, [ledger.expenses]);

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

  const tripActions = (
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <button
            type="button"
            onClick={handleExportIcs}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#eef1e5] hover:bg-[#d6dfd0] border border-[#c6d2c0] hover:border-gray-500 text-[#294333] text-sm font-semibold transition-all shadow-sm active:scale-95"
            title="Download standard .ics file for Google Calendar, Apple Calendar, or Outlook"
          >
            <Calendar className="w-3.5 h-3.5 text-[#89532d]" />
            <span>Add to calendar</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95"
            title="Copies URL query parameters to re-run the planner with these settings (does not share your private saved snapshot)"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-black" />
                <span>Parameters Copied!</span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5 text-black" />
                <span>Copy basic settings link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#eef1e5] hover:bg-[#d6dfd0] border border-[#c6d2c0] hover:border-gray-500 text-[#294333] text-sm font-semibold transition-all shadow-sm active:scale-95"
            title="Copy formatted text itinerary to clipboard"
          >
            {copiedText ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#89532d]" />
                <span>Text Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#526653]" />
                <span>Copy Text</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setInitialExpenseToAdd(null);
              setIsExpenseModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#eef1e5] hover:bg-[#d6dfd0] border border-amber-500/30 hover:border-amber-500/60 text-[#89532d] text-sm font-semibold transition-all shadow-sm active:scale-95"
            title="Open Browser-Local Group Expense Ledger & UPI Split Tracker (stored in this browser only)"
          >
            <Wallet className="w-3.5 h-3.5 text-[#89532d]" />
            <span>Split costs on this device</span>
            {ledger.expenses.length > 0 && (
              <span className="ml-1 text-sm bg-amber-500/20 text-[#89532d] px-1.5 py-0.2 rounded-full font-bold">
                {ledger.expenses.length}
              </span>
            )}
            {pendingSettlements.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title={`${pendingSettlements.length} settlement(s) due`} />
            )}
          </button>
        </div>
  );

  return (
    <div className="itinerary-reader space-y-6">
      <JourneyCostSummary plan={currentPlan} />
      {currentPlan.booked_transport && <section className="rounded-2xl border border-[#d6dfd0] bg-[#fffdf5] p-5" aria-label="Booked travel costs">
        <h3 className="text-xl font-semibold">Your booked travel</h3>
        <p className="my-2">{currentPlan.booked_transport.outbound_mode} outbound · {currentPlan.booked_transport.return_mode} return. User-reported; tickets and payments are unverified.</p>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt>Whole-group roundtrip fare</dt><dd className="text-xl font-semibold">₹{currentPlan.booked_transport.total_fare_inr.toLocaleString('en-IN')}</dd></div>
          <div><dt>Already paid</dt><dd className="text-xl font-semibold">₹{currentPlan.booked_transport.paid_inr.toLocaleString('en-IN')}</dd></div>
          <div><dt>Ticket balance to pay</dt><dd className="text-xl font-semibold">₹{(currentPlan.booked_transport.total_fare_inr - currentPlan.booked_transport.paid_inr).toLocaleString('en-IN')}</dd></div>
        </dl>
        <p className="mt-4">Tickets are additional to the destination subtotal of ₹{currentPlan.total_cost_inr.toLocaleString('en-IN')}. Transfers outside the daily itinerary, extra meals and other uncounted costs still need budgeting.</p>
      </section>}
      {formData?.journey_timing && <section className="rounded-2xl border border-[#d6dfd0] bg-[#fffdf5] p-5" aria-label="Your travel timing">
        <h2 className="text-xl font-semibold">Your travel timing</h2>
        <p className="text-sm text-[#596b57] mt-2">User-supplied · India time (UTC+05:30). These times constrain sightseeing. {currentPlan.booked_transport ? 'Your booked travel is shown separately above.' : 'Any transport suggestions are separate reference options.'}</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {([['outbound_departure', 'Leave origin'], ['destination_arrival', 'Arrive at destination'], ['destination_departure', 'Leave destination'], ['return_arrival', 'Return to origin']] as const).map(([key, label]) => <div key={key}><dt className="text-sm text-[#596b57]">{label}</dt><dd className="font-semibold">{formData.journey_timing![key].slice(0,16).replace('T', ' · ')}</dd></div>)}
        </dl>
        <p className="text-sm mt-4">Separate terminal transfers: {formData.journey_timing.arrival_transfer_minutes ?? 0} minutes on arrival and {formData.journey_timing.departure_transfer_minutes ?? 0} minutes on departure. Additional reserved buffers: {formData.journey_timing.arrival_buffer_minutes} minutes after arrival; {formData.journey_timing.departure_buffer_minutes} minutes before departure. Confirm transfers, tickets and hotel check-in yourself. Intercity fares are excluded from the destination budget.</p>
      </section>}
      {/* Modification & Version History Banner */}
      {planHistory.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-lg text-sm text-amber-200 animate-fade-in">
          <div className="flex items-center space-x-2.5">
            <Sparkles className="w-4 h-4 text-[#89532d] shrink-0" />
            <div>
              <span className="font-bold text-[#243e33] block">Your edited plan</span>
              <span className="text-sm text-[#89532d]/80">
                You have made {planHistory.length} local edit(s). Updated destination cost: <strong>₹{currentPlan.total_cost_inr.toLocaleString('en-IN')}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#eef1e5] hover:bg-[#d6dfd0] border border-[#c6d2c0] text-[#294333] text-sm font-semibold transition-all active:scale-95 shadow-sm"
              title="Undo last customizer action"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#89532d]" />
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
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95"
                title="Build a new plan around your pinned places"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Plan again with my pins</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action Toolbar: Calendar Export & Share */}
      <div className="itinerary-toolbar flex flex-wrap items-center justify-between gap-3 bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-4 shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#89532d]">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-base text-[#243e33]">{currentPlan.plan_name.replace('TripWeave Prototype Itinerary', 'Your trip').replace(' Variant', '')}</h3>
            <p className="text-sm text-[#526653]">
              {currentPlan.days.length} Days • ₹{currentPlan.total_cost_inr.toLocaleString('en-IN')} Estimated destination cost
              {currentPlan.fatigue_report?.overall_pace && ` • ${plainPlannerText(currentPlan.fatigue_report.overall_pace)}`}
            </p>
          </div>
        </div>

        {actionsTarget ? createPortal(tripActions, actionsTarget) : tripActions}
      </div>

      {currentPlan.candidate_summary && <section className="plan-evidence" aria-label="Planning evidence">
        <div><h3>How we picked your stops</h3><p>We compare places with your time, budget and interests. Your pinned places stay required.</p></div>
        <dl className="plan-evidence-counts">
          <div><dt>Places compared</dt><dd>{currentPlan.candidate_summary.total_candidates}</dd></div>
          <div><dt>Places from search</dt><dd>{currentPlan.candidate_summary.confirmed_discovered_candidates}</dd></div>
          <div><dt>With older ratings</dt><dd>{currentPlan.candidate_summary.rated_candidates}</dd></div>
        </dl>
        <details><summary>About the data</summary><p>Older ratings help compare places; missing ratings do not count against a place. {currentPlan.candidate_summary.weather_used_in_ranking ? 'Weather forecasts or seasonal weather also help us choose stops.' : 'Weather data was unavailable and did not affect the choices.'} Check opening hours, prices, food needs and access where marked as estimates.</p><p>{currentPlan.candidate_summary.notes}</p></details>
      </section>}
      {/* Blueprint Section 1 & Product Spec Feature 1: Travel between cities */}
      {plan.intercity_notice && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[#243e33]">{plan.intercity_notice}</p>}
      <IntercityTravel plan={currentPlan} people={formData?.people_count}/>

      <section className="itinerary-stay-costs" aria-label="Stay and estimated costs">
      {/* Hotel Centroid Decision Card */}
      {hotel && <StaySummaryCard hotel={hotel} destination={destination}/>}

      {/* Stat Bar */}
      <div className="itinerary-totals grid grid-cols-2 gap-3">
        <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-xl p-3.5 shadow-md">
          <span className="text-sm font-semibold text-[#526653] uppercase tracking-wider block">Estimated destination cost</span>
          <span className="text-xl font-extrabold text-[#89532d]">₹{currentPlan.total_cost_inr.toLocaleString('en-IN')}</span>
          <span className="text-sm text-[#596b57] block mt-0.5">Stay, local travel and stops. Tickets between cities and prepaid stays cost extra.</span>
        </div>

        <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-xl p-3.5 shadow-md">
          <span className="text-sm font-semibold text-[#526653] uppercase tracking-wider block">Stops & scheduled meals</span>
          <span className="text-xl font-extrabold text-[#243e33]">₹{totalActivitiesCost.toLocaleString('en-IN')}</span>
          <span className="text-sm text-[#596b57] block mt-0.5">{totalStops} scheduled stops</span>
        </div>

        <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-xl p-3.5 shadow-md">
          <span className="text-sm font-semibold text-[#526653] uppercase tracking-wider block">Local travel</span>
          <span className="text-xl font-extrabold text-[#243e33]">₹{currentPlan.estimated_transport_cost_inr.toLocaleString('en-IN')}</span>
          <span className="text-sm text-[#596b57] block mt-0.5 capitalize">{currentPlan.transport_mode} routes</span>
        </div>

        <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-xl p-3.5 shadow-md">
          <span className="text-sm font-semibold text-[#526653] uppercase tracking-wider block">Stay</span>
          <span className="text-xl font-extrabold text-[#243e33]">₹{(hotel?.total_cost_inr || 0).toLocaleString('en-IN')}</span>
          <span className="text-sm text-[#596b57] block mt-0.5">{hotel?.accommodation_kind === 'no_stay' ? 'No accommodation arranged' : hotel?.excluded_prepaid_cost_inr ? 'Prepaid stay shown separately' : hotel ? `${hotel.nights} night(s)` : 'Day Trip'}</span>
        </div>
      </div>

      </section>

      {currentPlan.verification_report && <div className="itinerary-check-summary" role="status">
        <ShieldCheck size={20} aria-hidden="true" /><span>{currentPlan.verification_report.is_valid ? 'Your plan passed our time and budget checks using the available data.' : 'This plan needs attention. Review the schedule checks below.'} Check current prices and opening hours before you go.</span>
      </div>}
      <PlanNotices warnings={currentPlan.verification_report?.warnings} />
      {currentPlan.verification_report?.errors?.map((error, index) => <p key={`error-${index}`} role="alert" className="itinerary-warning">{error}</p>)}
      {/* Day by Day Itinerary */}
      <div className="itinerary-schedule space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-[#243e33] tracking-tight flex items-center space-x-2">
            <Compass className="w-5 h-5 text-[#89532d]" />
            <span>Your day-by-day plan</span>
          </h3>

          {/* Day Filter Pills */}
          <div className="flex items-center space-x-1 bg-[#eef1e5] border border-[#c6d2c0] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onSelectDay?.('all')}
              className={`px-2.5 py-1 text-sm font-semibold rounded-lg transition-colors ${
                selectedDay === 'all'
                  ? 'bg-amber-500 text-black'
                  : 'text-[#526653] hover:text-[#243e33]'
              }`}
            >
              All Days
            </button>
            {plan.days.map(d => (
              <button
                key={d.day_number}
                type="button"
                onClick={() => onSelectDay?.(d.day_number)}
                className={`px-2.5 py-1 text-sm font-semibold rounded-lg transition-colors ${
                  selectedDay === d.day_number
                    ? 'bg-amber-500 text-black'
                    : 'text-[#526653] hover:text-[#243e33]'
                }`}
              >
                Day {d.day_number}
              </button>
            ))}
          </div>
        </div>

        <div className="itinerary-days-grid">
        {visibleDays.map(day => (
          <div
            key={day.day_number}
            className="itinerary-day bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-5 space-y-4"
          >
            {/* Day Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#d6dfd0] gap-2">
              <div className="flex items-center space-x-3">
                <div className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[#89532d] font-bold text-base">
                  Day {day.day_number}
                </div>
                <div>
                  <h4 className="font-bold text-base text-[#243e33]">
                    {day.day_of_week ? `${day.day_of_week} • ${day.date}` : `Day ${day.day_number} Route`}
                  </h4>
                  {day.cluster_name && (
                    <div className="flex items-center space-x-1.5 text-sm text-[#526653] mt-0.5">
                      <Layers className="w-3.5 h-3.5 text-sky-800" />
                      <span className="text-sky-800 font-medium">Area: {day.cluster_name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Weather Pill */}
                {day.weather && (
                  <div
                    className={`inline-flex items-center space-x-1.5 text-sm px-2.5 py-1 rounded-lg border font-medium ${
                      day.weather.heat_advisory
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-800'
                        : day.weather.precipitation_probability_pct > 30
                        ? 'bg-sky-500/10 border-sky-500/30 text-sky-800'
                        : 'bg-[#eef1e5] border-[#c6d2c0] text-[#425d4c]'
                    }`}
                    title={day.weather.advisory_text}
                  >
                    {day.weather.precipitation_probability_pct > 30 ? (
                      <CloudRain className="w-3.5 h-3.5 text-sky-800" />
                    ) : day.weather.heat_advisory ? (
                      <Flame className="w-3.5 h-3.5 text-rose-700" />
                    ) : (
                      <CloudSun className="w-3.5 h-3.5 text-[#89532d]" />
                    )}
                    <span>{day.weather.max_temp_c.toFixed(0)}°C • {day.weather.condition}</span>
                    {day.weather.precipitation_probability_pct > 0 && (
                      <span className="text-sm text-[#526653]">({day.weather.precipitation_probability_pct}% rain)</span>
                    )}
                    <span className={`text-sm uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                      day.weather.is_forecast
                        ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
                        : 'bg-gray-500/20 text-[#526653] border border-gray-500/30'
                    }`} title={day.weather.is_forecast ? 'Live Open-Meteo meteorological forecast' : 'Seasonal historical climate model'}>
                      {day.weather.is_forecast ? 'Live Forecast' : 'Climate'}
                    </span>
                  </div>
                )}

                {day.fatigue_level && (
                  <span className="inline-flex items-center space-x-1 text-sm text-[#89532d] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                    <Activity className="w-3 h-3 text-[#89532d]" />
                    <span>{plainPlannerText(day.fatigue_level)} ({day.fatigue_score}/100)</span>
                  </span>
                )}
                <div className="text-sm font-semibold text-[#526653]">
                  Stops & meals: <span className="text-[#243e33]">₹{day.day_cost_inr.toLocaleString('en-IN')}</span>
                </div>

                {/* Live In-Trip Rebalancer Trigger Button */}
                <button
                  type="button"
                  onClick={() => setRebalanceDayNumber(day.day_number)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-[#89532d] border border-amber-500/40 text-sm font-bold transition-all active:scale-95 shadow-sm hover:border-amber-400"
                  title="Need a rest or running late? Adjust your remaining stops."
                >
                  <Zap className="w-3.5 h-3.5 text-[#89532d] fill-amber-400/20" />
                  <span>Make this day easier</span>
                </button>
              </div>
            </div>

            {day.planning_note && day.activities.length > 0 && <p className="itinerary-warning" role="status">{day.planning_note}</p>}
            {day.activities.length > 0 && <p className="day-progress" aria-live="polite">
              {day.activities.filter((act, index) => visitedActivities[`${day.day_number}:${act.place_id || act.place_name}:${index}`]?.visited).length} of {day.activities.length} stops visited
              <span>Tap a numbered circle as you go.</span>
            </p>}
            {/* Activities Timeline */}
            <div className="day-timeline">
              {day.activities.length === 0 && <p className="rounded-xl border border-[#c6d2c0] bg-[#fffdf5] p-4 text-base text-[#304c3b]">{day.planning_note || 'No visits fit this date under the current candidate pool and constraints. Add places or adjust your preferences. Meals and personal expenses may still apply.'}</p>}
              {day.activities.map((act, actIdx) => {
                const actKey = `${day.day_number}:${act.place_id || act.place_name}:${actIdx}`;
                const visitInfo = visitedActivities[actKey];
                const isVisited = !!visitInfo?.visited;
                const actSpend = visitInfo?.actualCost ?? act.estimated_cost_inr;
                const isMealPlaceholder=isUnassignedMeal(act);
                const gap=actIdx>0?timeBetweenStops(day.activities[actIdx-1],act):null;

                return (
                <div key={actIdx} className="itinerary-stop relative group" data-visited={isVisited} data-meal-placeholder={isMealPlaceholder} data-simple-stop={isMealPlaceholder||act.place_type==='rest_break'}>
                  <button
                    type="button"
                    className="stop-completion"
                    aria-pressed={isVisited}
                    aria-label={`${isVisited ? 'Mark unvisited' : 'Mark visited'}: ${act.place_name}`}
                    title={isVisited ? 'Mark as unvisited' : 'Mark as visited and log spend'}
                    onClick={() => toggleActivityVisited(actKey, act.estimated_cost_inr)}
                  >
                    {isVisited ? <CheckSquare size={20} aria-hidden="true" /> : <span>{actIdx + 1}</span>}
                  </button>

                  <div className={`border rounded-xl p-4 transition-colors ${
                    isVisited ? 'bg-[#eef1e5] border-emerald-500/40' : 'bg-[#eef1e5] border-[#c6d2c0] hover:border-gray-600'
                  }`}>
                    {gap!=null&&gap>0&&<p className="stop-gap">{gap} min between stops · travel or free time</p>}
                    <div className="stop-heading">
                      {act.place_type!=='rest_break'&&!isMealPlaceholder&&<TravelImage destination={destination} category={act.place_type==='restaurant'?'food':undefined} placeName={act.place_name} compact className="stop-thumbnail"/>}
                      <div className="stop-identity">

                        <span className="text-sm font-bold text-[#89532d] bg-amber-500/10 px-2 py-0.5 rounded">
                          {act.start_time} - {act.end_time}
                        </span>
                        <h5 className={`font-bold text-base ${isVisited ? 'text-[#425d4c] line-through' : 'text-[#243e33]'}`}>
                          {act.place_name}
                        </h5>

                        {act.formatted_address && (
                          <span className="text-xs text-[#526653] inline-flex items-center gap-0.5">
                            <MapPin className="w-3 h-3 text-[#89532d] shrink-0" />
                            <span>{act.formatted_address}</span>
                          </span>
                        )}
                        {!isMealPlaceholder && act.lat !== undefined && act.lng !== undefined && (
                          <a href={`https://www.openstreetmap.org/?mlat=${act.lat}&mlon=${act.lng}#map=17/${act.lat}/${act.lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#243e33] underline hover:text-[#385e4e] inline-flex items-center gap-0.5">
                            Map ↗
                          </a>
                        )}


                        {!isMealPlaceholder && (act.rating != null && act.rating_evidence ? <span className="text-sm text-[#425d4c]" title={act.rating_evidence}>★ {act.rating.toFixed(2)}/5 · {act.review_count ?? 0} older rating samples</span> : <span className="text-sm text-[#526653]">Rating not available</span>)}
                        {act.meal_type && <span className="text-sm font-semibold text-[#89532d]">{act.meal_type.charAt(0).toUpperCase() + act.meal_type.slice(1)} · {isMealPlaceholder?'time reserved; choose a venue':'restaurant stop'}</span>}
                        {act.is_locked && (
                          <span className="text-sm text-[#89532d] bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold inline-flex items-center space-x-0.5">
                            <Pin className="w-2.5 h-2.5 mr-0.5" />
                            <span>Pinned</span>
                          </span>
                        )}
                        {!isMealPlaceholder && act.place_type === 'restaurant' && (
                          <span className="text-sm text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5">
                            <Utensils className="w-2.5 h-2.5 mr-0.5" />
                            <span>Dining</span>
                          </span>
                        )}
                        {act.verification_status && (
                          <span className="text-sm text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5" title={act.source_reference?.startsWith('User-confirmed') ? act.source_reference : act.last_verified_date ? `Listed review date: ${act.last_verified_date}` : 'No verified review date is available'}>
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                            <span>{act.verification_status === 'verified' ? 'Reviewed data' : act.verification_status === 'curated_seed' ? 'Planning estimate' : 'Estimated data'}</span>
                          </span>
                        )}
                        {!isMealPlaceholder && act.crowd_forecast && (
                          <span
                            className={`text-sm px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-1 ${
                              act.crowd_forecast.level === 'Low'
                                ? 'text-emerald-700 bg-emerald-500/10 border border-emerald-500/20'
                                : act.crowd_forecast.level === 'Moderate'
                                ? 'text-[#89532d] bg-amber-500/10 border border-amber-500/20'
                                : 'text-orange-400 bg-orange-500/10 border border-orange-500/20'
                            }`}
                            title={act.crowd_forecast.reason}
                          >
                            <Users className="w-2.5 h-2.5 mr-0.5" />
                            <span>{act.crowd_forecast.level} Crowd ({act.crowd_forecast.score})</span>
                          </span>
                        )}
                        {!isMealPlaceholder && act.detour_cost_inr !== undefined && act.detour_cost_inr !== null && (
                          <span className="text-sm text-sky-800 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5" title="Estimated extra travel cost for this stop">
                            <span>Detour: +₹{act.detour_cost_inr}</span>
                          </span>
                        )}
                        {act.depends_on && act.depends_on.length > 0 && (
                          <span className="text-sm text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-0.5" title={`Prerequisite: Requires visiting ${act.depends_on.join(', ')} first`}>
                            <span>Sequence Linked</span>
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-[#425d4c]">
                        {act.estimated_cost_inr > 0 ? `₹${act.estimated_cost_inr.toLocaleString('en-IN')} · group estimate` : '₹0 planned · estimate'}
                      </span>
                    </div>

                    {!isMealPlaceholder && <p className="stop-reason">{act.is_locked?'Your must-visit choice.':act.meal_type?'Meal time included in your schedule.':currentPlan.verification_report?.is_valid?'Fits this day’s route, time and budget using the listed estimates.':'Scheduled using the listed estimates; review plan checks.'}</p>}
                    {act.rating_evidence && <details className="stop-viewpoint"><summary>Rating source and limitations</summary><p className="text-sm text-[#425d4c]">{act.rating_evidence}. Written review text is not republished. This score summarizes the downloaded sample, not today’s platform rating.</p></details>}
                    {/* Special Experiences & Golden Hour Badges */}
                    {act.experience_tag && (
                      <div className="mb-2 inline-flex items-center space-x-1.5 text-sm font-medium text-[#89532d] bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                        <Sparkles className="w-3.5 h-3.5 text-[#89532d]" />
                        <span>{act.experience_tag}</span>
                      </div>
                    )}

                    {/* Recommended Viewpoint Pro-Tip */}
                    {act.recommended_viewpoint && (
                      <details className="stop-viewpoint text-sm text-[#425d4c] mt-2">
                        <summary className="flex items-center gap-2 text-[#89532d] font-semibold">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Viewpoint details</span>
                        </summary>
                        <p className="mt-2 font-semibold">{act.recommended_viewpoint.viewpoint_name || act.recommended_viewpoint.name}</p>
                        <p className="text-sm text-[#526653] pl-5">{act.recommended_viewpoint.description}</p>
                      </details>
                    )}

                    {/* Interactive Customizer Action Bar */}
                    <div className="stop-action-bar">
                      {act.meal_type ? <p className="text-sm text-[#425d4c]">Reserved meal. To change meal timing or the budget, adjust trip preferences and regenerate.</p> : <details className="stop-edit-menu"><summary>Edit stop</summary><div className="stop-actions">
                        {/* Pin / Lock Button */}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(day.day_number, actIdx)}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-sm font-medium border transition-all ${
                            act.is_locked
                              ? 'bg-amber-500/20 text-[#89532d] border-amber-500/40 shadow-sm'
                              : 'bg-[#fffdf5] text-[#526653] border-[#c6d2c0] hover:text-[#243e33] hover:border-gray-600'
                          }`}
                          title={act.is_locked ? "Unpin stop" : "Pin stop (force solver retention)"}
                        >
                          {act.is_locked ? <Lock className="w-3 h-3 text-[#89532d]" /> : <Unlock className="w-3 h-3" />}
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
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-sm font-medium bg-[#fffdf5] text-[#425d4c] border border-[#c6d2c0] hover:border-amber-500/40 hover:text-[#89532d] transition-all"
                          title="Swap with candidate place"
                        >
                          <ArrowRightLeft className="w-3 h-3 text-[#89532d]" />
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
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-sm font-medium bg-[#fffdf5] text-[#425d4c] border border-[#c6d2c0] hover:border-orange-500/40 hover:text-orange-300 transition-all"
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
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-sm font-medium bg-[#fffdf5] text-[#526653] border border-[#c6d2c0] hover:border-rose-500/40 hover:text-rose-700 transition-all"
                          title="Drop stop from day schedule"
                        >
                          <Trash2 className="w-3 h-3 text-rose-700" />
                          <span>Remove</span>
                        </button>
                      </div></details>}

                      <div className="text-sm text-[#596b57] font-mono">
                        Stop #{actIdx + 1}
                      </div>
                    </div>

                    {/* Feature 2: Smart Interactive Expense Logging per Activity */}
                    {isVisited && (
                      <div className="mt-3 pt-2.5 border-t border-[#c6d2c0] flex flex-wrap items-center justify-between gap-2 text-sm bg-[#fffdf5]/60 px-3 py-2 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="font-semibold text-emerald-700">Visited</span>
                          <span className="text-[#596b57]">•</span>
                          <span className="text-[#526653]">Logged Spend:</span>
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
                              <span className="text-[#243e33] font-bold">₹</span>
                              <input
                                type="number"
                                value={spendInput}
                                onChange={(e) => setSpendInput(e.target.value)}
                                className="w-20 px-2 py-0.5 text-sm bg-[#eef1e5] border border-amber-500/50 rounded text-[#243e33] font-bold"
                                autoFocus
                              />
                              <button type="submit" className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded">
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
                              className="text-[#89532d] font-bold hover:underline cursor-pointer flex items-center space-x-1"
                              title="Click to edit actual spend"
                            >
                              <span>₹{actSpend.toLocaleString('en-IN')}</span>
                              <span className="text-sm text-[#596b57] font-normal">(Edit)</span>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-[#526653]">
                          <span>
                            Budgeted: ₹{act.estimated_cost_inr} •
                            <span className={actSpend <= act.estimated_cost_inr ? 'text-emerald-700 ml-1' : 'text-rose-700 ml-1'}>
                              {actSpend <= act.estimated_cost_inr ? '✓ Under' : `+₹${actSpend - act.estimated_cost_inr} over`}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setInitialExpenseToAdd({
                                title: act.place_name,
                                amount: actSpend || act.estimated_cost_inr,
                                category: act.place_type === 'restaurant' ? 'dining' : 'activities',
                                activityRef: actKey
                              });
                              setIsExpenseModalOpen(true);
                            }}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-sm font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-[#89532d] border border-amber-500/30 transition-colors"
                            title="Log to Group Ledger and split among travelers"
                          >
                            <Wallet className="w-3 h-3 text-[#89532d]" />
                            <span>Split with Group</span>
                          </button>
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
      </div>

<section className="itinerary-evidence-grid" aria-label="Budget and schedule details">
      <details className="itinerary-disclosure"><summary>Budget breakdown <span>See stay, travel, meal costs and money left</span></summary><div className="disclosure-body">
      {/* Feature 2: Smart Expense Simulator & Category Allocation */}
      {plan.expense_breakdown && (
        <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#d6dfd0] gap-2">
            <div className="flex items-center space-x-2.5">
              <Wallet className="w-5 h-5 text-[#89532d]" />
              <div>
                <h4 className="font-bold text-base text-[#243e33]">Where your budget goes</h4>
                <p className="text-sm text-[#526653]">Your planned costs and money left over add up to your destination budget.</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm text-[#526653]">Destination budget: </span>
              <span className="text-base font-bold text-[#89532d]">₹{plan.expense_breakdown.total_inr.toLocaleString('en-IN')}</span>
              <span className="text-sm text-[#596b57] block">₹{plan.expense_breakdown.per_person_inr.toLocaleString('en-IN')} / traveler</span>
            </div>
          </div>

          <div className="budget-category-rows">
            <div className="bg-[#eef1e5] border border-[#c6d2c0] rounded-xl p-3 text-center">
              <span className="text-sm uppercase font-semibold text-[#526653] block tracking-wider">Stay</span>
              <span className="text-base font-bold text-[#243e33] mt-0.5 block">₹{plan.expense_breakdown.lodging_inr.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[#eef1e5] border border-[#c6d2c0] rounded-xl p-3 text-center">
              <span className="text-sm uppercase font-semibold text-[#526653] block tracking-wider">Local Transit</span>
              <span className="text-base font-bold text-[#243e33] mt-0.5 block">₹{plan.expense_breakdown.transit_inr.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[#eef1e5] border border-[#c6d2c0] rounded-xl p-3 text-center">
              <span className="text-sm uppercase font-semibold text-[#526653] block tracking-wider">Sightseeing</span>
              <span className="text-base font-bold text-[#243e33] mt-0.5 block">₹{plan.expense_breakdown.activities_inr.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[#eef1e5] border border-[#c6d2c0] rounded-xl p-3 text-center">
              <span className="text-sm uppercase font-semibold text-[#526653] block tracking-wider">
                {plan.expense_breakdown.dining_inr && plan.expense_breakdown.dining_inr > 0 ? 'Dining (Itinerary)' : 'Est. Dining'}
              </span>
              <span className="text-base font-bold text-[#243e33] mt-0.5 block">
                ₹{((plan.expense_breakdown.dining_inr && plan.expense_breakdown.dining_inr > 0) ? plan.expense_breakdown.dining_inr : plan.expense_breakdown.suggested_meals_inr || plan.expense_breakdown.estimated_meals_inr).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-[#eef1e5] border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
              <span className="text-sm uppercase font-semibold text-emerald-700 block tracking-wider">Unallocated</span>
              <span className="text-base font-bold text-emerald-800 mt-0.5 block">₹{(plan.expense_breakdown.unallocated_buffer_inr ?? plan.expense_breakdown.buffer_inr).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Reconciled Accounting Status Bar */}
          <div className="budget-reconciliation flex flex-col sm:flex-row sm:items-center justify-between bg-[#eef1e5] border border-[#c6d2c0] rounded-xl px-4 py-2.5 text-sm gap-2">
            <div className="flex items-center space-x-2 text-[#425d4c]">
              <span className="font-semibold text-[#243e33]">Direct Subtotal:</span>
              <span className="text-[#89532d] font-bold">₹{(plan.expense_breakdown.direct_subtotal_inr ?? plan.total_cost_inr).toLocaleString('en-IN')}</span>
              <span className="text-[#596b57]">•</span>
              <span className="text-[#526653]">Meals Guidance:</span>
              <span className="text-[#294333]">₹{(plan.expense_breakdown.suggested_meals_inr ?? plan.expense_breakdown.estimated_meals_inr).toLocaleString('en-IN')}</span>
            </div>
            {plan.expense_breakdown.meal_buffer_status && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold ${
                plan.expense_breakdown.meal_buffer_status.toLowerCase().includes('sufficient')
                  ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30'
                  : 'bg-amber-500/10 text-[#89532d] border border-amber-500/30'
              }`}>
                {plan.expense_breakdown.meal_buffer_status}
              </span>
            )}
          </div>

          {plan.intercity_transport && (
            <div className="text-sm text-[#89532d]/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2 leading-relaxed flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-semibold text-[#243e33]">What your budget covers:</span> Your ₹{(formData?.budget_inr ?? plan.expense_breakdown.budget_limit_inr ?? (plan.expense_breakdown.direct_subtotal_inr ?? plan.total_cost_inr)).toLocaleString('en-IN')} budget covers your stay, local travel, visits and planned meals. Money left: ₹{(plan.expense_breakdown.unallocated_buffer_inr ?? plan.expense_breakdown.buffer_inr).toLocaleString('en-IN')}. Extra meals may cost more than this.
              </div>
              <span className="text-sm bg-[#fffdf5] px-2 py-0.5 rounded border border-amber-500/30 text-[#89532d] font-medium">
                Inter-City Travel is Additive
              </span>
            </div>
          )}
        </div>
      )}

      </div></details>
      <details className="itinerary-disclosure"><summary>Plan checks & data <span>See what we checked and which details are estimates</span></summary><div className="disclosure-body">
      {/* Stage 8: Independent Verification & Real-World Physics Audit */}
      {plan.verification_report && (
        <div className="bg-[#fffdf5] border border-emerald-500/20 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#d6dfd0] gap-2 mb-3">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              <div>
                <h4 className="font-bold text-base text-[#243e33]">Schedule & budget checks</h4>
                <p className="text-sm text-[#526653]">Checks times, estimated travel and costs using the data we have. These checks do not confirm live tickets or current venue conditions.</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                Check score: {plan.verification_report.audit_score}/100 (using available data)
              </span>
            </div>
          </div>

          {/* Operational Metrics */}
          {plan.verification_report.metrics && (
            <div className="schedule-metrics">
              {Object.entries(plan.verification_report.metrics).map(([key, val]) => (
                <div key={key} className="bg-[#eef1e5] border border-[#c6d2c0] rounded-lg p-2 text-center">
                  <span className="text-sm uppercase font-semibold text-[#526653] block tracking-wider">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-bold text-[#243e33] mt-0.5 block">{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Checks Passed Pills */}
          <div className="schedule-check-list">
            {plan.verification_report.checks_passed.map((chk, idx) => (
              <span key={idx} className="inline-flex items-center space-x-1 text-sm text-emerald-800 bg-emerald-500/5 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" />
                <span>{chk}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      </div></details>
      </section>
      {/* Blueprint Stage 10 & Spec Feature 1: Places not included */}
      {currentPlan.decision_trace?.excluded_places && currentPlan.decision_trace.excluded_places.length > 0 && (
        <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-5 shadow-xl">
          <button
            type="button"
            onClick={() => setShowWhyNot(!showWhyNot)}
            className="w-full flex items-center justify-between text-left transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <HelpCircle className="w-5 h-5 text-[#89532d]" />
              <div>
                <h4 className="font-bold text-base text-[#243e33]">Places not included</h4>
                <p className="text-sm text-[#526653]">
                  {currentPlan.decision_trace.excluded_places.length} places considered but not included
                </p>
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-[#eef1e5] border border-[#c6d2c0] text-[#526653]">
              {showWhyNot ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showWhyNot && (
            <div className="mt-4 pt-4 border-t border-[#d6dfd0] space-y-3">
              {currentPlan.decision_trace.excluded_places.map((item, idx) => (
                <div key={idx} className="bg-[#eef1e5] border border-[#c6d2c0] rounded-xl p-3.5 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#243e33] text-base">{item.place_name}</span>
                    <span className={`text-sm font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                      item.category === 'closed_on_day'
                        ? 'bg-rose-500/10 text-rose-800 border border-rose-500/20'
                        : item.category === 'budget_limit'
                        ? 'bg-amber-500/10 text-[#89532d] border border-amber-500/20'
                        : item.category === 'pace_limit'
                        ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                        : 'bg-gray-500/10 text-[#425d4c] border border-gray-500/20'
                    }`}>
                      {item.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-[#425d4c] leading-relaxed">{item.reason}</p>
                  {item.suggested_action && (
                    <div className="text-sm text-[#89532d]/90 pt-1 font-medium">
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
        <div className="text-center text-sm text-[#596b57] pt-4 border-t border-[#d6dfd0]">
          {currentPlan.disclaimer}
        </div>
      )}

      {/* Feature 2 & 3C: Floating Live Group Expense Tracker & UPI Settlement Bar */}
      {(totalVisitedCount > 0 || ledger.expenses.length > 0) && (
        <div className="sticky bottom-4 z-40 bg-[#fffdf5]/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[#89532d] font-bold shrink-0">
              💰
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <h4 className="text-sm font-bold text-[#243e33] uppercase tracking-wider">Browser-Local Expense & UPI Split Tracker</h4>
                <span className="text-sm bg-[#eef1e5] text-[#526653] border border-[#c6d2c0] px-2 py-0.5 rounded-full font-medium">
                  Stored in this browser only
                </span>
                {totalVisitedCount > 0 && (
                  <span className="text-sm bg-emerald-500/20 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                    {totalVisitedCount} of {totalStops} Stops Visited
                  </span>
                )}
                {ledger.expenses.length > 0 && (
                  <span className="text-sm bg-amber-500/20 text-[#89532d] px-2 py-0.5 rounded-full font-bold">
                    {ledger.expenses.length} Group Spends
                  </span>
                )}
              </div>
              <p className="text-sm text-[#526653] mt-0.5">
                Logged Spend: <span className="text-[#243e33] font-bold">₹{Math.max(totalActualSpent, totalLedgerSpent).toLocaleString('en-IN')}</span> • Est for visited: <span className="text-[#425d4c]">₹{totalEstimatedForVisited.toLocaleString('en-IN')}</span> • {pendingSettlements.length > 0 ? (
                  <span className="text-rose-700 font-semibold">{pendingSettlements.length} UPI transfer(s) due</span>
                ) : (
                  <span className="text-emerald-700 font-semibold">All debts settled</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="text-right">
              <span className="text-sm text-[#526653] block uppercase font-semibold">Remaining Local Budget</span>
              <span className={`text-base font-extrabold ${remainingBudget >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                ₹{remainingBudget.toLocaleString('en-IN')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setInitialExpenseToAdd(null);
                setIsExpenseModalOpen(true);
              }}
              className="px-3 py-1.5 text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-black shadow-md transition-all active:scale-95 flex items-center space-x-1"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>UPI Split & Ledger</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setVisitedActivities({});
                handleUpdateLedger({ ...ledger, expenses: [], settlements: [] });
              }}
              className="px-2.5 py-1 text-sm rounded-lg bg-[#eef1e5] hover:bg-[#d6dfd0] border border-[#c6d2c0] text-[#526653] hover:text-[#243e33] transition-colors"
              title="Reset logged expenses"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Group Expense & UPI Settlement Modal */}
      {isExpenseModalOpen && (
        <GroupExpenseModal
          isOpen={isExpenseModalOpen}
          onClose={() => {
            setIsExpenseModalOpen(false);
            setInitialExpenseToAdd(null);
          }}
          destination={destination}
          plan={currentPlan}
          ledger={ledger}
          onUpdateLedger={handleUpdateLedger}
          initialAddExpense={initialExpenseToAdd}
        />
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
          pace={formData?.pace || 'balanced'}
          budgetLimitInr={formData?.budget_inr || currentPlan.expense_breakdown?.budget_limit_inr || null}
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
          transportMode={currentPlan.transport_mode || formData?.transport_mode || 'cab'}
          pace={formData?.pace || 'balanced'}
          budgetLimit={formData?.budget_inr || currentPlan.expense_breakdown?.budget_limit_inr || undefined}
          onApplyUpdate={handleApplyRebalancedPlan}
        />
      )}
    </div>
  );
}
