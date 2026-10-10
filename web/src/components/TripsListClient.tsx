'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BookmarkCheck,
  Calendar,
  Compass,
  Edit3,
  ExternalLink,
  History,
  IndianRupee,
  Loader2,
  MapPin,
  PlusCircle,
  RefreshCw,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { createTripsService, getAvailableVariants, type SupabasePersistenceClient } from '@/lib/trips-service';
import type { SavedTripRecord } from '@/types/trip';

export default function TripsListClient() {
  const [trips, setTrips] = useState<SavedTripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tripsService = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    return createTripsService(getBrowserSupabase() as unknown as SupabasePersistenceClient);
  }, []);

  const loadTrips = useCallback(async () => {
    if (!tripsService) {
      setErrorMessage('Supabase client is not configured in this environment.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const list = await tripsService.listSavedTrips();
      setTrips(list);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load saved trips. Make sure the latest Supabase migration has been applied.');
    } finally {
      setLoading(false);
    }
  }, [tripsService]);

  useEffect(() => {
    void loadTrips();
  }, [loadTrips]);

  const handleStartRename = (trip: SavedTripRecord) => {
    setEditingId(trip.id);
    setEditingTitle(trip.title);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleSaveRename = async (tripId: string) => {
    if (!tripsService) return;
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setErrorMessage('Trip title cannot be empty.');
      return;
    }
    setRenamingId(tripId);
    setErrorMessage(null);
    try {
      const updated = await tripsService.renameSavedTrip(tripId, trimmed);
      setTrips((prev) => prev.map((item) => (item.id === tripId ? updated : item)));
      setEditingId(null);
      setStatusMessage(`Renamed trip to "${updated.title}".`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to rename trip.');
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (trip: SavedTripRecord) => {
    if (!tripsService) return;
    setDeletingId(trip.id);
    setErrorMessage(null);
    try {
      await tripsService.deleteSavedTrip(trip.id);
      setTrips((prev) => prev.filter((item) => item.id !== trip.id));
      setConfirmDeleteId(null);
      setStatusMessage(`Deleted "${trip.title}" and its version history.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete trip.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#c6d2c0]">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#4a6b5b] flex items-center gap-1.5">
            <BookmarkCheck size={14} /> Saved Itineraries & Version Vault
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1f332a] mt-1 tracking-tight">
            My Trips
          </h1>
          <p className="text-sm text-[#496357] mt-1.5 max-w-2xl">
            Reopen any saved itinerary snapshot instantly without regenerating, customize stops, or restore an earlier revision from its version history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadTrips()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#c6d2c0] bg-white px-3.5 py-2.5 text-xs font-bold text-[#243e33] hover:bg-[#f2f6ee] transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            href="/planner"
            className="inline-flex items-center gap-2 rounded-xl bg-[#243e33] px-4 py-2.5 text-sm font-bold text-[#fffdf5] shadow-sm hover:bg-[#1b3027] transition"
          >
            <PlusCircle size={16} />
            Create trip
          </Link>
        </div>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900"
        >
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={17} className="text-emerald-700 shrink-0" />
            {statusMessage}
          </span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs font-bold uppercase tracking-wider text-emerald-800 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertCircle size={17} className="text-red-700 shrink-0" />
            {errorMessage}
          </span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold uppercase tracking-wider text-red-800 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-10 rounded-3xl border border-[#c6d2c0] bg-white/80 p-12 text-center shadow-sm">
          <Loader2 size={28} className="mx-auto animate-spin text-[#2f5d46]" />
          <p className="mt-3 text-sm font-semibold text-[#243e33]">Loading your saved itineraries…</p>
          <p className="mt-1 text-xs text-[#557064]">Fetching verified account snapshots from Supabase</p>
        </div>
      ) : trips.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-[#b5c7ad] bg-[#f7faf4] p-10 sm:p-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e5efe0] text-[#243e33]">
            <Compass size={28} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#1f332a]">No saved trips yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#4e675b]">
            Generate a multi-day itinerary in the planner and click <strong>Save trip</strong> to keep a permanent snapshot with full version history.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/planner"
              className="inline-flex items-center gap-2 rounded-xl bg-[#243e33] px-5 py-3 text-sm font-bold text-[#fffdf5] shadow-sm hover:bg-[#1b3027] transition"
            >
              <PlusCircle size={17} />
              Create your first trip
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
          {trips.map((trip) => {
            const activePlan = trip.itinerary_data.variants[trip.selected_variant];
            const availableVariants = getAvailableVariants(trip.itinerary_data.variants);
            const totalStops =
              activePlan?.days?.reduce((acc, d) => acc + (d.activities?.length || 0), 0) || 0;
            const onGroundCost = activePlan?.total_cost_inr ?? trip.budget_inr;
            const isEditing = editingId === trip.id;
            const isConfirmingDelete = confirmDeleteId === trip.id;

            return (
              <article
                key={trip.id}
                className="flex flex-col justify-between rounded-3xl border border-[#c6d2c0] bg-white p-5 sm:p-6 shadow-sm hover:border-[#8fa989] transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e7efe1] px-2.5 py-1 text-xs font-bold text-[#243e33]">
                        <MapPin size={12} />
                        {trip.destination}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#c6d2c0] bg-[#fbfcf8] px-2.5 py-1 text-xs font-semibold text-[#3f594d]">
                        v{trip.current_version}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-900">
                        {trip.selected_variant} tier
                      </span>
                    </div>
                    <span className="text-[11px] text-[#688074] whitespace-nowrap">
                      Updated {new Date(trip.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="mt-3 flex items-center gap-2">
                      <label htmlFor={`rename-${trip.id}`} className="sr-only">
                        Trip title
                      </label>
                      <input
                        id={`rename-${trip.id}`}
                        type="text"
                        maxLength={120}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSaveRename(trip.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 rounded-xl border border-[#8fa989] bg-[#fffdf5] px-3 py-1.5 text-sm font-bold text-[#1f332a] focus:outline-none focus:ring-2 focus:ring-[#243e33]"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={renamingId === trip.id}
                        onClick={() => void handleSaveRename(trip.id)}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#243e33] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1b3027] disabled:opacity-50"
                      >
                        {renamingId === trip.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#c6d2c0] px-2.5 py-1.5 text-xs font-semibold text-[#496357] hover:bg-slate-100"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-start justify-between gap-2">
                      <h2 className="text-lg font-extrabold text-[#1f332a] leading-snug">
                        {trip.title}
                      </h2>
                      <button
                        type="button"
                        onClick={() => handleStartRename(trip)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#496357] hover:bg-[#f2f6ee] hover:text-[#1f332a] transition shrink-0"
                        title="Rename trip"
                      >
                        <Edit3 size={13} />
                        Rename
                      </button>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-2xl bg-[#f7faf4] p-3 border border-[#e2eadc] text-xs">
                    <div>
                      <span className="text-[#60786c] block">Dates / Duration</span>
                      <span className="font-bold text-[#1f332a] flex items-center gap-1 mt-0.5">
                        <Calendar size={12} className="text-[#2f5d46]" />
                        {trip.start_date && trip.end_date
                          ? `${trip.start_date} → ${trip.end_date}`
                          : `${trip.days} Day${trip.days > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#60786c] block">Local On-Ground Est.</span>
                      <span className="font-bold text-[#1f332a] flex items-center gap-0.5 mt-0.5">
                        <IndianRupee size={12} className="text-[#2f5d46]" />
                        {onGroundCost.toLocaleString('en-IN')}
                        <span className="text-[11px] font-normal text-[#60786c]">
                          / ₹{trip.budget_inr.toLocaleString('en-IN')}
                        </span>
                      </span>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <span className="text-[#60786c] block">Snapshot Coverage</span>
                      <span className="font-bold text-[#1f332a] block mt-0.5">
                        {totalStops} stops • {availableVariants.length} tier{availableVariants.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#e6ede1] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/planner?tripId=${encodeURIComponent(trip.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#243e33] px-4 py-2 text-xs font-bold text-[#fffdf5] hover:bg-[#1b3027] transition shadow-sm"
                    >
                      <ExternalLink size={13} />
                      Open saved trip
                    </Link>
                    <Link
                      href={`/planner?tripId=${encodeURIComponent(trip.id)}&history=1`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#c6d2c0] bg-[#f7faf4] px-3.5 py-2 text-xs font-bold text-[#243e33] hover:bg-[#e7efe1] transition"
                    >
                      <History size={13} />
                      View history (v{trip.current_version})
                    </Link>
                  </div>

                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1">
                      <span className="text-[11px] font-bold text-red-800">Delete trip?</span>
                      <button
                        type="button"
                        disabled={deletingId === trip.id}
                        onClick={() => void handleDelete(trip)}
                        className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingId === trip.id ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(trip.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-transparent px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 hover:border-red-200 transition"
                      title="Delete saved trip"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
