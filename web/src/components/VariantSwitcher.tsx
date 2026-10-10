'use client';

import React from 'react';
import { ShieldCheck, Zap, Sparkles, Info } from 'lucide-react';
import { MultiVariantTripPlan, VariantKey } from '../types/trip';
import { getAvailableVariants } from '../lib/trips-service';

interface VariantSwitcherProps {
  multiPlan: MultiVariantTripPlan;
  activeVariant: VariantKey;
  onSelectVariant: (variant: VariantKey) => void;
}

export default function VariantSwitcher({
  multiPlan,
  activeVariant,
  onSelectVariant
}: VariantSwitcherProps) {
  const availableKeys = getAvailableVariants(multiPlan.variants);
  const unavailableReasons = multiPlan.unavailable_variants || {};

  const variants: Array<{
    id: VariantKey;
    label: string;
    badge: string;
    icon: typeof Zap;
    plan: typeof multiPlan.variants.balanced;
    desc: string;
  }> = [
    {
      id: 'budget',
      label: 'Budget Saver',
      badge: 'Economical',
      icon: Zap,
      plan: multiPlan.variants.budget,
      desc: 'Relaxed pace, auto-rickshaw/metro transit, budget-conscious lodging'
    },
    {
      id: 'balanced',
      label: 'Balanced Choice',
      badge: 'Recommended',
      icon: Sparkles,
      plan: multiPlan.variants.balanced,
      desc: 'Balanced pace, golden-hour highlights, and centroid-scored lodging'
    },
    {
      id: 'comfort',
      label: 'Comfort & Ease',
      badge: 'Premium',
      icon: ShieldCheck,
      plan: multiPlan.variants.comfort,
      desc: 'Intensive coverage with private cab transit and upgraded lodging'
    }
  ];

  return (
    <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl p-4 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
        <div>
          <h3 className="text-sm font-bold text-[#243e33] tracking-tight">Stage 9 Multi-Variant Synthesizer</h3>
          <p className="text-xs text-[#526653]">
            Only genuinely distinct, constraint-verified alternatives are shown (local on-ground budget)
          </p>
        </div>
        <span className="text-[11px] font-semibold text-[#89532d] bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
          {availableKeys.length} Distinct {availableKeys.length === 1 ? 'Variant' : 'Variants'} Synthesized
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {variants.map(v => {
          const isAvailable = Boolean(v.plan && v.plan.days && v.plan.days.length > 0);
          const isSelected = isAvailable && activeVariant === v.id;
          const Icon = v.icon;

          if (!isAvailable) {
            const reason =
              unavailableReasons[v.id] ||
              'Not available as a distinct feasible schedule under your current budget, date, or transport constraints.';
            return (
              <div
                key={v.id}
                aria-disabled="true"
                className="p-4 rounded-xl border border-dashed border-[#c6d2c0] bg-[#f5f7f0]/70 text-left opacity-80 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Icon className="w-4 h-4 text-[#6d8072]" />
                      <span className="text-sm font-bold text-[#496357]">{v.label}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#e2e8dd] text-[#496357]">
                      Unavailable
                    </span>
                  </div>
                  <p className="text-[11px] text-[#496357] leading-relaxed flex items-start gap-1.5 mt-2">
                    <Info className="w-3.5 h-3.5 text-[#6d8072] shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </p>
                </div>
              </div>
            );
          }

          const totalCost = v.plan?.total_cost_inr || 0;
          const mode = v.plan?.transport_mode || 'cab';

          return (
            <button
              key={v.id}
              type="button"
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
                  <span className={`text-sm font-bold ${isSelected ? 'text-[#243e33]' : 'text-[#294333]'}`}>
                    {v.label}
                  </span>
                </div>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  isSelected ? 'bg-amber-500 text-black' : 'bg-[#d6dfd0] text-[#243e33]'
                }`}>
                  {v.badge}
                </span>
              </div>

              <div className="flex items-baseline space-x-1.5 mb-1.5">
                <span className="text-xl font-extrabold text-[#243e33]">₹{totalCost.toLocaleString('en-IN')}</span>
                <span className="text-xs text-[#526653]">local on-ground est.</span>
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
