'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Users,
  CreditCard,
  History,
  PieChart,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Share2,
  Trash2,
  Smartphone,
  Copy,
  Check,
  Edit2,
  IndianRupee,
  Utensils,
  Car,
  Hotel,
  Ticket,
  ShoppingBag,
  Package
} from 'lucide-react';
import {
  GroupMember,
  GroupExpense,
  SettlementTransfer,
  TripExpenseLedger,
  ExpenseCategory,
  TripPlan
} from '../types/trip';
import {
  calculateEqualSplits,
  calculateNetBalances,
  calculateOptimalSettlements,
  calculateCategoryTotals,
  generateUpiUrl,
  isValidUpiId,
  formatWhatsAppExpenseSummary
} from '../utils/settlement';

interface GroupExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: string;
  plan: TripPlan;
  ledger: TripExpenseLedger;
  onUpdateLedger: (updatedLedger: TripExpenseLedger) => void;
  initialAddExpense?: {
    title: string;
    amount: number;
    category: ExpenseCategory;
    activityRef?: string;
  } | null;
}

const CATEGORY_CONFIG: Record<
  ExpenseCategory,
  { label: string; icon: typeof Utensils; color: string; bg: string }
> = {
  dining: { label: 'Dining & Food', icon: Utensils, color: 'text-[#89532d]', bg: 'bg-amber-500/10 border-amber-500/30' },
  transit: { label: 'Transit & Commute', icon: Car, color: 'text-cyan-700', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  lodging: { label: 'Lodging & Stays', icon: Hotel, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  activities: { label: 'Activities & Entry', icon: Ticket, color: 'text-emerald-700', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  shopping: { label: 'Shopping & Souvenirs', icon: ShoppingBag, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10 border-fuchsia-500/30' },
  other: { label: 'Other & Tips', icon: Package, color: 'text-[#526653]', bg: 'bg-gray-500/10 border-gray-500/30' },
};

type ActiveTab = 'overview' | 'settle' | 'history' | 'members';

export default function GroupExpenseModal({
  isOpen,
  onClose,
  destination,
  plan,
  ledger,
  onUpdateLedger,
  initialAddExpense = null
}: GroupExpenseModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [copiedUpiId, setCopiedUpiId] = useState<string | null>(null);

  // Form states for new expense
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('dining');
  const [newPaidBy, setNewPaidBy] = useState('');
  const [newSplitType, setNewSplitType] = useState<'equal' | 'custom'>('equal');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [newNotes, setNewNotes] = useState('');
  const [newActivityRef, setNewActivityRef] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => setIsMounted(true), []);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Keep this dialog above Leaflet's positioned panes and isolate page scroll
  // while open. The portal also avoids transformed/overflowing page ancestors.
  useEffect(() => {
    if (!isOpen || !isMounted) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (
        document.activeElement === first
        || document.activeElement === modalRef.current
        || !modalRef.current.contains(document.activeElement)
      )) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (
        document.activeElement === last
        || document.activeElement === modalRef.current
        || !modalRef.current.contains(document.activeElement)
      )) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, isMounted]);

  // Member editing states
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberEditName, setMemberEditName] = useState('');
  const [memberEditUpi, setMemberEditUpi] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberUpi, setNewMemberUpi] = useState('');

  // Settle inline UPI update
  const [inlineUpiTarget, setInlineUpiTarget] = useState<string | null>(null);
  const [inlineUpiValue, setInlineUpiValue] = useState('');

  // Initialize form when opened with initialAddExpense
  useEffect(() => {
    if (initialAddExpense) {
      setNewTitle(initialAddExpense.title);
      setNewAmount(String(initialAddExpense.amount || ''));
      setNewCategory(initialAddExpense.category);
      setNewActivityRef(initialAddExpense.activityRef);
      setIsAddingExpense(true);
      setActiveTab('history');
    }
  }, [initialAddExpense]);

  // Set default payer and members when modal opens or members change
  useEffect(() => {
    if (ledger.members.length > 0) {
      if (!newPaidBy || !ledger.members.some(m => m.id === newPaidBy)) {
        setNewPaidBy(ledger.members[0].id);
      }
      if (selectedMemberIds.length === 0) {
        setSelectedMemberIds(ledger.members.map(m => m.id));
      }
    }
  }, [ledger.members, newPaidBy, selectedMemberIds.length]);

  // Calculations
  const memberMap = useMemo(() => new Map<string, GroupMember>(ledger.members.map(m => [m.id, m])), [ledger.members]);
  const totalSpentInr = useMemo(() => ledger.expenses.reduce((s, e) => s + e.amount_inr, 0), [ledger.expenses]);
  const categoryTotals = useMemo(() => calculateCategoryTotals(ledger.expenses), [ledger.expenses]);
  const netBalances = useMemo(() => calculateNetBalances(ledger.members, ledger.expenses, ledger.settlements), [ledger.members, ledger.expenses, ledger.settlements]);
  const pendingSettlements = useMemo(() => calculateOptimalSettlements(ledger.members, ledger.expenses, ledger.settlements), [ledger.members, ledger.expenses, ledger.settlements]);
  const settledTransfers = useMemo(() => ledger.settlements.filter(s => s.is_settled), [ledger.settlements]);

  // Planned allocations for budget comparison
  const plannedBudget = useMemo(() => {
    const hotelCost = plan.hotel_summary?.total_cost_inr || 0;
    const transitCost = plan.estimated_transport_cost_inr || 0;
    const activitiesCost = plan.days.reduce((acc, d) => acc + d.day_cost_inr, 0);
    const mealsCost = plan.expense_breakdown?.suggested_meals_inr || plan.expense_breakdown?.estimated_meals_inr || 0;
    const totalPlanCost = plan.total_cost_inr || (hotelCost + transitCost + activitiesCost + mealsCost);

    return {
      dining: mealsCost,
      transit: transitCost,
      lodging: hotelCost,
      activities: activitiesCost,
      total: totalPlanCost
    };
  }, [plan]);

  if (!isOpen || !isMounted) return null;

  // Toggle member participation in split
  const toggleMemberInSplit = (memberId: string) => {
    if (selectedMemberIds.includes(memberId)) {
      if (selectedMemberIds.length === 1) return; // Prevent empty split
      setSelectedMemberIds(selectedMemberIds.filter(id => id !== memberId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, memberId]);
    }
  };

  // Handle custom split input changes
  const handleCustomSplitChange = (memberId: string, val: string) => {
    setCustomSplits(prev => ({ ...prev, [memberId]: val }));
  };

  // Add new expense submission
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid positive expense amount.');
      return;
    }
    if (!newTitle.trim()) {
      setFormError('Please enter a description for this expense.');
      return;
    }
    if (!newPaidBy) {
      setFormError('Please select who paid for this expense.');
      return;
    }
    if (selectedMemberIds.length === 0) {
      setFormError('At least one member must be selected for the split.');
      return;
    }

    let splits = [];
    if (newSplitType === 'equal') {
      splits = calculateEqualSplits(amount, selectedMemberIds);
    } else {
      let customSum = 0;
      splits = selectedMemberIds.map(id => {
        const val = parseFloat(customSplits[id] || '0');
        customSum += isNaN(val) ? 0 : val;
        return { member_id: id, amount_inr: isNaN(val) ? 0 : Math.round(val * 100) / 100 };
      });

      if (Math.abs(customSum - amount) > 0.05) {
        setFormError(`Custom splits sum to ₹${customSum.toLocaleString('en-IN')}, which does not match total ₹${amount.toLocaleString('en-IN')}. Difference: ₹${Math.abs(customSum - amount).toFixed(2)}.`);
        return;
      }
    }

    const createdExpense: GroupExpense = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: newTitle.trim(),
      amount_inr: Math.round(amount * 100) / 100,
      category: newCategory,
      paid_by_member_id: newPaidBy,
      split_type: newSplitType,
      splits,
      created_at: new Date().toISOString(),
      activity_ref: newActivityRef,
      notes: newNotes.trim() || undefined
    };

    onUpdateLedger({
      ...ledger,
      expenses: [createdExpense, ...ledger.expenses]
    });

    // Reset form
    setNewTitle('');
    setNewAmount('');
    setNewCategory('dining');
    setNewNotes('');
    setNewActivityRef(undefined);
    setCustomSplits({});
    setIsAddingExpense(false);
  };

  // Delete an expense
  const handleDeleteExpense = (expenseId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this expense?')) {
      return;
    }
    onUpdateLedger({
      ...ledger,
      expenses: ledger.expenses.filter(e => e.id !== expenseId)
    });
  };

  // Mark settlement transfer as completed
  const handleMarkSettled = (settlement: SettlementTransfer, method: 'upi' | 'cash' = 'upi') => {
    const updatedSettlements: SettlementTransfer[] = [
      ...ledger.settlements,
      {
        ...settlement,
        is_settled: true,
        settled_at: new Date().toISOString(),
        payment_method: method
      }
    ];
    onUpdateLedger({
      ...ledger,
      settlements: updatedSettlements
    });
  };

  // Undo a completed settlement
  const handleUndoSettlement = (settlementId: string) => {
    onUpdateLedger({
      ...ledger,
      settlements: ledger.settlements.filter(s => s.id !== settlementId)
    });
  };

  // Member Management: Add Member
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    if (newMemberUpi.trim() && !isValidUpiId(newMemberUpi.trim())) {
      setFormError('Invalid UPI ID format (expected handle like name@bank)');
      return;
    }

    const newId = `m_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newMember: GroupMember = {
      id: newId,
      name: newMemberName.trim(),
      upi_id: newMemberUpi.trim() || undefined
    };

    onUpdateLedger({
      ...ledger,
      members: [...ledger.members, newMember]
    });

    setSelectedMemberIds(prev => [...prev, newId]);
    setNewMemberName('');
    setNewMemberUpi('');
  };

  // Member Management: Save edited member
  const handleSaveMemberEdit = (memberId: string) => {
    if (!memberEditName.trim()) return;

    if (memberEditUpi.trim() && !isValidUpiId(memberEditUpi.trim())) {
      alert('Invalid UPI ID format (e.g. name@bank)');
      return;
    }

    onUpdateLedger({
      ...ledger,
      members: ledger.members.map(m => {
        if (m.id === memberId) {
          return {
            ...m,
            name: memberEditName.trim(),
            upi_id: memberEditUpi.trim() || undefined
          };
        }
        return m;
      })
    });

    setEditingMemberId(null);
  };

  // Quick save inline UPI ID
  const handleSaveInlineUpi = (memberId: string) => {
    if (!inlineUpiValue.trim()) return;

    if (!isValidUpiId(inlineUpiValue.trim())) {
      alert('Invalid UPI ID format (e.g. name@bank)');
      return;
    }

    onUpdateLedger({
      ...ledger,
      members: ledger.members.map(m => {
        if (m.id === memberId) {
          return { ...m, upi_id: inlineUpiValue.trim() };
        }
        return m;
      })
    });

    setInlineUpiTarget(null);
    setInlineUpiValue('');
  };

  // Copy WhatsApp summary
  const handleCopyWhatsApp = async () => {
    const summaryText = formatWhatsAppExpenseSummary(
      plan.plan_name || 'Trip Plan',
      destination,
      ledger,
      plan.total_cost_inr
    );

    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2500);
    } catch {
      // fallback
    }
  };

  // Copy individual UPI ID
  const handleCopyUpi = async (upiId: string) => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopiedUpiId(upiId);
      setTimeout(() => setCopiedUpiId(null), 2000);
    } catch {
      // fallback
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-expense-dialog-title"
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#c6d2c0] bg-[#eef1e5] shadow-2xl outline-none sm:max-h-[92dvh]"
      >

        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-[#d6dfd0] bg-[#fffdf5] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-gradient-to-tr from-amber-500/20 to-orange-500/20 font-bold text-[#89532d] shadow-inner sm:flex">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 id="group-expense-dialog-title" className="truncate text-sm font-bold tracking-wide text-[#243e33] sm:text-base">
                  Group Expense Tracker & UPI Settlement
                </h3>
                <span className="hidden shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#89532d] sm:inline-flex">
                  Live Ledger
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-[#526653] sm:text-xs">
                {destination.charAt(0).toUpperCase() + destination.slice(1)} • {ledger.members.length} Members • Total Spent: <span className="text-[#243e33] font-bold">₹{totalSpentInr.toLocaleString('en-IN')}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6dfd0] bg-[#d6dfd0] px-2 py-1.5 text-xs font-semibold text-gray-200 shadow-sm transition-all hover:bg-[#d6dfd0] hover:text-[#243e33] sm:px-3"
              title="Copy formatted WhatsApp summary"
            >
              {copiedWhatsApp ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="hidden sm:inline">WhatsApp Card</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#526653] hover:text-[#243e33] rounded-lg hover:bg-[#d6dfd0] transition-colors"
              aria-label="Close group expense tracker"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between gap-2 border-b border-[#d6dfd0] bg-[#eef1e5] px-2 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
            <button
              type="button"
              onClick={() => { setActiveTab('overview'); setIsAddingExpense(false); }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs ${
                activeTab === 'overview'
                  ? 'bg-amber-500/20 text-[#89532d] border border-amber-500/40 shadow-sm'
                  : 'text-[#526653] hover:text-[#243e33] hover:bg-[#eef1e5]'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              <span>Overview & Balances</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('settle'); setIsAddingExpense(false); }}
              className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs ${
                activeTab === 'settle'
                  ? 'bg-amber-500/20 text-[#89532d] border border-amber-500/40 shadow-sm'
                  : 'text-[#526653] hover:text-[#243e33] hover:bg-[#eef1e5]'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Settle Dues</span>
              {pendingSettlements.length > 0 && (
                <span className="ml-1 text-[10px] bg-rose-500/30 text-rose-300 border border-rose-500/40 px-1.5 py-0.2 rounded-full font-bold">
                  {pendingSettlements.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('history'); setIsAddingExpense(false); }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs ${
                activeTab === 'history'
                  ? 'bg-amber-500/20 text-[#89532d] border border-amber-500/40 shadow-sm'
                  : 'text-[#526653] hover:text-[#243e33] hover:bg-[#eef1e5]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Expenses ({ledger.expenses.length})</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('members'); setIsAddingExpense(false); }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs ${
                activeTab === 'members'
                  ? 'bg-amber-500/20 text-[#89532d] border border-amber-500/40 shadow-sm'
                  : 'text-[#526653] hover:text-[#243e33] hover:bg-[#eef1e5]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Members ({ledger.members.length})</span>
            </button>
          </div>

          {!isAddingExpense && (
            <button
              type="button"
              onClick={() => setIsAddingExpense(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2 py-1.5 text-[11px] font-bold text-black shadow-md transition-all hover:bg-amber-400 active:scale-95 sm:px-3 sm:text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Expense</span>
            </button>
          )}
        </div>

        {/* Main Body Content */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-3 sm:p-5">

          {/* Add Expense Form Drawer */}
          {isAddingExpense && (
            <div className="bg-[#eef1e5] border border-amber-500/40 rounded-xl p-4 sm:p-5 shadow-xl animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#c6d2c0]">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-[#89532d] flex items-center justify-center font-bold text-xs">
                    ₹
                  </div>
                  <h4 className="text-sm font-bold text-[#243e33]">Record New Group Expense</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingExpense(false)}
                  className="text-[#526653] hover:text-[#243e33] text-xs"
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSaveExpense} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Title / Description */}
                  <div>
                    <label className="block text-xs font-medium text-[#425d4c] mb-1">
                      Expense Description <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dinner at Paradise, Auto to Golconda"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-[#d6dfd0] border border-[#d6dfd0] focus:border-amber-400 rounded-lg text-[#243e33] placeholder-gray-500 focus:outline-none"
                    />
                  </div>

                  {/* Amount in INR */}
                  <div>
                    <label className="block text-xs font-medium text-[#425d4c] mb-1">
                      Total Amount (₹ INR) <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#526653] text-xs font-bold">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="0.00"
                        value={newAmount}
                        onChange={e => setNewAmount(e.target.value)}
                        required
                        className="w-full pl-7 pr-3 py-2 text-xs bg-[#d6dfd0] border border-[#d6dfd0] focus:border-amber-400 rounded-lg text-[#243e33] font-bold placeholder-gray-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-medium text-[#425d4c] mb-1.5">
                    Category
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {(Object.keys(CATEGORY_CONFIG) as ExpenseCategory[]).map(catKey => {
                      const cfg = CATEGORY_CONFIG[catKey];
                      const Icon = cfg.icon;
                      const isSelected = newCategory === catKey;
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => setNewCategory(catKey)}
                          className={`flex items-center space-x-1.5 p-2 rounded-lg text-xs font-medium border transition-all text-left ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500/50 text-[#243e33] shadow-sm'
                              : 'bg-[#d6dfd0] border-[#d6dfd0] text-[#526653] hover:text-[#243e33]'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                          <span className="truncate">{cfg.label.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Paid By */}
                  <div>
                    <label className="block text-xs font-medium text-[#425d4c] mb-1">
                      Paid By <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={newPaidBy}
                      onChange={e => setNewPaidBy(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#d6dfd0] border border-[#d6dfd0] focus:border-amber-400 rounded-lg text-[#243e33] focus:outline-none"
                    >
                      {ledger.members.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.upi_id ? `(${m.upi_id})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Split Type Toggle */}
                  <div>
                    <label className="block text-xs font-medium text-[#425d4c] mb-1">
                      Split Mode
                    </label>
                    <div className="flex rounded-lg bg-[#d6dfd0] p-0.5 border border-[#d6dfd0]">
                      <button
                        type="button"
                        onClick={() => setNewSplitType('equal')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          newSplitType === 'equal'
                            ? 'bg-amber-500 text-black shadow-sm'
                            : 'text-[#526653] hover:text-[#243e33]'
                        }`}
                      >
                        Split Equally
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewSplitType('custom')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          newSplitType === 'custom'
                            ? 'bg-amber-500 text-black shadow-sm'
                            : 'text-[#526653] hover:text-[#243e33]'
                        }`}
                      >
                        Custom Split
                      </button>
                    </div>
                  </div>
                </div>

                {/* Member Split Selection */}
                <div className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#425d4c]">
                      Split Among ({selectedMemberIds.length} members)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedMemberIds.length === ledger.members.length) {
                          setSelectedMemberIds([ledger.members[0].id]);
                        } else {
                          setSelectedMemberIds(ledger.members.map(m => m.id));
                        }
                      }}
                      className="text-[11px] text-[#89532d] hover:underline"
                    >
                      {selectedMemberIds.length === ledger.members.length ? 'Deselect Others' : 'Select All'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ledger.members.map(m => {
                      const isSelected = selectedMemberIds.includes(m.id);
                      const amountNum = parseFloat(newAmount) || 0;
                      const equalShare = selectedMemberIds.length > 0
                        ? (amountNum / selectedMemberIds.length).toFixed(2)
                        : '0.00';

                      return (
                        <div
                          key={m.id}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                            isSelected
                              ? 'bg-[#d6dfd0] border-amber-500/40 text-[#243e33]'
                              : 'bg-[#eef1e5] border-[#d6dfd0] text-[#596b57]'
                          }`}
                        >
                          <label className="flex items-center space-x-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMemberInSplit(m.id)}
                              className="w-3.5 h-3.5 text-amber-500 rounded border-gray-600 focus:ring-0"
                            />
                            <span className="font-medium text-gray-200">{m.name}</span>
                          </label>

                          {isSelected && (
                            <div>
                              {newSplitType === 'equal' ? (
                                <span className="text-[#89532d] font-mono font-bold">
                                  ₹{equalShare}
                                </span>
                              ) : (
                                <div className="flex items-center space-x-1">
                                  <span className="text-[#526653] text-[10px]">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    value={customSplits[m.id] ?? ''}
                                    onChange={e => handleCustomSplitChange(m.id, e.target.value)}
                                    className="w-16 px-1.5 py-0.5 text-xs bg-[#eef1e5] border border-[#d6dfd0] focus:border-amber-400 rounded text-right text-[#243e33] font-bold"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes Input */}
                <div>
                  <input
                    type="text"
                    placeholder="Optional notes or receipt details..."
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#d6dfd0] border border-[#d6dfd0] focus:border-amber-400 rounded-lg text-[#243e33] placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingExpense(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#d6dfd0] hover:bg-[#d6dfd0] text-[#425d4c]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-black shadow-md active:scale-95"
                  >
                    Save Group Expense
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 1: OVERVIEW & BALANCES */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {/* Top Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-3.5">
                  <span className="text-[10px] text-[#526653] uppercase font-semibold block">Total Logged Spend</span>
                  <div className="text-xl font-extrabold text-[#243e33] mt-1">
                    ₹{totalSpentInr.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[11px] text-[#526653] mt-1 block">
                    Across {ledger.expenses.length} recorded items
                  </span>
                </div>

                <div className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-3.5">
                  <span className="text-[10px] text-[#526653] uppercase font-semibold block">Trip Estimated Budget</span>
                  <div className="text-xl font-extrabold text-[#89532d] mt-1">
                    ₹{plannedBudget.total.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] mt-1 flex items-center space-x-1">
                    {plannedBudget.total - totalSpentInr >= 0 ? (
                      <span className="text-emerald-700 font-semibold">
                        ✓ ₹{(plannedBudget.total - totalSpentInr).toLocaleString('en-IN')} remaining
                      </span>
                    ) : (
                      <span className="text-rose-400 font-semibold">
                        ⚠️ ₹{(totalSpentInr - plannedBudget.total).toLocaleString('en-IN')} over budget
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-3.5">
                  <span className="text-[10px] text-[#526653] uppercase font-semibold block">Settlement Status</span>
                  <div className="text-xl font-extrabold mt-1">
                    {pendingSettlements.length === 0 ? (
                      <span className="text-emerald-700 flex items-center space-x-1">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>All Settled</span>
                      </span>
                    ) : (
                      <span className="text-rose-400">
                        {pendingSettlements.length} Transfers Due
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#526653] mt-1 block">
                    {settledTransfers.length} completed settlements
                  </span>
                </div>
              </div>

              {/* Net Balances per Member */}
              <div>
                <h4 className="text-xs font-bold text-[#425d4c] uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-[#89532d]" />
                  <span>Individual Net Balances</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {ledger.members.map(m => {
                    const net = netBalances.get(m.id) ?? 0;
                    const isCreditor = net > 0.01;
                    const isDebtor = net < -0.01;

                    return (
                      <div
                        key={m.id}
                        className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-3.5 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-500/20 text-[#89532d] flex items-center justify-center font-bold text-xs border border-amber-500/30">
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#243e33] block">{m.name}</span>
                              <span className="text-[10px] text-[#526653] font-mono">
                                {m.upi_id || 'No UPI ID'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#d6dfd0] flex items-center justify-between">
                          <span className="text-[11px] text-[#526653]">Net Balance:</span>
                          <span
                            className={`text-xs font-bold font-mono ${
                              isCreditor
                                ? 'text-emerald-700'
                                : isDebtor
                                ? 'text-rose-400'
                                : 'text-[#526653]'
                            }`}
                          >
                            {isCreditor ? `+₹${net.toLocaleString('en-IN')}` : isDebtor ? `-₹${Math.abs(net).toLocaleString('en-IN')}` : '₹0 (Settled)'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Breakdown vs Planned Budget */}
              <div>
                <h4 className="text-xs font-bold text-[#425d4c] uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                  <PieChart className="w-4 h-4 text-[#89532d]" />
                  <span>Category Spend vs Planned Budget</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(CATEGORY_CONFIG) as ExpenseCategory[]).map(catKey => {
                    const cfg = CATEGORY_CONFIG[catKey];
                    const Icon = cfg.icon;
                    const actual = categoryTotals[catKey];
                    const planned = (plannedBudget as Record<string, number>)[catKey] || 0;
                    const hasPlanned = planned > 0;
                    const pct = hasPlanned ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
                    const isOver = hasPlanned && actual > planned;

                    return (
                      <div key={catKey} className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center space-x-2">
                            <div className={`p-1.5 rounded-lg border ${cfg.bg}`}>
                              <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                            </div>
                            <span className="text-xs font-semibold text-gray-200">{cfg.label}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-[#243e33]">₹{actual.toLocaleString('en-IN')}</span>
                            {hasPlanned && (
                              <span className="text-[10px] text-[#526653] block">
                                / ₹{planned.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>

                        {hasPlanned && (
                          <div className="mt-2">
                            <div className="w-full bg-[#d6dfd0] h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isOver ? 'bg-rose-500' : 'bg-amber-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] mt-1">
                              <span className={isOver ? 'text-rose-400 font-semibold' : 'text-[#526653]'}>
                                {isOver ? `⚠️ Over by ₹${(actual - planned).toLocaleString('en-IN')}` : `${pct}% of budget`}
                              </span>
                              {!isOver && (
                                <span className="text-emerald-700 font-medium">
                                  ₹{(planned - actual).toLocaleString('en-IN')} left
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SETTLE DUES (WHO OWES WHOM & UPI LINKS) */}
          {activeTab === 'settle' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-xs font-bold text-[#425d4c] uppercase tracking-wider flex items-center space-x-1.5">
                      <CreditCard className="w-4 h-4 text-[#89532d]" />
                      <span>Recommended Minimum-Transfer Settlements</span>
                    </h4>
                    <p className="text-[11px] text-[#526653] mt-0.5">
                      Greedy bipartite matching settles all group balances in at most {ledger.members.length - 1} payments.
                    </p>
                  </div>
                </div>

                {pendingSettlements.length === 0 ? (
                  <div className="bg-[#eef1e5] border border-emerald-500/30 rounded-xl p-8 text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto" />
                    <h4 className="text-sm font-bold text-[#243e33]">All Debts Completely Cleared!</h4>
                    <p className="text-xs text-[#526653] max-w-sm mx-auto">
                      There are no pending settlement transfers. All expenses are balanced or have been marked as paid.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingSettlements.map((s, idx) => {
                      const fromMember = memberMap.get(s.from_member_id);
                      const toMember = memberMap.get(s.to_member_id);
                      if (!fromMember || !toMember) return null;

                      const upiUrl = toMember.upi_id
                        ? generateUpiUrl(
                            toMember.upi_id,
                            toMember.name,
                            s.amount_inr,
                            `TourGuide ${destination} settle`
                          )
                        : null;

                      return (
                        <div
                          key={s.id || idx}
                          className="bg-[#eef1e5] border border-[#d6dfd0] hover:border-amber-500/30 rounded-xl p-4 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-xs">
                                {fromMember.name.charAt(0)}
                              </div>

                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-[#243e33]">{fromMember.name}</span>
                                <ArrowRight className="w-3.5 h-3.5 text-[#596b57]" />
                                <span className="text-xs font-bold text-emerald-700">{toMember.name}</span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-3 sm:space-x-4">
                              <div className="text-right">
                                <span className="text-sm font-extrabold text-[#243e33] font-mono block">
                                  ₹{s.amount_inr.toLocaleString('en-IN')}
                                </span>
                                <span className="text-[10px] text-[#526653]">
                                  {toMember.upi_id ? `Pay to: ${toMember.upi_id}` : 'No UPI ID'}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1.5">
                                {upiUrl ? (
                                  <>
                                    <a
                                      href={upiUrl}
                                      className="inline-flex items-center space-x-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all"
                                      title="Open UPI app (Google Pay, PhonePe, Paytm)"
                                    >
                                      <Smartphone className="w-3.5 h-3.5" />
                                      <span>Pay UPI</span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => toMember.upi_id && handleCopyUpi(toMember.upi_id)}
                                      className="p-1.5 bg-[#d6dfd0] hover:bg-[#d6dfd0] border border-[#d6dfd0] text-[#425d4c] hover:text-[#243e33] rounded-lg transition-colors"
                                      title="Copy UPI ID"
                                    >
                                      {copiedUpiId === toMember.upi_id ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineUpiTarget(toMember.id);
                                      setInlineUpiValue('');
                                    }}
                                    className="px-2.5 py-1.5 bg-[#d6dfd0] hover:bg-[#d6dfd0] border border-[#d6dfd0] text-[#89532d] text-xs font-semibold rounded-lg"
                                  >
                                    + Add UPI ID
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleMarkSettled(s, 'upi')}
                                  className="px-2.5 py-1.5 bg-[#eef1e5] hover:bg-[#d6dfd0] border border-[#d6dfd0] text-[#425d4c] hover:text-[#243e33] text-xs font-semibold rounded-lg transition-colors"
                                  title="Mark as paid/cleared"
                                >
                                  Mark Settled
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Inline UPI ID Input if missing */}
                          {inlineUpiTarget === toMember.id && (
                            <div className="mt-3 pt-3 border-t border-[#d6dfd0] flex items-center space-x-2">
                              <span className="text-xs text-[#526653]">Enter UPI ID for {toMember.name}:</span>
                              <input
                                type="text"
                                placeholder="e.g. name@oksbi"
                                value={inlineUpiValue}
                                onChange={e => setInlineUpiValue(e.target.value)}
                                className="px-2 py-1 text-xs bg-[#d6dfd0] border border-[#d6dfd0] rounded text-[#243e33] font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveInlineUpi(toMember.id)}
                                className="px-2 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineUpiTarget(null)}
                                className="text-xs text-[#526653] hover:text-[#243e33] px-1"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Settled History */}
              {settledTransfers.length > 0 && (
                <div className="pt-4 border-t border-[#d6dfd0]">
                  <h4 className="text-xs font-bold text-[#526653] uppercase tracking-wider mb-3">
                    Completed Settlements ({settledTransfers.length})
                  </h4>
                  <div className="space-y-2">
                    {settledTransfers.map((s, idx) => {
                      const fromMember = memberMap.get(s.from_member_id);
                      const toMember = memberMap.get(s.to_member_id);
                      return (
                        <div
                          key={s.id || idx}
                          className="bg-[#eef1e5] border border-[#d6dfd0] rounded-lg p-2.5 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span className="text-[#425d4c]">
                              <span className="text-[#243e33] font-semibold">{fromMember?.name || 'Member'}</span> paid{' '}
                              <span className="text-[#243e33] font-semibold">{toMember?.name || 'Member'}</span> ₹{s.amount_inr.toLocaleString('en-IN')}
                            </span>
                            <span className="text-[10px] text-[#596b57]">
                              ({s.payment_method?.toUpperCase() || 'UPI'})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUndoSettlement(s.id)}
                            className="text-[11px] text-[#596b57] hover:text-rose-400 transition-colors"
                            title="Undo this settlement"
                          >
                            Revert
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: EXPENSE HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#425d4c] uppercase tracking-wider">
                  Logged Expenses ({ledger.expenses.length})
                </h4>
                <span className="text-xs text-[#526653] font-mono">
                  Total: ₹{totalSpentInr.toLocaleString('en-IN')}
                </span>
              </div>

              {ledger.expenses.length === 0 ? (
                <div className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-8 text-center space-y-2">
                  <Utensils className="w-8 h-8 text-[#596b57] mx-auto" />
                  <h4 className="text-sm font-bold text-[#243e33]">No expenses recorded yet</h4>
                  <p className="text-xs text-[#526653] max-w-sm mx-auto">
                    Click &quot;Add Expense&quot; above or check off items in your itinerary to start tracking group spends!
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {ledger.expenses.map(exp => {
                    const cfg = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG.other;
                    const Icon = cfg.icon;
                    const payer = memberMap.get(exp.paid_by_member_id);

                    return (
                      <div
                        key={exp.id}
                        className="bg-[#eef1e5] border border-[#d6dfd0] hover:border-[#d6dfd0] rounded-xl p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`p-2 rounded-lg border ${cfg.bg} shrink-0 mt-0.5`}>
                            <Icon className={`w-4 h-4 ${cfg.color}`} />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h5 className="text-xs font-bold text-[#243e33]">{exp.title}</h5>
                              <span className="text-[10px] text-[#526653] bg-[#d6dfd0] px-2 py-0.2 rounded font-medium">
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#526653] mt-1">
                              Paid by <span className="text-[#89532d] font-semibold">{payer?.name || 'Member'}</span> • Split between{' '}
                              <span className="text-[#425d4c]">{exp.splits.length} people</span>{' '}
                              ({exp.split_type === 'equal' ? 'Equally' : 'Custom'})
                            </p>
                            {exp.notes && (
                              <p className="text-[10px] text-[#596b57] italic mt-0.5">{exp.notes}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end space-x-3">
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-[#243e33] font-mono block">
                              ₹{exp.amount_inr.toLocaleString('en-IN')}
                            </span>
                            <span className="text-[10px] text-[#596b57]">
                              {new Date(exp.created_at).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1.5 text-[#596b57] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Delete expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MEMBERS MANAGEMENT */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-[#425d4c] uppercase tracking-wider mb-3">
                  Group Members ({ledger.members.length})
                </h4>
                <div className="space-y-2.5">
                  {ledger.members.map(m => {
                    const isEditing = editingMemberId === m.id;
                    const hasExpenses = ledger.expenses.some(
                      e => e.paid_by_member_id === m.id || e.splits.some(s => s.member_id === m.id)
                    );

                    return (
                      <div
                        key={m.id}
                        className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                      >
                        {isEditing ? (
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={memberEditName}
                              onChange={e => setMemberEditName(e.target.value)}
                              placeholder="Name"
                              className="px-2 py-1 bg-[#d6dfd0] border border-amber-500/50 rounded text-[#243e33] text-xs font-semibold"
                            />
                            <input
                              type="text"
                              value={memberEditUpi}
                              onChange={e => setMemberEditUpi(e.target.value)}
                              placeholder="UPI ID (optional, e.g. name@bank)"
                              className="px-2 py-1 bg-[#d6dfd0] border border-amber-500/50 rounded text-[#243e33] text-xs font-mono"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center space-x-3">
                            <div className="w-7 h-7 rounded-full bg-amber-500/20 text-[#89532d] flex items-center justify-center font-bold text-xs border border-amber-500/30">
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-[#243e33] block">{m.name}</span>
                              <span className="text-[11px] text-[#526653] font-mono">
                                {m.upi_id ? `UPI: ${m.upi_id}` : 'No UPI configured'}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center space-x-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveMemberEdit(m.id)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingMemberId(null)}
                                className="text-[#526653] hover:text-[#243e33] px-1"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMemberId(m.id);
                                  setMemberEditName(m.name);
                                  setMemberEditUpi(m.upi_id || '');
                                }}
                                className="p-1.5 text-[#526653] hover:text-[#243e33] hover:bg-[#d6dfd0] rounded-lg"
                                title="Edit details"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {!hasExpenses && ledger.members.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUpdateLedger({
                                      ...ledger,
                                      members: ledger.members.filter(mem => mem.id !== m.id)
                                    });
                                    setSelectedMemberIds(prev => prev.filter(id => id !== m.id));
                                  }}
                                  className="p-1.5 text-[#596b57] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
                                  title="Remove member"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Member Form */}
              <div className="bg-[#eef1e5] border border-[#d6dfd0] rounded-xl p-4">
                <h5 className="text-xs font-bold text-[#425d4c] uppercase tracking-wider mb-2">
                  + Add New Group Traveler
                </h5>
                <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Member Name (e.g. Priya)"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    required
                    className="px-3 py-1.5 text-xs bg-[#d6dfd0] border border-[#d6dfd0] rounded-lg text-[#243e33] placeholder-gray-500 focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    placeholder="UPI ID (optional, e.g. priya@okhdfc)"
                    value={newMemberUpi}
                    onChange={e => setNewMemberUpi(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-[#d6dfd0] border border-[#d6dfd0] rounded-lg text-[#243e33] font-mono placeholder-gray-500 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg shadow-sm transition-all"
                  >
                    Add Member
                  </button>
                </form>
              </div>
            </div>
          )}

        </div>

        {/* Footer Bar */}
        <div className="flex items-center justify-between gap-2 border-t border-[#d6dfd0] bg-[#fffdf5] px-3 py-2 text-[10px] text-[#526653] sm:px-5 sm:py-3 sm:text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Auto-synced with browser local storage</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#d6dfd0] hover:bg-[#d6dfd0] text-[#425d4c] hover:text-[#243e33] font-semibold transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>,
    document.body,
  );
}
