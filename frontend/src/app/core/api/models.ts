export interface Account {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: 'USER' | 'ADMIN';
  locale: 'fr' | 'en';
  onboarded: boolean;
  /** the body profile (height, weight, goal) has been filled in */
  profileComplete: boolean;
  admin: boolean;
}

export interface Me {
  authenticated: boolean;
  account?: Account;
}

export interface Providers {
  google: boolean;
  passkey: boolean;
  devLogin: boolean;
}

export type RequestKind = 'NEW_ACCESS' | 'LOST_ACCESS';

export interface AccessRequestInput {
  email: string;
  name: string;
  message?: string;
  kind: RequestKind;
  website?: string;
}

export interface Passkey {
  id: string;
  label: string;
  createdAt?: string;
  lastUsedAt?: string;
  synced: boolean;
}

export interface SecurityInfo {
  googleLinked: boolean;
  googleEmail?: string;
  passkeys: Passkey[];
}

export type LinkKind = 'INVITE' | 'RECOVERY';
export type LinkState = 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';

export interface AdminLink {
  id: string;
  kind: LinkKind;
  state: LinkState;
  userId: string;
  userEmail?: string;
  userName?: string;
  createdBy?: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  /** only in the answer that creates the link */
  url?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  envAdmin: boolean;
  self: boolean;
  google: { linked: boolean; email?: string };
  passkeys: number;
  onboarded: boolean;
  createdAt: string;
  lastLoginAt?: string;
  lastLoginMethod?: 'GOOGLE' | 'PASSKEY' | 'LINK' | 'DEV';
  activeLink?: AdminLink;
}

export interface AdminSummary {
  users: number;
  admins: number;
  pendingRequests: number;
  activeLinks: number;
}

export interface AdminRequest {
  id: string;
  email: string;
  name: string;
  message?: string;
  kind: RequestKind;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  existingUser: boolean;
}

export interface Decision {
  request: AdminRequest;
  user: AdminUser;
  link: AdminLink;
}

export interface AuditLine {
  id: number;
  actorEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  details?: string;
  ip?: string;
  createdAt: string;
}

export interface ApiErrorBody {
  status: number;
  message: string;
  fields?: Record<string, string>;
}

// ── tracking ─────────────────────────────────────────────────────────────────
export type Sex = 'FEMALE' | 'MALE' | 'OTHER';
export type Activity = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';

export interface ProfileInput {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  activityLevel: Activity;
  currentWeightKg: number;
  goalWeightKg: number;
  weeklyRateKg: number;
}

export interface BodyProfile {
  sex: Sex;
  birthDate: string;
  age: number;
  heightCm: number;
  activityLevel: Activity;
  startWeightKg: number;
  startDate: string;
  goalWeightKg: number;
  weeklyRateKg: number;
  minGoalKg: number;
}

export interface Summary {
  profile: BodyProfile;
  current: { weightKg?: number; day?: string; trendKg: number; bmi: number; changeKg?: number };
  energy: { bmr: number; tdee: number; targetKcal: number; floorApplied: boolean };
  goal: {
    goalKg: number;
    remainingKg: number;
    progressPct: number;
    reached: boolean;
    planDate?: string;
    trendDate?: string;
    trendKgPerWeek?: number;
  };
  streak: { days: number; todayDone: boolean; week: { day: string; done: boolean; future: boolean }[] };
  warnings: string[];
}

export interface LogInput {
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  chestCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  note?: string | null;
}

export interface BodyLogEntry extends LogInput {
  day: string;
  trendKg?: number;
}
