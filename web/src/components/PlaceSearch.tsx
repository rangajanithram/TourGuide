'use client';
import { useEffect, useId, useRef, useState } from 'react';
export interface SearchOption { value: string; label: string; description?: string }
export default function PlaceSearch({ label, value, options, onChange, placeholder = 'Type to search', disabled = false, onQueryChange, onPendingChange, status, filterLocally = true }: {
  label: string; value: string; options: SearchOption[]; onChange: (value: string) => void; placeholder?: string; disabled?: boolean;
  onQueryChange?: (query: string) => void; onPendingChange?: (pending: boolean) => void; status?: string;
  filterLocally?: boolean;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const matches = options.filter(option => !filterLocally || query.toLowerCase().trim().split(/\s+/).every(word => option.label.toLowerCase().includes(word))).slice(0, 12);
  useEffect(() => {
    const root = list.current;
    const option = root?.querySelector<HTMLElement>(`[id="${id}-${active}"]`);
    if (!open || !root || !option) return;
    if (option.offsetTop < root.scrollTop) root.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > root.scrollTop + root.clientHeight) root.scrollTop = option.offsetTop + option.offsetHeight - root.clientHeight;
  }, [active, open, id]);
  const pick = (option: SearchOption) => { onChange(option.value); setQuery(''); setPending(false); onPendingChange?.(false); onQueryChange?.(''); setOpen(false); };
  return <div className="place-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
      disabled={disabled} placeholder={placeholder} value={open || pending ? query : options.find(option => option.value === value)?.label || value}
      onFocus={() => { setOpen(true); setActive(0); }} onChange={event => { setQuery(event.target.value); setPending(true); onPendingChange?.(true); onQueryChange?.(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); setQuery(''); setPending(false); onPendingChange?.(false); onQueryChange?.(''); }
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (matches[active]) pick(matches[active]); }
      }} />
    {open && <div ref={list} className="place-results" id={`${id}-list`} role="listbox" aria-label={label}>
      {matches.map((option, index) => <div role="option" id={`${id}-${index}`} key={option.value} aria-selected={option.value === value} className={active === index ? 'active' : ''}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(option)}>{option.label}{option.description && <small className="block">{option.description}</small>}</div>)}
      {!matches.length && <p role="status">{status || 'No matching places. Try another name.'}</p>}
    </div>}
    {status && <p className="step-note" role="status">{status}</p>}
  </div>;
}
