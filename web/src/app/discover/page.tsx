import { requireVerifiedUser } from '@/lib/require-user';
import DiscoveryPage from '@/components/DiscoveryPage';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Discover places - TripWeave', robots: { index: false, follow: false } };
export default async function Page() { await requireVerifiedUser(); return <DiscoveryPage />; }
