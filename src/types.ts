export interface Member {
  id: string;
  member_id: string; // e.g. MS-0001
  name: string;
  mobile: string;
  email: string;
  dob?: string;
  gender: 'male' | 'female' | 'other' | '';
  address?: string;
  join_date: string;
  plan_id?: string;
  plan_amount: number;
  discount: number;
  emergency_contact?: string;
  notes?: string;
  membership_start: string;
  membership_expiry: string;
  status: 'active' | 'expired' | 'inactive';
  created_at?: string;
  updated_at?: string;
  // Computed or cached financial stats for the member
  remaining_balance?: number;
}

export interface MembershipPlan {
  id: string;
  name: string;
  duration_months: number;
  price: number;
  discount: number;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Payment {
  id: string;
  payment_id: string; // e.g. MSF-FEE-260905-0001
  receipt_number?: string; // e.g. MSF-RCPT-260905-001
  member_id: string;
  amount: number;
  discount: number;
  previous_balance: number;
  total_due: number;
  remaining_balance: number;
  payment_method: 'Cash' | 'UPI';
  transaction_number?: string;
  payment_date: string;
  notes?: string;
  created_at?: string;
  // Joined member details for display
  member_name?: string;
  member_code?: string;
  member_mobile?: string;
  member_email?: string;
  membership_start?: string;
  membership_expiry?: string;
  join_date?: string;
  plan_name?: string;
  admin_email?: string;
}

export interface GymSettings {
  id?: string;
  gym_name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  upi_id: string;
  logo_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  admin_email: string;
}

export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  expiredMembers: number;
  expiringSoon: number; // expiring within 30 days
  totalPaymentsCount: number;
  todayCollection: number;
  thisMonthCollection: number;
  totalOutstandingBalance: number;
}

export type AppointmentServiceType =
  | 'free_trial'
  | 'gym_tour'
  | 'personal_training'
  | 'nutrition_consultation'
  | 'membership_inquiry'
  | 'general';

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Appointment {
  id: string;
  appointment_code: string; // e.g. MSF-APT-260905-001
  name: string;
  mobile: string;
  email?: string;
  service_type: AppointmentServiceType;
  appointment_date: string; // YYYY-MM-DD
  time_slot: string;
  fitness_goal?: string;
  notes?: string;
  status: AppointmentStatus;
  created_at?: string;
  updated_at?: string;
}
