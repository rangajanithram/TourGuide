'use client';

import React, { useState } from 'react';
import { 
  MapPin, Calendar, Users, IndianRupee, Car, 
  Sparkles, Pin, Tag, SlidersHorizontal, Check, 
  Train, Clock, Share2, HeartHandshake, Eye, EyeOff
} from 'lucide-react';
import { TripFormData, TripPlan } from '../types/trip';

interface SharedTripOverviewProps {
  formData: TripFormData | null;
  currentPlan?: TripPlan | null;
  activeVariant: 'budget' | 'balanced' | 'comfort';
  onToggleEditor: () => void;
  showEditor: boolean;
}

const INTEREST_LABELS: Record<string, string> = {
  unesco: 'UNESCO Sites',
  history: 'Historic Forts',
  royal: 'Royal Palaces',
  museum: 'Museums',
  food: 'Street Food & Bazaars',
  sunset: 'Golden Hour Photography',
};

const MODE_LABELS: Record<string, string> = {
  cab: 'Cab / Private Taxi',
  auto: 'Auto-Rickshaw',
  metro: 'Metro Rail',
  walk: 'Walking Only',
};

const PROFILE_LABELS: Record<string, string> = {
  default: 'General Group',
  young_solo: 'Solo / Active',
  family: 'Family with Kids',
  elderly: 'Senior Travelers',
};

const VARIANT_NAMES: Record<string, string> = {
  budget: 'Budget Saver',
  balanced: 'Balanced Choice',
  comfort: 'Comfort & Ease',
};

export default function SharedTripOverview({
  formData,
  currentPlan,
  activeVariant,
  onToggleEditor,
  showEditor
}: SharedTripOverviewProps) {
  const [copied, setCopied] = useState(false);

  const destination = (formData?.destination || currentPlan?.plan_name || 'Destination').toUpperCase();
  const origin = formData?.origin_city ? formData.origin_city.toUpperCase() : null;
  const startDate = formData?.start_date || currentPlan?.days[0]?.date;
  const endDate = formData?.end_date || currentPlan?.days[currentPlan?.days.length - 1]?.date;
  const daysCount = currentPlan?.days.length || 0;
  const people = formData?.people_count || currentPlan?.hotel_summary?.people_accommodated || 2;
  const budget = formData?.budget_inr || currentPlan?.total_cost_inr || 0;
  const mode = formData?.transport_mode || currentPlan?.transport_mode || 'cab';
  const pace = formData?.pace || 'balanced';
  const profile = formData?.group_profile || 'default';
  const pinnedStops = formData?.locked_activities || [];
  const interests = formData?.interests || [];

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.origin + window.location.pathname);
      const dest = formData?.destination || currentPlan?.plan_name || 'hyderabad';
      url.searchParams.set('dest', dest.toLowerCase());
      if (startDate) url.searchParams.set('start', startDate);
      if (endDate) url.searchParams.set('end', endDate);
      if (mode) url.searchParams.set('mode', mode);
      if (origin) url.searchParams.set('origin', origin.toLowerCase());
      if (activeVariant) url.searchParams.set('variant', activeVariant.toLowerCase());
      if (people) url.searchParams.set('people', people.toString());
      if (budget) url.searchParams.set('budget', budget.toString());
      if (pace) url.searchParams.set('pace', pace);
      if (profile && profile !== 'default') url.searchParams.set('profile', profile);
      if (formData?.origin_type) url.searchParams.set('origin_type', formData.origin_type);
      if (formData?.start_location) url.searchParams.set('start_location', formData.start_location);
      if (interests.length > 0) url.searchParams.set('interests', interests.join(','));
      if (pinnedStops.length > 0) url.searchParams.set('pins', pinnedStops.join(','));

      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // ignore clipboard error
      }
    }
  };

  return (
    <div className="bg-[#11131b] border border-amber-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Background Accent Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Top Banner Row: Badges & Action CTAs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2230] relative z-10">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full uppercase tracking-wider">
              <HeartHandshake className="w-3.5 h-3.5 text-amber-400" />
              <span>Shared Group Itinerary</span>
            </span>
            <span className="text-[11px] text-gray-400">
              Curated by Trip Organizer / Room Head
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-2 flex-wrap">
            <span>{destination}</span>
            {origin && (
              <span className="text-gray-400 text-lg font-normal flex items-center space-x-1.5">
                <span>• From</span>
                <span className="text-amber-300 font-semibold">{origin}</span>
              </span>
            )}
            <span className="text-xs font-semibold text-gray-400 bg-[#161922] border border-[#222736] px-2.5 py-1 rounded-lg">
              {daysCount > 0 ? `${daysCount} Days` : ''}
              {startDate && endDate ? ` (${startDate} to ${endDate})` : ''}
            </span>
          </h1>
        </div>

        {/* Action Buttons: Customize & Share */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleEditor}
            className={`inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 shadow-sm ${
              showEditor
                ? 'bg-amber-500 text-black border-amber-400 font-bold'
                : 'bg-[#161922] text-gray-200 border-[#222736] hover:border-gray-500'
            }`}
            title="Toggle the trip customization form to edit dates, budget, or destination"
          >
            {showEditor ? (
              <>
                <EyeOff className="w-4 h-4 text-black" />
                <span>Hide Settings Form</span>
              </>
            ) : (
              <>
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span>Customize / Edit Settings</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all active:scale-95 shadow-sm"
            title="Copy shared trip link to send to other group members"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-amber-400" />
                <span>Share with Group</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Useful Settings Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 relative z-10">
        {/* Destination & City Hub */}
        <div className="bg-[#161922] border border-[#222736] rounded-xl p-3">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider block flex items-center space-x-1">
            <MapPin className="w-3 h-3 text-amber-400" />
            <span>Target City</span>
          </span>
          <span className="text-sm font-bold text-white block mt-0.5 truncate capitalize">
            {formData?.destination || destination}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5">
            {origin ? `From ${origin}` : 'Local Hub'}
          </span>
        </div>

        {/* Travel Dates & Days */}
        <div className="bg-[#161922] border border-[#222736] rounded-xl p-3">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider block flex items-center space-x-1">
            <Calendar className="w-3 h-3 text-amber-400" />
            <span>Schedule</span>
          </span>
          <span className="text-sm font-bold text-white block mt-0.5 truncate">
            {daysCount} Days
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5 truncate">
            {startDate ? startDate : 'Flexible'}
          </span>
        </div>

        {/* Travelers & Profile */}
        <div className="bg-[#161922] border border-[#222736] rounded-xl p-3">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider block flex items-center space-x-1">
            <Users className="w-3 h-3 text-amber-400" />
            <span>Group Size</span>
          </span>
          <span className="text-sm font-bold text-white block mt-0.5">
            {people} {people === 1 ? 'Guest' : 'Guests'}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5 truncate">
            {PROFILE_LABELS[profile] || profile}
          </span>
        </div>

        {/* Trip Budget */}
        <div className="bg-[#161922] border border-[#222736] rounded-xl p-3">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider block flex items-center space-x-1">
            <IndianRupee className="w-3 h-3 text-amber-400" />
            <span>Target Budget</span>
          </span>
          <span className="text-sm font-extrabold text-amber-400 block mt-0.5">
            ₹{budget.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5 truncate">
            ₹{Math.round(budget / people).toLocaleString('en-IN')} / person
          </span>
        </div>

        {/* Transit Mode & Pacing */}
        <div className="bg-[#161922] border border-[#222736] rounded-xl p-3">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider block flex items-center space-x-1">
            <Car className="w-3 h-3 text-amber-400" />
            <span>Transit & Pace</span>
          </span>
          <span className="text-sm font-bold text-white block mt-0.5 truncate">
            {MODE_LABELS[mode] || mode}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5 capitalize truncate">
            {pace} Pacing
          </span>
        </div>

        {/* Active Variant Tier */}
        <div className="bg-[#161922] border border-[#222736] rounded-xl p-3">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider block flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Active Tier</span>
          </span>
          <span className="text-sm font-bold text-amber-300 block mt-0.5 truncate">
            {VARIANT_NAMES[activeVariant] || activeVariant}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5">
            Pre-selected
          </span>
        </div>
      </div>

      {/* Must-Visit Pinned Stops & Travel Interests */}
      {(pinnedStops.length > 0 || interests.length > 0) && (
        <div className="pt-3 border-t border-[#1e2230] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs relative z-10">
          {/* Pinned Highlights */}
          {pinnedStops.length > 0 && (
            <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
              <span className="text-gray-400 font-semibold flex items-center space-x-1 text-[11px] shrink-0">
                <Pin className="w-3 h-3 text-amber-400" />
                <span>Must-Visit Highlights:</span>
              </span>
              {pinnedStops.map(p => (
                <span
                  key={p}
                  className="bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-medium text-[11px]"
                >
                  {p}
                </span>
              ))}
            </div>
          )}

          {/* Interests */}
          {interests.length > 0 && (
            <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
              <span className="text-gray-400 font-semibold flex items-center space-x-1 text-[11px] shrink-0">
                <Tag className="w-3 h-3 text-sky-400" />
                <span>Interests:</span>
              </span>
              {interests.map(t => (
                <span
                  key={t}
                  className="bg-[#161922] text-gray-300 border border-[#222736] px-2 py-0.5 rounded-md text-[11px]"
                >
                  {INTEREST_LABELS[t] || t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
