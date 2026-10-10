'use client';
import { useId, useState } from 'react';
import { Info } from 'lucide-react';
export default function InfoTip({ title, children }: { title: string; children: string }) {
  const id = useId(); const [open, setOpen] = useState(false);
  return <span className="info-tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={`About ${title}`} aria-expanded={open} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}><Info size={16} /></button>
    {open && <span id={id} role="tooltip" className="info-tip-content"><strong>{title}</strong>{children}</span>}
  </span>;
}
