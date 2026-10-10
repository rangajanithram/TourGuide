'use client';
import { plannerFetch } from '@/lib/planner-fetch';

import React, { useState, useEffect } from 'react';
import {
  X, ArrowRightLeft, Trash2, Sun, AlertTriangle, CheckCircle2,
  Compass, Sparkles, RefreshCw
} from 'lucide-react';
import {
  TripPlan, DayPlan, EditActionType,
  EditConsequenceResponse, PlaceCandidate
} from '../types/trip';

interface EditConsequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: string;
  plan: TripPlan;
  dayNumber: number;
  activityIndex: number;
  initialAction: EditActionType;
  peopleCount: number;
  onApplyUpdate: (updatedDay: DayPlan, newPlan?: TripPlan) => void;
}

export default function EditConsequenceModal({
  isOpen,
  onClose,
  destination,
  plan,
  dayNumber,
  activityIndex,
  initialAction,
  peopleCount,
  onApplyUpdate
}: EditConsequenceModalProps) {
  const [action, setAction] = useState<EditActionType>(initialAction);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>('');
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<EditConsequenceResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const targetDay = plan.days.find(d => d.day_number === dayNumber);
  const targetActivity = targetDay?.activities[activityIndex];

  // Reset action when initialAction or modal opens
  useEffect(() => {
    if (isOpen) {
      setAction(initialAction);
      setPreview(null);
      setErrorMsg(null);
      setSelectedPlaceId('');
    }
  }, [isOpen, initialAction]);

  // Fetch candidates for swapping
  useEffect(() => {
    if (!isOpen || action !== 'swap') return;

    const controller = new AbortController();
    setCandidates([]);
    setIsLoadingCandidates(true);
    // Exclude places currently in the plan
    const scheduledPlaceIds: string[] = [];
    plan.days.forEach(d => {
      d.activities.forEach(a => {
        if (a.place_id) scheduledPlaceIds.push(a.place_id);
      });
    });

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    plannerFetch(`${apiUrl}/api/itinerary/candidates?destination=${encodeURIComponent(destination)}&exclude_ids=${encodeURIComponent(scheduledPlaceIds.join(','))}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load candidate alternatives');
        return res.json();
      })
      .then((data: PlaceCandidate[]) => {
        if (controller.signal.aborted) return;
        setCandidates(data);
        if (data.length > 0) {
          setSelectedPlaceId(data[0].place_id);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        if (!controller.signal.aborted) setErrorMsg('Unable to load candidate attractions.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingCandidates(false);
      });
    return () => controller.abort();
  }, [isOpen, action, destination, plan]);

  // Fetch preview consequence whenever action or selected place changes
  useEffect(() => {
    if (!isOpen || !targetActivity) return;
    if (action === 'swap' && !selectedPlaceId) return;

    const controller = new AbortController();
    setPreview(null);
    setIsLoadingPreview(true);
    setErrorMsg(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    plannerFetch(`${apiUrl}/api/itinerary/preview-edit`, {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination,
        plan,
        day_number: dayNumber,
        activity_index: activityIndex,
        action,
        replacement_place_id: action === 'swap' ? selectedPlaceId : undefined,
        people_count: peopleCount,
        transport_mode: plan.transport_mode
      })
    })
      .then(res => {
        if (!res.ok) return res.json().then(e => { throw new Error(e.detail || 'Failed preview'); });
        return res.json();
      })
      .then((data: EditConsequenceResponse) => {
        if (!controller.signal.aborted) setPreview(data);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (!controller.signal.aborted) setErrorMsg(err.message || 'Could not preview this change. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingPreview(false);
      });
    return () => controller.abort();
  }, [isOpen, action, selectedPlaceId, destination, plan, dayNumber, activityIndex, peopleCount, targetActivity]);

  if (!isOpen || !targetActivity) return null;

  const handleApply = () => {
    if (preview?.suggested_updated_day) {
      onApplyUpdate(preview.suggested_updated_day);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#fffdf5] border border-[#d6dfd0] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#d6dfd0] bg-[#eef1e5]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#89532d]">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#243e33]">Customize Itinerary Stop</h3>
              <p className="text-[11px] text-[#526653]">Day {dayNumber} • {targetActivity.place_name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#526653] hover:text-[#243e33] hover:bg-[#c6d2c0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Switcher Tabs */}
        <div className="grid grid-cols-3 border-b border-[#d6dfd0] bg-[#eef1e5] p-1.5 gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setAction('swap')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
              action === 'swap'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-[#526653] hover:text-[#243e33] hover:bg-[#d6dfd0]'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Swap Stop</span>
          </button>
          <button
            type="button"
            onClick={() => setAction('remove')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
              action === 'remove'
                ? 'bg-rose-500 text-[#243e33] shadow-md'
                : 'text-[#526653] hover:text-[#243e33] hover:bg-[#d6dfd0]'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Drop Stop</span>
          </button>
          <button
            type="button"
            onClick={() => setAction('move_to_sunset')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
              action === 'move_to_sunset'
                ? 'bg-amber-600 text-[#243e33] shadow-md'
                : 'text-[#526653] hover:text-[#243e33] hover:bg-[#d6dfd0]'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Move to Sunset</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Action-specific input controls */}
          {action === 'swap' && (
            <div className="space-y-2">
              <label className="block text-[#425d4c] font-semibold flex items-center justify-between">
                <span>Select Alternative Attraction</span>
                <span className="text-[10px] text-[#596b57] font-normal">
                  {candidates.length} candidate places available
                </span>
              </label>

              {isLoadingCandidates ? (
                <div className="p-4 bg-[#eef1e5] rounded-xl text-center text-[#526653] flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#89532d]" />
                  <span>Loading candidate database...</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {candidates.map(c => {
                    const isSelected = selectedPlaceId === c.place_id;
                    return (
                      <div
                        key={c.place_id}
                        onClick={() => setSelectedPlaceId(c.place_id)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/50 text-[#243e33] ring-1 ring-amber-500/30'
                            : 'bg-[#eef1e5] border-[#c6d2c0] text-[#425d4c] hover:border-gray-600'
                        }`}
                      >
                        <div>
                          <span className="font-bold text-[#243e33] block">{c.name}</span>
                          <span className="text-[10px] text-[#526653] capitalize">
                            {c.place_type} • {c.duration_minutes} mins duration
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[#89532d] font-bold block">
                            ₹{c.estimated_cost_per_person_inr * peopleCount}
                          </span>
                          <span className="text-[9px] text-[#596b57] block">
                            ₹{c.estimated_cost_per_person_inr}/person
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {action === 'remove' && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1 text-rose-300">
              <span className="font-bold block">Drop Stop Confirmation:</span>
              <p className="text-[11px] leading-relaxed text-rose-200/90">
                Dropping <strong className="text-[#243e33]">&apos;{targetActivity.place_name}&apos;</strong> will stitch the preceding
                and succeeding stops directly together, recalculating commute times and removing entry fees.
              </p>
            </div>
          )}

          {action === 'move_to_sunset' && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1 text-[#89532d]">
              <span className="font-bold block">NOAA Sunset Recalibration:</span>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                Moves <strong className="text-[#243e33]">&apos;{targetActivity.place_name}&apos;</strong> into the astronomical golden hour
                time-window for Day {dayNumber}, reordering neighboring stops chronologically.
              </p>
            </div>
          )}

          {/* Edit Consequence Preview Card */}
          {isLoadingPreview ? (
            <div className="p-5 bg-[#eef1e5] border border-[#c6d2c0] rounded-xl text-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#89532d] mx-auto" />
              <p className="text-[#526653] font-medium">Computing real-world physics & cost delta...</p>
            </div>
          ) : preview ? (
            <div className="bg-[#eef1e5] border border-[#c6d2c0] rounded-xl p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#c6d2c0]">
                <div className="flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-[#89532d]" />
                  <span className="font-bold text-[#243e33] text-xs uppercase tracking-wider">
                    Edit Impact Preview
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  preview.is_feasible
                    ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}>
                  {preview.is_feasible ? 'Valid Feasibility' : 'Advisory / Infeasible'}
                </span>
              </div>

              {/* 3 Metric Pills */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#fffdf5] border border-[#c6d2c0] p-2 rounded-lg">
                  <span className="text-[9px] text-[#596b57] block uppercase font-semibold">Cost Delta</span>
                  <span className={`text-xs font-bold ${
                    preview.delta_cost_inr > 0 ? 'text-[#89532d]' : preview.delta_cost_inr < 0 ? 'text-emerald-700' : 'text-[#425d4c]'
                  }`}>
                    {preview.delta_cost_inr > 0 ? `+₹${preview.delta_cost_inr}` : preview.delta_cost_inr < 0 ? `-₹${Math.abs(preview.delta_cost_inr)}` : '₹0'}
                  </span>
                </div>

                <div className="bg-[#fffdf5] border border-[#c6d2c0] p-2 rounded-lg">
                  <span className="text-[9px] text-[#596b57] block uppercase font-semibold">Transit Distance</span>
                  <span className="text-xs font-bold text-[#243e33]">
                    {preview.delta_transit_km > 0 ? `+${preview.delta_transit_km} km` : `${preview.delta_transit_km} km`}
                  </span>
                </div>

                <div className="bg-[#fffdf5] border border-[#c6d2c0] p-2 rounded-lg">
                  <span className="text-[9px] text-[#596b57] block uppercase font-semibold">Commute Time</span>
                  <span className="text-xs font-bold text-[#243e33]">
                    {preview.delta_transit_minutes > 0 ? `+${preview.delta_transit_minutes} min` : `${preview.delta_transit_minutes} min`}
                  </span>
                </div>
              </div>

              {/* Narrative Summary */}
              <p className="text-xs text-[#425d4c] bg-[#fffdf5] p-3 rounded-lg border border-[#d6dfd0] leading-relaxed">
                {preview.impact_summary}
              </p>

              {/* Feasibility Notes */}
              {preview.feasibility_notes && preview.feasibility_notes.length > 0 && (
                <div className="space-y-1">
                  {preview.feasibility_notes.map((note, idx) => (
                    <div key={idx} className="flex items-start space-x-1.5 text-[11px] text-[#526653]">
                      {note.includes('⚠️') ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      )}
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#d6dfd0] bg-[#eef1e5] flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#fffdf5] hover:bg-[#d6dfd0] border border-[#c6d2c0] text-[#425d4c] text-xs font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!preview?.suggested_updated_day}
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
