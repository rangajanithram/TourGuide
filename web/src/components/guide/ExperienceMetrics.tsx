'use client';

import { useEffect, useRef } from 'react';

/** Local development diagnostics only. No analytics endpoint or personal data. */
export default function ExperienceMetrics() {
  const output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !('PerformanceObserver' in window)) return;
    const values: Record<string, number | string> = { scope: 'local navigation; not field p75' };
    const observers: PerformanceObserver[] = [];
    let windowStart = 0, lastShift = 0, sessionScore = 0;
    const publish = () => { if (output.current) output.current.textContent = JSON.stringify(values); };
    for (const type of ['largest-contentful-paint', 'layout-shift', 'event']) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const item = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number; interactionId?: number };
          if (type === 'largest-contentful-paint') values.lcpMs = Math.round(entry.startTime);
          if (type === 'layout-shift' && !item.hadRecentInput) {
            if (entry.startTime - lastShift > 1000 || entry.startTime - windowStart > 5000) {
              sessionScore = 0; windowStart = entry.startTime;
            }
            sessionScore += item.value ?? 0; lastShift = entry.startTime;
            values.cls = Math.max(Number(values.cls ?? 0), sessionScore);
          }
          // A diagnostic upper bound from observed interactions, not a field INP claim.
          if (type === 'event' && item.interactionId) values.maxObservedInteractionMs = Math.max(Number(values.maxObservedInteractionMs ?? 0), entry.duration);
        }
        publish();
      });
      observer.observe({ type, buffered: true }); observers.push(observer);
    }
    values.cls = 0; publish();
    return () => observers.forEach(observer => observer.disconnect());
  }, []);
  return process.env.NODE_ENV === 'development' ? <output ref={output} data-experience-metrics hidden aria-hidden="true" /> : null;
}
