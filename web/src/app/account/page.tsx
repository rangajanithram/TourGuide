import Link from 'next/link';
import { requireVerifiedUser } from '@/lib/require-user';
import ProfileSettings from '@/components/auth/ProfileSettings';
import LogoutButton from '@/components/auth/LogoutButton';
export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const user = await requireVerifiedUser();
  const name = typeof user.user_metadata.name === 'string' ? user.user_metadata.name : '';
  return <main className="profile-page"><header><Link href="/guide">TripWeave · The forest line</Link><Link href="/planner">Open planner →</Link></header>
    <section><p className="profile-eyebrow">YOUR TRAVEL COMPANION</p><h1>Your little corner of the world.</h1><p>Manage your profile, travel preferences and account security.</p>
    <div className="profile-grid"><ProfileSettings initialName={name} preferences={user.user_metadata.travel_preferences} />
    <aside><h2>Account & security</h2><p className="break-all">{user.email}</p><p className="profile-verified">✓ Email verified</p><h3>Sign-in methods</h3><p>{Array.from(new Set(user.identities?.map(i => i.provider))).join(', ') || 'Email'}</p><Link href="/forgot-password">Send a password recovery email →</Link><p className="text-sm">Google sign-in is managed by Google. A recovery email lets you set or reset a TripWeave email password.</p><h3>Your travel data</h3><p className="text-sm">Profile preferences are saved to your account. Expense records remain in this browser and are not synchronized between devices.</p><LogoutButton /><Link href="/guide">Back to the field guide →</Link></aside></div></section></main>;
}
