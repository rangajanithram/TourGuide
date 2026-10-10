import { redirect } from 'next/navigation';
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.dest || params.destination || params.shared) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (typeof value === 'string') query.set(key, value); });
    redirect(`/planner?${query}`);
  }
  redirect('/guide');
}
