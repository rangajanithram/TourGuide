import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthPanel({ title, children }: { title: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[#f5f2e8] text-[#243e33] px-5 py-12 flex items-center justify-center">
    <section className="w-full max-w-lg rounded-3xl bg-[#fffdf5] border border-[#b6c4b5] p-6 sm:p-10 shadow-lg">
      <Link href="/guide" className="font-bold">TripWeave · The forest line</Link>
      <h1 className="text-3xl mt-6 mb-5 font-serif">{title}</h1>
      <div className="space-y-5">{children}</div>
    </section>
  </main>;
}
