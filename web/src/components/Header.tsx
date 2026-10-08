'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, Compass, Layers } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#1e2230] bg-[#090a0f]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Compass className="w-6 h-6 text-black stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight text-white">TripWeave</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                v0.1 Engine
              </span>
            </div>
            <p className="text-xs text-gray-400 hidden sm:block">Deterministic TSP / VRP Travel Optimizer</p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/guide"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3040] bg-[#11131b] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-amber-500/50 hover:text-amber-300"
          >
            <BookOpen className="h-3.5 w-3.5 text-amber-400" />
            <span>How to use</span>
          </Link>
          <Link
            href="/planner"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-amber-400"
          >
            Open planner
          </Link>
          <div className="hidden md:flex items-center space-x-3 text-xs text-gray-400 bg-[#11131b] border border-[#1e2230] px-3 py-1.5 rounded-lg">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-gray-300 font-medium">OR-Tools Engine</span>
            </div>
            <span className="text-gray-600">|</span>
            <div className="flex items-center space-x-1 text-gray-400">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>DBSCAN Clustering</span>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
