import { TripPlan } from '../types/trip';

function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds lines according to RFC 5545 section 3.1:
 * Lines of text SHOULD NOT be longer than 75 octets.
 * Long lines are folded with CRLF followed by a single whitespace.
 */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 74) {
    parts.push(' ' + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  if (remaining.length > 0) {
    parts.push(' ' + remaining);
  }
  return parts.join('\r\n');
}

/**
 * Exports the complete TripPlan to a standard RFC 5545 iCalendar (.ics) file
 * compatible with Google Calendar, Apple Calendar, and Microsoft Outlook.
 */
export function exportToIcs(plan: TripPlan, destination: string) {
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TourGuide//TripWeave Engine 1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:TourGuide - ${escapeIcsText(destination)} Itinerary`,
    'X-WR-TIMEZONE:Asia/Kolkata',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'X-LIC-LOCATION:Asia/Kolkata',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  plan.days.forEach(day => {
    // Resolve date: use day.date if present; otherwise fall back to sequential days from today
    let dayDate = day.date;
    if (!dayDate) {
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() + (day.day_number - 1));
      dayDate = fallbackDate.toISOString().split('T')[0];
    }
    const [year, month, d] = dayDate.split('-');

    day.activities.forEach((act, actIdx) => {
      const parseTime = (timeStr: string) => {
        try {
          const parts = timeStr.trim().split(' ');
          const timePart = parts[0];
          const modifier = parts[1] || 'AM';
          const timeTokens = timePart.split(':').map(Number);
          let hours = timeTokens[0];
          const minutes = timeTokens[1] || 0;
          if (modifier === 'PM' && hours < 12) hours += 12;
          if (modifier === 'AM' && hours === 12) hours = 0;
          return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}00`;
        } catch {
          return '090000';
        }
      };

      const dtStart = `${year}${month}${d}T${parseTime(act.start_time)}`;
      const dtEnd = `${year}${month}${d}T${parseTime(act.end_time)}`;
      // Deterministic RFC 5545 UID
      const uid = `tourguide-${destination.toLowerCase()}-${plan.variant_type || 'bal'}-d${day.day_number}-${actIdx}-${dayDate}@tourguide.local`;

      let rawDesc = `TourGuide Scheduled Visit: ${act.place_name}\nEst Cost: ₹${act.estimated_cost_inr}\nTime: ${act.start_time} - ${act.end_time}`;
      if (act.recommended_viewpoint) {
        const vpName = act.recommended_viewpoint.viewpoint_name || act.recommended_viewpoint.name || 'Vantage Point';
        rawDesc += `\nBest Spot: ${vpName} - ${act.recommended_viewpoint.description}`;
      }
      if (act.experience_tag) {
        rawDesc += `\nHighlight: ${act.experience_tag}`;
      }

      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `SUMMARY:${escapeIcsText(`${act.place_name} (${destination})`)}`,
        `DESCRIPTION:${escapeIcsText(rawDesc)}`,
        `DTSTART;TZID=Asia/Kolkata:${dtStart}`,
        `DTEND;TZID=Asia/Kolkata:${dtEnd}`,
        `LOCATION:${escapeIcsText(act.lat && act.lng ? `${act.lat}, ${act.lng}` : destination)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    });
  });

  icsLines.push('END:VCALENDAR');

  // RFC 5545 standard line folding with CRLF line breaks
  const formattedIcs = icsLines.map(foldIcsLine).join('\r\n');
  const blob = new Blob([formattedIcs], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `TourGuide-${destination}-Itinerary.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats the itinerary into clean markdown summary for clipboard sharing.
 */
export function formatItineraryForShare(plan: TripPlan, destination: string): string {
  let summary = `🌟 TourGuide Optimized Itinerary: ${destination} (${plan.variant_type.toUpperCase()} Variant)\n`;
  summary += `💰 Total Estimated Cost: ₹${plan.total_cost_inr.toLocaleString('en-IN')}\n`;
  if (plan.hotel_summary) {
    summary += `🏨 Base Stay: ${plan.hotel_summary.hotel_name} (₹${plan.hotel_summary.price_per_night_per_room}/night)\n`;
  }
  summary += `🚗 Transit: ${plan.transport_mode.toUpperCase()} (₹${plan.estimated_transport_cost_inr})\n\n`;

  plan.days.forEach(day => {
    summary += `📅 Day ${day.day_number} (${day.day_of_week || 'Schedule'} - ${day.date || ''})\n`;
    if (day.cluster_name) summary += `   Hub: ${day.cluster_name}\n`;
    day.activities.forEach((act, idx) => {
      summary += `   ${idx + 1}. ${act.start_time} - ${act.end_time} : ${act.place_name} (₹${act.estimated_cost_inr})\n`;
      if (act.recommended_viewpoint) {
        summary += `      📸 Tip: ${act.recommended_viewpoint.description}\n`;
      }
    });
    summary += '\n';
  });

  summary += `✨ Generated by TourGuide - Optimized with Google OR-Tools routing, travel-time models & feasibility verification.`;
  return summary;
}
