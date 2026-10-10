export default function JourneyLoading({ label = 'Opening your next stop…', compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`journey-loading ${compact ? 'journey-loading-compact' : ''}`} role="status" aria-live="polite">
    <div className="loading-rail" aria-hidden="true">
      <svg className="loading-train" viewBox="0 0 100 48" fill="none"><path d="M5 15h28v23H5zM39 15h28v23H39z" fill="#91a779"/><path d="M73 8h15v16h8v14H73z" fill="#b96a40"/><path d="M77 12h7v10h-7z" fill="#fffdf5"/>{[12,26,46,60,79,90].map(x => <circle key={x} cx={x} cy="39" r="4" fill="#294333"/>)}</svg>
    </div>
    <p>{label}</p><span className="loading-caption">A little pause before the journey.</span>
  </div>;
}
