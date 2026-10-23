'use client';
import { cloneElement, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import type { PlannerIssue } from '@/lib/planner-validation';
export const PlannerErrors = createContext<PlannerIssue[]>([]);
export function FieldMessage({id}:{id:string}) {
  const error=useContext(PlannerErrors).find(issue=>issue.field===id);
  return error?<p id={`${id}-error`} className="field-error"><AlertCircle size={16} aria-hidden="true"/>{error.message}</p>:null;
}
export default function PlannerField({id,label,hint,children}:{id:string;label:string;hint?:string;children:ReactNode}) {
  const error=useContext(PlannerErrors).find(issue=>issue.field===id);
  const control=isValidElement(children)?cloneElement(children as ReactElement<{id?:string;'aria-invalid'?:boolean;'aria-describedby'?:string}>,{id, 'aria-invalid':!!error,'aria-describedby':[hint?`${id}-hint`:'',error?`${id}-error`:''].filter(Boolean).join(' ')||undefined}):children;
  return <div className="planner-field" data-field={id} data-invalid={!!error}><label htmlFor={id}>{label}</label>{control}{hint&&<p id={`${id}-hint`} className="field-hint">{hint}</p>}<FieldMessage id={id}/></div>;
}
