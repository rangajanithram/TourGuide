import PlannerPage from '@/components/PlannerPage';
import { requireVerifiedUser } from '@/lib/require-user';
export const dynamic = 'force-dynamic';
export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
 const user = await requireVerifiedUser();
 const params = await searchParams;
 const routeKey = JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
 return <PlannerPage key={routeKey} preferences={user.user_metadata.travel_preferences} />;
}
