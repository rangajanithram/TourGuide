'use client';
import Image from 'next/image';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { travelArtwork } from '@/lib/travel-media';

export default function TravelImage({ destination, category, placeName, compact = false, className = '', priority = false }: {
  destination: string; category?: string; placeName?: string; compact?: boolean; className?: string; priority?: boolean;
}) {
  const art = travelArtwork(destination, category, placeName);
  const [failedSource, setFailedSource] = useState('');
  return <figure className={`travel-image ${className}`}>
    {failedSource === art.src ? <div className="travel-image-fallback"><ImageOff size={24}/><span>Image unavailable</span></div>
      : <Image src={art.src} alt={art.alt} fill sizes="(max-width: 700px) 100vw, (max-width: 1200px) 45vw, 30vw" priority={priority} onError={() => setFailedSource(art.src)} />}
    <figcaption title={art.caption}>{compact ? 'AI art' : art.caption}</figcaption>
  </figure>;
}
