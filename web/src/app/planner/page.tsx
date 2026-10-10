import PlannerPage from '@/components/PlannerPage';
import { requireVerifiedUser } from '@/lib/require-user';
export const dynamic = 'force-dynamic';
export default async function Page() { const user = await requireVerifiedUser(); return <PlannerPage preferences={user.user_metadata.travel_preferences} />; }
