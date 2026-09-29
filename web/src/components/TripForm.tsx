'use client';

import React, { useState } from 'react';
import { 
  Calendar, Users, IndianRupee, Gauge, 
  Car, Sparkles, Check, Compass, Building,
  Train, Plane, MapPin, Pin
} from 'lucide-react';
import { TripFormData } from '../types/trip';

interface TripFormProps {
  onSubmit: (formData: TripFormData) => void;
  isLoading: boolean;
  initialValues?: TripFormData | null;
}

const CITY_MUST_VISIT_PINS: Record<string, string[]> = {
  hyderabad: ['Charminar', 'Golconda Fort', 'Chowmahalla Palace', 'Salar Jung Museum'],
  delhi: ['Qutub Minar', "Humayun's Tomb", 'Red Fort (Lal Qila)'],
  jaipur: ['Amber Fort', 'Hawa Mahal', 'Nahargarh Fort Sunset Viewpoint'],
  bengaluru: ['Bangalore Palace', 'Lalbagh Botanical Garden', "Tipu Sultan's Summer Palace", 'Cubbon Park & Vidhana Soudha'],
  mumbai: ['Gateway of India', 'CSMVS Museum (Prince of Wales)', 'Marine Drive & Nariman Point', 'Elephanta Caves'],
};

const CITIES = [
  { id: 'hyderabad', name: 'Hyderabad', tagline: 'Charminar, Golconda & Nizam Heritage' },
  { id: 'delhi', name: 'Delhi', tagline: 'Red Fort, Qutub Minar & Mughal Monuments' },
  { id: 'jaipur', name: 'Jaipur', tagline: 'Amber Fort, Hawa Mahal & Pink City' },
  { id: 'bengaluru', name: 'Bengaluru', tagline: 'Bangalore Palace, Lalbagh & Garden City' },
  { id: 'mumbai', name: 'Mumbai', tagline: 'Gateway of India, Marine Drive & Coastal Heritage' },
];

const ORIGIN_HUBS = [
  { id: 'center', label: 'City Center Hub', desc: 'Central Downtown Landmark Base', icon: Building },
  { id: 'station', label: 'Railway Station', desc: 'Central Train Station', icon: Train },
  { id: 'airport', label: 'Airport Hub', desc: 'Flight Terminal', icon: Plane },
];

const GROUP_PROFILES = [
  { id: 'default', label: 'General Group', desc: 'Standard leisure pacing' },
  { id: 'young_solo', label: 'Solo / Active', desc: 'Fast-paced, low fatigue sensitivity' },
  { id: 'family', label: 'Family with Kids', desc: 'Rest buffers & kid-friendly pacing' },
  { id: 'elderly', label: 'Senior Travelers', desc: 'Accessibility-first & minimal walking' },
];

const PACES = [
  { id: 'relaxed', label: 'Relaxed', desc: 'Max 2 stops/day' },
  { id: 'balanced', label: 'Balanced', desc: 'Max 3 stops/day (Recommended)' },
  { id: 'intensive', label: 'Intensive', desc: 'Max 4 stops/day' },
];

const MODES = [
  { id: 'cab', label: 'Cab / Taxi' },
  { id: 'auto', label: 'Auto-Rickshaw' },
  { id: 'metro', label: 'Metro Rail' },
  { id: 'walk', label: 'Walking' },
];

const INTEREST_TAGS = [
  { id: 'unesco', label: 'UNESCO Sites' },
  { id: 'history', label: 'Historic Forts' },
  { id: 'royal', label: 'Royal Palaces' },
  { id: 'museum', label: 'Museums' },
  { id: 'food', label: 'Street Food & Bazaars' },
  { id: 'sunset', label: 'Golden Hour Photography' },
];

const getFutureDate = (daysAhead: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
};

export default function TripForm({ onSubmit, isLoading, initialValues }: TripFormProps) {
  const [destination, setDestination] = useState<string>('hyderabad');
  const [originCity, setOriginCity] = useState<string>('');
  const [originType, setOriginType] = useState<'center' | 'station' | 'airport'>('center');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [budget, setBudget] = useState<number>(15000);
  const [peopleCount, setPeopleCount] = useState<number>(2);
  const [lockedActivities, setLockedActivities] = useState<string[]>([]);
  const [groupProfile, setGroupProfile] = useState<'default' | 'young_solo' | 'family' | 'elderly'>('default');
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'intensive'>('balanced');
  const [transportMode, setTransportMode] = useState<'cab' | 'auto' | 'metro' | 'walk'>('cab');
  const [interests, setInterests] = useState<string[]>(['unesco', 'history', 'sunset']);

  // Sync form inputs when initialValues are passed (from URL share link or parent state)
  React.useEffect(() => {
    if (initialValues) {
      if (initialValues.destination) setDestination(initialValues.destination.toLowerCase());
      if (initialValues.origin_city !== undefined) setOriginCity(initialValues.origin_city ? initialValues.origin_city.toLowerCase() : '');
      if (initialValues.origin_type && ['center', 'station', 'airport'].includes(initialValues.origin_type)) {
        setOriginType(initialValues.origin_type as 'center' | 'station' | 'airport');
      }
      if (initialValues.start_date) setStartDate(initialValues.start_date);
      if (initialValues.end_date) setEndDate(initialValues.end_date);
      if (initialValues.budget_inr) setBudget(initialValues.budget_inr);
      if (initialValues.people_count) setPeopleCount(initialValues.people_count);
      if (initialValues.group_profile) setGroupProfile(initialValues.group_profile);
      if (initialValues.pace) setPace(initialValues.pace);
      if (initialValues.transport_mode) setTransportMode(initialValues.transport_mode);
      if (initialValues.interests && initialValues.interests.length > 0) setInterests(initialValues.interests);
      if (initialValues.locked_activities && initialValues.locked_activities.length > 0) setLockedActivities(initialValues.locked_activities);
    } else {
      setStartDate(prev => prev || getFutureDate(7));
      setEndDate(prev => prev || getFutureDate(9));
    }
  }, [initialValues]);

  const toggleInterest = (tag: string) => {
    setInterests(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const togglePin = (placeName: string) => {
    setLockedActivities(prev => 
      prev.includes(placeName) ? prev.filter(p => p !== placeName) : [...prev, placeName]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      origin_city: originCity && originCity !== destination ? originCity : undefined,
      destination,
      origin_type: originType,
      start_date: startDate,
      end_date: endDate,
      budget_inr: budget,
      people_count: peopleCount,
      group_profile: groupProfile,
      locked_activities: lockedActivities,
      pace,
      transport_mode: transportMode,
      interests
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#11131b] border border-[#1e2230] rounded-2xl p-6 shadow-xl">
      <div className="flex items-center space-x-2 pb-4 border-b border-[#1e2230] mb-6">
        <Sparkles className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-bold text-white tracking-tight">Configure Your Trip</h2>
      </div>

      <div className="space-y-6">
        {/* Departure City (Inter-City Routing) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Train className="w-3.5 h-3.5 text-amber-400" />
              <span>Traveling From (Departure City)</span>
            </span>
            <span className="text-[11px] text-gray-500 font-normal lowercase">Curated 10+ inter-city corridors</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setOriginCity('')}
              className={`p-2.5 text-left rounded-xl border text-xs font-medium transition-all ${
                !originCity
                  ? 'bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30'
                  : 'bg-[#161922] border-[#222736] text-gray-400 hover:border-gray-600'
              }`}
            >
              <span className="font-semibold block text-white">Local / Same City</span>
              <span className="text-[10px] text-gray-500">Already in destination</span>
            </button>
            {CITIES.map(c => {
              const isSelected = originCity === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOriginCity(c.id)}
                  className={`p-2.5 text-left rounded-xl border text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30'
                      : 'bg-[#161922] border-[#222736] text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className="font-semibold block text-white">{c.name}</span>
                  <span className="text-[10px] text-gray-500 truncate block">Hub terminal link</span>
                </button>
              );
            })}
          </div>
          {originCity && originCity !== destination && (
            <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 mt-2 leading-relaxed">
              🚄 <strong>Inter-City Transit Enabled:</strong> Comparing Vande Bharat trains, sleeper buses & direct flights from {originCity.toUpperCase()} to {destination.toUpperCase()} with terminal-to-hotel last-mile transfers.
            </p>
          )}
        </div>

        {/* City Destination */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Target Destination
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {CITIES.map(c => {
              const isSelected = destination === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDestination(c.id)}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    isSelected 
                      ? 'bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30' 
                      : 'bg-[#161922] border-[#222736] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{c.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-gray-400 line-clamp-1">{c.tagline}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Starting Origin Hub */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>Trip Starting Location / Origin</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {ORIGIN_HUBS.map(hub => {
              const isSelected = originType === hub.id;
              const IconComp = hub.icon;
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => setOriginType(hub.id as 'center' | 'station' | 'airport')}
                  className={`p-2.5 text-left rounded-xl border transition-all ${
                    isSelected 
                      ? 'bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30' 
                      : 'bg-[#161922] border-[#222736] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <IconComp className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-gray-400'}`} />
                    <span className="font-semibold text-xs">{hub.label}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 line-clamp-1">{hub.desc}</p>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            * Day trips start and finish at this origin hub. Multi-day trips base overnight stays at an optimal centroid hotel.
          </p>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Start Date</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-[#161922] border border-[#222736] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>End Date</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-[#161922] border border-[#222736] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              required
            />
          </div>
        </div>

        {/* Travelers & Budget */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>Travelers ({peopleCount})</span>
            </label>
            <input
              type="range"
              min={1}
              max={6}
              value={peopleCount}
              onChange={e => setPeopleCount(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-gray-500 mt-1">
              <span>Solo</span>
              <span>2 Guests</span>
              <span>4+ Group</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                <span>On-Ground Budget: ₹{budget.toLocaleString('en-IN')}</span>
              </span>
              <span className="text-[10px] text-amber-400/80 font-normal lowercase">destination stay & activities</span>
            </label>
            <input
              type="range"
              min={4000}
              max={50000}
              step={1000}
              value={budget}
              onChange={e => setBudget(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-gray-500 mt-1">
              <span>₹4k (Shoestring)</span>
              <span>₹25k</span>
              <span>₹50k (Luxury)</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5 leading-tight">
              Covers destination lodging, local transport, sightseeing and scheduled dining. Extra meals and inter-city travel are estimated separately and may exceed this cap.
            </p>
          </div>
        </div>

        {/* Traveler Group Profile */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Traveler Group Profile (Calibrated Fatigue)</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {GROUP_PROFILES.map(gp => {
              const active = groupProfile === gp.id;
              return (
                <button
                  type="button"
                  key={gp.id}
                  onClick={() => setGroupProfile(gp.id as 'default' | 'young_solo' | 'family' | 'elderly')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    active
                      ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-sm'
                      : 'bg-[#161922] border-[#222736] text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="text-xs font-semibold text-white">{gp.label}</div>
                  <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{gp.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pace & Transport Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              <span>Sightseeing Pace</span>
            </label>
            <select
              value={pace}
              onChange={e => setPace(e.target.value as 'relaxed' | 'balanced' | 'intensive')}
              className="w-full bg-[#161922] border border-[#222736] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {PACES.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label} - {p.desc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
              <Car className="w-3.5 h-3.5 text-amber-400" />
              <span>Transit Preference</span>
            </label>
            <select
              value={transportMode}
              onChange={e => setTransportMode(e.target.value as 'cab' | 'auto' | 'metro' | 'walk')}
              className="w-full bg-[#161922] border border-[#222736] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {MODES.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Must-Visit Pins (Strict In-Solver Constraint) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
            <Pin className="w-3.5 h-3.5 text-amber-400" />
            <span>Must-Visit Places (Strict Pins 🔒)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {(CITY_MUST_VISIT_PINS[destination] || []).map(placeName => {
              const active = lockedActivities.includes(placeName);
              return (
                <button
                  type="button"
                  key={placeName}
                  onClick={() => togglePin(placeName)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center space-x-1.5 ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-semibold shadow-sm'
                      : 'bg-[#161922] border-[#222736] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Pin className={`w-3 h-3 ${active ? 'text-amber-400' : 'text-gray-500'}`} />
                  <span>{placeName}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Pinned stops become mandatory solver nodes protected against budget trimming.
          </p>
        </div>

        {/* Interests & Themes */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Interests & Themes (Prioritizes Drop Penalties)
          </label>
          <div className="flex flex-wrap gap-2">
            {INTEREST_TAGS.map(tag => {
              const active = interests.includes(tag.id);
              return (
                <button
                  type="button"
                  key={tag.id}
                  onClick={() => toggleInterest(tag.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-[#161922] border-[#222736] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit CTA */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-sm tracking-wide shadow-lg shadow-amber-500/25 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              <span>Executing 10-Stage Deterministic Optimizer...</span>
            </>
          ) : (
            <>
              <Compass className="w-4 h-4" />
              <span>Synthesize 3 Optimized Variants</span>
            </>
          )}
        </button>

        {/* Blueprint Stage 1-10 Progressive Engine Telemetry (Shows while calculating) */}
        {isLoading && (
          <div className="bg-[#161922] border border-amber-500/30 rounded-xl p-4 space-y-2 text-xs animate-pulse shadow-inner">
            <div className="flex items-center justify-between text-amber-400 font-bold border-b border-[#222736] pb-2">
              <span className="flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Deterministic Travel Optimizer Active</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider bg-amber-500/20 px-2 py-0.5 rounded">Solving</span>
            </div>
            <div className="space-y-1.5 text-gray-300 text-[11px] pt-1">
              <div className="flex items-center space-x-2 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Stage 1-2: Candidate places & weekly closure audit</span>
              </div>
              <div className="flex items-center space-x-2 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Stage 3-5: DBSCAN clustering & centroid base lodging</span>
              </div>
              <div className="flex items-center space-x-2 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>Stage 6-8: Google OR-Tools VRP routing & physics audit</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
                <span>Stage 9-10: 3 variants diversification & explainability trace</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
