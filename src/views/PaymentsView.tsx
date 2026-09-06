import React, { useState, useEffect } from 'react';
import { Member, MembershipPlan, Payment, GymSettings } from '../types';
import { getMemberLatestBalance } from '../lib/db';
import {
  CreditCard,
  Search,
  Receipt,
  Download,
  Eye,
  CheckCircle2,
  Calendar,
  IndianRupee,
  RefreshCw,
  Clock,
  Sparkles,
  User,
  ArrowRight,
  Mail,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { generateReceiptPdf } from '../lib/pdfReceipt';
import { sendReceiptEmail } from '../lib/emailReceipt';
import { resolveMemberPlanName, extractUpiTransactionNumber } from '../lib/planUtils';

interface Props {
  members: Member[];
  plans: MembershipPlan[];
  payments: Payment[];
  settings: GymSettings;
  adminEmail: string;
  onRecordPayment: (paymentData: any) => Promise<Payment>;
  onViewReceipt: (payment: Payment) => void;
  preselectedMember?: Member | null;
  onClearPreselectedMember?: () => void;
}

export const PaymentsView: React.FC<Props> = ({
  members,
  plans,
  payments,
  settings,
  adminEmail,
  onRecordPayment,
  onViewReceipt,
  preselectedMember,
  onClearPreselectedMember,
}) => {
  // Member selection
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');

  // Payment form states
  const [planAmount, setPlanAmount] = useState<number>(0);
  const [previousBalance, setPreviousBalance] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI'>('Cash');
  const [upiTransactionNumber, setUpiTransactionNumber] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [renewMonths, setRenewMonths] = useState<number>(0);

  // Status states
  const [loadingBalance, setLoadingBalance] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successPayment, setSuccessPayment] = useState<Payment | null>(null);

  // Email status state
  const [sendingPaymentId, setSendingPaymentId] = useState<string | null>(null);
  const [emailAlert, setEmailAlert] = useState<{
    type: 'success' | 'error';
    message: string;
    paymentId?: string;
  } | null>(null);

  // History search filter
  const [historySearch, setHistorySearch] = useState<string>('');

  // When preselectedMember is provided, auto-select
  useEffect(() => {
    if (preselectedMember) {
      handleSelectMember(preselectedMember);
    }
  }, [preselectedMember]);

  const handleSelectMember = async (m: Member) => {
    setSelectedMemberId(m.id);
    setMemberSearch(`${m.name} (${m.member_id})`);
    setErrorMsg(null);
    setSuccessPayment(null);
    setUpiTransactionNumber('');

    // Load member plan info
    const plan = plans.find((p) => p.id === m.plan_id);
    const pAmount = Number(m.plan_amount || plan?.price || 0);
    const pDiscount = Number(m.discount || 0);
    setPlanAmount(pAmount);
    setDiscount(pDiscount);
    setRenewMonths(plan?.duration_months || 1);

    // Fetch the latest remaining balance from previous payments
    setLoadingBalance(true);
    try {
      const prevBal = await getMemberLatestBalance(m.id);
      setPreviousBalance(prevBal);

      // Default amount paid to total due
      const initialTotalDue = Math.max(0, pAmount - pDiscount + prevBal);
      setAmountPaid(initialTotalDue);
    } catch (e) {
      console.warn('Could not fetch previous balance:', e);
      setPreviousBalance(0);
      setAmountPaid(Math.max(0, pAmount - pDiscount));
    } finally {
      setLoadingBalance(false);
    }
  };

  // Payment calculations
  // Total Due = Plan Amount - Discount + Previous Balance
  const totalDue = Math.max(0, Number(planAmount) - Number(discount) + Number(previousBalance));
  // Remaining Balance = Total Due - Amount Paid
  const remainingBalance = Math.max(0, totalDue - Number(amountPaid));

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedMemberId) {
      setErrorMsg('Please select a member first.');
      return;
    }

    if (amountPaid <= 0 && totalDue > 0) {
      if (!confirm('The amount paid is ₹0. Do you want to record this transaction with full outstanding balance?')) {
        return;
      }
    }

    setSubmitting(true);
    try {
      const member = members.find((m) => m.id === selectedMemberId);
      const plan = plans.find((p) => p.id === member?.plan_id);

      const payment = await onRecordPayment({
        member_id: selectedMemberId,
        amount: Number(amountPaid),
        discount: Number(discount),
        previous_balance: Number(previousBalance),
        total_due: Number(totalDue),
        remaining_balance: Number(remainingBalance),
        payment_method: paymentMethod,
        payment_date: paymentDate,
        notes: notes.trim(),
        plan_name: plan?.name || 'Membership Fee',
        renew_months: renewMonths,
      });

      setSuccessPayment(payment);
      if (onClearPreselectedMember) onClearPreselectedMember();
    } catch (err: any) {
      console.error('Supabase payment insert error:', err);
      setErrorMsg(err.message || 'Failed to save payment to Supabase');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadSuccessPdf = () => {
    if (!successPayment) return;
    const member = members.find((m) => m.id === successPayment.member_id);
    generateReceiptPdf(successPayment, member, settings, adminEmail);
  };

  const handleSendReceiptEmail = async (p: Payment) => {
    if (sendingPaymentId) return; // Prevent multiple clicks while sending
    setSendingPaymentId(p.id);
    setEmailAlert(null);

    const member = members.find((m) => m.id === p.member_id);
    try {
      const result = await sendReceiptEmail(p, member, settings, adminEmail);
      if (result.success) {
        setEmailAlert({
          type: 'success',
          message: result.message,
          paymentId: p.id,
        });
      } else {
        setEmailAlert({
          type: 'error',
          message: result.message || 'Customer email address not found. Please update the member profile first.',
          paymentId: p.id,
        });
      }
    } catch (err: any) {
      setEmailAlert({
        type: 'error',
        message: err.message || 'Failed to dispatch email receipt.',
        paymentId: p.id,
      });
    } finally {
      setSendingPaymentId(null);
    }
  };

  const resetFormAfterSuccess = () => {
    setSuccessPayment(null);
    setSelectedMemberId('');
    setMemberSearch('');
    setNotes('');
  };

  // Filtered members for dropdown search
  const searchedMembers = members.filter((m) => {
    if (!memberSearch) return false;
    const q = memberSearch.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.member_id.toLowerCase().includes(q) ||
      m.mobile.includes(q)
    );
  });

  // Filtered payment history
  const filteredPayments = payments.filter((p) => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      (p.member_name && p.member_name.toLowerCase().includes(q)) ||
      (p.member_code && p.member_code.toLowerCase().includes(q)) ||
      (p.payment_id && p.payment_id.toLowerCase().includes(q)) ||
      (p.receipt_number && p.receipt_number.toLowerCase().includes(q)) ||
      (p.payment_method && p.payment_method.toLowerCase().includes(q))
    );
  });

  const selectedMember = members.find((m) => m.id === selectedMemberId);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white font-display">
            FEE COLLECTION & AUTOMATED RECEIPT GENERATOR
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Calculates plan fees, carried previous balances, and remaining balances with instant PDF receipts.
          </p>
        </div>
      </div>

      {/* Main Grid: Payment Form (Left) & Real-time Receipt Preview / Success (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form (7 cols) */}
        <div className="lg:col-span-7 bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-neutral-800">
            <div className="w-10 h-10 rounded-2xl bg-red-600/10 border border-red-500/20 text-red-500 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Record Member Fee Payment</h3>
              <p className="text-xs text-neutral-400">Select athlete, review dues, and issue official receipt</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-950/50 border border-red-800/60 text-red-200 text-xs">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmitPayment} className="space-y-5">
            {/* Member Selection Search */}
            <div className="relative">
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-red-500" /> Select Gym Member *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    if (selectedMemberId && e.target.value !== selectedMember?.name) {
                      setSelectedMemberId('');
                    }
                  }}
                  placeholder="Type Name, Member ID (e.g. MS-0001), or Mobile..."
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-neutral-500 outline-none"
                />
                <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>

              {/* Autocomplete dropdown if typing */}
              {!selectedMemberId && memberSearch && searchedMembers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl z-20 max-h-56 overflow-y-auto divide-y divide-neutral-800">
                  {searchedMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMember(m)}
                      className="w-full text-left p-3 hover:bg-neutral-900 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{m.name}</span>
                          <span className="font-mono text-red-400 text-[10px] bg-red-950/60 px-1.5 py-0.5 rounded">
                            {m.member_id}
                          </span>
                        </div>
                        <span className="text-neutral-400 text-[11px]">{m.mobile}</span>
                      </div>
                      <span className="text-neutral-400 text-[10px]">Click to select</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Member Details Snapshot Card */}
            {selectedMember && (
              <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider block">
                    Selected Member
                  </span>
                  <div className="font-bold text-white text-sm mt-0.5">{selectedMember.name}</div>
                  <div className="text-neutral-400 mt-0.5">
                    Plan: <span className="text-neutral-200 font-medium">{plans.find((p) => p.id === selectedMember.plan_id)?.name || 'Custom'}</span> • Expiry:{' '}
                    <span className="text-red-400">{new Date(selectedMember.membership_expiry).toLocaleDateString('en-IN')}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase text-neutral-500 font-bold block">
                    Carried Dues
                  </span>
                  <span className="font-bold text-amber-400 text-base font-display">
                    {loadingBalance ? '...' : `₹${Number(previousBalance).toLocaleString('en-IN')}`}
                  </span>
                </div>
              </div>
            )}

            {/* Calculations Breakdown Grid */}
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-2xl p-4 space-y-4">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">
                Financial Calculation Breakdown
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                    Plan Amount (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={planAmount}
                    onChange={(e) => setPlanAmount(Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-red-400 mb-1">
                    Discount (-) (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-red-300 focus:border-red-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-amber-400 mb-1">
                    Previous Balance (+) (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={previousBalance}
                    onChange={(e) => setPreviousBalance(Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-amber-300 focus:border-red-500 outline-none"
                  />
                </div>
              </div>

              {/* Total Due Highlight */}
              <div className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider block">
                    Total Amount Due
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    (Plan ₹{planAmount} - Disc ₹{discount} + Prev Balance ₹{previousBalance})
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-white font-display">
                  ₹{totalDue.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Payment Mode & Amount Paid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-emerald-400 mb-1.5 flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5" /> Amount Received *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-emerald-800/80 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-2xl px-4 py-2.5 text-base font-bold text-emerald-300 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Payment Method *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Cash')}
                    className={`py-2.5 rounded-2xl text-xs font-bold transition-all ${
                      paymentMethod === 'Cash'
                        ? 'bg-neutral-800 text-white border-2 border-red-500'
                        : 'bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    💵 Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('UPI')}
                    className={`py-2.5 rounded-2xl text-xs font-bold transition-all ${
                      paymentMethod === 'UPI'
                        ? 'bg-neutral-800 text-white border-2 border-red-500'
                        : 'bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    📱 UPI
                  </button>
                </div>
              </div>
            </div>

            {/* Remaining balance preview */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 text-xs">
              <span className="font-semibold text-neutral-300">
                Remaining Balance (Auto-carried to next bill):
              </span>
              <span className={`font-bold font-display text-lg ${remainingBalance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                ₹{remainingBalance.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Date & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-red-500" /> Payment Date
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-white focus:border-red-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Renew Membership (Months)
                </label>
                <input
                  type="number"
                  min={0}
                  value={renewMonths}
                  onChange={(e) => setRenewMonths(Number(e.target.value))}
                  placeholder="e.g. 1, 6, 12 (0 to keep current)"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-white focus:border-red-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Receipt Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Partial advance fee payment, discount approved by owner"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-red-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedMemberId}
              className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-bold text-sm tracking-wide transition-all shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Receipt className="w-4 h-4" />
                  <span>Submit Payment & Generate Receipt</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Live Receipt Summary / Success State (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {successPayment ? (
            <div className="bg-neutral-900 border-2 border-emerald-500/60 rounded-3xl p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Payment Recorded Successfully!</h3>
                  <p className="text-xs text-neutral-400">Receipt generated and stored in Supabase</p>
                </div>
              </div>

              <div className="bg-neutral-950 rounded-2xl p-4 border border-neutral-800 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Receipt No:</span>
                  <span className="font-mono font-bold text-red-400">{successPayment.receipt_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Payment ID:</span>
                  <span className="font-mono text-white">{successPayment.payment_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Amount Paid:</span>
                  <span className="font-bold text-emerald-400 text-sm">₹{Number(successPayment.amount).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Remaining Balance:</span>
                  <span className="font-bold text-amber-400">₹{Number(successPayment.remaining_balance).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Method:</span>
                  <span className="font-bold text-white">{successPayment.payment_method}</span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleSendReceiptEmail(successPayment)}
                  disabled={sendingPaymentId === successPayment.id}
                  className="w-full py-3 rounded-2xl bg-red-950/60 border border-red-800/60 hover:bg-red-900/70 text-red-200 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-950/30"
                >
                  {sendingPaymentId === successPayment.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      <span>Sending Receipt...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 text-red-400" />
                      <span>Send Receipt Email</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadSuccessPdf}
                  className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20"
                >
                  <Download className="w-4 h-4" /> Download Official PDF Receipt
                </button>
                <button
                  onClick={() => onViewReceipt(successPayment)}
                  className="w-full py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Eye className="w-4 h-4" /> View & Print Receipt
                </button>
                <button
                  onClick={resetFormAfterSuccess}
                  className="w-full py-2.5 text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  Record Another Payment
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 space-y-5">
              <div className="flex items-center gap-2 text-xs font-bold text-red-500 uppercase tracking-wider">
                <Receipt className="w-4 h-4" /> Receipt Calculation Preview
              </div>

              <div className="bg-neutral-950 rounded-2xl p-5 border border-neutral-800 text-xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                  <span className="font-bold text-white uppercase text-[11px] font-display">MS FITNESS RECEIPT</span>
                  <span className="font-mono text-neutral-500 text-[10px]">PREVIEW</span>
                </div>

                <div className="space-y-1.5 text-neutral-300">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Membership Fee:</span>
                    <span className="font-semibold text-white">₹{planAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-red-400">
                    <span>Discount:</span>
                    <span>- ₹{discount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <span>Previous Dues:</span>
                    <span>+ ₹{previousBalance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white pt-2 border-t border-neutral-800 text-sm">
                    <span>Total Amount Due:</span>
                    <span>₹{totalDue.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-800 grid grid-cols-2 gap-2 text-center">
                  <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/40">
                    <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Will Pay</span>
                    <span className="text-base font-bold text-emerald-300 font-display">₹{amountPaid.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800">
                    <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Carry Over</span>
                    <span className="text-base font-bold text-red-400 font-display">₹{remainingBalance.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-neutral-400 leading-relaxed">
                💡 <strong>Automatic Ledger Logic:</strong> When a payment is recorded, any remaining balance is automatically tracked in the database and loaded as previous balance on the member's next payment cycle.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Complete Payment History Section */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-white font-display">
              COMPLETE PAYMENT & RECEIPT ARCHIVE
            </h3>
            <p className="text-xs text-neutral-400">
              Every fee receipt ever recorded. Download PDF or view details anytime.
            </p>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search receipts..."
              className="w-full bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none"
            />
          </div>
        </div>

        {/* Email feedback alert */}
        {emailAlert && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
              emailAlert.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/70 border-rose-800/80 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {emailAlert.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="font-medium">{emailAlert.message}</span>
            </div>
            <button
              onClick={() => setEmailAlert(null)}
              className="text-[10px] uppercase font-bold tracking-wider opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          {filteredPayments.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-xs">
              No payment transactions found.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/80 border-b border-neutral-800 text-neutral-400 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Receipt / Payment ID</th>
                  <th className="py-3.5 px-4">Member</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Total Due</th>
                  <th className="py-3.5 px-4">Amount Paid</th>
                  <th className="py-3.5 px-4">Remaining Due</th>
                  <th className="py-3.5 px-4">Method</th>
                  <th className="py-3.5 px-4 text-right">Actions & Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-neutral-200">
                {filteredPayments.map((p) => {
                  const member = members.find((m) => m.id === p.member_id || m.member_id === p.member_id || m.member_id === p.member_code) || {
                    id: p.member_id,
                    member_id: p.member_code || 'N/A',
                    name: p.member_name || 'Member',
                    mobile: p.member_mobile || 'N/A',
                    email: (p as any).member_email || '',
                    gender: 'other' as const,
                    join_date: (p as any).join_date || p.payment_date,
                    plan_amount: Number(p.total_due || p.amount),
                    discount: Number(p.discount || 0),
                    membership_start: (p as any).membership_start || p.payment_date,
                    membership_expiry: (p as any).membership_expiry || '',
                    status: 'active' as const,
                  };
                  const isSendingThis = sendingPaymentId === p.id;

                  return (
                    <tr key={p.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-red-400">{p.receipt_number || p.payment_id}</div>
                        <div className="font-mono text-[10px] text-neutral-400">{p.payment_id}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{p.member_name || member?.name || 'Member'}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{p.member_code || member?.member_id}</div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-300">
                        {new Date(p.payment_date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-300">
                        ₹{Number(p.total_due).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        ₹{Number(p.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-red-400">
                        ₹{Number(p.remaining_balance).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-[10px] font-bold uppercase">
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={() => onViewReceipt(p)}
                            title="View & Print Official Receipt"
                            className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-medium flex items-center gap-1.5 transition-colors text-[11px]"
                          >
                            <Eye className="w-3.5 h-3.5 text-neutral-300" />
                            <span>View Receipt</span>
                          </button>
                          <button
                            onClick={() => generateReceiptPdf(p, member, settings, adminEmail)}
                            title="Download PDF Receipt"
                            className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleSendReceiptEmail(p)}
                            disabled={isSendingThis || !!sendingPaymentId}
                            title={
                              isSendingThis
                                ? 'Sending Receipt...'
                                : `Send PDF Receipt Email to ${member?.email || 'customer'}`
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-red-950/50 border border-red-800/50 hover:bg-red-900/60 text-red-300 hover:text-white font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isSendingThis ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                                <span className="text-[11px]">Sending...</span>
                              </>
                            ) : (
                              <>
                                <Mail className="w-3.5 h-3.5 text-red-400" />
                                <span className="text-[11px] hidden lg:inline">Send Email</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
