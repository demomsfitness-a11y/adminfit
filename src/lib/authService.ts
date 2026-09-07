import { getSupabase, isSupabaseConfigured } from './supabase';
import { fetchAdminByEmail, updateAdminLastLogin } from './adminDb';
import { logActivity } from './db';
import { AdminAccount } from '../types';

export interface PasswordValidationResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  errors: string[];
}

/**
 * Validates password strength according to gym security requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one number (0-9)
 */
export function validatePasswordStrength(pwd: string): PasswordValidationResult {
  const hasMinLength = (pwd || '').length >= 8;
  const hasUpper = /[A-Z]/.test(pwd || '');
  const hasLower = /[a-z]/.test(pwd || '');
  const hasNumber = /[0-9]/.test(pwd || '');

  const errors: string[] = [];
  if (!hasMinLength) errors.push('Minimum 8 characters');
  if (!hasUpper) errors.push('At least one uppercase letter (A-Z)');
  if (!hasLower) errors.push('At least one lowercase letter (a-z)');
  if (!hasNumber) errors.push('At least one number (0-9)');

  return {
    isValid: hasMinLength && hasUpper && hasLower && hasNumber,
    hasMinLength,
    hasUpper,
    hasLower,
    hasNumber,
    errors,
  };
}

/**
 * Standardize Supabase and network auth error messages
 */
export function formatAuthErrorMessage(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';
  const raw = String(error.message || error).toLowerCase();

  if (
    raw.includes('is invalid') ||
    raw.includes('invalid email') ||
    raw.includes('unable to validate email') ||
    raw.includes('email address')
  ) {
    return 'Please enter a valid email address.';
  }

  if (
    raw.includes('smtp') ||
    raw.includes('error sending') ||
    raw.includes('email provider is disabled') ||
    raw.includes('mail delivery') ||
    raw.includes('mailer') ||
    raw.includes('transport')
  ) {
    return 'Email authentication is currently unavailable. Please check Supabase email/SMTP configuration.';
  }

  if (raw.includes('invalid login credentials') || raw.includes('invalid grant')) {
    return 'Invalid email or password. Please try again or click "Forgot Password?".';
  }

  if (
    raw.includes('token has expired') ||
    raw.includes('invalid token') ||
    raw.includes('token is expired') ||
    raw.includes('otp has expired') ||
    raw.includes('invalid otp') ||
    raw.includes('token not found')
  ) {
    return 'This password reset request is invalid or has expired. Please request a new one.';
  }

  return error.message || 'Authentication error. Please check your credentials.';
}

/**
 * Trigger Password Reset / Recovery via Supabase Auth
 * Follows generic email response rule to avoid exposing account existence
 */
export async function requestPasswordReset(email: string): Promise<{
  success: boolean;
  message: string;
}> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  // 1. Verify if admin exists and is active
  const admin = await fetchAdminByEmail(cleanEmail);

  // If inactive, block immediately with explicit administrative notice
  if (admin && admin.status === 'inactive') {
    throw new Error('Your administrator account has been deactivated. Please contact the Super Admin.');
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Email authentication is currently unavailable. Please check Supabase email/SMTP configuration.');
  }

  // If the account does not exist, return the safe generic message without exposing info
  if (!admin) {
    // Record security log without leaking info to the UI
    await logActivity(
      'Password Reset Requested',
      `Password recovery requested for unregistered address: ${cleanEmail}`,
      cleanEmail,
      {
        module: 'Auth',
        status: 'warning',
      }
    );
    return {
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.',
    };
  }

  // Account exists and is active -> Request reset via Supabase Auth
  try {
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin,
    });

    if (error) {
      // Record failed security event
      await logActivity(
        'Password Reset Failed',
        `Supabase rejected reset request for ${cleanEmail}: ${error.message}`,
        admin,
        {
          module: 'Auth',
          status: 'failed',
          target_type: 'admin',
          target_id: admin.admin_id,
        }
      );
      throw new Error(formatAuthErrorMessage(error));
    }

    // Record successful security event
    await logActivity(
      'Password Reset Requested',
      `Secure password reset instructions dispatched to registered email ${cleanEmail}`,
      admin,
      {
        module: 'Auth',
        status: 'success',
        target_type: 'admin',
        target_id: admin.admin_id,
      }
    );

    return {
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.',
    };
  } catch (err: any) {
    throw new Error(formatAuthErrorMessage(err));
  }
}

/**
 * Verify Password Reset OTP code sent via Supabase
 */
export async function verifyPasswordResetOtp(email: string, otp: string): Promise<boolean> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanOtp = (otp || '').trim();

  if (!cleanOtp || cleanOtp.length < 4) {
    throw new Error('Please enter the verification code sent to your email.');
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Email authentication is currently unavailable. Please check Supabase email/SMTP configuration.');
  }

  const admin = await fetchAdminByEmail(cleanEmail);

  try {
    const { data, error } = await client.auth.verifyOtp({
      email: cleanEmail,
      token: cleanOtp,
      type: 'recovery',
    });

    if (error) {
      await logActivity(
        'Password Reset Failed',
        `Invalid or expired recovery code submitted for ${cleanEmail}: ${error.message}`,
        admin || cleanEmail,
        {
          module: 'Auth',
          status: 'failed',
          target_type: 'admin',
          target_id: admin?.admin_id || '',
        }
      );
      throw new Error('This password reset request is invalid or has expired. Please request a new one.');
    }

    return true;
  } catch (err: any) {
    throw new Error(formatAuthErrorMessage(err));
  }
}

/**
 * Update authenticated user's password in Supabase Auth
 */
export async function updateAdminPassword(
  newPassword: string,
  email?: string
): Promise<{ success: boolean; message: string }> {
  const validation = validatePasswordStrength(newPassword);
  if (!validation.isValid) {
    throw new Error(`Password does not meet requirements: ${validation.errors.join(', ')}`);
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Authentication service unavailable. Please check Supabase configuration.');
  }

  try {
    const { data, error } = await client.auth.updateUser({
      password: newPassword,
    });

    const targetEmail = (email || data?.user?.email || '').toLowerCase().trim();
    const admin = targetEmail ? await fetchAdminByEmail(targetEmail) : null;

    if (error) {
      await logActivity(
        'Password Reset Failed',
        `Supabase failed updating password for ${targetEmail}: ${error.message}`,
        admin || targetEmail,
        {
          module: 'Auth',
          status: 'failed',
          target_type: 'admin',
          target_id: admin?.admin_id || '',
        }
      );
      throw new Error(formatAuthErrorMessage(error));
    }

    // Record successful password reset security event
    await logActivity(
      'Password Reset Successful',
      `Administrator account password updated securely for ${targetEmail}`,
      admin || targetEmail,
      {
        module: 'Auth',
        status: 'success',
        target_type: 'admin',
        target_id: admin?.admin_id || '',
      }
    );

    // Save transient flag to log "Login After Password Reset" upon next sign-in
    if (targetEmail) {
      try {
        sessionStorage.setItem('msf_just_reset_password_email', targetEmail);
      } catch (e) {
        console.warn('Could not store reset flag in sessionStorage:', e);
      }
    }

    return {
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    };
  } catch (err: any) {
    throw new Error(formatAuthErrorMessage(err));
  }
}

/**
 * Sign in using email and password with Supabase Auth
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<AdminAccount> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  if (!password || password.trim().length === 0) {
    throw new Error('Please enter your account password.');
  }

  // 1. Verify existence in active admins directory
  const admin = await fetchAdminByEmail(cleanEmail);
  if (!admin) {
    await logActivity('Failed Login', `Password sign-in rejected: ${cleanEmail} is not a registered admin`, cleanEmail, {
      module: 'Auth',
      status: 'failed',
    });
    throw new Error(`Account not found for "${cleanEmail}". Please contact the Super Admin.`);
  }

  if (admin.status === 'inactive') {
    await logActivity('Failed Login', `Deactivated admin attempted sign-in: ${admin.full_name} (${cleanEmail})`, admin, {
      module: 'Auth',
      status: 'failed',
      target_type: 'admin',
      target_id: admin.admin_id,
    });
    throw new Error('Your admin account has been deactivated. Please contact the Super Admin.');
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase authentication is not configured.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: cleanEmail,
    password: password.trim(),
  });

  if (error) {
    await logActivity('Failed Login', `Failed password login attempt for ${cleanEmail}: ${error.message}`, admin, {
      module: 'Auth',
      status: 'failed',
      target_type: 'admin',
      target_id: admin.admin_id,
    });
    throw new Error(formatAuthErrorMessage(error));
  }

  // Check if this login is right after a password reset
  let justReset = false;
  try {
    justReset = sessionStorage.getItem('msf_just_reset_password_email') === cleanEmail;
    if (justReset) {
      sessionStorage.removeItem('msf_just_reset_password_email');
    }
  } catch (e) {
    // Ignore
  }

  if (justReset) {
    await logActivity(
      'Login After Password Reset',
      `${admin.full_name} (${admin.role}) signed in successfully following password reset`,
      admin,
      {
        module: 'Auth',
        status: 'success',
        target_type: 'admin',
        target_id: admin.admin_id,
      }
    );
  } else {
    await logActivity(
      'Login',
      `${admin.full_name} (${admin.role}) signed in successfully using password authentication`,
      admin,
      {
        module: 'Auth',
        status: 'success',
        target_type: 'admin',
        target_id: admin.admin_id,
      }
    );
  }

  await updateAdminLastLogin(cleanEmail);
  return admin;
}

/**
 * Send OTP login code via Supabase Auth
 */
export async function sendLoginOtp(email: string): Promise<string> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  // Verify active account
  const admin = await fetchAdminByEmail(cleanEmail);
  if (!admin) {
    await logActivity('Failed Login', `OTP login rejected: ${cleanEmail} is not registered`, cleanEmail, {
      module: 'Auth',
      status: 'failed',
    });
    throw new Error(`Account not found for "${cleanEmail}". Please contact the Super Admin.`);
  }

  if (admin.status === 'inactive') {
    throw new Error('Your admin account has been deactivated. Please contact the Super Admin.');
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Email authentication is currently unavailable. Please check Supabase email/SMTP configuration.');
  }

  const { error } = await client.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    await logActivity('Failed Login', `Supabase rejected OTP dispatch for ${cleanEmail}: ${error.message}`, admin, {
      module: 'Auth',
      status: 'failed',
      target_type: 'admin',
      target_id: admin.admin_id,
    });
    throw new Error(formatAuthErrorMessage(error));
  }

  return `A 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox.`;
}

/**
 * Verify OTP login code and sign in
 */
export async function verifyLoginOtp(email: string, otp: string): Promise<AdminAccount> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanOtp = (otp || '').trim();

  if (!cleanOtp || cleanOtp.length < 4) {
    throw new Error('Please enter the 6-digit verification code.');
  }

  const admin = await fetchAdminByEmail(cleanEmail);
  if (!admin || admin.status === 'inactive') {
    throw new Error('Account not found or has been deactivated.');
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Supabase authentication is not configured.');
  }

  const { data, error } = await client.auth.verifyOtp({
    email: cleanEmail,
    token: cleanOtp,
    type: 'email',
  });

  if (error) {
    await logActivity('Failed Login', `Invalid OTP submitted for ${cleanEmail}: ${error.message}`, admin, {
      module: 'Auth',
      status: 'failed',
      target_type: 'admin',
      target_id: admin.admin_id,
    });
    throw new Error(formatAuthErrorMessage(error));
  }

  await updateAdminLastLogin(cleanEmail);
  await logActivity(
    'Login',
    `${admin.full_name} (${admin.role}) signed in successfully via verified OTP`,
    admin,
    {
      module: 'Auth',
      status: 'success',
      target_type: 'admin',
      target_id: admin.admin_id,
    }
  );

  return admin;
}

/**
 * Verify active admin's account password for sensitive actions
 * e.g. Membership Registration, Plan Changes, Payment Actions
 */
export async function verifyCurrentAdminPassword(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPwd = (password || '').trim();

  if (!cleanPwd) {
    return { success: false, error: 'Please enter your administrator account password.' };
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    return { success: false, error: 'Authentication service is not configured.' };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPwd,
    });

    if (error) {
      return { success: false, error: formatAuthErrorMessage(error) };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatAuthErrorMessage(err) };
  }
}

/**
 * Super Admin triggers password reset for an employee
 */
export async function superAdminTriggerPasswordReset(
  targetEmail: string,
  callerAdmin: AdminAccount
): Promise<string> {
  if (callerAdmin.role !== 'super_admin') {
    throw new Error('Unauthorized: Only Super Admin can trigger password recovery for other accounts.');
  }

  const cleanEmail = (targetEmail || '').trim().toLowerCase();
  const targetAdmin = await fetchAdminByEmail(cleanEmail);
  if (!targetAdmin) {
    throw new Error(`Admin account for "${cleanEmail}" was not found.`);
  }

  const client = getSupabase();
  if (!client || !isSupabaseConfigured()) {
    throw new Error('Email authentication is currently unavailable. Please check Supabase email/SMTP configuration.');
  }

  const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: window.location.origin,
  });

  if (error) {
    await logActivity(
      'Password Reset Failed',
      `Super Admin triggered reset failed for ${cleanEmail}: ${error.message}`,
      callerAdmin,
      {
        module: 'Admins',
        status: 'failed',
        target_type: 'admin',
        target_id: targetAdmin.admin_id,
      }
    );
    throw new Error(formatAuthErrorMessage(error));
  }

  await logActivity(
    'Password Reset Requested',
    `Super Admin ${callerAdmin.full_name} triggered password recovery for employee ${targetAdmin.full_name} (${cleanEmail})`,
    callerAdmin,
    {
      module: 'Admins',
      status: 'success',
      target_type: 'admin',
      target_id: targetAdmin.admin_id,
    }
  );

  return `Password reset instructions have been dispatched to ${cleanEmail}.`;
}
