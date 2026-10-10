'use client';

import InfoTip from './InfoTip';
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function TripForm({ onSubmit, isLoading, initialValues }: TripFormProps) {
  const [validationError, setValidationError] = useState('');
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
      setInterests(initialValues.interests || []);
      setLockedActivities(initialValues.locked_activities || []);
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
    if (isLoading) return;
    if (!startDate || !endDate || endDate < startDate) { setValidationError('Choose an end date on or after the start date.'); return; }
    if (startDate < getFutureDate(0)) { setValidationError('Choose today or a future start date.'); return; }
    setValidationError('');
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
    <form onSubmit={handleSubmit} className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-6 shadow-xl">
      <div className="flex items-center space-x-2 pb-4 border-b border-[#d6dfd0] mb-6">
        <Sparkles className="w-5 h-5 text-[#89532d]" />
        <h2 className="text-lg font-bold text-[#243e33] tracking-tight">Your trip, your way</h2>
      </div>

      {validationError && <p role="alert" className="mb-4 text-sm text-red-800">{validationError}</p>}
      <div className="space-y-6">
        {/* City Destination */}
        <div>
          <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2">
            Where are you going?
          </div><InfoTip title="Destination">Choose the city you want to explore. Changing it clears must-visit selections for the previous city.</InfoTip>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {CITIES.map(c => {
              const isSelected = destination === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setDestination(c.id)}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-[#243e33] ring-1 ring-amber-500/30'
                      : 'bg-[#eef1e5] border-[#c6d2c0] text-[#425d4c] hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{c.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-[#89532d]" />}
                  </div>
                  <p className="text-[11px] text-[#526653] line-clamp-1">{c.tagline}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="trip-start" className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#89532d]" />
              <span>Start Date</span>
            </label><InfoTip title="Start date">First sightseeing day. For a full day, arrive beforehand. Choose dates with enough time for your must-sees.</InfoTip>
            <input
              type="date"
              id="trip-start"
              min={getFutureDate(0)}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-[#eef1e5] border border-[#c6d2c0] rounded-xl px-3.5 py-2.5 text-sm text-[#243e33] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              required
            />
          </div>
          <div>
            <label htmlFor="trip-end" className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#89532d]" />
              <span>End Date</span>
            </label><InfoTip title="End date">Last sightseeing day, including this date. It cannot be before the start date.</InfoTip>
            <input
              type="date"
              id="trip-end"
              min={startDate || getFutureDate(0)}
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-[#eef1e5] border border-[#c6d2c0] rounded-xl px-3.5 py-2.5 text-sm text-[#243e33] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              required
            />
          </div>
        </div>

        {/* Travelers & Budget */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="trip-people" className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-[#89532d]" />
              <span>Travelers ({peopleCount})</span>
            </label><InfoTip title="Travelers">People sharing the trip. This changes tickets, transport capacity, rooms and the group cost estimate.</InfoTip>
            <input
              type="range"
              min={1}
              max={6}
              id="trip-people"
              value={peopleCount}
              onChange={e => setPeopleCount(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-[#596b57] mt-1">
              <span>Solo</span>
              <span>2 Guests</span>
              <span>4+ Group</span>
            </div>
          </div>

          <div>
            <label htmlFor="trip-budget" className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-[#89532d]" />
                <span>On-Ground Budget: ₹{budget.toLocaleString('en-IN')}</span>
              </span>
              <span className="text-[10px] text-[#89532d]/80 font-normal lowercase">destination stay & activities</span>
            </label><InfoTip title="Destination budget">Total on-ground budget for the whole group, not per person. Extra meals and intercity travel are estimated separately. Review the final total before booking.</InfoTip>
            <input
              type="range"
              min={4000}
              max={50000}
              step={1000}
              id="trip-budget"
              value={budget}
              onChange={e => setBudget(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-[#596b57] mt-1">
              <span>₹4k (Shoestring)</span>
              <span>₹25k</span>
              <span>₹50k (Luxury)</span>
            </div>
            <p className="text-[10px] text-[#596b57] mt-1.5 leading-tight">
              Covers destination lodging, local transport, sightseeing and scheduled dining. Extra meals and inter-city travel are estimated separately and may exceed this cap.
            </p>
          </div>
        </div>

        <details className="trip-extra"><summary>Travel style & must-see places <span>Optional · tailor your day</span></summary><div className="space-y-6 mt-5">        {/* Traveler Group Profile */}
        <div>
          <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5 text-[#89532d]" />
            <span>Who’s coming along?</span>
          </div><InfoTip title="Travel group">Adjusts fatigue assumptions. Family and senior profiles favor a gentler day; this is not an accessibility guarantee.</InfoTip>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {GROUP_PROFILES.map(gp => {
              const active = groupProfile === gp.id;
              return (
                <button
                  type="button"
                  key={gp.id}
                  aria-pressed={active}
                  onClick={() => setGroupProfile(gp.id as 'default' | 'young_solo' | 'family' | 'elderly')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    active
                      ? 'bg-amber-500/10 border-amber-500/60 text-[#243e33] shadow-sm'
                      : 'bg-[#eef1e5] border-[#c6d2c0] text-[#526653] hover:border-gray-700'
                  }`}
                >
                  <div className="text-xs font-semibold text-[#243e33]">{gp.label}</div>
                  <div className="text-[10px] text-[#596b57] line-clamp-1 mt-0.5">{gp.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pace & Transport Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
              <Gauge className="w-3.5 h-3.5 text-[#89532d]" />
              <span>Sightseeing Pace</span>
            </div><InfoTip title="Pace">Relaxed allows up to 2 visits a day, balanced 3, intensive 4. Actual visits also depend on hours, journey time and budget.</InfoTip>
            <select
              aria-label="Sightseeing pace"
              value={pace}
              onChange={e => setPace(e.target.value as 'relaxed' | 'balanced' | 'intensive')}
              className="w-full bg-[#eef1e5] border border-[#c6d2c0] rounded-xl px-3.5 py-2.5 text-sm text-[#243e33] focus:outline-none focus:border-amber-500"
            >
              {PACES.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label} - {p.desc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
              <Car className="w-3.5 h-3.5 text-[#89532d]" />
              <span>Transit Preference</span>
            </div><InfoTip title="Local transport">Preferred travel mode between stops. Metro availability and walking feasibility can limit your options. Fares and durations are estimates.</InfoTip>
            <select
              aria-label="Local transport"
              value={transportMode}
              onChange={e => setTransportMode(e.target.value as 'cab' | 'auto' | 'metro' | 'walk')}
              className="w-full bg-[#eef1e5] border border-[#c6d2c0] rounded-xl px-3.5 py-2.5 text-sm text-[#243e33] focus:outline-none focus:border-amber-500"
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
          <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
            <Pin className="w-3.5 h-3.5 text-[#89532d]" />
            <span>Must-Visit Places (Strict Pins 🔒)</span>
          </div><InfoTip title="Must-visit places">Select essential stops only. Too many pins can make the plan impossible; reduce them or add days if that happens.</InfoTip>
          <div className="flex flex-wrap gap-2">
            {(CITY_MUST_VISIT_PINS[destination] || []).map(placeName => {
              const active = lockedActivities.includes(placeName);
              return (
                <button
                  type="button"
                  key={placeName}
                  aria-pressed={lockedActivities.includes(placeName)}
                  onClick={() => togglePin(placeName)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center space-x-1.5 ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/60 text-[#89532d] font-semibold shadow-sm'
                      : 'bg-[#eef1e5] border-[#c6d2c0] text-[#526653] hover:text-[#243e33]'
                  }`}
                >
                  <Pin className={`w-3 h-3 ${active ? 'text-[#89532d]' : 'text-[#596b57]'}`} />
                  <span>{placeName}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[#596b57] mt-1.5">
            Pinned stops become mandatory solver nodes protected against budget trimming.
          </p>
        </div>

        {/* Interests & Themes */}
        <div>
          <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2">
            Interests & Themes (Prioritizes Drop Penalties)
          </div><InfoTip title="Interests">Select the kinds of places you enjoy. These preferences guide selection; a matching attraction may still be omitted when constraints do not fit.</InfoTip>
          <div className="flex flex-wrap gap-2">
            {INTEREST_TAGS.map(tag => {
              const active = interests.includes(tag.id);
              return (
                <button
                  type="button"
                  key={tag.id}
                  aria-pressed={interests.includes(tag.id)}
                  onClick={() => toggleInterest(tag.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/50 text-[#89532d]'
                      : 'bg-[#eef1e5] border-[#c6d2c0] text-[#526653] hover:text-[#243e33]'
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit CTA */}
        </div></details>
        <details className="trip-extra"><summary>Arrival & departure <span>Optional · travel from another city</span></summary><div className="space-y-6 mt-5">        {/* Departure City (Inter-City Routing) */}
        <div>
          <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Train className="w-3.5 h-3.5 text-[#89532d]" />
              <span>Traveling From (Departure City)</span>
            </span>
            <span className="text-[11px] text-[#596b57] font-normal lowercase">Curated 10+ inter-city corridors</span>
          </div><InfoTip title="Departure city">Already there? Keep Local / Same City. Otherwise select your departure city to compare estimated intercity travel; it is priced separately.</InfoTip>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              aria-pressed={!originCity}
              onClick={() => setOriginCity('')}
              className={`p-2.5 text-left rounded-xl border text-xs font-medium transition-all ${
                !originCity
                  ? 'bg-amber-500/10 border-amber-500/50 text-[#243e33] ring-1 ring-amber-500/30'
                  : 'bg-[#eef1e5] border-[#c6d2c0] text-[#526653] hover:border-gray-600'
              }`}
            >
              <span className="font-semibold block text-[#243e33]">Local / Same City</span>
              <span className="text-[10px] text-[#596b57]">Already in destination</span>
            </button>
            {CITIES.map(c => {
              const isSelected = originCity === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setOriginCity(c.id)}
                  className={`p-2.5 text-left rounded-xl border text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-[#243e33] ring-1 ring-amber-500/30'
                      : 'bg-[#eef1e5] border-[#c6d2c0] text-[#526653] hover:border-gray-600'
                  }`}
                >
                  <span className="font-semibold block text-[#243e33]">{c.name}</span>
                  <span className="text-[10px] text-[#596b57] truncate block">Hub terminal link</span>
                </button>
              );
            })}
          </div>
          {originCity && originCity !== destination && (
            <p className="text-[11px] text-[#89532d]/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 mt-2 leading-relaxed">
              🚄 <strong>Inter-City Transit Enabled:</strong> Comparing Vande Bharat trains, sleeper buses & direct flights from {originCity.toUpperCase()} to {destination.toUpperCase()} with terminal-to-hotel last-mile transfers.
            </p>
          )}
        </div>

        {/* Starting Origin Hub */}
        <div>
          <div className="block text-xs font-semibold uppercase tracking-wider text-[#526653] mb-2 flex items-center space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#89532d]" />
            <span>Trip Starting Location / Origin</span>
          </div><InfoTip title="Starting location">Choose where each day begins. Station and airport use representative city hubs; they are estimates, not your live location.</InfoTip>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {ORIGIN_HUBS.map(hub => {
              const isSelected = originType === hub.id;
              const IconComp = hub.icon;
              return (
                <button
                  key={hub.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setOriginType(hub.id as 'center' | 'station' | 'airport')}
                  className={`p-2.5 text-left rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-[#243e33] ring-1 ring-amber-500/30'
                      : 'bg-[#eef1e5] border-[#c6d2c0] text-[#425d4c] hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <IconComp className={`w-3.5 h-3.5 ${isSelected ? 'text-[#89532d]' : 'text-[#526653]'}`} />
                    <span className="font-semibold text-xs">{hub.label}</span>
                  </div>
                  <p className="text-[10px] text-[#526653] line-clamp-1">{hub.desc}</p>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[#596b57] mt-2">
            * Day trips start and finish at this origin hub. Multi-day trips base overnight stays at an optimal centroid hotel.
          </p>
        </div>

        </div></details>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-sm tracking-wide shadow-lg shadow-amber-500/25 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              <span>Creating your trip…</span>
            </>
          ) : (
            <>
              <Compass className="w-4 h-4" />
              <span>Create my trip</span>
            </>
          )}
        </button>

        {/* Blueprint Stage 1-10 Progressive Engine Telemetry (Shows while calculating) */}
        {isLoading && <p role="status" className="mt-4 text-sm">Comparing routes and estimates. The service may take about a minute to wake up. Keep this page open.</p>}
      </div>
    </form>
  );
}
