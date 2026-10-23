import { useId } from 'react';

type Option = { value: string; label: string; description?: string };
export default function ChoiceCards({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
}) {
  const name = useId();
  return <fieldset className="choice-group min-w-0"><legend className="mb-3 font-semibold text-[#243e33]">{label}</legend>
    <div className="choice-grid">{options.map(option =>
      <label key={option.value} data-checked={value === option.value} className={`choice-card min-w-0 cursor-pointer rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-[#385e4e] ${value === option.value ? 'border-[#385e4e] bg-[#e7efe1]' : 'border-[#c6d2c0] bg-[#fffdf5] hover:bg-[#f4f7f0]'}`}>
        <input className="mt-1 h-4 w-4 shrink-0 accent-[#385e4e]" type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span className="choice-copy min-w-0 break-words"><span className="block font-semibold text-[#243e33]">{option.label}</span>{option.description && <span className="mt-1 block text-sm leading-relaxed text-[#526653]">{option.description}</span>}</span>
      </label>)}</div>
  </fieldset>;
}
