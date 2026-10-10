import type { Metadata } from 'next';
import Link from 'next/link';
import { requireVerifiedUser } from '@/lib/require-user';
import ProfileSettings from '@/components/auth/ProfileSettings';
import LogoutButton from '@/components/auth/LogoutButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'My Profile · TripWeave',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await requireVerifiedUser();
  const name = typeof user.user_metadata.name === 'string' ? user.user_metadata.name : '';
  return (
    <main className="profile-page">
      <header>
        <Link href="/guide">TripWeave · The forest line</Link>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/trips">My trips →</Link>
          <Link href="/planner">Create trip →</Link>
        </div>
      </header>
      <section>
        <p className="profile-eyebrow">YOUR TRAVEL COMPANION</p>
        <h1>Your little corner of the world.</h1>
        <p>Manage your profile, saved itineraries, travel preferences, and account security.</p>
        <div className="profile-grid">
          <ProfileSettings initialName={name} preferences={user.user_metadata.travel_preferences} />
          <aside>
            <h2>Account & security</h2>
            <p className="break-all">{user.email}</p>
            <p className="profile-verified">✓ Email verified</p>
            <h3>Sign-in methods</h3>
            <p>{Array.from(new Set(user.identities?.map((i) => i.provider))).join(', ') || 'Email'}</p>
            <Link href="/forgot-password">Send a password recovery email →</Link>
            <p className="text-sm">Google sign-in is managed by Google. A recovery email lets you set or reset a TripWeave email password.</p>
            <h3>Your saved trips & data</h3>
            <p className="text-sm">
              Saved itineraries and their revision histories are stored privately in your account under Row Level Security. Expense split ledgers remain local to this browser until cloud expense sync is enabled.
            </p>
            <Link href="/trips">Open My trips & version history →</Link>
            <LogoutButton />
            <Link href="/guide">Back to the field guide →</Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
