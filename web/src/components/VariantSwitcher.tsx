'use client';

import React from 'react';
import { ShieldCheck, Zap, Sparkles } from 'lucide-react';
import { MultiVariantTripPlan } from '../types/trip';

interface VariantSwitcherProps {
  multiPlan: MultiVariantTripPlan;
  activeVariant: 'budget' | 'balanced' | 'comfort';
  onSelectVariant: (variant: 'budget' | 'balanced' | 'comfort') => void;
}

export default function VariantSwitcher({
  multiPlan,
  activeVariant,
  onSelectVariant
}: VariantSwitcherProps) {
  const variants = [
    {
      id: 'budget' as const,
      label: 'Budget Saver',
      badge: 'Economical',
      icon: Zap,
      plan: multiPlan.variants.budget,
      desc: 'Smart budget stay, auto-rickshaw/metro transit, high attraction coverage'
    },
    {
      id: 'balanced' as const,
      label: 'Balanced Choice',
      badge: 'Recommended',
      icon: Sparkles,
      plan: multiPlan.variants.balanced,
      desc: 'Optimal balance of comfort, scenic viewpoints, and smooth pacing'
    },
    {
      id: 'comfort' as const,
      label: 'Comfort & Ease',
      badge: 'Premium',
      icon: ShieldCheck,
      plan: multiPlan.variants.comfort,
      desc: 'Upgraded boutique hotel, private cab transit, relaxed sightseeing buffer'
    }
  ];

  return (
    <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-4 shadow-xl mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <h3 className="text-sm font-bold text-[#243e33] tracking-tight">Stage 9 Multi-Variant Synthesizer</h3>
          <p className="text-xs text-[#526653]">Deterministic multi-objective alternatives generated for your group</p>
        </div>
        <span className="text-[11px] font-semibold text-[#89532d] bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
          3 Variants Synthesized
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {variants.map(v => {
          const isSelected = activeVariant === v.id;
          const Icon = v.icon;
          const totalCost = v.plan?.total_cost_inr || 0;
          const mode = v.plan?.transport_mode || 'cab';

          return (
            <button
              key={v.id}
              onClick={() => onSelectVariant(v.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/30'
                  : 'bg-[#eef1e5] border-[#c6d2c0] hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-[#89532d]' : 'text-[#526653]'}`} />
                  <span className={`text-sm font-bold ${isSelected ? 'text-[#243e33]' : 'text-gray-200'}`}>
                    {v.label}
                  </span>
                </div>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  isSelected ? 'bg-amber-500 text-black' : 'bg-gray-800 text-[#526653]'
                }`}>
                  {v.badge}
                </span>
              </div>

              <div className="flex items-baseline space-x-1.5 mb-1.5">
                <span className="text-xl font-extrabold text-[#243e33]">₹{totalCost.toLocaleString('en-IN')}</span>
                <span className="text-xs text-[#526653]">total trip</span>
              </div>

              <div className="flex items-center space-x-2 text-xs text-[#526653] mb-2">
                <span className="capitalize px-1.5 py-0.5 rounded bg-[#d6dfd0] text-[#425d4c] font-medium">
                  {mode}
                </span>
                <span>•</span>
                <span>{v.plan?.days.length || 0} Days</span>
              </div>

              <p className="text-[11px] text-[#526653] line-clamp-2 leading-relaxed">{v.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
