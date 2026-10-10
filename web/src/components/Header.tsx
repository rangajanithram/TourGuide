 'use client';
import Link from 'next/link';
import { Compass, BookOpen, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import LogoutButton from '@/components/auth/LogoutButton';
export default function Header() {
  const { user } = useAuth();
  return <header className="sticky top-0 z-40 border-b border-[#c6d2c0] bg-[#fffdf5]/90 backdrop-blur-xl"><div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
    <Link href="/guide" className="flex items-center gap-2 font-bold text-lg text-[#243e33]"><Compass size={26} /><span>TripWeave</span></Link>
    <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4 text-sm"><Link href="/guide" className="flex items-center gap-1"><BookOpen size={17} /><span className="hidden sm:inline">Field guide</span></Link><Link href="/account" className="flex items-center gap-1 rounded-full border border-[#c6d2c0] px-3 py-2"><User size={17} />My profile</Link>{user && <LogoutButton compact />}</nav>
  </div></header>;
}
