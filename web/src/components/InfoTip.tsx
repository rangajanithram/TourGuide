'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
export default function InfoTip({ title, children }: { title: string; children: string }) {
  const id = useId(); const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 0 });
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - 276)), top: rect.bottom + 8 });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);
  return <span className="info-tip" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
    <button ref={trigger} type="button" aria-label={`About ${title}`} aria-expanded={open} aria-describedby={open ? id : undefined}
      onFocus={show} onBlur={() => setOpen(false)} onClick={show}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}><Info size={16} /></button>
    {open && createPortal(<span id={id} role="tooltip" className="info-tip-content" style={{ position: 'fixed', left: position.left, top: Math.max(8, Math.min(position.top, window.innerHeight - 210)), zIndex: 1000 }}><strong>{title}</strong>{children}</span>, document.body)}
  </span>;
}
