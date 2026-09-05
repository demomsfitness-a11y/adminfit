import React from 'react';
import { Payment, Member, GymSettings } from '../types';
import { generateReceiptPdf } from '../lib/pdfReceipt';
import { Download, Printer, X, Dumbbell, CheckCircle2, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment | null;
  member: Member | undefined;
  settings: GymSettings;
  adminEmail: string;
}

export const ReceiptModal: React.FC<Props> = ({
  isOpen,
  onClose,
  payment,
  member,
  settings,
  adminEmail,
}) => {
  if (!isOpen || !payment) return null;

  const handleDownloadPdf = () => {
    generateReceiptPdf(payment, member, settings, adminEmail);
  };

  const handlePrint = () => {
    window.print();
  };

  const planAmountCalculated = Number(payment.total_due - (payment.previous_balance || 0) + (payment.discount || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Action Header bar (no-print) */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950 no-print">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Payment Successful & Recorded
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={handleDownloadPdf}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper */}
        <div className="p-6 md:p-8 bg-neutral-950 text-neutral-100 receipt-printable space-y-6">
          {/* Gym Header */}
          <div className="flex items-start justify-between border-b border-neutral-800 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-600/30">
                <Dumbbell className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-wider text-white leading-none font-display">
                  {settings.gym_name || 'MS FITNESS'}
                </h1>
                <p className="text-xs text-red-500 font-semibold tracking-widest uppercase mt-0.5">
                  {settings.tagline || 'Stronger Body, Stronger You'}
                </p>
                <p className="text-[11px] text-neutral-400 mt-1 max-w-xs leading-relaxed">
                  {settings.address}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-md bg-red-600/10 border border-red-500/20 text-red-400 text-[10px] font-bold tracking-widest uppercase">
                Official Receipt
              </span>
              <p className="text-xs font-mono text-neutral-300 font-bold mt-2">
                {payment.receipt_number}
              </p>
              <p className="text-[11px] text-neutral-400 font-mono">
                {payment.payment_id}
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">
                {new Date(payment.payment_date).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Member Details Box */}
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider block font-semibold mb-1">
                Billed To
              </span>
              <p className="text-sm font-bold text-white">{member?.name || payment.member_name}</p>
              <p className="text-neutral-300 font-mono mt-0.5 font-semibold text-red-400">
                ID: {member?.member_id || payment.member_code}
              </p>
              <p className="text-neutral-400 mt-0.5">Mobile: {member?.mobile || payment.member_mobile}</p>
            </div>
            <div className="border-l border-neutral-800 pl-4">
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider block font-semibold mb-1">
                Plan Information
              </span>
              <p className="text-sm font-semibold text-white">{payment.plan_name || 'Gym Membership'}</p>
              <p className="text-neutral-400 mt-0.5">
                Expiry: <span className="text-white font-medium">{member?.membership_expiry ? new Date(member.membership_expiry).toLocaleDateString('en-IN') : 'Active'}</span>
              </p>
              <p className="text-neutral-400 mt-0.5">
                Mode: <span className="text-emerald-400 font-bold uppercase">{payment.payment_method}</span>
              </p>
            </div>
          </div>

          {/* Fee Calculation Breakdown */}
          <div className="space-y-2 text-xs">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1">
              Payment Breakdown
            </div>
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl divide-y divide-neutral-800/80 overflow-hidden">
              <div className="flex justify-between p-3">
                <span className="text-neutral-300">Membership Plan Amount</span>
                <span className="font-semibold text-white">₹{planAmountCalculated.toLocaleString('en-IN')}</span>
              </div>
              {Number(payment.discount) > 0 && (
                <div className="flex justify-between p-3 text-red-400">
                  <span>Discount Applied (-)</span>
                  <span className="font-semibold">- ₹{Number(payment.discount).toLocaleString('en-IN')}</span>
                </div>
              )}
              {Number(payment.previous_balance) > 0 && (
                <div className="flex justify-between p-3 text-amber-300">
                  <span>Previous Balance (+)</span>
                  <span className="font-semibold">+ ₹{Number(payment.previous_balance).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between p-3 bg-neutral-800/40 font-bold text-neutral-100">
                <span>Total Amount Due</span>
                <span>₹{Number(payment.total_due).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Highlights: Amount Paid & Remaining Balance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-3.5">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                Amount Paid
              </span>
              <p className="text-2xl font-bold text-emerald-300 mt-1 font-display">
                ₹{Number(payment.amount).toLocaleString('en-IN')}
              </p>
              <span className="text-[10px] text-emerald-400/80 flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3" /> Confirmed via {payment.payment_method}
              </span>
            </div>

            <div className={`rounded-2xl p-3.5 border ${
              Number(payment.remaining_balance) > 0
                ? 'bg-red-950/40 border-red-800/60'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}>
              <span className={`text-[10px] uppercase font-bold tracking-wider block ${
                Number(payment.remaining_balance) > 0 ? 'text-red-400' : 'text-neutral-400'
              }`}>
                Remaining Balance
              </span>
              <p className={`text-2xl font-bold mt-1 font-display ${
                Number(payment.remaining_balance) > 0 ? 'text-red-300' : 'text-neutral-300'
              }`}>
                ₹{Number(payment.remaining_balance).toLocaleString('en-IN')}
              </p>
              <span className="text-[10px] text-neutral-400 block mt-0.5">
                {Number(payment.remaining_balance) > 0 ? 'Carried to next payment' : 'No dues pending'}
              </span>
            </div>
          </div>

          {payment.notes && (
            <div className="text-xs text-neutral-400 bg-neutral-900/40 p-3 rounded-xl border border-neutral-800/60">
              <strong className="text-neutral-300">Notes:</strong> {payment.notes}
            </div>
          )}

          {/* Footer signature line */}
          <div className="pt-4 border-t border-neutral-800 flex items-end justify-between text-[11px] text-neutral-400">
            <div>
              <p>Admin: {adminEmail || 'admin@msfitness.com'}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">MS Fitness Management Software</p>
            </div>
            <div className="text-right">
              <div className="w-36 border-b border-neutral-700 pb-1 text-center font-serif italic text-neutral-300 text-xs">
                Authorized Signatory
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">MS Fitness Official Stamp</p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between no-print">
          <p className="text-xs text-neutral-400">
            Official PDF copy is ready for downloading or printing.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-white transition-colors"
            >
              Done
            </button>
            <button
              onClick={handleDownloadPdf}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-lg shadow-red-600/20"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
