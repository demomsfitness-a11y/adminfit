import { getSupabase, isSupabaseConfigured } from './supabase';
import {
  Member,
  MembershipPlan,
  Payment,
  GymSettings,
  ActivityLog,
  DashboardStats,
  Appointment,
  AppointmentStatus,
} from '../types';

export const DEFAULT_PLANS: Omit<MembershipPlan, 'id'>[] = [
  {
    name: 'Basic',
    duration_months: 1,
    price: 999,
    discount: 0,
    description: '₹999 / 1 Month Gym Access with locker facility and basic workout plan',
    is_active: true,
  },
  {
    name: 'Standard',
    duration_months: 6,
    price: 3597,
    discount: 0,
    description: '₹3597 / 6 Months Gym Access, cardio & weights, diet consultation',
    is_active: true,
  },
  {
    name: 'Premium',
    duration_months: 12,
    price: 5994,
    discount: 0,
    description: '₹5994 / 12 Months All-access pass, fitness coach, sauna, and gym kit',
    is_active: true,
  },
];

export const DEFAULT_SETTINGS: GymSettings = {
  gym_name: 'MS Fitness',
  tagline: 'Stronger Body, Stronger You',
  phone: '+91 98765 43210',
  email: 'contact@msfitness.com',
  address: '123 Powerhouse Street, Fitness District, New Delhi, India',
  upi_id: 'msfitness@upi',
  logo_url: '',
};

// UUID validation helper to prevent PostgreSQL syntax errors
export function isValidUuid(str: string | undefined | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

// Format Supabase errors for console and user feedback
export function formatSupabaseError(error: any, context: string): string {
  if (!error) return `${context} failed with unknown database error`;
  const code = error.code ? `[Code ${error.code}] ` : '';
  const message = error.message || 'Database request rejected';
  const details = error.details ? ` Details: ${error.details}` : '';
  const hint = error.hint ? ` Hint: ${error.hint}` : '';
  return `${context}: ${code}${message}${details}${hint}`;
}

// Error detection for missing Supabase tables
export function isTableMissingError(error: any): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const msg = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();
  return (
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    details.includes('schema cache') ||
    hint.includes('schema cache')
  );
}

// Extract missing column name when PostgREST returns PGRST204
export function extractMissingColumn(error: any): string | null {
  if (!error) return null;
  const msg = String(error.message || '');
  const details = String(error.details || '');
  const combined = `${msg} ${details}`;
  const match = combined.match(/could not find the '([^']+)' column/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

// Reactive state tracker for pending Supabase schema creation
let schemaMissingStatus = false;
const schemaListeners = new Set<(missing: boolean) => void>();

export function isSupabaseSchemaPending(): boolean {
  return schemaMissingStatus;
}

export function setSupabaseSchemaPending(pending: boolean) {
  if (schemaMissingStatus !== pending) {
    schemaMissingStatus = pending;
    schemaListeners.forEach((fn) => fn(pending));
  }
}

export function subscribeToSchemaPending(listener: (missing: boolean) => void) {
  schemaListeners.add(listener);
  listener(schemaMissingStatus);
  return () => {
    schemaListeners.delete(listener);
  };
}

// Sample data kept only for type reference or empty-database fallback
export const DEFAULT_SAMPLE_MEMBERS: Member[] = [];
export const DEFAULT_SAMPLE_PAYMENTS: Payment[] = [];

// ---------------- ACTIVITY LOGS ----------------

export async function logActivity(action: string, description: string, adminEmail: string) {
  const client = getSupabase();
  const logItem: Omit<ActivityLog, 'id'> = {
    action,
    description,
    timestamp: new Date().toISOString(),
    admin_email: adminEmail || 'admin@msfitness.com',
  };

  if (client && isSupabaseConfigured()) {
    try {
      const { error } = await client.from('activity_logs').insert([logItem]);
      if (error) {
        console.warn('Supabase activity log notice:', error.message);
      }
    } catch (e) {
      console.warn('Could not insert activity log to Supabase:', e);
    }
  }
}

export async function fetchActivityLogs(): Promise<ActivityLog[]> {
  const client = getSupabase();
  if (client && isSupabaseConfigured()) {
    try {
      const { data, error } = await client
        .from('activity_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (!error && data) {
        return data as ActivityLog[];
      }
      if (error) {
        console.warn('Supabase fetch logs notice:', error.message);
      }
    } catch (err) {
      console.warn('Error fetching logs from Supabase:', err);
    }
  }
  return [];
}

// ---------------- MEMBERS ----------------

export async function fetchMembers(): Promise<Member[]> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const { data, error } = await client
    .from('members')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase fetch members error:', error);
    if (isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(error, 'Failed to fetch members from Supabase'));
  }

  setSupabaseSchemaPending(false);
  return (data || []) as Member[];
}

export async function generateNextMemberId(): Promise<string> {
  let highestNum = 0;
  const client = getSupabase();

  if (client && isSupabaseConfigured()) {
    try {
      const { data, error } = await client.from('members').select('member_id');
      if (!error && data && data.length > 0) {
        for (const row of data) {
          const match = String(row.member_id).match(/MS-(\d+)/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > highestNum) highestNum = num;
          }
        }
      }
    } catch (e) {
      console.warn('Could not query members for next ID:', e);
    }
  }

  const nextNum = highestNum + 1;
  return `MS-${String(nextNum).padStart(4, '0')}`;
}

export async function createMember(memberData: Omit<Member, 'id'>, adminEmail: string): Promise<Member> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Please verify your Supabase project settings.');
  }

  const now = new Date().toISOString();

  // Auto-generate member_id if missing or empty
  let member_id = memberData.member_id?.trim();
  if (!member_id) {
    member_id = await generateNextMemberId();
  }

  // Sanitize payload strictly for PostgreSQL table schema
  const insertPayload: Record<string, any> = {
    member_id,
    name: memberData.name.trim(),
    mobile: memberData.mobile.trim(),
    email: (memberData.email || '').trim(),
    gender: memberData.gender || 'male',
    address: (memberData.address || '').trim(),
    join_date: memberData.join_date || now.slice(0, 10),
    membership_start: memberData.membership_start || now.slice(0, 10),
    membership_expiry: memberData.membership_expiry,
    plan_amount: Number(memberData.plan_amount) || 0,
    discount: Number(memberData.discount) || 0,
    remaining_balance: Number(memberData.remaining_balance) || 0,
    emergency_contact: (memberData.emergency_contact || '').trim(),
    notes: (memberData.notes || '').trim(),
    status: memberData.status || 'active',
    created_at: now,
    updated_at: now,
  };

  // Nullable DATE: Must be valid date string or NULL (never empty string '')
  if (memberData.dob && memberData.dob.trim() !== '') {
    insertPayload.dob = memberData.dob.trim();
  } else {
    insertPayload.dob = null;
  }

  // Nullable UUID: Must be valid UUID or NULL (never empty string '')
  if (memberData.plan_id && isValidUuid(memberData.plan_id)) {
    insertPayload.plan_id = memberData.plan_id.trim();
  } else {
    insertPayload.plan_id = null;
  }

  console.log('Inserting member into Supabase table "members":', insertPayload);

  let currentPayload = { ...insertPayload };
  let insertResult: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client
      .from('members')
      .insert([currentPayload])
      .select()
      .single();

    if (!error && data) {
      insertResult = data;
      break;
    }

    lastError = error;
    const missingCol = extractMissingColumn(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(currentPayload, missingCol)) {
      console.warn(
        `Supabase table "members" is missing column '${missingCol}'. Retrying insert without it. Run "ALTER TABLE public.members ADD COLUMN IF NOT EXISTS ${missingCol} TEXT;" in Supabase SQL editor to add it.`
      );
      delete currentPayload[missingCol];
      continue;
    }

    break;
  }

  if (!insertResult && lastError) {
    console.error('Supabase member insert error:', lastError);
    if (isTableMissingError(lastError)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(lastError, 'Supabase Add Member Failed'));
  }

  setSupabaseSchemaPending(false);
  await logActivity('Member Created', `Added member ${insertResult.name} (${insertResult.member_id})`, adminEmail);
  return insertResult as Member;
}

export async function updateMember(id: string, updates: Partial<Member>, adminEmail: string): Promise<Member> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    ...updates,
    updated_at: now,
  };
  delete updatePayload.id;

  if (updates.dob !== undefined) {
    updatePayload.dob = updates.dob && updates.dob.trim() !== '' ? updates.dob.trim() : null;
  }

  if (updates.plan_id !== undefined) {
    updatePayload.plan_id = isValidUuid(updates.plan_id) ? updates.plan_id.trim() : null;
  }

  console.log(`Updating member ${id} in Supabase:`, updatePayload);

  let currentUpdate = { ...updatePayload };
  let updateResult: any = null;
  let lastUpdateError: any = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client
      .from('members')
      .update(currentUpdate)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      updateResult = data;
      break;
    }

    lastUpdateError = error;
    const missingCol = extractMissingColumn(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(currentUpdate, missingCol)) {
      console.warn(
        `Supabase table "members" is missing column '${missingCol}'. Retrying update without it.`
      );
      delete currentUpdate[missingCol];
      continue;
    }

    break;
  }

  if (!updateResult && lastUpdateError) {
    console.error('Supabase member update error:', lastUpdateError);
    if (isTableMissingError(lastUpdateError)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(lastUpdateError, 'Supabase Update Member Failed'));
  }

  await logActivity('Member Updated', `Updated member details for ${updateResult.name} (${updateResult.member_id})`, adminEmail);
  return updateResult as Member;
}

export async function deleteMember(id: string, memberName: string, memberCode: string, adminEmail: string): Promise<void> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  console.log(`Deleting member ${id} (${memberCode}) from Supabase`);

  const { error } = await client.from('members').delete().eq('id', id);

  if (error) {
    console.error('Supabase member delete error:', error);
    if (isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(error, 'Supabase Delete Member Failed'));
  }

  await logActivity('Member Deleted', `Deleted member ${memberName} (${memberCode})`, adminEmail);
}

// ---------------- MEMBERSHIP PLANS ----------------

export async function fetchPlans(): Promise<MembershipPlan[]> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await client
    .from('membership_plans')
    .select('*')
    .order('price', { ascending: true });

  if (error) {
    console.error('Supabase fetch plans error:', error);
    if (isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(error, 'Failed to fetch membership plans'));
  }

  setSupabaseSchemaPending(false);

  // If table is currently empty, seed the default plans directly into Supabase
  if (!data || data.length === 0) {
    try {
      console.log('Seeding default membership plans to Supabase...');
      const now = new Date().toISOString();
      const plansToSeed = DEFAULT_PLANS.map((p) => ({
        ...p,
        created_at: now,
        updated_at: now,
      }));

      const { data: seeded, error: seedErr } = await client
        .from('membership_plans')
        .insert(plansToSeed)
        .select();

      if (!seedErr && seeded && seeded.length > 0) {
        return seeded as MembershipPlan[];
      }
    } catch (seedErr) {
      console.warn('Could not auto-seed plans in Supabase:', seedErr);
    }
  }

  return (data || []) as MembershipPlan[];
}

export async function createPlan(plan: Omit<MembershipPlan, 'id'>, adminEmail: string): Promise<MembershipPlan> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const now = new Date().toISOString();
  const toInsert = {
    name: plan.name.trim(),
    duration_months: Number(plan.duration_months) || 1,
    price: Number(plan.price) || 0,
    discount: Number(plan.discount) || 0,
    description: (plan.description || '').trim(),
    is_active: plan.is_active ?? true,
    created_at: now,
    updated_at: now,
  };

  console.log('Inserting plan into Supabase table "membership_plans":', toInsert);

  const { data, error } = await client
    .from('membership_plans')
    .insert([toInsert])
    .select()
    .single();

  if (error) {
    console.error('Supabase plan insert error:', error);
    if (isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(error, 'Supabase Add Plan Failed'));
  }

  await logActivity('Plan Created', `Created membership plan: ${data.name} (₹${data.price})`, adminEmail);
  return data as MembershipPlan;
}

export async function updatePlan(id: string, updates: Partial<MembershipPlan>, adminEmail: string): Promise<MembershipPlan> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const now = new Date().toISOString();
  const toUpdate = { ...updates, updated_at: now };
  delete toUpdate.id;

  console.log(`Updating plan ${id} in Supabase:`, toUpdate);

  const { data, error } = await client
    .from('membership_plans')
    .update(toUpdate)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Supabase plan update error:', error);
    if (isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(error, 'Supabase Update Plan Failed'));
  }

  await logActivity('Plan Updated', `Updated plan: ${data.name}`, adminEmail);
  return data as MembershipPlan;
}

export async function deletePlan(id: string, planName: string, adminEmail: string): Promise<void> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  console.log(`Deleting plan ${id} (${planName}) from Supabase`);

  const { error } = await client.from('membership_plans').delete().eq('id', id);

  if (error) {
    console.error('Supabase plan delete error:', error);
    if (isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(error, 'Supabase Delete Plan Failed'));
  }

  await logActivity('Plan Deleted', `Deleted plan: ${planName}`, adminEmail);
}

// ---------------- PAYMENTS ----------------

export async function fetchPayments(): Promise<Payment[]> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await client
    .from('payments')
    .select('*, members(name, member_id, mobile)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase fetch payments error:', error);
    if (isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(error, 'Failed to fetch payments from Supabase'));
  }

  setSupabaseSchemaPending(false);

  const mapped = (data || []).map((p: any) => ({
    ...p,
    member_name: p.members?.name || 'Member',
    member_code: p.members?.member_id || '',
    member_mobile: p.members?.mobile || '',
  })) as Payment[];

  return mapped;
}

export function generatePaymentAndReceiptIds(): { paymentId: string; receiptNumber: string } {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const randomSeq = String(Math.floor(1000 + Math.random() * 9000));
  const dateStr = `${yy}${mm}${dd}`;

  return {
    paymentId: `MSF-FEE-${dateStr}-${randomSeq}`,
    receiptNumber: `MSF-RCPT-${dateStr}-${randomSeq.slice(0, 3)}`,
  };
}

export async function getMemberLatestBalance(memberId: string): Promise<number> {
  const client = getSupabase();
  if (client && isSupabaseConfigured() && isValidUuid(memberId)) {
    try {
      const { data } = await client
        .from('payments')
        .select('remaining_balance, created_at')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        return Number(data[0].remaining_balance) || 0;
      }

      // Check member's remaining_balance column
      const { data: mem } = await client
        .from('members')
        .select('remaining_balance')
        .eq('id', memberId)
        .single();

      if (mem && mem.remaining_balance !== undefined) {
        return Number(mem.remaining_balance) || 0;
      }
    } catch (e) {
      console.warn('Could not fetch last balance from payments table:', e);
    }
  }
  return 0;
}

export async function createPayment(
  paymentData: {
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
  },
  adminEmail: string
): Promise<Payment> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  // Validate member_id UUID to prevent foreign key constraint or UUID syntax crash
  if (!isValidUuid(paymentData.member_id)) {
    throw new Error(
      `Cannot record payment: Selected member ID ("${paymentData.member_id}") is not a valid Supabase UUID. Please select a valid member saved in Supabase.`
    );
  }

  const { paymentId, receiptNumber } = generatePaymentAndReceiptIds();
  const now = new Date().toISOString();

  const record = {
    payment_id: paymentId,
    receipt_number: receiptNumber,
    member_id: paymentData.member_id,
    amount: Number(paymentData.amount) || 0,
    discount: Number(paymentData.discount) || 0,
    previous_balance: Number(paymentData.previous_balance) || 0,
    total_due: Number(paymentData.total_due) || 0,
    remaining_balance: Number(paymentData.remaining_balance) || 0,
    payment_method: paymentData.payment_method || 'Cash',
    payment_date: paymentData.payment_date || now.slice(0, 10),
    notes: (paymentData.notes || '').trim(),
    plan_name: (paymentData.plan_name || 'Membership Fee').trim(),
    created_at: now,
  };

  console.log('Inserting payment into Supabase table "payments":', record);

  let currentRecord: Record<string, any> = { ...record };
  let paymentResult: any = null;
  let lastPaymentError: any = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client
      .from('payments')
      .insert([currentRecord])
      .select('*, members(name, member_id, mobile)')
      .single();

    if (!error && data) {
      paymentResult = data;
      break;
    }

    lastPaymentError = error;
    const missingCol = extractMissingColumn(error);
    if (missingCol && Object.prototype.hasOwnProperty.call(currentRecord, missingCol)) {
      console.warn(
        `Supabase table "payments" is missing column '${missingCol}'. Retrying insert without it.`
      );
      delete currentRecord[missingCol];
      continue;
    }

    break;
  }

  if (!paymentResult && lastPaymentError) {
    console.error('Supabase payment insert error:', lastPaymentError);
    if (isTableMissingError(lastPaymentError)) {
      setSupabaseSchemaPending(true);
    }
    throw new Error(formatSupabaseError(lastPaymentError, 'Supabase Add Payment Failed'));
  }

  const data = paymentResult;

  // Synchronize member's remaining balance and membership expiry directly in Supabase
  try {
    const memUpdate: Record<string, any> = {
      remaining_balance: Number(paymentData.remaining_balance) || 0,
      updated_at: now,
    };

    if (paymentData.renew_months && paymentData.renew_months > 0) {
      const { data: mem } = await client
        .from('members')
        .select('membership_expiry')
        .eq('id', paymentData.member_id)
        .single();

      if (mem && mem.membership_expiry) {
        const currentExpiry = new Date(mem.membership_expiry);
        const baseDate = currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
        baseDate.setMonth(baseDate.getMonth() + paymentData.renew_months);
        memUpdate.membership_expiry = baseDate.toISOString().slice(0, 10);
        memUpdate.status = 'active';
      }
    }

    await client.from('members').update(memUpdate).eq('id', paymentData.member_id);
  } catch (syncErr) {
    console.warn('Member balance update notice:', syncErr);
  }

  await logActivity(
    'Payment Recorded',
    `Payment of ₹${paymentData.amount} received (${paymentData.payment_method}) - ID: ${paymentId}`,
    adminEmail
  );

  const createdPayment: Payment = {
    ...(data as Payment),
    member_name: data.members?.name || 'Member',
    member_code: data.members?.member_id || '',
    member_mobile: data.members?.mobile || '',
  };

  return createdPayment;
}

// ---------------- GYM SETTINGS ----------------

export async function fetchGymSettings(): Promise<GymSettings> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    return DEFAULT_SETTINGS;
  }

  try {
    const { data, error } = await client.from('gym_settings').select('*').limit(1);
    if (!error && data && data.length > 0) {
      return data[0] as GymSettings;
    }

    if (error && isTableMissingError(error)) {
      setSupabaseSchemaPending(true);
    }

    // Insert default settings row if table is empty
    const { data: inserted, error: insertErr } = await client
      .from('gym_settings')
      .insert([DEFAULT_SETTINGS])
      .select()
      .single();

    if (!insertErr && inserted) {
      return inserted as GymSettings;
    }
  } catch (err) {
    console.warn('Could not query gym settings from Supabase:', err);
  }

  return DEFAULT_SETTINGS;
}

export async function updateGymSettings(settings: Partial<GymSettings>, adminEmail: string): Promise<GymSettings> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const now = new Date().toISOString();
  const toSave: Record<string, any> = {
    gym_name: (settings.gym_name || 'MS Fitness').trim(),
    tagline: (settings.tagline || '').trim(),
    phone: (settings.phone || '').trim(),
    email: (settings.email || '').trim(),
    address: (settings.address || '').trim(),
    upi_id: (settings.upi_id || '').trim(),
    logo_url: (settings.logo_url || '').trim(),
    updated_at: now,
  };

  console.log('Updating gym settings in Supabase table "gym_settings":', toSave);

  // Check if existing row exists
  const { data: existing, error: selectErr } = await client.from('gym_settings').select('id').limit(1);

  if (selectErr && isTableMissingError(selectErr)) {
    setSupabaseSchemaPending(true);
    throw new Error(formatSupabaseError(selectErr, 'Gym Settings table does not exist in Supabase'));
  }

  let resultRow: GymSettings;

  if (existing && existing.length > 0) {
    const { data, error } = await client
      .from('gym_settings')
      .update(toSave)
      .eq('id', existing[0].id)
      .select()
      .single();

    if (error) {
      console.error('Supabase settings update error:', error);
      if (isTableMissingError(error)) setSupabaseSchemaPending(true);
      throw new Error(formatSupabaseError(error, 'Supabase Update Settings Failed'));
    }
    resultRow = data as GymSettings;
  } else {
    const { data, error } = await client
      .from('gym_settings')
      .insert([toSave])
      .select()
      .single();

    if (error) {
      console.error('Supabase settings insert error:', error);
      if (isTableMissingError(error)) setSupabaseSchemaPending(true);
      throw new Error(formatSupabaseError(error, 'Supabase Insert Settings Failed'));
    }
    resultRow = data as GymSettings;
  }

  setSupabaseSchemaPending(false);
  await logActivity('Settings Updated', 'Gym settings and branding details updated in Supabase', adminEmail);
  return resultRow;
}

// ---------------- DASHBOARD STATS ----------------

export function computeDashboardStats(members: Member[] = [], payments: Payment[] = []): DashboardStats {
  const safeMembers = Array.isArray(members) ? members : [];
  const safePayments = Array.isArray(payments) ? payments : [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let activeCount = 0;
  let expiredCount = 0;
  let expiringSoonCount = 0;

  safeMembers.forEach((m) => {
    if (!m) return;
    const expDate = new Date(m.membership_expiry || now);
    const diffTime = expDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0 || m.status === 'expired') {
      expiredCount++;
    } else {
      activeCount++;
      if (diffDays <= 30) {
        expiringSoonCount++;
      }
    }
  });

  let todayCollection = 0;
  let thisMonthCollection = 0;

  safePayments.forEach((p) => {
    if (!p) return;
    const amount = Number(p.amount) || 0;
    if (p.payment_date === todayStr) {
      todayCollection += amount;
    }
    const pDate = new Date(p.payment_date || p.created_at || now);
    if (pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear) {
      thisMonthCollection += amount;
    }
  });

  const memberBalances: Record<string, number> = {};
  safePayments.forEach((p) => {
    if (p && p.member_id && memberBalances[p.member_id] === undefined) {
      memberBalances[p.member_id] = Number(p.remaining_balance) || 0;
    }
  });

  const totalOutstandingBalance = Object.values(memberBalances).reduce((sum, val) => sum + val, 0);

  return {
    totalMembers: safeMembers.length,
    activeMembers: activeCount,
    expiredMembers: expiredCount,
    expiringSoon: expiringSoonCount,
    totalPaymentsCount: safePayments.length,
    todayCollection,
    thisMonthCollection,
    totalOutstandingBalance,
  };
}

export async function calculateDashboardStats(members: Member[] = [], payments: Payment[] = []): Promise<DashboardStats> {
  return computeDashboardStats(members, payments);
}

// ---------------- EXPORT ALIASES & HELPERS ----------------
export const getMembers = fetchMembers;
export const getPlans = fetchPlans;
export const getPayments = fetchPayments;
export const getSettings = fetchGymSettings;
export const updateSettings = updateGymSettings;
export const getActivityLogs = fetchActivityLogs;

export async function generateNextPaymentId(): Promise<string> {
  return generatePaymentAndReceiptIds().paymentId;
}

export async function generateNextReceiptNumber(): Promise<string> {
  return generatePaymentAndReceiptIds().receiptNumber;
}

// ---------------- APPOINTMENT BOOKINGS ----------------

export async function generateNextAppointmentCode(): Promise<string> {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(-2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const datePrefix = `MSF-APT-${yy}${mm}${dd}`;

  let maxSeq = 0;
  const client = getSupabase();

  if (client && isSupabaseConfigured()) {
    try {
      const { data } = await client
        .from('appointments')
        .select('appointment_code')
        .ilike('appointment_code', `${datePrefix}%`);

      if (data && data.length > 0) {
        data.forEach((row) => {
          const parts = row.appointment_code?.split('-');
          if (parts && parts.length >= 4) {
            const num = parseInt(parts[3], 10);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          }
        });
      }
    } catch (e) {
      console.warn('Could not query Supabase for appointments count:', e);
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${datePrefix}-${nextSeq}`;
}

export async function fetchAppointments(): Promise<Appointment[]> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data, error } = await client
      .from('appointments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase fetch appointments error:', error);
      if (isTableMissingError(error)) setSupabaseSchemaPending(true);
      return [];
    }

    setSupabaseSchemaPending(false);
    return (data || []) as Appointment[];
  } catch (err) {
    console.error('Could not connect to Supabase appointments table:', err);
    return [];
  }
}

export interface CreateAppointmentResult {
  success: boolean;
  appointment: Appointment;
  savedToSupabase: boolean;
  message?: string;
}

export async function createAppointment(
  appointmentData: Omit<Appointment, 'id' | 'appointment_code' | 'created_at' | 'updated_at'> & {
    appointment_code?: string;
  },
  adminEmail?: string
): Promise<CreateAppointmentResult> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured.');
  }

  const appointmentCode = appointmentData.appointment_code || (await generateNextAppointmentCode());
  const now = new Date().toISOString();

  const insertPayload = {
    appointment_code: appointmentCode,
    name: appointmentData.name.trim(),
    mobile: appointmentData.mobile.trim(),
    email: (appointmentData.email || '').trim(),
    service_type: appointmentData.service_type || 'free_trial',
    appointment_date: appointmentData.appointment_date,
    time_slot: appointmentData.time_slot,
    fitness_goal: appointmentData.fitness_goal || 'general_fitness',
    notes: (appointmentData.notes || '').trim(),
    status: appointmentData.status || 'pending',
    created_at: now,
    updated_at: now,
  };

  console.log('Inserting appointment into Supabase table "appointments":', insertPayload);

  const { data, error } = await client
    .from('appointments')
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    console.error('Supabase appointment insert error:', error);
    if (isTableMissingError(error)) setSupabaseSchemaPending(true);
    throw new Error(formatSupabaseError(error, 'Supabase Appointment Booking Failed'));
  }

  logActivity(
    'APPOINTMENT_BOOKED',
    `Appointment ${data.appointment_code} booked for ${data.name} (${data.service_type}) on ${data.appointment_date}`,
    adminEmail || 'Public Visitor'
  );

  return {
    success: true,
    appointment: data as Appointment,
    savedToSupabase: true,
    message: 'Appointment successfully saved directly to Supabase!',
  };
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  adminEmail: string
): Promise<boolean> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured.');
  }

  const now = new Date().toISOString();

  console.log(`Updating appointment ${id} status to ${status} in Supabase`);

  const { error } = await client
    .from('appointments')
    .update({ status, updated_at: now })
    .eq('id', id);

  if (error) {
    console.error('Supabase update appointment error:', error);
    throw new Error(formatSupabaseError(error, 'Supabase Update Appointment Failed'));
  }

  logActivity(
    'APPOINTMENT_STATUS_UPDATED',
    `Appointment status updated to ${status.toUpperCase()} for record ID ${id}`,
    adminEmail
  );

  return true;
}

export async function deleteAppointment(
  id: string,
  code: string,
  adminEmail: string
): Promise<boolean> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured.');
  }

  console.log(`Deleting appointment ${id} (${code}) from Supabase`);

  const { error } = await client.from('appointments').delete().eq('id', id);
  if (error) {
    console.error('Supabase delete appointment error:', error);
    throw new Error(formatSupabaseError(error, 'Supabase Delete Appointment Failed'));
  }

  logActivity(
    'APPOINTMENT_DELETED',
    `Appointment ${code} was removed from Supabase`,
    adminEmail
  );

  return true;
}

export const getAppointments = fetchAppointments;

export async function syncAppointmentsToSupabase(): Promise<{ syncedCount: number; error?: string }> {
  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    return { syncedCount: 0, error: 'Supabase client is not configured' };
  }
  return { syncedCount: 0 };
}
