'use client';

import React, { useState } from 'react';
import { 
  Building2, Camera, Compass, Sparkles, Layers,
  ShieldCheck, CheckCircle2, Calendar,
  Copy, Check, Activity, CloudSun,
  CloudRain, Flame, Utensils, Wallet,
  HelpCircle, ChevronDown, ChevronUp, Pin, Link2, Users
} from 'lucide-react';
import { TripPlan } from '../types/trip';
import { exportToIcs, formatItineraryForShare } from '../utils/calendarExport';

interface ItineraryViewProps {
  plan: TripPlan;
  destination?: string;
  selectedDay?: number | 'all';
  onSelectDay?: (day: number | 'all') => void;
}

export default function ItineraryView({ 
  plan, 
  destination = 'City',
  selectedDay = 'all',
  onSelectDay 
}: ItineraryViewProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showWhyNot, setShowWhyNot] = useState(false);
  const hotel = plan.hotel_summary;
  const totalActivitiesCost = plan.days.reduce((acc, d) => acc + d.day_cost_inr, 0);
  const totalStops = plan.days.reduce((acc, d) => acc + d.activities.length, 0);

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('dest', destination.toLowerCase());
    const startDate = plan.days[0]?.date;
    if (startDate) {
      url.searchParams.set('start', startDate);
    }
    const endDate = plan.days[plan.days.length - 1]?.date;
    if (endDate) {
      url.searchParams.set('end', endDate);
    }
    url.searchParams.set('mode', plan.transport_mode);
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyText = () => {
    const text = formatItineraryForShare(plan, destination);
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleExportIcs = () => {
    exportToIcs(plan, destination);
  };

  const visibleDays = selectedDay === 'all' 
    ? plan.days 
    : plan.days.filter(d => d.day_number === selectedDay);

  return (
    <div className="space-y-6">
      {/* Action Toolbar: Calendar Export & Share */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11131b] border border-[#1e2230] rounded-2xl p-4 shadow-lg">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">{plan.plan_name}</h3>
            <p className="text-[11px] text-gray-400">
              {plan.days.length} Days • ₹{plan.total_cost_inr.toLocaleString('en-IN')} Total Subtotal
              {plan.fatigue_report?.overall_pace && ` • ${plan.fatigue_report.overall_pace}`}
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
          <span className="text-xl font-extrabold text-amber-400">₹{plan.total_cost_inr.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5">All lodgings, transit & tickets</span>
        </div>

        <div className="bg-[#11131b] border border-[#1e2230] rounded-xl p-3.5 shadow-md">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Total Sightseeing</span>
          <span className="text-xl font-extrabold text-white">₹{totalActivitiesCost.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5">{totalStops} scheduled attractions</span>
        </div>

        <div className="bg-[#11131b] border border-[#1e2230] rounded-xl p-3.5 shadow-md">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Transit Matrix</span>
          <span className="text-xl font-extrabold text-white">₹{plan.estimated_transport_cost_inr.toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5 capitalize">{plan.transport_mode} routes</span>
        </div>

        <div className="bg-[#11131b] border border-[#1e2230] rounded-xl p-3.5 shadow-md">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Lodging</span>
          <span className="text-xl font-extrabold text-white">₹{(hotel?.total_cost_inr || 0).toLocaleString('en-IN')}</span>
          <span className="text-[10px] text-gray-500 block mt-0.5">{hotel ? `${hotel.nights} night(s)` : 'Day Trip'}</span>
        </div>
      </div>

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
                <h4 className="font-bold text-sm text-white">Smart Budget Allocation & Expense Reconciliation</h4>
                <p className="text-[11px] text-gray-400">Strictly reconciled cost distribution: Direct Subtotal + Safe Buffer = Total Budget</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">Per Traveler: </span>
              <span className="text-sm font-bold text-amber-400">₹{plan.expense_breakdown.per_person_inr.toLocaleString('en-IN')}</span>
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
              <span className="text-[10px] uppercase font-semibold text-emerald-400 block tracking-wider">Safe Buffer</span>
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
              </div>
            </div>

            {/* Activities Timeline */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#222736]">
              {day.activities.map((act, actIdx) => (
                <div key={actIdx} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-[#11131b] group-hover:scale-125 transition-transform"></div>

                  <div className="bg-[#161922] border border-[#222736] rounded-xl p-4 hover:border-gray-600 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                          {act.start_time} - {act.end_time}
                        </span>
                        <h5 className="font-bold text-sm text-white">{act.place_name}</h5>
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Blueprint Stage 10 & Spec Feature 1: Why Not X? Candidate Omission Audit */}
      {plan.decision_trace?.excluded_places && plan.decision_trace.excluded_places.length > 0 && (
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
                  {plan.decision_trace.excluded_places.length} attractions evaluated but omitted from this itinerary
                </p>
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-[#161922] border border-[#222736] text-gray-400">
              {showWhyNot ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showWhyNot && (
            <div className="mt-4 pt-4 border-t border-[#1e2230] space-y-3">
              {plan.decision_trace.excluded_places.map((item, idx) => (
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
      {plan.disclaimer && (
        <div className="text-center text-xs text-gray-500 pt-4 border-t border-[#1e2230]">
          {plan.disclaimer}
        </div>
      )}
    </div>
  );
}
