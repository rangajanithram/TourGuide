import AccountWelcome from '@/components/guide/AccountWelcome';
import PlannerPage from '@/components/PlannerPage';

// Keep previously shared root URLs working while giving new visitors a welcome page.
export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tripKeys = ['dest', 'destination', 'start', 'start_date', 'end', 'end_date', 'budget', 'pins', 'locked', 'origin', 'from', 'shared', 'mode', 'people', 'pace', 'profile', 'variant', 'interests', 'origin_type', 'start_location', 'hub'];
  return tripKeys.some(key => params[key] !== undefined)
    ? <PlannerPage />
    : <AccountWelcome />;
}
