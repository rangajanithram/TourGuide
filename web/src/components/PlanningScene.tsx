'use client';
import { useEffect, useState } from 'react';
import JourneyLoading from './JourneyLoading';
const phrases = ['A little planning. More room for possibility.', 'Good journeys leave room to breathe.', 'Your next story starts with a thoughtful route.', 'A sunset, a shared meal, a day that feels like you.'];
export default function PlanningScene({ phase = 'generating' }: { phase?: 'connecting' | 'generating' }) {
  const [phrase, setPhrase] = useState(0);
  useEffect(() => { const timer = setInterval(() => setPhrase(index => (index + 1) % phrases.length), 6500); return () => clearInterval(timer); }, []);
  return <section className="planning-scene" aria-label="Trip planning in progress">
    <JourneyLoading compact label={phase === 'connecting' ? 'Checking the planning service…' : 'Creating your itinerary…'} />
    <p className="planning-phrase" key={phrase}>{phrases[phrase]}</p>
    <p role="status">{phase === 'connecting' ? 'Waiting for the service to confirm it is ready. It may be waking up.' : 'The backend is processing your trip request. We’ll show the results after it responds.'}</p>
    <small>You can cancel waiting above. A request already received by the backend may finish there.</small>
  </section>;
}
