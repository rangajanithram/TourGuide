'use client';
import {useMemo,useState} from 'react';
import {Plus,ArrowRight,ReceiptText} from 'lucide-react';
import type {Room} from '@/lib/room-service';
import {calculateNetBalances,calculateOptimalSettlements} from '@/utils/settlement';
import type {GroupExpense} from '@/types/trip';
import ExpenseWizard from './ExpenseWizard';
const money=(n:number)=>`₹${n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
type Bill=GroupExpense&{created_by?:string};
export default function CloudLedger({room,userId,command,busy}:{room:Room;userId:string;command:(action:string,data:Record<string,unknown>)=>Promise<Room>;busy:boolean}){
 const [adding,setAdding]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<string|null>(null),[checked,setChecked]=useState(false);
 const ledger=room.ledger,host=userId===room.user_id;
 const balances=useMemo(()=>calculateNetBalances(ledger.members,ledger.expenses,ledger.settlements),[ledger]);
 const transfers=useMemo(()=>calculateOptimalSettlements(ledger.members,ledger.expenses,ledger.settlements),[ledger]);
 const name=(id:string)=>ledger.members.find(m=>m.id===id)?.name||'Traveler';
 async function run(action:string,data:Record<string,unknown>){setError('');try{await command(action,data);setConfirm(null);setChecked(false);}catch(error){setError((error as Error).message);}}
 if(adding)return <section className="room-card expense-dialog room-expense-form"><p className="room-note">This bill saves to the trip room for every member. Invitees must join before they appear in the split.</p><ExpenseWizard cloud members={ledger.members} payerId={userId} lockPayer={!host} onCancel={()=>setAdding(false)} onSave={async bill=>{await command('add_bill',bill as unknown as Record<string,unknown>);setAdding(false);}}/></section>;
 return <>
  <section className="room-card"><div className="room-section-heading"><div><h2>Shared bills</h2><p>Actual bills entered by your group. Planning estimates are separate.</p></div><button className="expense-primary" disabled={busy||!room.enabled} onClick={()=>setAdding(true)}><Plus size={18}/>Add a bill</button></div>
   <div className="room-total"><span>Total recorded</span><strong>{money(ledger.expenses.reduce((s,b)=>s+b.amount_inr,0))}</strong></div>
   {error&&<p className="expense-error" role="alert">{error}</p>}
   {!ledger.expenses.length?<div className="expense-empty"><ReceiptText size={30}/><h3>No bills yet</h3><p>Add food, travel, stay or ticket bills. Each person’s share is calculated after you review and save.</p></div>:<div className="expense-bills">{(ledger.expenses as Bill[]).map(b=><article key={b.id}><div><h3>{b.title}</h3><p>{name(b.paid_by_member_id)} paid · {new Date(b.created_at).toLocaleDateString('en-IN')}</p>{b.notes&&<p>{b.notes}</p>}<details><summary>Who shares this bill?</summary>{b.splits.map(s=><p key={s.member_id}>{name(s.member_id)}: <strong>{money(s.amount_inr)}</strong></p>)}</details></div><div><strong>{money(b.amount_inr)}</strong>{(host||b.created_by===userId)&&(confirm===b.id?<div><p>Delete this bill? Confirmed payment records stay unchanged.</p><button disabled={busy} onClick={()=>void run('delete_bill',{id:b.id})}>Delete bill</button><button onClick={()=>setConfirm(null)}>Keep bill</button></div>:<button disabled={busy} onClick={()=>setConfirm(b.id)}>Delete</button>)}</div></article>)}</div>}
  </section>
  <section className="room-card"><h2>Who owes what?</h2><p>Positive balances get money back. Only the recipient or room owner can confirm that money was received. TripWeave does not check bank payments.</p><div className="room-balances">{ledger.members.map(m=><div key={m.id}><span>{m.name}</span><strong>{(balances.get(m.id)||0)>0?`Gets back ${money(balances.get(m.id)!)}`:(balances.get(m.id)||0)<0?`Owes ${money(-balances.get(m.id)!)}`:'Even so far'}</strong></div>)}</div>
  <div className="expense-payments">{transfers.map((t,i)=>{const key=`payment-${i}`,allowed=host||t.to_member_id===userId;return <article key={key}><h3>{name(t.from_member_id)} <ArrowRight size={17}/> {name(t.to_member_id)}</h3><strong>{money(t.amount_inr)}</strong><div className="expense-inline-actions">{allowed?<button disabled={busy||!room.enabled} onClick={()=>{setConfirm(key);setChecked(false);}}>Record received payment</button>:<p>Pay with your usual payment app or cash, then ask {name(t.to_member_id)} to confirm receipt here.</p>}</div>{confirm===key&&<div className="room-confirm"><label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>I checked that {name(t.to_member_id)} received {money(t.amount_inr)}.</label><button disabled={!checked||busy} onClick={()=>void run('record_payment',{from_member_id:t.from_member_id,to_member_id:t.to_member_id,amount_inr:t.amount_inr,confirm_received:true})}>Confirm received</button><button onClick={()=>setConfirm(null)}>Cancel</button></div>}</article>;})}</div>
  {!transfers.length&&<p>No payments are needed for the bills recorded so far.</p>}
  {!!ledger.settlements.length&&<details><summary>Confirmed payment records</summary>{ledger.settlements.map(s=><div className="expense-recorded-payment" key={s.id}><span>{name(s.from_member_id)} → {name(s.to_member_id)} · {money(s.amount_inr)} · confirmed manually</span>{(host||(s as typeof s&{confirmed_by?:string}).confirmed_by===userId)&&<button disabled={busy} onClick={()=>void run('undo_payment',{id:s.id})}>Undo record</button>}</div>)}</details>}
  </section>
 </>;
}
