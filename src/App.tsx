import React, { useState, useEffect, useCallback } from 'react';
import {
  Member,
  MembershipPlan,
  Payment,
  GymSettings,
  ActivityLog,
  Appointment,
} from './types';
import {
  getMembers,
  createMember,
  updateMember,
  deleteMember,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getPayments,
  createPayment,
  getSettings,
  updateSettings,
  getActivityLogs,
  getAppointments,
  generateNextMemberId,
  generateNextPaymentId,
  generateNextReceiptNumber,
  subscribeToSchemaPending,
} from './lib/db';
import { supabase, isSupabaseConfigured, DEFAULT_SUPABASE_PROJECT_ID } from './lib/supabase';
import { Sidebar, TabType } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { MembersView } from './views/MembersView';
import { PlansView } from './views/PlansView';
import { PaymentsView } from './views/PaymentsView';
import { ExpiryView } from './views/ExpiryView';
import { ReportsView } from './views/ReportsView';
import { ActivityLogsView } from './views/ActivityLogsView';
import { SettingsView } from './views/SettingsView';
import { AppointmentsView } from './views/AppointmentsView';
import { AppointmentBookingModal } from './components/AppointmentBookingModal';
import { ReceiptModal } from './components/ReceiptModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { SqlSetupModal } from './components/SqlSetupModal';
import { RefreshCw, AlertTriangle, Database } from 'lucide-react';

export default function App() {
  // Session & Auth state
  const [adminEmail, setAdminEmail] = useState<string | null>(() => {
    return localStorage.getItem('msf_admin_email') || null;
  });
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [isSchemaPending, setIsSchemaPending] = useState<boolean>(false);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Subscribe to missing tables detection
  useEffect(() => {
    const unsubscribe = subscribeToSchemaPending((pending) => {
      setIsSchemaPending(pending);
    });
    return unsubscribe;
  }, []);

  // Core Data States
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<GymSettings>({
    gym_name: 'MS Fitness',
    tagline: 'Stronger Body, Stronger You',
    phone: '+91 98765 43210',
    email: 'contact@msfitness.com',
    address: '123 Powerhouse Street, Fitness District, New Delhi, India',
    upi_id: 'msfitness@upi',
    currency: 'INR',
  });
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Modals
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);

  // Quick action cross-view triggers
  const [preselectedPaymentMember, setPreselectedPaymentMember] = useState<Member | null>(null);
  const [openAddMemberDirectly, setOpenAddMemberDirectly] = useState(false);
  const [leadDataForMember, setLeadDataForMember] = useState<Partial<Member> | null>(null);

  // Check Supabase Auth session on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user?.email) {
            setAdminEmail(data.session.user.email);
            localStorage.setItem('msf_admin_email', data.session.user.email);
          }
        }
      } catch (err) {
        console.warn('Auth check fallback:', err);
      } finally {
        setAuthChecking(false);
      }
    }

    checkAuth();

    if (supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (session?.user?.email) {
            setAdminEmail(session.user.email);
            localStorage.setItem('msf_admin_email', session.user.email);
          } else if (event === 'SIGNED_OUT') {
            setAdminEmail(null);
            localStorage.removeItem('msf_admin_email');
          }
        }
      );

      return () => {
        authListener.subscription.unsubscribe();
      };
    }
  }, []);

  // Fetch all gym data
  const loadGymData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [
        membersRes,
        plansRes,
        paymentsRes,
        settingsRes,
        logsRes,
        appointmentsRes,
      ] = await Promise.allSettled([
        getMembers(),
        getPlans(),
        getPayments(),
        getSettings(),
        getActivityLogs(),
        getAppointments(),
      ]);

      if (membersRes.status === 'fulfilled') setMembers(membersRes.value);
      else console.error('Error fetching members from Supabase:', membersRes.reason);

      if (plansRes.status === 'fulfilled') setPlans(plansRes.value);
      else console.error('Error fetching plans from Supabase:', plansRes.reason);

      if (paymentsRes.status === 'fulfilled') setPayments(paymentsRes.value);
      else console.error('Error fetching payments from Supabase:', paymentsRes.reason);

      if (settingsRes.status === 'fulfilled' && settingsRes.value) setSettings(settingsRes.value);
      else if (settingsRes.status === 'rejected') console.error('Error fetching settings from Supabase:', settingsRes.reason);

      if (logsRes.status === 'fulfilled') setActivityLogs(logsRes.value);
      if (appointmentsRes.status === 'fulfilled') setAppointments(appointmentsRes.value);
    } catch (err) {
      console.error('Error fetching gym data:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Load data when admin is authenticated
  useEffect(() => {
    if (adminEmail) {
      loadGymData();
    }
  }, [adminEmail, loadGymData]);

  // Handle Login
  const handleLoginSuccess = (email: string) => {
    setAdminEmail(email);
    localStorage.setItem('msf_admin_email', email);
    loadGymData();
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Sign out warning:', err);
    } finally {
      setAdminEmail(null);
      localStorage.removeItem('msf_admin_email');
    }
  };

  // ----------------------------------------------------
  // Member Operations
  // ----------------------------------------------------
  const handleAddMember = async (memberData: Omit<Member, 'id'>) => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    const nextCode = await generateNextMemberId();
    await createMember({ ...memberData, member_id: nextCode }, userEmail);
    await loadGymData();
  };

  const handleUpdateMember = async (id: string, updates: Partial<Member>) => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    await updateMember(id, updates, userEmail);
    await loadGymData();
  };

  const handleDeleteMember = async (id: string, name: string, code: string) => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    await deleteMember(id, name, code, userEmail);
    await loadGymData();
  };

  // ----------------------------------------------------
  // Plan Operations
  // ----------------------------------------------------
  const handleAddPlan = async (planData: Omit<MembershipPlan, 'id'>) => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    await createPlan(planData, userEmail);
    await loadGymData();
  };

  const handleUpdatePlan = async (id: string, updates: Partial<MembershipPlan>) => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    await updatePlan(id, updates, userEmail);
    await loadGymData();
  };

  const handleDeletePlan = async (id: string, planName: string) => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    await deletePlan(id, planName, userEmail);
    await loadGymData();
  };

  // ----------------------------------------------------
  // Payment Operations
  // ----------------------------------------------------
  const handleRecordPayment = async (payload: {
    member_id: string;
    amount: number;
    discount: number;
    previous_balance: number;
    total_due: number;
    remaining_balance: number;
    payment_method: 'Cash' | 'UPI';
    payment_date: string;
    notes?: string;
    plan_name?: string;
    renew_months?: number;
  }): Promise<Payment> => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    const member = members.find((m) => m.id === payload.member_id);

    const nextPaymentId = await generateNextPaymentId();
    const nextReceiptNo = await generateNextReceiptNumber();

    const paymentData: Omit<Payment, 'id'> = {
      payment_id: nextPaymentId,
      receipt_number: nextReceiptNo,
      member_id: payload.member_id,
      member_name: member?.name || 'Member',
      member_code: member?.member_id || '',
      amount: payload.amount,
      discount: payload.discount,
      previous_balance: payload.previous_balance,
      total_due: payload.total_due,
      remaining_balance: payload.remaining_balance,
      payment_method: payload.payment_method,
      payment_date: payload.payment_date,
      notes: payload.notes || '',
      plan_name: payload.plan_name || 'Membership Fee',
    };

    const createdPayment = await createPayment(paymentData, userEmail);

    // If membership renewal is included
    if (payload.renew_months && payload.renew_months > 0 && member) {
      const currentExpiry = new Date(member.membership_expiry);
      const baseDate = currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
      baseDate.setMonth(baseDate.getMonth() + payload.renew_months);
      const newExpiry = baseDate.toISOString().slice(0, 10);

      await updateMember(
        member.id,
        {
          membership_expiry: newExpiry,
          status: 'active',
        },
        userEmail
      );
    }

    await loadGymData();
    return createdPayment;
  };

  // ----------------------------------------------------
  // Settings Operations
  // ----------------------------------------------------
  const handleUpdateSettings = async (updates: Partial<GymSettings>) => {
    const userEmail = adminEmail || 'admin@msfitness.com';
    await updateSettings(updates, userEmail);
    await loadGymData();
  };

  // ----------------------------------------------------
  // View navigation helpers
  // ----------------------------------------------------
  const handleQuickPaymentForMember = (member: Member) => {
    setPreselectedPaymentMember(member);
    setActiveTab('payments');
  };

  const handleQuickRenewMember = (member: Member) => {
    setPreselectedPaymentMember(member);
    setActiveTab('payments');
  };

  const handleQuickAddMember = () => {
    setOpenAddMemberDirectly(true);
    setActiveTab('members');
  };

  // Page titles mapping
  const titles: Record<TabType, string> = {
    dashboard: 'ADMIN DASHBOARD',
    appointments: 'APPOINTMENTS & VISITS',
    members: 'MEMBERS DIRECTORY',
    plans: 'MEMBERSHIP TIERS',
    payments: 'FEE & RECEIPT ENGINE',
    expiry: 'EXPIRY MANAGEMENT',
    reports: 'ANALYTICS & REPORTS',
    activity: 'AUDIT ACTIVITY LOGS',
    settings: 'GYM BRANDING & SETUP',
  };

  // Show loading spinner while checking auth
  if (authChecking) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white">
        <RefreshCw className="w-8 h-8 text-red-500 animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wider uppercase font-display text-neutral-400">
          Loading MS Fitness Portal...
        </p>
      </div>
    );
  }

  // Not logged in -> Show Login View
  if (!adminEmail) {
    return (
      <>
        <LoginView
          onLoginSuccess={handleLoginSuccess}
          onOpenConfig={() => setIsConfigModalOpen(true)}
          onOpenSql={() => setIsSqlModalOpen(true)}
          onOpenBooking={() => setIsBookingModalOpen(true)}
        />
        <AppointmentBookingModal
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          onAppointmentCreated={(newApt) => {
            setAppointments((prev) => [newApt, ...prev.filter((a) => a.id !== newApt.id)]);
          }}
          onOpenSqlSetup={() => {
            setIsBookingModalOpen(false);
            setIsSqlModalOpen(true);
          }}
        />
        <SupabaseConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          onSaved={() => {
            setIsConfigModalOpen(false);
            window.location.reload();
          }}
        />
        <SqlSetupModal
          isOpen={isSqlModalOpen}
          onClose={() => setIsSqlModalOpen(false)}
        />
      </>
    );
  }

  // Find member for viewing receipt modal
  const viewingReceiptMember = viewingReceipt
    ? members.find((m) => m.id === viewingReceipt.member_id || m.member_id === viewingReceipt.member_id || m.member_id === viewingReceipt.member_code)
    : undefined;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex font-sans antialiased selection:bg-red-600 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        adminEmail={adminEmail}
        onLogout={handleLogout}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
        onOpenSql={() => setIsSqlModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:pl-72 flex flex-col min-w-0">
        {/* Admin Header */}
        <Header
          title={titles[activeTab]}
          adminEmail={adminEmail}
          onLogout={handleLogout}
          onOpenConfig={() => setIsConfigModalOpen(true)}
          onOpenSql={() => setIsSqlModalOpen(true)}
          isSchemaPending={isSchemaPending}
          onOpenAddMember={handleQuickAddMember}
          onOpenPayment={() => {
            setPreselectedPaymentMember(null);
            setActiveTab('payments');
          }}
          onOpenBooking={() => setIsBookingModalOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        {/* Informative Banner when Supabase schema tables haven't been run yet */}
        {isSchemaPending && (
          <div className="bg-amber-950/40 border-b border-amber-800/60 px-4 md:px-8 py-2.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Supabase Database Tables Pending:</strong> Your database tables (appointments, members, payments) have not been created yet in your Supabase project (<strong>{DEFAULT_SUPABASE_PROJECT_ID}</strong>). The app is operating safely in local storage fallback mode.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSqlModalOpen(true)}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Database className="w-3.5 h-3.5" /> Run SQL Setup Script
              </button>
              <button
                onClick={() => loadGymData()}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
              >
                Check Again
              </button>
            </div>
          </div>
        )}

        {/* View Component Switcher */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <DashboardView
              members={members}
              payments={payments}
              plans={plans}
              onNavigate={(tab) => setActiveTab(tab as TabType)}
              onAddMemberClick={handleQuickAddMember}
              onPaymentClick={() => {
                setPreselectedPaymentMember(null);
                setActiveTab('payments');
              }}
              onViewReceipt={(p) => setViewingReceipt(p)}
            />
          )}

          {activeTab === 'appointments' && (
            <AppointmentsView
              appointments={appointments}
              onRefresh={async () => {
                const refreshed = await getAppointments();
                setAppointments(refreshed);
              }}
              onOpenBookingModal={() => setIsBookingModalOpen(true)}
              onOpenAddMemberWithData={(lead) => {
                setLeadDataForMember(lead);
                setActiveTab('members');
              }}
              adminEmail={adminEmail}
              onOpenSqlSetup={() => setIsSqlModalOpen(true)}
            />
          )}

          {activeTab === 'members' && (
            <MembersView
              members={members}
              plans={plans}
              payments={payments}
              adminEmail={adminEmail}
              onAddMember={handleAddMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              onOpenPaymentForMember={handleQuickPaymentForMember}
              onViewReceipt={(p) => setViewingReceipt(p)}
              initialOpenAdd={openAddMemberDirectly}
              initialMemberData={leadDataForMember}
              onClearInitialMemberData={() => setLeadDataForMember(null)}
            />
          )}

          {activeTab === 'plans' && (
            <PlansView
              plans={plans}
              onAddPlan={handleAddPlan}
              onUpdatePlan={handleUpdatePlan}
              onDeletePlan={handleDeletePlan}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsView
              members={members}
              plans={plans}
              payments={payments}
              settings={settings}
              adminEmail={adminEmail}
              onRecordPayment={handleRecordPayment}
              onViewReceipt={(p) => setViewingReceipt(p)}
              preselectedMember={preselectedPaymentMember}
              onClearPreselectedMember={() => setPreselectedPaymentMember(null)}
            />
          )}

          {activeTab === 'expiry' && (
            <ExpiryView
              members={members}
              plans={plans}
              onRenewMember={handleQuickRenewMember}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              members={members}
              payments={payments}
              settings={settings}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityLogsView logs={activityLogs} />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onOpenConfig={() => setIsConfigModalOpen(true)}
              onOpenSql={() => setIsSqlModalOpen(true)}
              adminEmail={adminEmail}
            />
          )}
        </main>
      </div>

      {/* MODAL: VIEW & PRINT RECEIPT */}
      {viewingReceipt && (
        <ReceiptModal
          isOpen={true}
          payment={viewingReceipt}
          member={viewingReceiptMember}
          plans={plans}
          settings={settings}
          adminEmail={adminEmail}
          onClose={() => setViewingReceipt(null)}
        />
      )}

      {/* MODAL: SUPABASE CONFIGURATION */}
      <SupabaseConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSaved={() => {
          setIsConfigModalOpen(false);
          loadGymData();
        }}
      />

      {/* MODAL: AUTHORITATIVE SQL SETUP SCRIPT */}
      <SqlSetupModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
      />

      {/* MODAL: APPOINTMENT BOOKING FORM */}
      <AppointmentBookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onAppointmentCreated={async (newApt) => {
          setAppointments((prev) => [newApt, ...prev.filter((a) => a.id !== newApt.id)]);
          const refreshed = await getAppointments();
          setAppointments(refreshed);
        }}
        adminEmail={adminEmail}
        onOpenSqlSetup={() => {
          setIsBookingModalOpen(false);
          setIsSqlModalOpen(true);
        }}
      />
    </div>
  );
}
