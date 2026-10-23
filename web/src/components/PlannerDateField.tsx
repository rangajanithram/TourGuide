'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import ThemedSelect from './ThemedSelect';

const iso=(date:Date)=>date.toISOString().slice(0,10);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&iso(new Date(value+'T12:00:00Z'))===value;
const dateLabel=(value:string)=>valid(value)?new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Choose a date';
type FieldProps={id?:string;label:string;'aria-invalid'?:boolean;'aria-describedby'?:string};
export default function PlannerDateField({value,onChange,min,max,id,label,...aria}:FieldProps&{value:string;onChange:(value:string)=>void;min?:string;max?:string}) {
  const [open,setOpen]=useState(false);
  return <div className="planner-date-field"><button type="button" className="date-trigger" id={id} aria-label={`${label}: ${dateLabel(value)}`} aria-haspopup="dialog" aria-expanded={open} {...aria} onClick={()=>setOpen(true)}><CalendarDays size={19}/><span>{dateLabel(value)}</span><span className="date-change">Change</span></button>
    {open&&createPortal(<CalendarDialog value={value} min={min} max={max} label={label} onChange={onChange} close={()=>setOpen(false)}/>,document.body)}
  </div>;
}
function CalendarDialog({value,min,max,label,onChange,close}:{value:string;min?:string;max?:string;label:string;onChange:(value:string)=>void;close:()=>void}) {
  const clamp=(v:string)=>min&&v<min?min:max&&v>max?max:v;
  const [active,setActive]=useState(()=>clamp(valid(value)?value:today()));
  const [month,setMonth]=useState(()=>active.slice(0,7));
  const ref=useDialogFocus(true,close), uid=useId(), grid=useRef<HTMLTableElement>(null);
  const year=Number(month.slice(0,4)), mon=Number(month.slice(5,7))-1;
  const offset=new Date(Date.UTC(year,mon,1)).getUTCDay(),count=new Date(Date.UTC(year,mon+1,0)).getUTCDate();
  const monthLabel=new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,mon,1)));
  useEffect(()=>{const frame=requestAnimationFrame(()=>grid.current?.querySelector<HTMLButtonElement>(`button[data-date="${active}"]`)?.focus());return()=>cancelAnimationFrame(frame);},[active,month]);
  const jumpMonth=(amount:number)=>{const date=new Date(active+'T12:00:00Z'), day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+amount);date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));const next=clamp(iso(date));setActive(next);setMonth(next.slice(0,7));};
  const key=(event:React.KeyboardEvent<HTMLButtonElement>)=>{
    const current=new Date(active+'T12:00:00Z');let amount=0;
    if(event.key==='ArrowRight')amount=1;else if(event.key==='ArrowLeft')amount=-1;else if(event.key==='ArrowDown')amount=7;else if(event.key==='ArrowUp')amount=-7;else if(event.key==='Home')amount=-current.getUTCDay();else if(event.key==='End')amount=6-current.getUTCDay();else if(event.key==='PageUp'||event.key==='PageDown'){event.preventDefault();jumpMonth((event.key==='PageUp'?-1:1)*(event.shiftKey?12:1));return;}else return;
    event.preventDefault();current.setUTCDate(current.getUTCDate()+amount);const next=clamp(iso(current));setActive(next);setMonth(next.slice(0,7));
  };
  return <div className="calendar-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><div className="calendar-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-help`} tabIndex={-1}>
    <header><div><span>SELECT A DATE</span><h2 id={`${uid}-title`}>{label}</h2></div><button type="button" aria-label="Close calendar" onClick={close}><X size={20}/></button></header>
    <div className="calendar-month"><button type="button" aria-label="Previous month" disabled={!!min&&month<=min.slice(0,7)} onClick={()=>jumpMonth(-1)}><ChevronLeft size={20}/></button><h3 aria-live="polite">{monthLabel}</h3><button type="button" aria-label="Next month" disabled={!!max&&month>=max.slice(0,7)} onClick={()=>jumpMonth(1)}><ChevronRight size={20}/></button></div>
    <table ref={grid} role="grid" aria-label={monthLabel}><thead><tr>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><th key={day} scope="col" abbr={day}>{day.slice(0,2)}</th>)}</tr></thead><tbody>{Array.from({length:Math.ceil((offset+count)/7)},(_,row)=><tr key={row}>{Array.from({length:7},(_,col)=>{
      const day=row*7+col-offset+1;if(day<1||day>count)return <td key={col}/>;
      const date=`${month}-${String(day).padStart(2,'0')}`,disabled=!!((min&&date<min)||(max&&date>max));
      return <td key={col} aria-selected={date===value}><button type="button" data-date={date} aria-label={dateLabel(date)} aria-current={date===today()?'date':undefined} disabled={disabled} tabIndex={date===active?0:-1} onFocus={()=>setActive(date)} onKeyDown={key} onClick={()=>{onChange(date);close();}}>{day}</button></td>;
    })}</tr>)}</tbody></table>
    <p id={`${uid}-help`}>Arrow keys move by day or week. Page Up / Down changes month. Enter selects; Escape closes.</p>
    <footer><button type="button" onClick={()=>{const next=clamp(today());setActive(next);setMonth(next.slice(0,7));}}>Go to today</button><button type="button" onClick={()=>{onChange('');close();}}>Clear date</button></footer>
  </div></div>;
}
export function PlannerTimeField({value,onChange,id,label,...aria}:FieldProps&{value:string;onChange:(value:string)=>void}) {
  const hour=value?.slice(0,2)||'',minute=value?.slice(3,5)||'';
  return <div className="planner-time-field"><ThemedSelect id={id} label={`${label}: hour`} value={hour} {...aria} options={[{value:'',label:'Hour'},...Array.from({length:24},(_,i)=>({value:String(i).padStart(2,'0'),label:String(i).padStart(2,'0')}))]} onChange={h=>onChange(h?`${h}:${minute||'00'}`:'')}/><span aria-hidden="true">:</span><ThemedSelect label={`${label}: minute`} value={minute} options={[{value:'',label:'Min'},...Array.from({length:60},(_,i)=>({value:String(i).padStart(2,'0'),label:String(i).padStart(2,'0')}))]} onChange={m=>onChange(m?`${hour||'09'}:${m}`:'')}/>{value&&<button type="button" className="clear-time" aria-label={`Clear ${label}`} onClick={()=>onChange('')}><X size={16}/></button>}</div>;
}
export function PlannerDateTimeField({value,onChange,id,label,...aria}:FieldProps&{value:string;onChange:(value:string)=>void}) {
  const [datePart,timePart]=value.split('T');const date=datePart||'',time=(timePart||'').slice(0,5);
  // Preserve partially completed dates; validation identifies the missing time before submission.
  return <div className="planner-datetime-field"><PlannerDateField id={id} label={`${label} date`} value={date} {...aria} onChange={next=>onChange(next?`${next}T${time||''}`:'')}/><PlannerTimeField label={`${label} time`} {...aria} value={time} onChange={next=>onChange(`${valid(date)?date:''}T${next}`)}/><small>India time · 24-hour clock</small></div>;
}
