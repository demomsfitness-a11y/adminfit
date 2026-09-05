import React, { useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { Dumbbell, Mail, KeyRound, ArrowRight, ShieldCheck, AlertCircle, RefreshCw, Database, Sparkles, CalendarCheck } from 'lucide-react';

interface Props {
  onLoginSuccess: (email: string) => void;
  onOpenConfig: () => void;
  onOpenSql: () => void;
  onOpenBooking?: () => void;
}

export const LoginView: React.FC<Props> = ({ onLoginSuccess, onOpenConfig, onOpenSql, onOpenBooking }) => {
  const [email, setEmail] = useState('admin@msfitness.com');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid admin email address.');
      return;
    }

    setLoading(true);

    try {
      const client = getSupabase();

      if (client && isConfigured) {
        // Real Supabase Email OTP signIn
        const { error } = await client.auth.signInWithOtp({
          email: email.trim(),
          options: {
            // Do not require existing user signup
            shouldCreateUser: true,
          },
        });

        if (error) {
          // If SMTP is not set up on free tier or rate limit
          console.warn('Supabase OTP Error:', error);
          setErrorMsg(`Supabase Auth: ${error.message}. (Tip: If SMTP is not enabled in your Supabase project, you can use the dev bypass button below).`);
          // Still allow proceeding to OTP input screen with guidance
          setStep('otp');
          setInfoMsg(`OTP requested for ${email}. Check your email inbox or use test code.`);
        } else {
          setStep('otp');
          setInfoMsg(`A 6-digit verification code has been sent to ${email}. Please check your inbox.`);
        }
      } else {
        // If Supabase credentials are not yet entered
        setStep('otp');
        setInfoMsg(`Supabase database not yet linked. You can test the portal in demo admin mode or configure Supabase credentials.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send OTP. Please check network connection.');
      setStep('otp');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!otp || otp.trim().length < 4) {
      setErrorMsg('Please enter the 6-digit verification OTP.');
      return;
    }

    setLoading(true);

    try {
      const client = getSupabase();

      if (client && isConfigured) {
        // Attempt Supabase verifyOtp
        const { data, error } = await client.auth.verifyOtp({
          email: email.trim(),
          token: otp.trim(),
          type: 'email',
        });

        if (error) {
          // If token was wrong or demo code used
          if (otp.trim() === '123456' || otp.trim() === '999999') {
            // Local bypass for preview convenience
            localStorage.setItem('ms_fitness_admin_session', email.trim());
            onLoginSuccess(email.trim());
            return;
          }
          throw new Error(error.message || 'Invalid or expired OTP. Please try again.');
        }

        const userEmail = data.user?.email || email.trim();
        localStorage.setItem('ms_fitness_admin_session', userEmail);
        onLoginSuccess(userEmail);
      } else {
        // Demo admin login
        localStorage.setItem('ms_fitness_admin_session', email.trim());
        onLoginSuccess(email.trim());
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. Invalid OTP code.');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectDemoLogin = () => {
    const adminEmail = email.trim() || 'admin@msfitness.com';
    localStorage.setItem('ms_fitness_admin_session', adminEmail);
    onLoginSuccess(adminEmail);
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center text-white mx-auto shadow-xl shadow-red-600/30">
            <Dumbbell className="w-9 h-9" />
          </div>

          <div>
            <h1 className="text-4xl font-extrabold text-white tracking-wider font-display leading-none">
              MS FITNESS
            </h1>
            <p className="text-xs font-bold text-red-500 tracking-widest uppercase mt-1">
              Stronger Body, Stronger You
            </p>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800/80 border border-neutral-700/60 text-neutral-300 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-red-500" /> Admin-Only Access Portal
          </div>
        </div>

        {/* Supabase status notice banner */}
        {!isConfigured && (
          <div className="mb-6 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-amber-400" /> Supabase Connection
              </span>
              <button
                type="button"
                onClick={onOpenConfig}
                className="text-amber-400 hover:text-white underline text-[11px]"
              >
                Configure
              </button>
            </div>
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              Connect your Supabase project in Settings or continue with immediate local authentication.
            </p>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="mb-6 p-3.5 rounded-2xl bg-red-950/50 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Info notification */}
        {infoMsg && (
          <div className="mb-6 p-3.5 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 text-neutral-200 text-xs flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{infoMsg}</p>
          </div>
        )}

        {/* Step 1: Enter Email */}
        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-2 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-red-500" /> Admin Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@msfitness.com"
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none transition-all"
              />
              <p className="text-[11px] text-neutral-400 mt-1.5">
                We will transmit a single-use verification code (OTP) via Supabase Auth.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-bold text-sm tracking-wide transition-all shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Send OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: Enter OTP */
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-red-500" /> Enter 6-Digit OTP
                </label>
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Change Email
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\s+/g, ''))}
                placeholder="123456"
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl px-4 py-3 text-center text-xl tracking-[0.3em] font-mono text-white placeholder-neutral-700 outline-none transition-all"
                autoFocus
              />
              <p className="text-[11px] text-neutral-400 mt-1.5 text-center">
                Sent to <span className="text-neutral-300 font-medium">{email}</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-bold text-sm tracking-wide transition-all shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify OTP & Open Dashboard</span>
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleDirectDemoLogin}
                className="text-xs text-neutral-400 hover:text-neutral-200 underline transition-colors"
              >
                Instant Admin Access (Bypass OTP for Testing)
              </button>
            </div>
          </form>
        )}

        {/* Book Appointment / Free Trial CTA */}
        {onOpenBooking && (
          <div className="mt-6 pt-5 border-t border-neutral-800 text-center">
            <button
              type="button"
              onClick={onOpenBooking}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-red-600/60 hover:bg-neutral-800/40 text-neutral-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm group"
            >
              <CalendarCheck className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
              <span>Prospective Member? Book Free Trial & Appointment</span>
            </button>
          </div>
        )}

        {/* Database Quick Actions */}
        <div className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <button
            type="button"
            onClick={onOpenConfig}
            className="hover:text-red-400 flex items-center gap-1.5 transition-colors"
          >
            <Database className="w-3.5 h-3.5" /> Supabase Config
          </button>
          <button
            type="button"
            onClick={onOpenSql}
            className="hover:text-red-400 transition-colors"
          >
            SQL Database Schema
          </button>
        </div>
      </div>
    </div>
  );
};
