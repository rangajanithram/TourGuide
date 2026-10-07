'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Sparkles,
  SlidersHorizontal,
  Compass,
  Wallet,
  Sun,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
  Zap,
  TrendingUp,
  Coffee,
  ChevronDown,
  Smartphone,
  ShieldAlert,
  DollarSign,
  Award,
  RotateCcw
} from 'lucide-react';
import Header from '../../components/Header';

// ---------------------------------------------------------------------------
// DATA: Interactive Demos & Showcase
// ---------------------------------------------------------------------------

const VARIANT_DEMOS = {
  budget: {
    name: 'Budget Backpacker',
    totalCost: '₹5,850',
    perPerson: '₹1,950 / traveler',
    hotel: 'Zostel Old City (Bunk Pods)',
    hotelPrice: '₹1,200 / night',
    transport: 'Metro + Shared Auto',
    transportCost: '₹450 total',
    dining: 'Local Irani Cafes & Street Food',
    diningEst: '₹2,400 meals allocation',
    badge: 'Lean & Adventurous',
    color: 'emerald',
    description: 'Prioritizes public transit lines, budget-friendly verified stays, and low-cost entry hours without compromising key landmarks.'
  },
  balanced: {
    name: 'Balanced Explorer',
    totalCost: '₹13,919',
    perPerson: '₹4,640 / traveler',
    hotel: 'Treebo Trend Central (Deluxe Room)',
    hotelPrice: '₹3,200 / night',
    transport: 'App-based Autos & Cabs',
    transportCost: '₹1,319 total',
    dining: 'Heritage Cafes + Paradise Biryani',
    diningEst: '₹4,800 meals buffer',
    badge: 'Recommended Standard',
    color: 'amber',
    description: 'The golden balance: private air-conditioned cab hops for long cross-city hops, verified 3-star comfort, and timed meal reservations.'
  },
  comfort: {
    name: 'Comfort Executive',
    totalCost: '₹24,200',
    perPerson: '₹8,067 / traveler',
    hotel: 'Taj Vivanta / Falaknuma Luxury Base',
    hotelPrice: '₹8,500 / night',
    transport: 'Dedicated Prime Sedan AC Cab',
    transportCost: '₹2,800 total',
    dining: 'Fine Dining & Royal Banquets',
    diningEst: '₹7,500 meals buffer',
    badge: 'Premium Leisure',
    color: 'violet',
    description: 'Maximum ease: zero wait times with dedicated private driver, top-tier accommodations, prime vantage point access, and expansive dining buffers.'
  }
};

const QUICK_DEMO_CARDS = [
  {
    city: 'Hyderabad',
    tag: 'Royal Heritage & Biryani',
    days: '3 Days • 3 Travelers',
    variant: 'Comfort',
    budget: '₹25,000',
    stops: 'Charminar, Golconda Fort, Chowmahalla Palace, Salar Jung Museum',
    origin: 'Bengaluru (Flight connection)',
    url: '/?dest=hyderabad&start=2026-10-06&end=2026-10-08&mode=cab&origin=bengaluru&variant=comfort&people=3&budget=25000&pace=balanced&profile=default&origin_type=center&interests=unesco%2Csunset%2Croyal%2Cmuseum%2Cfood',
    bg: 'from-amber-500/20 via-orange-500/10 to-transparent',
    border: 'border-amber-500/30'
  },
  {
    city: 'Jaipur',
    tag: 'Palaces, Forts & Astronomical Sunsets',
    days: '3 Days • 4 Travelers',
    variant: 'Balanced',
    budget: '₹30,000',
    stops: 'Amber Palace, Hawa Mahal, Nahargarh Golden Hour, City Palace',
    origin: 'Delhi (Vande Bharat train)',
    url: '/?dest=jaipur&start=2026-10-10&end=2026-10-12&mode=auto&origin=delhi&variant=balanced&people=4&budget=30000&pace=balanced&profile=default&origin_type=center&interests=unesco%2Csunset%2Croyal%2Cfort%2Cshopping',
    bg: 'from-pink-500/20 via-rose-500/10 to-transparent',
    border: 'border-rose-500/30'
  },
  {
    city: 'Bengaluru',
    tag: 'Garden City & Modern Tech',
    days: '2 Days • 2 Travelers',
    variant: 'Budget',
    budget: '₹12,000',
    stops: 'Bangalore Palace, Lalbagh Botanical Gardens, Cubbon Park, MTR',
    origin: 'Local City Center',
    url: '/?dest=bengaluru&start=2026-10-15&end=2026-10-16&mode=metro&variant=budget&people=2&budget=12000&pace=relaxed&profile=young_solo&origin_type=center&interests=parks%2Cfood%2Cart',
    bg: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    border: 'border-emerald-500/30'
  },
  {
    city: 'Delhi',
    tag: 'Mughal Architecture & Metro Arteries',
    days: '3 Days • 2 Travelers',
    variant: 'Balanced',
    budget: '₹20,000',
    stops: 'Red Fort, Qutub Minar, Humayun’s Tomb, Chandni Chowk Food Tour',
    origin: 'Jaipur (Inter-City Bus)',
    url: '/?dest=delhi&start=2026-10-20&end=2026-10-22&mode=metro&origin=jaipur&variant=balanced&people=2&budget=20000&pace=intensive&profile=default&origin_type=center&interests=unesco%2Chistory%2Cfood%2Cshopping',
    bg: 'from-cyan-500/20 via-sky-500/10 to-transparent',
    border: 'border-cyan-500/30'
  },
  {
    city: 'Mumbai',
    tag: 'Colonial Coastline & Harbor Ferries',
    days: '2 Days • 2 Travelers',
    variant: 'Comfort',
    budget: '₹22,000',
    stops: 'Gateway of India, Elephanta Caves (Sequential Chain), Marine Drive',
    origin: 'Local City Center',
    url: '/?dest=mumbai&start=2026-10-25&end=2026-10-26&mode=cab&variant=comfort&people=2&budget=22000&pace=relaxed&profile=default&origin_type=center&interests=unesco%2Csunset%2Charbor%2Csea',
    bg: 'from-indigo-500/20 via-purple-500/10 to-transparent',
    border: 'border-indigo-500/30'
  }
];

export default function GuidePage() {
  // Interactive Simulator States
  const [selectedVariant, setSelectedVariant] = useState<'budget' | 'balanced' | 'comfort'>('balanced');
  const [solarHour, setSolarHour] = useState<number>(17.5); // 5:30 PM
  const [fatigueLevel, setFatigueLevel] = useState<'mild' | 'moderate' | 'exhausted'>('moderate');
  const [isSettledDemo, setIsSettledDemo] = useState<boolean>(false);
  const [copiedDemoUpi, setCopiedDemoUpi] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'variants' | 'solar' | 'fatigue' | 'upi'>('variants');

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#07080c] text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      <Header />

      <main className="relative overflow-hidden">
        
        {/* Background Ambient Glowing Orbs */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-b from-amber-500/15 via-orange-500/5 to-transparent blur-[140px]" />
        <div className="pointer-events-none absolute top-[900px] right-0 -z-10 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="pointer-events-none absolute top-[1800px] left-0 -z-10 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[150px]" />

        {/* ----------------------------------------------------------------- */}
        {/* SECTION 1: HERO SHOWCASE (Apple / Samsung Launch Aesthetic) */}
        {/* ----------------------------------------------------------------- */}
        <section className="relative px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:px-8">
          <div className="mx-auto max-w-6xl text-center">
            
            {/* Top Micro-Pill Tag */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Academic Business Proposal & Interactive Manual</span>
            </div>

            {/* Giant Title */}
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
              Travel Intelligence.
              <br />
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                Mathematically Engineered.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg sm:leading-8">
              TripWeave eliminates vacation planning paralysis. Combining Google OR-Tools multi-constraint vehicle routing, astronomical NOAA solar curves, and NPCI UPI debt settlement into a unified, zero-friction operating system for group travel.
            </p>

            {/* CTA Buttons */}
            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/?dest=hyderabad&start=2026-10-06&end=2026-10-08&mode=auto&origin=bengaluru&variant=comfort&people=3&budget=25000&pace=balanced&profile=default&origin_type=center&interests=unesco%2Csunset%2Croyal%2Cmuseum%2Cfood"
                className="group relative inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-7 py-3.5 text-sm font-bold text-black shadow-lg shadow-amber-500/25 transition-all hover:scale-105 active:scale-95"
              >
                <span>Launch Live Presentation Demo</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/15 transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="h-3.5 w-3.5 text-black" />
                </span>
              </Link>
              <a
                href="#interactive-simulator"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur-md transition-all hover:border-amber-400/40 hover:bg-white/[0.08]"
              >
                <Smartphone className="h-4 w-4 text-amber-400" />
                <span>Interactive Hardware Simulator</span>
              </a>
            </div>

            {/* Live Telemetry Pills Bar */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#11131b]/80 px-3 py-1.5 backdrop-blur-sm">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span>OR-Tools Multi-Constraint VRP</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#11131b]/80 px-3 py-1.5 backdrop-blur-sm">
                <Sun className="h-3.5 w-3.5 text-orange-400" />
                <span>NOAA Solar Equation Sunset Scheduling</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#11131b]/80 px-3 py-1.5 backdrop-blur-sm">
                <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                <span>Greedy Min-Cash-Flow UPI Splits</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#11131b]/80 px-3 py-1.5 backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                <span>Zero Fabricated Availability</span>
              </div>
            </div>

          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* SECTION 2: INTERACTIVE DEVICE SIMULATOR (The "Phone Manual" Experience) */}
        {/* ----------------------------------------------------------------- */}
        <section id="interactive-simulator" className="relative scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            
            <div className="text-center max-w-2xl mx-auto mb-10">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-2">Interactive Manual Experience</p>
              <h2 className="text-3xl font-black text-white sm:text-4xl">
                Test Every Core Engine Inside This Device
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                Click through the tabs below to interact with our mathematical modules in real time, simulating how users experience TripWeave.
              </p>
            </div>

            {/* Double-Bezel Hardware Container */}
            <div className="rounded-[2.5rem] border border-white/10 bg-[#0d0f17]/90 p-2 sm:p-3 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[2rem] border border-white/5 bg-[#12141f] p-5 sm:p-8 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                
                {/* Simulator Switcher Navigation */}
                <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/10 pb-6 mb-8">
                  <button
                    onClick={() => setActiveTab('variants')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                      activeTab === 'variants'
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                        : 'bg-[#181b26] text-slate-300 hover:text-white hover:bg-[#202535]'
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>01 · Multi-Variant Engine</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('solar')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                      activeTab === 'solar'
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                        : 'bg-[#181b26] text-slate-300 hover:text-white hover:bg-[#202535]'
                    }`}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    <span>02 · Astronomical Golden Hour</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('fatigue')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                      activeTab === 'fatigue'
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                        : 'bg-[#181b26] text-slate-300 hover:text-white hover:bg-[#202535]'
                    }`}
                  >
                    <Coffee className="h-3.5 w-3.5" />
                    <span>03 · &ldquo;I&apos;m Tired&rdquo; In-Trip Rebalancer</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('upi')}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                      activeTab === 'upi'
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                        : 'bg-[#181b26] text-slate-300 hover:text-white hover:bg-[#202535]'
                    }`}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>04 · UPI Split & Min-Cash-Flow</span>
                  </button>
                </div>

                {/* TAB 1: 3-TIER VARIANT COMPARATOR */}
                {activeTab === 'variants' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">Three Distinct Architectural Flavors</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Instead of a single rigid plan, TripWeave simultaneously synthesizes three diversified paths using varied hotel tiers, transit classes, and pacing.
                        </p>
                      </div>
                      <div className="inline-flex rounded-xl bg-[#161824] p-1 border border-white/10 shrink-0">
                        {(['budget', 'balanced', 'comfort'] as const).map(v => (
                          <button
                            key={v}
                            onClick={() => setSelectedVariant(v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                              selectedVariant === v
                                ? 'bg-amber-500 text-black shadow-sm'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Active Variant Card Display */}
                    {(() => {
                      const cur = VARIANT_DEMOS[selectedVariant];
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-[#161924] p-5 sm:p-6 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                                {cur.badge}
                              </span>
                              <span className="text-2xl font-black text-white font-mono">{cur.totalCost}</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">{cur.description}</p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10 text-xs">
                              <div className="rounded-xl bg-[#0e1017] p-3 border border-white/5">
                                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Lodging Base</span>
                                <span className="font-bold text-white mt-1 block">{cur.hotel}</span>
                                <span className="text-amber-400/90 text-[11px]">{cur.hotelPrice}</span>
                              </div>
                              <div className="rounded-xl bg-[#0e1017] p-3 border border-white/5">
                                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Transit Logic</span>
                                <span className="font-bold text-white mt-1 block">{cur.transport}</span>
                                <span className="text-cyan-400 text-[11px]">{cur.transportCost}</span>
                              </div>
                              <div className="rounded-xl bg-[#0e1017] p-3 border border-white/5">
                                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Dining Model</span>
                                <span className="font-bold text-white mt-1 block">{cur.dining}</span>
                                <span className="text-emerald-400 text-[11px]">{cur.diningEst}</span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-[#161924] p-5 flex flex-col justify-between">
                            <div>
                              <span className="text-[11px] text-slate-400 uppercase font-semibold">Financial Breakdown</span>
                              <div className="mt-4 space-y-2 text-xs">
                                <div className="flex justify-between text-slate-300">
                                  <span>Estimated Per Traveler:</span>
                                  <span className="font-bold text-white font-mono">{cur.perPerson}</span>
                                </div>
                                <div className="flex justify-between text-slate-300">
                                  <span>Dynamic Buffer:</span>
                                  <span className="font-bold text-emerald-400 font-mono">Included</span>
                                </div>
                                <div className="flex justify-between text-slate-300">
                                  <span>Solver Feasibility:</span>
                                  <span className="font-bold text-emerald-400">100% Passed</span>
                                </div>
                              </div>
                            </div>
                            <Link
                              href={`/?dest=hyderabad&variant=${selectedVariant}&budget=25000&people=3`}
                              className="mt-6 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold text-center block transition-all"
                            >
                              Open {cur.name} in Planner ↗
                            </Link>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* TAB 2: NOAA ASTRONOMICAL SOLAR SIMULATOR */}
                {activeTab === 'solar' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">NOAA Astral Golden-Hour Positioning</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Instead of visiting outdoor monuments in scorching noon heat, our solar model schedules scenic viewpoints at exact astronomical sunset.
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg shrink-0">
                        Solar Equation 24 Verified
                      </span>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#161924] p-6 space-y-6">
                      <div>
                        <div className="flex justify-between text-xs font-bold text-slate-300 mb-2">
                          <span>Simulate Trip Time: {Math.floor(solarHour)}:{solarHour % 1 === 0 ? '00' : '30'} {solarHour < 12 ? 'AM' : 'PM'}</span>
                          <span className={solarHour >= 17 && solarHour <= 18.5 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}>
                            {solarHour >= 17 && solarHour <= 18.5 ? '✨ Peak Golden Hour Window' : solarHour < 14 ? 'High Heat Solar Radiation' : 'Afternoon Pacing'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="19"
                          step="0.5"
                          value={solarHour}
                          onChange={e => setSolarHour(parseFloat(e.target.value))}
                          className="w-full accent-amber-400 cursor-pointer"
                        />
                      </div>

                      {/* Visual Simulation Display */}
                      <div className={`rounded-xl border p-5 transition-all ${
                        solarHour >= 17 && solarHour <= 18.5
                          ? 'bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-500/5 border-amber-400/50 shadow-lg shadow-orange-500/10'
                          : solarHour < 14
                          ? 'bg-[#10121a] border-cyan-500/30'
                          : 'bg-[#10121a] border-white/10'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                              solarHour >= 17 && solarHour <= 18.5 ? 'bg-amber-400 text-black' : 'bg-[#1a1e2b] text-slate-300'
                            }`}>
                              <Sun className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white">
                                {solarHour >= 17 && solarHour <= 18.5
                                  ? 'Charminar & Laad Bazaar (Scheduled at Sunset)'
                                  : solarHour < 14
                                  ? 'Salar Jung Museum (Air-Conditioned Indoor Gallery)'
                                  : 'Chowmahalla Palace (Shaded Courtyards)'}
                              </h4>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {solarHour >= 17 && solarHour <= 18.5
                                  ? 'Camera Pro-Tip: South-West Minaret Vantage Point during twilight illumination.'
                                  : solarHour < 14
                                  ? 'Midday High-Heat Shielding: Avoids 38°C outdoor stone walking.'
                                  : 'Moderate afternoon exertion schedule.'}
                              </p>
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            solarHour >= 17 && solarHour <= 18.5 ? 'bg-amber-400 text-black' : 'bg-white/10 text-slate-300'
                          }`}>
                            {solarHour >= 17 && solarHour <= 18.5 ? 'Golden Hour Locked' : 'Standard Window'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: LIVE "I'M TIRED" REBALANCER */}
                {activeTab === 'fatigue' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">Live In-Trip Rebalancer (&ldquo;I&apos;m Tired&rdquo;)</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          When physical fatigue strikes mid-day, TripWeave dynamically simplifies the remaining hours without breaking booked hotels or dinner reservations.
                        </p>
                      </div>
                      <div className="inline-flex rounded-xl bg-[#161824] p-1 border border-white/10 shrink-0">
                        {(['mild', 'moderate', 'exhausted'] as const).map(lvl => (
                          <button
                            key={lvl}
                            onClick={() => setFatigueLevel(lvl)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                              fatigueLevel === lvl
                                ? 'bg-amber-500 text-black shadow-sm'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Before Rebalance */}
                      <div className="rounded-2xl border border-rose-500/20 bg-[#161924] p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Before: Original High Strain</span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">Fatigue: 88 / 100</span>
                        </div>
                        <div className="space-y-2 text-xs text-slate-300 pt-2">
                          <div className="flex justify-between p-2 rounded bg-[#0f1118]">
                            <span>09:30 AM · Golconda Fort Hike</span>
                            <span className="text-slate-500">2.5 hrs</span>
                          </div>
                          <div className="flex justify-between p-2 rounded bg-[#0f1118]">
                            <span>01:00 PM · Qutb Shahi Tombs (Detour)</span>
                            <span className="text-rose-400">+4.2 km cab</span>
                          </div>
                          <div className="flex justify-between p-2 rounded bg-[#0f1118]">
                            <span>04:00 PM · Charminar Old City Walk</span>
                            <span className="text-slate-500">1.5 hrs</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 italic">Total distance: 18.4 km • Zero designated rest buffers</p>
                      </div>

                      {/* After Rebalance */}
                      <div className="rounded-2xl border border-emerald-500/30 bg-[#161924] p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                            After: Rebalanced ({fatigueLevel})
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            Fatigue: {fatigueLevel === 'mild' ? '62' : fatigueLevel === 'moderate' ? '46' : '28'} / 100
                          </span>
                        </div>
                        <div className="space-y-2 text-xs text-slate-300 pt-2">
                          <div className="flex justify-between p-2 rounded bg-[#0f1118]">
                            <span>09:30 AM · Golconda Fort (Retained)</span>
                            <span className="text-emerald-400">Done</span>
                          </div>
                          <div className="flex justify-between p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold">
                            <span>☕ 02:00 PM · Nimrah Café Chai & Rest Break</span>
                            <span>+45m Rest</span>
                          </div>
                          <div className="flex justify-between p-2 rounded bg-[#0f1118]">
                            <span>05:30 PM · Charminar (Pinned Sunset Visit)</span>
                            <span className="text-emerald-400">Preserved</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-emerald-400/90 font-medium">
                          ✓ Dropped high-detour stop • Saved 4.2 km & 45 mins • Feasibility: Valid
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: SMART UPI SPLIT SIMULATOR */}
                {activeTab === 'upi' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">NPCI-Standard UPI Debt Settlement</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          A greedy minimum-cash-flow algorithm reduces an N(N-1) tangle of debts into at most N-1 clean one-tap UPI payment transfers.
                        </p>
                      </div>
                      <button
                        onClick={() => setIsSettledDemo(!isSettledDemo)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1d2130] hover:bg-[#252b40] text-amber-300 border border-amber-500/30 transition-all shrink-0"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>{isSettledDemo ? 'Reset Demo' : 'Simulate Real-time Settlement'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Recorded Expenses */}
                      <div className="rounded-2xl border border-white/10 bg-[#161924] p-5 space-y-3">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Logged Group Expenses (3 items)</span>
                        <div className="space-y-2 text-xs">
                          <div className="p-2.5 rounded-lg bg-[#0f1118] flex justify-between items-center">
                            <div>
                              <span className="font-bold text-white block">Paradise Biryani Dinner</span>
                              <span className="text-[10px] text-slate-400">Paid by Suresh • Split 4 ways</span>
                            </div>
                            <span className="font-mono font-bold text-white">₹2,400</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-[#0f1118] flex justify-between items-center">
                            <div>
                              <span className="font-bold text-white block">Auto Cabs to Golconda</span>
                              <span className="text-[10px] text-slate-400">Paid by Priya • Split 4 ways</span>
                            </div>
                            <span className="font-mono font-bold text-white">₹600</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-[#0f1118] flex justify-between items-center">
                            <div>
                              <span className="font-bold text-white block">Heritage Monument Tickets</span>
                              <span className="text-[10px] text-slate-400">Paid by Suresh • Split 4 ways</span>
                            </div>
                            <span className="font-mono font-bold text-white">₹400</span>
                          </div>
                        </div>
                      </div>

                      {/* Optimal Settlement Transfers */}
                      <div className="rounded-2xl border border-amber-500/30 bg-[#161924] p-5 space-y-3">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                          Optimal Settlement Transfers ({isSettledDemo ? '0 Due' : '2 Due'})
                        </span>

                        {isSettledDemo ? (
                          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-2">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                            <h4 className="text-sm font-bold text-white">All Dues Cleared!</h4>
                            <p className="text-xs text-slate-400">
                              Zero balance remaining across Suresh, Priya, Ravi, and Meera.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="p-3 rounded-xl bg-[#0f1118] border border-white/5 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-white font-bold">Ravi ➔ Suresh</span>
                                <span className="text-[10px] text-slate-400 block font-mono">suresh@oksbi</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-black text-amber-300">₹850</span>
                                <a
                                  href="upi://pay?pa=suresh@oksbi&pn=Suresh&am=850.00&cu=INR&tn=TripWeave%20settle"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[11px] rounded-lg shadow-sm"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    navigator.clipboard.writeText('suresh@oksbi');
                                    setCopiedDemoUpi(true);
                                    setTimeout(() => setCopiedDemoUpi(false), 2000);
                                  }}
                                >
                                  <Smartphone className="w-3 h-3" />
                                  <span>{copiedDemoUpi ? 'Copied VPA' : 'Pay UPI'}</span>
                                </a>
                              </div>
                            </div>

                            <div className="p-3 rounded-xl bg-[#0f1118] border border-white/5 flex items-center justify-between text-xs">
                              <div>
                                <span className="text-white font-bold">Meera ➔ Suresh</span>
                                <span className="text-[10px] text-slate-400 block font-mono">suresh@oksbi</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-black text-amber-300">₹850</span>
                                <button
                                  onClick={() => setIsSettledDemo(true)}
                                  className="px-2.5 py-1 bg-[#1a1e2b] hover:bg-[#252b40] text-slate-300 font-semibold text-[11px] rounded-lg border border-white/10"
                                >
                                  Mark Settled
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-500 pt-1">
                          * Tapping &ldquo;Pay UPI&rdquo; on mobile launches GPay, PhonePe, Paytm, or BHIM directly via NPCI deep-linking.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* SECTION 3: CLASSROOM BUSINESS PROPOSAL (Executive Pitch Deck) */}
        {/* ----------------------------------------------------------------- */}
        <section id="business-proposal" className="relative scroll-mt-20 border-t border-b border-white/5 bg-[#0a0c13] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            
            <div className="text-center max-w-2xl mx-auto mb-14">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300 mb-3">
                <TrendingUp className="h-3 w-3" />
                <span>Classroom Proposal Deck</span>
              </div>
              <h2 className="text-3xl font-black text-white sm:text-4xl">
                The Business Model & Competitive Moat
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                Why TripWeave succeeds where legacy travel apps fail: addressing the structural realities of Indian domestic group tourism.
              </p>
            </div>

            {/* 4-Pillar Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
              
              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Award className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">1. The Market Pain</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Indian domestic leisure tourism exceeds <strong className="text-white">$30 Billion annually</strong>. Over 75% of travel is group-led. Coordination breaks down across disjointed maps, unvetted reviews, and awkward debt chasing.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">2. Algorithmic Edge</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Competitors provide manual drag-and-drop bucket lists. TripWeave implements true multi-constraint combinatorial solvers: respecting opening hours, lunch detours, vehicle capacities, and solar illumination.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">3. Monetization Engine</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Dual revenue model: B2B affiliate commissions on verified train/hotel partners (AOPAY / Booking.com in Phase 2) + TripWeave Pro micro-pass (₹199 per trip for offline vector tiles and live multiplayer sync).
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">4. Defensible Moat</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Curated city knowledge bases with opening days, auto fare calculations, fatigue curves for elderly travelers, and zero-drift integer paise UPI settlements create an unmatchable local moats.
                </p>
              </div>

            </div>

            {/* Competitive Comparison Matrix Table */}
            <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 overflow-x-auto">
              <h3 className="text-base font-bold text-white mb-4">Competitive Feature Matrix</h3>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="pb-3 font-semibold">Capability</th>
                    <th className="pb-3 font-bold text-amber-400">TripWeave (Our Engine)</th>
                    <th className="pb-3">MakeMyTrip</th>
                    <th className="pb-3">Wanderlog</th>
                    <th className="pb-3">Google Maps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  <tr>
                    <td className="py-3 font-medium text-white">OR-Tools Route Optimization</td>
                    <td className="py-3 text-emerald-400 font-bold">✓ Native Multi-VRP</td>
                    <td className="py-3 text-slate-500">✗ Fixed Packages</td>
                    <td className="py-3 text-slate-500">✗ Manual Ordering</td>
                    <td className="py-3 text-slate-500">✗ Point-to-Point only</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-white">Astronomical NOAA Sunset Scheduling</td>
                    <td className="py-3 text-emerald-400 font-bold">✓ Equation-driven</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-white">Native NPCI UPI Split Settlement</td>
                    <td className="py-3 text-emerald-400 font-bold">✓ One-Tap Deep Links</td>
                    <td className="py-3 text-slate-500">✗ Single Payer only</td>
                    <td className="py-3 text-slate-500">✗ Manual Venmo/PayPal</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-white">Live In-Trip Fatigue Rebalancer</td>
                    <td className="py-3 text-emerald-400 font-bold">✓ &ldquo;I&apos;m Tired&rdquo; Mode</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-white">Explainable Exclusion Trace (&ldquo;Why Not X?&rdquo;)</td>
                    <td className="py-3 text-emerald-400 font-bold">✓ Transparent Audit</td>
                    <td className="py-3 text-slate-500">✗ Hidden</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                    <td className="py-3 text-slate-500">✗ None</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* SECTION 4: HARDWARE USER MANUAL (Step-by-Step Mobile Style Guide) */}
        {/* ----------------------------------------------------------------- */}
        <section id="user-manual" className="relative scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            
            <div className="text-center max-w-2xl mx-auto mb-14">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-2">Step-by-Step User Manual</p>
              <h2 className="text-3xl font-black text-white sm:text-4xl">
                How To Operate TripWeave Like a Pro
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                A breakdown of every screen, control dial, and workflow inside the platform.
              </p>
            </div>

            <div className="space-y-6">
              
              {/* Step 1 */}
              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 flex flex-col md:flex-row gap-6 items-start">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-lg shrink-0 border border-amber-500/30">
                  01
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-base font-bold text-white">Configure Dates, City & Origin Terminal</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Select a supported hub (Hyderabad, Jaipur, Bengaluru, Delhi, or Mumbai). You can specify your arrival point: City Center Hub, Main Railway Station, or International Airport. If entering an inter-city trip, TripWeave automatically looks up curated direct trains, buses, or flights.
                  </p>
                  <div className="text-[11px] text-amber-400 font-medium pt-1">
                    💡 Pro-Tip: You can enter dates, or select start date + number of days. Single-day weekend trips up to 14-day grand tours are supported.
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 flex flex-col md:flex-row gap-6 items-start">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-lg shrink-0 border border-amber-500/30">
                  02
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-base font-bold text-white">Calibrate Group Size, Budget & Fatigue Profile</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Enter traveler count and your on-ground target budget. Choose your pacing: <strong className="text-white">Relaxed</strong> (max 2 stops/day), <strong className="text-white">Balanced</strong> (max 3 stops/day), or <strong className="text-white">Intensive</strong> (max 4 stops/day). Select your Group Profile (<strong className="text-white">Young Solo</strong>, <strong className="text-white">Family with Kids</strong>, or <strong className="text-white">Elderly / Senior</strong>) to adjust walking stamina penalties and rest buffers.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 flex flex-col md:flex-row gap-6 items-start">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-lg shrink-0 border border-amber-500/30">
                  03
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-base font-bold text-white">Lock Must-Visit Attractions (Pinned Precedence)</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Have non-negotiable sights? Pin them on the form or click the 🔒 Pin button on any stop. If an attraction has prerequisites (e.g., Elephanta Caves requiring Gateway of India ferry departure), TripWeave&apos;s solver automatically enforces sequence order without route breakage.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 flex flex-col md:flex-row gap-6 items-start">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-lg shrink-0 border border-amber-500/30">
                  04
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-base font-bold text-white">Interactive Stop Modification & Consequence Audits</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    On the itinerary screen, every stop provides four tactile controls:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="p-2 rounded-lg bg-[#0e1017] border border-white/5">
                      <span className="font-bold text-amber-300 block">🔒 Pin / Lock</span>
                      <span className="text-[10px] text-slate-400">Forces retention in solver</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#0e1017] border border-white/5">
                      <span className="font-bold text-amber-300 block">⇄ Swap</span>
                      <span className="text-[10px] text-slate-400">Audits alternatives & deltas</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#0e1017] border border-white/5">
                      <span className="font-bold text-orange-400 block">☀️ Sunset</span>
                      <span className="text-[10px] text-slate-400">Shifts to golden hour</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#0e1017] border border-white/5">
                      <span className="font-bold text-rose-400 block">🗑️ Drop</span>
                      <span className="text-[10px] text-slate-400">Removes stop & recalculates</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-6 flex flex-col md:flex-row gap-6 items-start">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-lg shrink-0 border border-amber-500/30">
                  05
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-base font-bold text-white">Live Group Ledger & One-Tap UPI Settlement</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Open the <strong className="text-amber-400">Group Splits</strong> modal anytime. Add members and assign UPI handles. Log receipts on the fly or click &ldquo;Split with Group&rdquo; directly on visited itinerary cards. The engine computes net balances and generates clickable NPCI `upi://pay` links. When payments clear, tap &ldquo;Mark Settled&rdquo; to clear debts instantly!
                  </p>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* SECTION 5: ONE-CLICK DEMO LAUNCH STATION (For Classroom Presentation) */}
        {/* ----------------------------------------------------------------- */}
        <section id="demo-station" className="relative scroll-mt-20 border-t border-white/5 bg-[#0a0c13] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            
            <div className="text-center max-w-2xl mx-auto mb-14">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300 mb-3">
                <RocketIcon className="h-3 w-3" />
                <span>Instant Presentation Launchers</span>
              </div>
              <h2 className="text-3xl font-black text-white sm:text-4xl">
                Ready-to-Present Classroom Demos
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                Click any destination below to launch a rich, fully populated, verified itinerary in the live planner during your class proposal presentation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {QUICK_DEMO_CARDS.map(card => (
                <div
                  key={card.city}
                  className={`rounded-2xl border ${card.border} bg-gradient-to-b ${card.bg} to-[#12141f] p-6 flex flex-col justify-between hover:scale-[1.02] transition-all shadow-xl`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white bg-black/40 px-2.5 py-1 rounded-full border border-white/10">
                        {card.city}
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-400">{card.budget}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">{card.tag}</h3>
                    <p className="text-xs text-slate-300">{card.days} • {card.variant} Tier</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed border-t border-white/10 pt-2">
                      <strong className="text-slate-200">Key Stops:</strong> {card.stops}
                    </p>
                  </div>

                  <Link
                    href={card.url}
                    className="mt-6 inline-flex items-center justify-between w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 text-xs font-bold shadow-md transition-all active:scale-95"
                  >
                    <span>Launch {card.city} Demo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* SECTION 6: TRANSPARENT ARCHITECTURAL SPECS & LIMITS */}
        {/* ----------------------------------------------------------------- */}
        <section className="relative px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            
            <div className="text-center max-w-2xl mx-auto mb-14">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Engineering Disclosures</p>
              <h2 className="text-3xl font-black text-white sm:text-4xl">
                Prototype Boundaries & Data Honesty
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                In academic and commercial proposals, credibility requires total honesty about what is active today versus what is planned on the roadmap.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-5 space-y-2">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Curated Datasets vs Live GDS</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Prices, travel durations, and schedules are seeded from verified timetable baselines (such as Indian Railways indices and state transport tables). They represent realistic benchmarks rather than live dynamic IRCTC Tatkal surges.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-5 space-y-2">
                <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>Client-Side UPI Intent vs Direct Banking</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  UPI buttons trigger standard NPCI `upi://pay` protocol handlers to launch user-installed apps (Google Pay, PhonePe, Paytm). TripWeave never holds user banking credentials or processes merchant funds.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-5 space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
                  <Wallet className="w-4 h-4 shrink-0" />
                  <span>Local-Storage Persistence vs Multi-User Sync</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ledger expenses are isolated and stored in the browser&apos;s persistent `localStorage`. Shareable URLs recreate itinerary plan parameters; they do not synchronize live private financial ledgers across devices.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#12141f] p-5 space-y-2">
                <div className="flex items-center space-x-2 text-violet-400 font-bold text-xs">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>Heuristic Rebalance vs Global Re-Optimization</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The in-trip &ldquo;I&apos;m Tired&rdquo; rebalancer applies deterministic constraint checks (opening times, sunset windows, fatigue metrics) to prune optional detours rapidly without requiring full solver latency.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* SECTION 7: INTERACTIVE FAQ ACCORDION */}
        {/* ----------------------------------------------------------------- */}
        <section className="relative border-t border-white/5 bg-[#0a0c13] px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            
            <div className="text-center mb-12">
              <h2 className="text-2xl font-black text-white sm:text-3xl">
                Frequently Asked Presentation Questions
              </h2>
            </div>

            <div className="space-y-3">
              {[
                {
                  q: 'Why does TripWeave generate 3 variants instead of just 1 "optimal" plan?',
                  a: 'Real-world travel is deeply subjective. What is optimal for a solo backpacker (hostels, metro transit, high physical pace) is completely infeasible for a family with grandparents (private air-conditioned cabs, central hotels, gentle walking paces). Providing Budget, Balanced, and Comfort variants lets travelers instantly compare the financial and comfort tradeoffs.'
                },
                {
                  q: 'How does the optimizer prevent visiting places when they are closed?',
                  a: 'Every curated attraction carries verified opening days and hours (e.g. Salar Jung Museum is strictly closed on Fridays; Taj Mahal is closed on Fridays). The OR-Tools scheduling solver incorporates these as hard mathematical constraints, pruning invalid days before sequencing routes.'
                },
                {
                  q: 'What is the mathematical principle behind the UPI debt settlement engine?',
                  a: 'Pairwise tracking creates quadratic N(N-1) IO debts where everyone pays everyone in circles. TripWeave calculates each person’s net balance (total paid minus total consumed), then applies a greedy bipartite matching algorithm pairing the greatest debtor with the greatest creditor. This mathematically guarantees settling all group dues in at most N-1 transfers.'
                },
                {
                  q: 'How does NOAA solar calculation benefit the traveler?',
                  a: 'Using NOAA Solar Position Equations based on latitude, longitude, and calendar day of the year, TripWeave calculates exact astronomical Golden Hour (60 minutes prior to sunset). It schedules scenic open-air viewpoints like Charminar, Nahargarh Fort, or Marine Drive specifically within this window, while placing indoor museums during peak midday UV heat.'
                },
                {
                  q: 'Can the plan be exported to real calendar apps?',
                  a: 'Yes! The Action Toolbar includes an "Export .ics" button that generates standard iCalendar files compatible with Google Calendar, Apple Calendar, and Microsoft Outlook, complete with location coordinates and visit notes.'
                }
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-white/10 bg-[#12141f] overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between p-5 text-left text-sm font-bold text-white hover:text-amber-300 transition-colors"
                  >
                    <span>{item.q}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openFaq === idx ? 'rotate-180 text-amber-400' : ''}`} />
                  </button>
                  {openFaq === idx && (
                    <div className="px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-white/5 pt-3 animate-in fade-in duration-200">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* FOOTER */}
        {/* ----------------------------------------------------------------- */}
        <footer className="border-t border-white/10 py-12 px-4 text-center text-xs text-slate-500">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-slate-300">TripWeave Travel Operating System</span>
              <span>• Class Business Proposal & User Guide</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-amber-400 hover:underline font-semibold">
                Open Planner
              </Link>
              <a href="#interactive-simulator" className="hover:text-slate-300">
                Interactive Simulator
              </a>
              <a href="#business-proposal" className="hover:text-slate-300">
                Business Deck
              </a>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}

// Micro icon helper
function RocketIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
