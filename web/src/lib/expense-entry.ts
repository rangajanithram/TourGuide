import type {ExpenseCategory, ExpenseSplit, GroupMember, TripExpenseLedger} from '@/types/trip';
import {calculateEqualSplits} from '@/utils/settlement';
export const expenseCategories:ExpenseCategory[]=['dining','transit','lodging','activities','shopping','other'];
export const moneyPaise=(value:string)=>/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value.trim())?Math.round(Number(value)*100):null;
export type ExpenseDraft={title:string;amount:string;paidBy:string;category:ExpenseCategory;selected:string[];splitType:'equal'|'custom';custom:Record<string,string>};
export function checkExpense(draft:ExpenseDraft,members:GroupMember[]){
  const issues:{step:number;field:string;message:string}[]=[];
  const amount=moneyPaise(draft.amount),ids=new Set(members.map(m=>m.id));
  if(!draft.title.trim()||draft.title.trim().length>160)issues.push({step:0,field:'expense-title',message:'Give the bill a short name, up to 160 characters.'});
  if(amount===null||amount<1||amount>500000000)issues.push({step:0,field:'expense-amount',message:'Enter ₹0.01 to ₹50,00,000, with no more than two decimal places.'});
  if(!expenseCategories.includes(draft.category))issues.push({step:0,field:'expense-title',message:'Choose a supported expense category.'});
  if(!ids.has(draft.paidBy))issues.push({step:0,field:'expense-payer',message:'Choose the person who paid this bill.'});
  if(!draft.selected.length||new Set(draft.selected).size!==draft.selected.length||draft.selected.some(id=>!ids.has(id)))issues.push({step:1,field:'expense-participants',message:'Choose at least one person to share this bill.'});
  let splits:ExpenseSplit[]=[];
  if(amount!==null&&amount>0){
    if(draft.splitType==='equal')splits=calculateEqualSplits(amount/100,draft.selected);
    else {
      let sum=0;
      for(const id of draft.selected){const value=moneyPaise(draft.custom[id]||'');if(value===null){issues.push({step:1,field:'expense-participants',message:'Enter a valid share for each selected person. Use 0 if they owe nothing.'});break;}sum+=value;splits.push({member_id:id,amount_inr:value/100});}
      if(!issues.some(i=>i.step===1)&&sum!==amount)issues.push({step:1,field:'expense-participants',message:`The shares must add up to ₹${(amount/100).toLocaleString('en-IN')}. They currently add up to ₹${(sum/100).toLocaleString('en-IN')}.`});
    }
  }
  return {issues,splits,amount:(amount??0)/100};
}
export function parseExpenseLedger(raw:string):TripExpenseLedger {
  if(raw.length>1500000)throw new Error('Expense data is too large to open.');
  const value=JSON.parse(raw) as TripExpenseLedger;
  if(!value||!Array.isArray(value.members)||!value.members.length||value.members.length>50||!Array.isArray(value.expenses)||value.expenses.length>1000||!Array.isArray(value.settlements)||value.settlements.length>1000)throw new Error('Saved expenses could not be read.');
  const text=(s:unknown,max:number)=>typeof s==='string'&&s.length>0&&s.length<=max;
  const amount=(n:unknown,max=5000000)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max&&Math.abs(n*100-Math.round(n*100))<0.000001;
  const ids=new Set(value.members.map(m=>m.id));
  if(ids.size!==value.members.length||value.members.some(m=>!text(m.id,160)||!text(m.name,80)||(m.upi_id!=null&&!text(m.upi_id,200))))throw new Error('Saved member details could not be read.');
  const expenseIds=new Set(value.expenses.map(e=>e.id)),settlementIds=new Set(value.settlements.map(s=>s.id));
  if(expenseIds.size!==value.expenses.length||settlementIds.size!==value.settlements.length)throw new Error('Duplicate saved expense records.');
  for(const e of value.expenses){
    if(!text(e.id,200)||!text(e.title,160)||!amount(e.amount_inr)||e.amount_inr<=0||!ids.has(e.paid_by_member_id)||!expenseCategories.includes(e.category)||!['equal','custom'].includes(e.split_type)||!Array.isArray(e.splits)||!e.splits.length||new Set(e.splits.map(s=>s.member_id)).size!==e.splits.length||e.splits.some(s=>!ids.has(s.member_id)||!amount(s.amount_inr))||e.splits.reduce((n,s)=>n+Math.round(s.amount_inr*100),0)!==Math.round(e.amount_inr*100)||!text(e.created_at,50)||!Number.isFinite(Date.parse(e.created_at))||(e.notes!=null&&!text(e.notes,500)))throw new Error('Saved expense amounts or shares could not be read.');
  }
  for(const s of value.settlements)if(!text(s.id,250)||!ids.has(s.from_member_id)||!ids.has(s.to_member_id)||s.from_member_id===s.to_member_id||!amount(s.amount_inr,5000000000)||s.amount_inr<=0||typeof s.is_settled!=='boolean'||(s.is_settled&&(!s.settled_at||!Number.isFinite(Date.parse(s.settled_at)))))throw new Error('Saved payment records could not be read.');
  return value;
}
