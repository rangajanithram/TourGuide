'use client';

import React, { useState } from 'react';
import { 
  Calendar, Users, IndianRupee, Gauge, 
  Car, Sparkles, Check, Compass, Building,
  Train, Plane, MapPin
} from 'lucide-react';
import { TripFormData } from '../types/trip';

interface TripFormProps {
  onSubmit: (formData: TripFormData) => void;
  isLoading: boolean;
}

const CITIES = [
  { id: 'hyderabad', name: 'Hyderabad', tagline: 'Charminar, Golconda & Nizam Heritage' },
  { id: 'delhi', name: 'Delhi', tagline: 'Red Fort, Qutub Minar & Mughal Monuments' },
  { id: 'jaipur', name: 'Jaipur', tagline: 'Amber Fort, Hawa Mahal & Pink City' },
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

export default function TripForm({ onSubmit, isLoading }: TripFormProps) {
  const [destination, setDestination] = useState('hyderabad');
  const [originType, setOriginType] = useState<'center' | 'station' | 'airport'>('center');
  const [startDate, setStartDate] = useState(() => getFutureDate(7));
  const [endDate, setEndDate] = useState(() => getFutureDate(9));
  const [budget, setBudget] = useState(15000);
  const [peopleCount, setPeopleCount] = useState(2);
  const [groupProfile, setGroupProfile] = useState<'default' | 'young_solo' | 'family' | 'elderly'>('default');
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'intensive'>('balanced');
  const [transportMode, setTransportMode] = useState<'cab' | 'auto' | 'metro' | 'walk'>('cab');
  const [interests, setInterests] = useState<string[]>(['unesco', 'history', 'sunset']);

  const toggleInterest = (tag: string) => {
    setInterests(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      destination,
      origin_type: originType,
      start_date: startDate,
      end_date: endDate,
      budget_inr: budget,
      people_count: peopleCount,
      group_profile: groupProfile,
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center space-x-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
              <span>Total Budget: ₹{budget.toLocaleString('en-IN')}</span>
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
              <span>Solving OR-Tools Routing...</span>
            </>
          ) : (
            <>
              <Compass className="w-4 h-4" />
              <span>Synthesize 3 Optimized Variants</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
