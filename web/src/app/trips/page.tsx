import type { Metadata } from 'next';
import { requireVerifiedUser } from '@/lib/require-user';
import Header from '@/components/Header';
import TripsListClient from '@/components/TripsListClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'My Trips · TripWeave',
  robots: { index: false, follow: false },
};

export default async function TripsPage() {
  await requireVerifiedUser();
  return (
    <div className="min-h-screen bg-[#fffdf5] text-[#1f332a]">
      <Header />
      <TripsListClient />
    </div>
  );
}
