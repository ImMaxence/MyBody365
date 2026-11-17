export interface Account {
  id: string;
  email: string;
  displayName: string;
  /** unique, to be found by friends */
  username: string;
  /** the picture shown: one's own when uploaded, else the Google one */
  avatarUrl?: string;
  /** a picture of one's own was uploaded */
  ownAvatar: boolean;
  /** shown in the username suggestions of the friends search */
  discoverable: boolean;
  /** glasses of water a day; absent: the water tracker is off */
  waterGoal?: number;
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
  storageUsedBytes: number;
  storageQuotaMb?: number;
  defaultQuotaMb: number;
}

export interface AdminSummary {
  users: number;
  admins: number;
  pendingRequests: number;
  activeLinks: number;
  openFeedback: number;
  openErrors: number;
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

export interface StreakDay {
  day: string;
  done: boolean;
  future: boolean;
  frozen: boolean;
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
  streak: { days: number; todayDone: boolean; week: StreakDay[]; best: number; freezes: number; calendar: StreakDay[] };
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

// ── photos (0.3) ─────────────────────────────────────────────────────────────
export type Pose = 'FRONT' | 'SIDE' | 'BACK';

export interface Photo {
  id: string;
  day: string;
  pose: Pose;
  width: number;
  height: number;
  weightKg?: number;
  /** same-origin URLs, served to the owner only (or a friend it was shared with) */
  url: string;
  thumbUrl: string;
  createdAt: string;
}

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
}

// ── meals (0.4) ──────────────────────────────────────────────────────────────
export interface Nutrients {
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  sugarsG?: number;
  fatG?: number;
  satFatG?: number;
  fiberG?: number;
  saltG?: number;
}

export type FoodSource = 'CIQUAL' | 'OFF' | 'USER';
export type Grade = 'a' | 'b' | 'c' | 'd' | 'e';

export interface Food {
  id: string;
  source: FoodSource;
  name: string;
  brand?: string;
  category?: string;
  per100: Nutrients;
  nutriscore?: Grade;
  nutriscoreEstimated: boolean;
  servingG?: number;
  mine: boolean;
}

export interface FoodInput {
  name: string;
  brand?: string | null;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  sugarsG?: number | null;
  fatG?: number | null;
  satFatG?: number | null;
  fiberG?: number | null;
  saltG?: number | null;
  servingG?: number | null;
}

export type Slot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface MealEntry {
  id: string;
  day: string;
  slot: Slot;
  foodId?: string;
  recipeId?: string;
  name: string;
  detail?: string;
  grams?: number;
  servings?: number;
  nutrients: Nutrients;
  nutriscore?: Grade;
  createdAt: string;
}

export interface MealDay {
  day: string;
  targetKcal?: number;
  totals: Nutrients;
  entries: MealEntry[];
}

/** a day of the calendar: only days with something logged come back */
export interface DayTotal {
  day: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entries: number;
}

export interface MealDays {
  targetKcal?: number;
  days: DayTotal[];
}

export interface FoodStat {
  name: string;
  detail?: string;
  times: number;
  kcal: number;
}

export interface MealStats {
  days: number;
  from: string;
  to: string;
  targetKcal?: number;
  daily: DayTotal[];
  totals: Nutrients;
  topByCount: FoodStat[];
  topByKcal: FoodStat[];
  slots: { slot: Slot; kcal: number; days: number }[];
  grades: { grade: string | null; kcal: number }[];
}

export interface MealInput {
  day: string;
  slot: Slot;
  foodId?: string;
  recipeId?: string;
  grams?: number;
  servings?: number;
  quick?: QuickPortion;
}

/** a portion with only its calories, the macros when known */
export interface QuickPortion {
  name: string;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface RecentItem {
  /** QUICK: a portion logged with its calories only (fast food, restaurant) */
  kind: 'FOOD' | 'RECIPE' | 'QUICK';
  id: string;
  name: string;
  detail?: string;
  grams?: number;
  servings?: number;
  kcal: number;
  nutriscore?: Grade;
  /** the portion's nutrients (QUICK) */
  quick?: Nutrients;
}

export type RecipeType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DESSERT' | 'DRINK';

export interface Recipe {
  id: string;
  name: string;
  type: RecipeType;
  servings: number;
  notes?: string;
  shared: boolean;
  visibility: RecipeVisibility;
  hidden: boolean;
  mine: boolean;
  /** the calories were entered by the owner (an imported recipe): no ingredient from the database */
  manualNutrition?: boolean;
  /** the ingredients as written, one per line */
  ingredientLines?: string[];
  sourceUrl?: string;
  sourceName?: string;
  author?: string;
  perServing: Nutrients;
  servingG?: number;
  nutriscore?: Grade;
  score: number;
  myVote?: number;
  imageUrl?: string;
  thumbUrl?: string;
  ingredients?: { foodId?: string; name: string; grams: number; kcal: number }[];
  createdAt: string;
}

/** who sees a recipe besides its owner: nobody, the friends, every member */
export type RecipeVisibility = 'PRIVATE' | 'FRIENDS' | 'PUBLIC';

export interface RecipeInput {
  name: string;
  type: RecipeType;
  servings: number;
  notes?: string | null;
  visibility: RecipeVisibility;
  ingredients: { foodId: string; grams: number }[];
  /** calories per serving entered by hand, instead of computed from the ingredients */
  manual?: { kcal: number; proteinG?: number | null; carbsG?: number | null; fatG?: number | null } | null;
  ingredientLines?: string[];
  sourceUrl?: string | null;
}

/** a recipe read from a recipe site, nothing saved yet */
export interface RecipeDraft {
  name: string;
  type: RecipeType;
  servings?: number;
  ingredients: string[];
  instructions?: string;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sourceUrl: string;
  sourceName: string;
}

export interface CiqualImport {
  id: string;
  version?: string;
  status: 'RUNNING' | 'DONE' | 'UP_TO_DATE' | 'FAILED';
  step?: string;
  progress: number;
  foods?: number;
  message?: string;
  startedAt: string;
  finishedAt?: string;
  startedBy?: string;
}

export interface FoodsOverview {
  ciqualVersion?: string;
  ciqualFoods: number;
  supersededFoods: number;
  offProducts: number;
  userFoods: number;
  imports: CiqualImport[];
  /** when the local copy of Open Food Facts was last imported (none: asked live) */
  offLocalAt?: string;
  offImports: OffImport[];
}

export interface OffImport {
  id: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  step?: string;
  progress: number;
  products?: number;
  message?: string;
  startedAt: string;
  finishedAt?: string;
  startedBy?: string;
}
