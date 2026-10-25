import TripRoomClient from '@/components/TripRoomClient';
export const dynamic='force-dynamic';
export const metadata={title:'Trip room · TripWeave',robots:{index:false,follow:false}};
export default async function Page({searchParams}: {searchParams: Promise<{trip?: string | string[]}>}) {
 const params = await searchParams;
 const tripId = typeof params.trip === 'string' ? params.trip : '';
 // Query navigation keeps the same route mounted; each room needs its own state.
 return <TripRoomClient key={tripId || 'list'} tripId={tripId}/>;
}
