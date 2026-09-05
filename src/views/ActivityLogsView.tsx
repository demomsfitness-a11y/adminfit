import React, { useState } from 'react';
import { ActivityLog } from '../types';
import { History, Search, User, Clock, ShieldCheck, Tag } from 'lucide-react';

interface Props {
  logs: ActivityLog[];
}

export const ActivityLogsView: React.FC<Props> = ({ logs }) => {
  const [search, setSearch] = useState('');

  const filteredLogs = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.admin_email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white font-display">
            ADMIN AUDIT TRAIL & ACTIVITY LOGS
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Immutable log tracking member registrations, fee payments, plan edits, and security changes.
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, member, or admin..."
            className="w-full bg-neutral-950 border border-neutral-800 focus:border-red-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 outline-none"
          />
        </div>
      </div>

      {/* Logs List */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-16 text-neutral-500 text-xs">
            No logged administrative activity recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => {
              const isPayment = log.action.toLowerCase().includes('payment');
              const isMember = log.action.toLowerCase().includes('member');
              const isPlan = log.action.toLowerCase().includes('plan');

              return (
                <div
                  key={log.id}
                  className="bg-neutral-950/70 border border-neutral-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                      isPayment
                        ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-400'
                        : isMember
                        ? 'bg-red-950/60 border border-red-800/40 text-red-400'
                        : isPlan
                        ? 'bg-blue-950/60 border border-blue-800/40 text-blue-400'
                        : 'bg-neutral-800 text-neutral-300'
                    }`}>
                      <Tag className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{log.action}</span>
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1 font-mono">
                          <User className="w-3 h-3 text-red-500" /> {log.admin_email}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                        {log.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1 sm:justify-end">
                      <Clock className="w-3 h-3" />
                      {new Date(log.timestamp).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
