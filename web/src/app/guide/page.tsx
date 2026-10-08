import type { Metadata } from 'next';
import JourneyGuide from '@/components/guide/JourneyGuide';
import './journey.css';
import './forest.css';

export const metadata: Metadata = {
  title: 'The journey starts here · TripWeave',
  description: 'Meet TripWeave. An interactive field guide to planning a trip around your time, budget, and people.',
};

export default function GuidePage() {
  return <JourneyGuide />;
}
