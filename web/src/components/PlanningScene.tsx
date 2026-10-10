'use client';
import { useEffect, useState } from 'react';
import JourneyLoading from './JourneyLoading';
const phrases = ['A little planning. More room for possibility.', 'Good journeys leave room to breathe.', 'Your next story starts with a thoughtful route.', 'A sunset, a shared meal, a day that feels like you.'];
export default function PlanningScene() {
  const [phrase, setPhrase] = useState(0);
  useEffect(() => { const timer = setInterval(() => setPhrase(index => (index + 1) % phrases.length), 6500); return () => clearInterval(timer); }, []);
  return <section className="planning-scene" aria-label="Trip planning in progress">
    <JourneyLoading compact label="Creating your itinerary…" />
    <p className="planning-phrase" key={phrase}>{phrases[phrase]}</p>
    <p role="status">Your request is being processed. We’ll show your options here when it finishes.</p>
    <small>The service may take about a minute to wake up. You can cancel above.</small>
  </section>;
}
