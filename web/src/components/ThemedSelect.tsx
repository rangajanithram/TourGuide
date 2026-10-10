'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function ThemedSelect({ value, onChange, options, label, id, disabled = false }: {
  value: string; onChange: (value: string) => void; options: { value: string; label: string }[];
  label: string; id?: string; disabled?: boolean;
}) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const listId = `${uid}-options`;
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const start = () => { const rect = root.current?.getBoundingClientRect(); setAbove(Boolean(rect && window.innerHeight - rect.bottom < 280 && rect.top > 280)); setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true); };
  return <div className="themed-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button id={id} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId}
      aria-haspopup="listbox" aria-activedescendant={open ? `${uid}-${active}` : undefined} disabled={disabled}
      onClick={() => open ? setOpen(false) : start()}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); return; }
        if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault();
          if (!open) { start(); return; }
          setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
        } else if (open && ['Enter',' '].includes(event.key)) {
          event.preventDefault(); onChange(options[active].value); setOpen(false);
        } else if (open && event.key.length === 1) {
          const index = options.findIndex(option => option.label.toLowerCase().startsWith(event.key.toLowerCase()));
          if (index >= 0) setActive(index);
        }
      }}>
      <span>{options.find(option => option.value === value)?.label || 'Choose an option'}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={listId} role="listbox" aria-label={label} className={`themed-options ${above ? 'opens-above' : ''}`}>
      {options.map((option, index) => <div key={option.value} id={`${uid}-${index}`} role="option" aria-selected={value === option.value}
        className={active === index ? 'option-active' : ''} onMouseEnter={() => setActive(index)}
        onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option.value); setOpen(false); }}>
        <span>{option.label}</span>{value === option.value && <Check size={16} aria-hidden="true" />}
      </div>)}
    </div>}
  </div>;
}
