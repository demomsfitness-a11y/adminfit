import React, { useState } from 'react';
import { Member, MembershipPlan } from '../types';
import { ClockAlert, Calendar, CreditCard, Search, CheckCircle2, AlertTriangle, AlertCircle, Sparkles } from 'lucide-react';

interface Props {
  members: Member[];
  plans: MembershipPlan[];
  onRenewMember: (member: Member) => void;
}

type ExpiryCategory = 'all' | 'expired' | '7days' | '30days' | 'active';

export const ExpiryView: React.FC<Props> = ({ members, plans, onRenewMember }) => {
  const [selectedCategory, setSelectedCategory] = useState<ExpiryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Compute days remaining and categorization for each member
  const membersWithExpiry = members.map((m) => {
    const expDate = new Date(m.membership_expiry);
    expDate.setHours(0, 0, 0, 0);

    const diffMs = expDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let category: 'expired' | '7days' | '30days' | 'active';
    let statusLabel = 'Active';
    let badgeColor = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40';

    if (diffDays < 0) {
      category = 'expired';
      statusLabel = `Expired (${Math.abs(diffDays)}d ago)`;
      badgeColor = 'bg-red-950/60 text-red-400 border-red-800/40';
    } else if (diffDays <= 7) {
      category = '7days';
      statusLabel = `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
      badgeColor = 'bg-rose-950/60 text-rose-400 border-rose-800/40';
    } else if (diffDays <= 30) {
      category = '30days';
      statusLabel = `Expires in ${diffDays} days`;
      badgeColor = 'bg-amber-950/60 text-amber-400 border-amber-800/40';
    } else {
      category = 'active';
      statusLabel = `${diffDays} days left`;
      badgeColor = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40';
    }

    const plan = plans.find((p) => p.id === m.plan_id);

    return {
      ...m,
      diffDays,
      category,
      statusLabel,
      badgeColor,
      planName: plan?.name || 'Standard Plan',
    };
  });

  // Counts for pills
  const counts = {
    expired: membersWithExpiry.filter((m) => m.category === 'expired').length,
    sevenDays: membersWithExpiry.filter((m) => m.category === '7days').length,
    thirtyDays: membersWithExpiry.filter((m) => m.category === '30days').length,
    active: membersWithExpiry.filter((m) => m.category === 'active').length,
    total: membersWithExpiry.length,
  };

  // Filtered members
  const filtered = membersWithExpiry.filter((m) => {
    if (selectedCategory === 'expired' && m.category !== 'expired') return false;
    if (selectedCategory === '7days' && m.category !== '7days') return false;
    if (selectedCategory === '30days' && m.category !== '30days' && m.category !== '7days') return false;
    if (selectedCategory === 'active' && m.category !== 'active') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.member_id.toLowerCase().includes(q) ||
        m.mobile.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white font-display">
            MEMBERSHIP EXPIRY & RENEWALS
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Track impending plan expirations, lapsed gym memberships, and send instant renewal invoices.
          </p>
        </div>
      </div>

      {/* Category Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setSelectedCategory('expired')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedCategory === 'expired'
              ? 'bg-red-950/60 border-red-500 text-white shadow-lg shadow-red-950/40'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Expired
            </span>
          </div>
          <div className="text-3xl font-bold font-display text-red-400 mt-2">{counts.expired}</div>
          <span className="text-[10px] text-neutral-400 block mt-0.5">Need immediate renewal</span>
        </button>

        <button
          onClick={() => setSelectedCategory('7days')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedCategory === '7days'
              ? 'bg-rose-950/60 border-rose-500 text-white shadow-lg shadow-rose-950/40'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-rose-400 flex items-center gap-1.5">
              <ClockAlert className="w-3.5 h-3.5" /> Within 7 Days
            </span>
          </div>
          <div className="text-3xl font-bold font-display text-rose-400 mt-2">{counts.sevenDays}</div>
          <span className="text-[10px] text-neutral-400 block mt-0.5">Urgent upcoming renewals</span>
        </button>

        <button
          onClick={() => setSelectedCategory('30days')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedCategory === '30days'
              ? 'bg-amber-950/60 border-amber-500 text-white shadow-lg shadow-amber-950/40'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-amber-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Within 30 Days
            </span>
          </div>
          <div className="text-3xl font-bold font-display text-amber-400 mt-2">{counts.thirtyDays}</div>
          <span className="text-[10px] text-neutral-400 block mt-0.5">Expiring this month</span>
        </button>

        <button
          onClick={() => setSelectedCategory('active')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            selectedCategory === 'active'
              ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-lg shadow-emerald-950/40'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active (&gt;30d)
            </span>
          </div>
          <div className="text-3xl font-bold font-display text-emerald-400 mt-2">{counts.active}</div>
          <span className="text-[10px] text-neutral-400 block mt-0.5">Healthy memberships</span>
        </button>
      </div>

      {/* Table search & filter controls */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-red-600 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              Show All ({counts.total})
            </button>
            <span className="text-xs text-neutral-500">
              Showing: <strong className="text-neutral-200 capitalize">{selectedCategory}</strong>
            </span>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search member name or ID..."
              className="w-full bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-xs">
              No members found in this category.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/80 border-b border-neutral-800 text-neutral-400 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Member ID</th>
                  <th className="py-3.5 px-4">Name</th>
                  <th className="py-3.5 px-4">Mobile</th>
                  <th className="py-3.5 px-4">Enrolled Plan</th>
                  <th className="py-3.5 px-4">Expiry Date</th>
                  <th className="py-3.5 px-4">Status / Days Left</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-neutral-200">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-red-400 bg-red-950/50 border border-red-800/40 px-2 py-0.5 rounded">
                        {m.member_id}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">{m.name}</td>
                    <td className="py-3.5 px-4 text-neutral-300">{m.mobile}</td>
                    <td className="py-3.5 px-4 font-medium">{m.planName}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono">
                        {new Date(m.membership_expiry).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${m.badgeColor}`}>
                        {m.statusLabel}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onRenewMember(m)}
                        className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 ml-auto shadow-md shadow-red-600/20"
                      >
                        <CreditCard className="w-3 h-3" />
                        <span>Renew Fee</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
