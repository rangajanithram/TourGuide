import { redirect } from 'next/navigation';
import { requireVerifiedUser } from '@/lib/require-user';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireVerifiedUser(); redirect('/guide'); }
