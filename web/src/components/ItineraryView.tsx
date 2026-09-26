'use client';

import React from 'react';
import { 
  Building2, Camera, Compass, Sparkles, Layers
} from 'lucide-react';
import { TripPlan } from '../types/trip';

interface ItineraryViewProps {
  plan: TripPlan;
}

export default function ItineraryView({ plan }: ItineraryViewProps) {
  const hotel = plan.hotel_summary;
  const totalActivitiesCost = plan.days.reduce((acc, d) => acc + d.day_cost_inr, 0);
  const totalStops = plan.days.reduce((acc, d) => acc + d.activities.length, 0);

  return (
    <div className="space-y-6">
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

      {/* Day by Day Itinerary */}
      <div className="space-y-5">
        <h3 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
          <Compass className="w-5 h-5 text-amber-400" />
          <span>Optimized Daily Schedule</span>
        </h3>

        {plan.days.map(day => (
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

              <div className="text-xs font-semibold text-gray-400">
                Day Tickets: <span className="text-white">₹{day.day_cost_inr.toLocaleString('en-IN')}</span>
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
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                          {act.start_time} - {act.end_time}
                        </span>
                        <h5 className="font-bold text-sm text-white">{act.place_name}</h5>
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
    </div>
  );
}
