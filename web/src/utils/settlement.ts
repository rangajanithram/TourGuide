import { GroupMember, GroupExpense, ExpenseSplit, SettlementTransfer, TripExpenseLedger, ExpenseCategory } from '../types/trip';

/**
 * Splits an amount equally among member IDs, distributing remainder paise
 * so that the sum of splits is mathematically guaranteed to equal the total.
 */
export function calculateEqualSplits(totalAmountInr: number, memberIds: string[]): ExpenseSplit[] {
  if (memberIds.length === 0 || totalAmountInr <= 0) {
    return [];
  }

  // Work in paise (integer cents) to prevent IEEE 754 floating point drift
  const totalPaise = Math.round(totalAmountInr * 100);
  const n = memberIds.length;
  const basePaise = Math.floor(totalPaise / n);
  const remainderPaise = totalPaise % n;

  return memberIds.map((id, index) => {
    // Distribute 1 extra paisa to the first `remainderPaise` members
    const sharePaise = basePaise + (index < remainderPaise ? 1 : 0);
    return {
      member_id: id,
      amount_inr: sharePaise / 100
    };
  });
}

/**
 * Computes net balances for all members across expenses and confirmed settlements.
 * Positive balance = creditor (is owed money by the group).
 * Negative balance = debtor (owes money to the group).
 * Total sum of all net balances across all members is strictly 0.
 */
export function calculateNetBalances(
  members: GroupMember[],
  expenses: GroupExpense[],
  settlements: SettlementTransfer[] = []
): Map<string, number> {
  const balances = new Map<string, number>();

  for (const m of members) {
    balances.set(m.id, 0);
  }

  // Account for expenses
  for (const exp of expenses) {
    // Payer is credited the full amount they paid
    const currentPayerBal = balances.get(exp.paid_by_member_id) ?? 0;
    balances.set(exp.paid_by_member_id, currentPayerBal + exp.amount_inr);

    // Each participant in the split is debited their share
    for (const split of exp.splits) {
      const currentMemberBal = balances.get(split.member_id) ?? 0;
      balances.set(split.member_id, currentMemberBal - split.amount_inr);
    }
  }

  // Account for already settled transfers
  for (const s of settlements) {
    if (s.is_settled && s.amount_inr > 0) {
      // Payer of the settlement reduces their debt (balance increases)
      const fromBal = balances.get(s.from_member_id) ?? 0;
      balances.set(s.from_member_id, fromBal + s.amount_inr);

      // Receiver of the settlement has received their owed money (balance decreases)
      const toBal = balances.get(s.to_member_id) ?? 0;
      balances.set(s.to_member_id, toBal - s.amount_inr);
    }
  }

  // Clean tiny floating point noise (under 0.01 INR)
  for (const [id, val] of Array.from(balances.entries())) {
    balances.set(id, Math.round(val * 100) / 100);
  }

  return balances;
}

interface BalanceEntry {
  memberId: string;
  amount: number;
}

/**
 * Greedy minimum cash flow settlement simplification algorithm.
 * Reduces an arbitrary N-person tangle of debts to at most N-1 simple transfers.
 */
export function calculateOptimalSettlements(
  members: GroupMember[],
  expenses: GroupExpense[],
  settlements: SettlementTransfer[] = []
): SettlementTransfer[] {
  const netBalances = calculateNetBalances(members, expenses, settlements);

  // Group into debtors (net < -0.01) and creditors (net > 0.01)
  const debtors: BalanceEntry[] = [];
  const creditors: BalanceEntry[] = [];

  for (const [memberId, net] of Array.from(netBalances.entries())) {
    if (net < -0.01) {
      debtors.push({ memberId, amount: Math.abs(net) });
    } else if (net > 0.01) {
      creditors.push({ memberId, amount: net });
    }
  }

  // Sort descending by amount for greedy matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const pendingSettlements: SettlementTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const transferAmount = Math.min(debtor.amount, creditor.amount);
    const roundedAmount = Math.round(transferAmount * 100) / 100;

    if (roundedAmount > 0) {
      pendingSettlements.push({
        id: `settle_${debtor.memberId}_to_${creditor.memberId}_${Date.now()}_${pendingSettlements.length}`,
        from_member_id: debtor.memberId,
        to_member_id: creditor.memberId,
        amount_inr: roundedAmount,
        is_settled: false
      });
    }

    debtor.amount = Math.round((debtor.amount - transferAmount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - transferAmount) * 100) / 100;

    if (debtor.amount < 0.01) {
      dIdx++;
    }
    if (creditor.amount < 0.01) {
      cIdx++;
    }
  }

  return pendingSettlements;
}

/**
 * Validates basic NPCI Virtual Payment Address (VPA) / UPI ID format: username@bank
 */
export function isValidUpiId(upiId: string): boolean {
  if (!upiId) return false;
  const trimmed = upiId.trim();
  // Standard UPI ID pattern: 2-256 characters, alphanumeric/dot/hyphen followed by @ and 2-64 alpha handle
  return /^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z0-9]{2,64}$/.test(trimmed);
}

/**
 * Generates an NPCI-compliant UPI deep link.
 * On mobile devices, tapping this opens any UPI app (GPay, PhonePe, Paytm, BHIM).
 */
export function generateUpiUrl(
  vpa: string,
  payeeName: string,
  amountInr: number,
  transactionNote: string = 'TripWeave split'
): string {
  const cleanVpa = encodeURIComponent(vpa.trim());
  const cleanName = encodeURIComponent(payeeName.trim());
  const cleanAmount = encodeURIComponent(amountInr.toFixed(2));
  const cleanNote = encodeURIComponent(transactionNote.trim());

  return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}`;
}

/**
 * Computes breakdown of expenses by category.
 */
export function calculateCategoryTotals(expenses: GroupExpense[]): Record<ExpenseCategory, number> {
  const totals: Record<ExpenseCategory, number> = {
    dining: 0,
    transit: 0,
    lodging: 0,
    activities: 0,
    shopping: 0,
    other: 0
  };

  for (const exp of expenses) {
    if (totals[exp.category] !== undefined) {
      totals[exp.category] += exp.amount_inr;
    } else {
      totals.other += exp.amount_inr;
    }
  }

  return totals;
}

/**
 * Formats a clean, readable end-of-trip summary ready for WhatsApp sharing.
 */
export function formatWhatsAppExpenseSummary(
  tripTitle: string,
  destination: string,
  ledger: TripExpenseLedger,
  totalEstimatedBudget?: number
): string {
  const memberMap = new Map<string, GroupMember>(ledger.members.map(m => [m.id, m]));
  const totalSpent = ledger.expenses.reduce((sum, e) => sum + e.amount_inr, 0);
  const catTotals = calculateCategoryTotals(ledger.expenses);

  const pendingSettlements = calculateOptimalSettlements(ledger.members, ledger.expenses, ledger.settlements);
  const settledList = ledger.settlements.filter(s => s.is_settled);

  let budgetLine = '';
  if (totalEstimatedBudget && totalEstimatedBudget > 0) {
    const diff = totalEstimatedBudget - totalSpent;
    if (diff >= 0) {
      budgetLine = ` (Budget: ₹${totalEstimatedBudget.toLocaleString('en-IN')} • Under by ₹${diff.toLocaleString('en-IN')} ✅)`;
    } else {
      budgetLine = ` (Budget: ₹${totalEstimatedBudget.toLocaleString('en-IN')} • Over by ₹${Math.abs(diff).toLocaleString('en-IN')} ⚠️)`;
    }
  }

  const lines: string[] = [
    `🧳 *${tripTitle} — Group Expense & Settlement Summary*`,
    `📍 Destination: ${destination.charAt(0).toUpperCase() + destination.slice(1)}`,
    `👥 Group: ${ledger.members.map(m => m.name).join(', ')} (${ledger.members.length} members)`,
    `💰 *Total Spent: ₹${totalSpent.toLocaleString('en-IN')}*${budgetLine}`,
    '',
    `📊 *Spend by Category:*`,
    `  🍛 Dining & Food: ₹${catTotals.dining.toLocaleString('en-IN')}`,
    `  🛺 Transit & Commute: ₹${catTotals.transit.toLocaleString('en-IN')}`,
    `  🏨 Hotel & Stays: ₹${catTotals.lodging.toLocaleString('en-IN')}`,
    `  🎟️ Entry & Activities: ₹${catTotals.activities.toLocaleString('en-IN')}`,
    `  🛍️ Shopping & Souvenirs: ₹${catTotals.shopping.toLocaleString('en-IN')}`,
    `  📦 Other & Tips: ₹${catTotals.other.toLocaleString('en-IN')}`,
    ''
  ];

  if (pendingSettlements.length > 0) {
    lines.push(`⚖️ *Pending Settlements (Who Pays Whom):*`);
    for (const s of pendingSettlements) {
      const fromName = memberMap.get(s.from_member_id)?.name || 'Member';
      const toName = memberMap.get(s.to_member_id)?.name || 'Member';
      const toMember = memberMap.get(s.to_member_id);
      const upiNote = toMember?.upi_id ? ` (UPI: ${toMember.upi_id})` : '';
      lines.push(`  • *${fromName}* pays *${toName}*: ₹${s.amount_inr.toLocaleString('en-IN')}${upiNote}`);
    }
    lines.push('');
  } else if (ledger.expenses.length > 0) {
    lines.push(`🎉 *All group expenses are completely settled!* No pending dues.`);
    lines.push('');
  }

  if (settledList.length > 0) {
    lines.push(`✅ *Completed Settlements:*`);
    for (const s of settledList) {
      const fromName = memberMap.get(s.from_member_id)?.name || 'Member';
      const toName = memberMap.get(s.to_member_id)?.name || 'Member';
      lines.push(`  • ${fromName} paid ${toName} ₹${s.amount_inr.toLocaleString('en-IN')} via ${s.payment_method || 'UPI'} [Settled]`);
    }
    lines.push('');
  }

  lines.push(`_Organized seamlessly with TourGuide / TripWeave_`);
  return lines.join('\n');
}
