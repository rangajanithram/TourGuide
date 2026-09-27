'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { TripPlan } from '../types/trip';

interface MapComponentProps {
  plan: TripPlan;
  selectedDay?: number | 'all';
  onSelectDay?: (day: number | 'all') => void;
}

// Map Auto-Fitter to zoom & fit all markers into viewport only when day filter or variant changes
function MapAutoFitter({ coordinates, filterKey }: { coordinates: [number, number][]; filterKey: string }) {
  const map = useMap();
  const prevKeyRef = useRef<string>('');

  useEffect(() => {
    if (coordinates.length > 0 && prevKeyRef.current !== filterKey) {
      prevKeyRef.current = filterKey;
      const bounds = L.latLngBounds(coordinates);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [coordinates, filterKey, map]);
  return null;
}

const DAY_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

export default function MapComponent({ plan, selectedDay = 'all', onSelectDay }: MapComponentProps) {
  const hotel = plan.hotel_summary;
  const hotelLat = hotel?.lat || 17.3850;
  const hotelLng = hotel?.lng || 78.4867;

  const filterKey = `${plan.variant_type}-${selectedDay}-${plan.days.length}`;

  // Memoize coordinates based on selectedDay filter for auto-zoom
  const filteredCoords = useMemo(() => {
    const coords: [number, number][] = [];
    if (hotel?.lat && hotel?.lng) {
      coords.push([hotel.lat, hotel.lng]);
    }

    plan.days.forEach(day => {
      if (selectedDay === 'all' || selectedDay === day.day_number) {
        day.activities.forEach(act => {
          if (act.lat && act.lng) {
            coords.push([act.lat, act.lng]);
          }
        });
      }
    });
    return coords;
  }, [hotel?.lat, hotel?.lng, plan.days, selectedDay]);

  const hotelIcon = L.divIcon({
    className: 'custom-hotel-pin',
    html: `
      <div style="background:#f59e0b; color:#090a0f; font-weight:800; font-size:11px; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 16px rgba(245,158,11,0.6); border:2.5px solid #ffffff;">
        🏨
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });

  const createActivityIcon = (dayNumber: number, stepIndex: number) => {
    const color = DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
    return L.divIcon({
      className: 'custom-activity-pin',
      html: `
        <div style="background:${color}; color:#090a0f; font-weight:800; font-size:11px; border-radius:8px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.6); border:2px solid #ffffff;">
          ${dayNumber}.${stepIndex + 1}
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    });
  };

  return (
    <div className="w-full h-full min-h-[460px] rounded-2xl overflow-hidden border border-[#1e2230] relative shadow-2xl bg-[#090a0f]">
      {/* Day Filter Toolbar Overlay */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center space-x-1.5 bg-[#11131b]/90 backdrop-blur-md border border-[#1e2230] rounded-xl p-1 shadow-lg">
        <button
          type="button"
          onClick={() => onSelectDay?.('all')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
            selectedDay === 'all' 
              ? 'bg-amber-500 text-black shadow' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          All Days
        </button>
        {plan.days.map((d, idx) => {
          const isSelected = selectedDay === d.day_number;
          return (
            <button
              key={d.day_number}
              type="button"
              onClick={() => onSelectDay?.(d.day_number)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5 ${
                isSelected
                  ? 'bg-amber-500 text-black shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: DAY_COLORS[idx % DAY_COLORS.length] }}
              />
              <span>Day {d.day_number}</span>
            </button>
          );
        })}
      </div>

      {/* Legend Overlay */}
      <div className="absolute top-3 right-3 z-[1000] bg-[#11131b]/90 backdrop-blur-md border border-[#1e2230] rounded-xl px-3 py-2 text-xs shadow-lg space-y-1.5 hidden sm:block">
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-white"></span>
          <span className="text-gray-300 font-semibold">Centroid Base / Hotel</span>
        </div>
        {plan.days.map((day, idx) => (
          <div key={day.day_number} className="flex items-center space-x-2">
            <span 
              className="w-3 h-3 rounded-sm border border-white"
              style={{ backgroundColor: DAY_COLORS[idx % DAY_COLORS.length] }}
            ></span>
            <span className="text-gray-300 font-medium">Day {day.day_number} Route</span>
          </div>
        ))}
      </div>

      <MapContainer
        center={[hotelLat, hotelLng]}
        zoom={12}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {filteredCoords.length > 0 && <MapAutoFitter coordinates={filteredCoords} filterKey={filterKey} />}

        {/* Hotel Pin */}
        {hotel?.lat && hotel?.lng && (
          <Marker position={[hotel.lat, hotel.lng]} icon={hotelIcon}>
            <Popup>
              <div className="p-1">
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest block">Base Hotel</span>
                <h4 className="font-bold text-sm text-gray-900 dark:text-white mt-0.5">{hotel.hotel_name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">₹{hotel.cost_per_night_inr || hotel.price_per_night_per_room}/night • {hotel.rooms_needed} room(s)</p>
                {hotel.why_this_hotel && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 italic border-t border-gray-200 dark:border-gray-700 pt-1">
                    {hotel.why_this_hotel}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Day Activities Pins and Route Polylines */}
        {plan.days.map((day, dayIdx) => {
          const isDayActive = selectedDay === 'all' || selectedDay === day.day_number;
          const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
          const routePoints: [number, number][] = [];

          if (hotel?.lat && hotel?.lng) {
            routePoints.push([hotel.lat, hotel.lng]);
          }

          day.activities.forEach(act => {
            if (act.lat && act.lng) {
              routePoints.push([act.lat, act.lng]);
            }
          });

          if (hotel?.lat && hotel?.lng && routePoints.length > 1) {
            routePoints.push([hotel.lat, hotel.lng]);
          }

          if (!isDayActive) return null;

          return (
            <React.Fragment key={day.day_number}>
              {/* Polyline of the day's route */}
              {routePoints.length > 1 && (
                <Polyline
                  positions={routePoints}
                  color={color}
                  weight={selectedDay === day.day_number ? 4.5 : 3.0}
                  opacity={0.85}
                  dashArray="6, 8"
                />
              )}

              {/* Stop Markers */}
              {day.activities.map((act, actIdx) => {
                if (!act.lat || !act.lng) return null;
                return (
                  <Marker
                    key={`${day.day_number}-${actIdx}`}
                    position={[act.lat, act.lng]}
                    icon={createActivityIcon(day.day_number, actIdx)}
                  >
                    <Popup>
                      <div className="p-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color }}>
                          Day {day.day_number} • Stop {actIdx + 1} ({act.start_time} - {act.end_time})
                        </span>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white mt-0.5">{act.place_name}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                          Cost: ₹{act.estimated_cost_inr}
                        </p>
                        {act.experience_tag && (
                          <div className="mt-1.5 inline-block text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded">
                            {act.experience_tag}
                          </div>
                        )}
                        {act.recommended_viewpoint && (
                          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1.5 border-t border-gray-200 dark:border-gray-700 pt-1">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">Pro-tip:</span> {act.recommended_viewpoint.viewpoint_name || act.recommended_viewpoint.name}
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
