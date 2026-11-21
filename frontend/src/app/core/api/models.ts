/** a milestone of one's own on the way to the goal (1.8) */
export interface Milestone {
  id: string;
  targetKg: number;
  /** what one promised oneself: « un resto », « des baskets » */
  reward?: string;
  /** the day a weigh-in passed it (it stays reached) */
  reachedOn?: string;
}

export interface MilestoneInput {
  targetKg: number;
  reward?: string;
}

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
  /** 1.14: the language chosen in the app; null until one is (the device's then) */
  locale?: 'fr' | 'en' | null;
  onboarded: boolean;
  /** the body profile (height, weight, goal) has been filled in */
  profileComplete: boolean;
  admin: boolean;
  /** the streak's icon and colour (core/engage/streak-style.ts) */
  streakIcon?: string;
  streakColor?: string;
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
  role: 'USER' | 'ADMIN' | 'BOT';
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
/** the day without sport (1.7: with the sessions a week, it replaces the level) */
export type Job = 'SEATED' | 'STANDING' | 'PHYSICAL';
export type MacroSplit = 'BALANCED' | 'PROTEIN' | 'LOW_CARB';

export interface ProfileInput {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  job: Job;
  sessionsPerWeek: number;
  currentWeightKg: number;
  goalWeightKg: number;
  weeklyRateKg: number;
  /** 1.14: the starting point, changed from « Mon objectif » (left out: kept) */
  startWeightKg?: number;
  /** 1.16: the weigh-in of the start day takes it too */
  startLogToo?: boolean;
}

export interface BodyProfile {
  sex: Sex;
  birthDate: string;
  age: number;
  heightCm: number;
  activityLevel: Activity;
  /** null on a profile saved before 1.7 (its level counts until answered) */
  job?: Job | null;
  sessionsPerWeek?: number | null;
  activityFactor: number;
  macroSplit: MacroSplit;
  /** the member asked for the target from their real numbers */
  adaptiveTdee: boolean;
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
  /** eveningKg: the optional evening weigh-in of that day (1.9) */
  current: { weightKg?: number; day?: string; trendKg: number; bmi: number; changeKg?: number; eveningKg?: number };
  /**
   * tdee: what the target counts on; estimatedTdee: the formula's; realTdee: from the member's meals and weigh-ins
   * of the last 4 weeks (realDays: the days fully noted), when there are enough; adaptive: the target counts on it
   */
  energy: {
    bmr: number;
    tdee: number;
    targetKcal: number;
    floorApplied: boolean;
    estimatedTdee: number;
    realTdee?: number | null;
    realDays?: number | null;
    adaptive: boolean;
  };
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
  /** the sessions of sport noted (timer, or by hand) */
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
  /** the optional evening weigh-in (1.9) */
  eveningKg?: number;
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

/** 1.13: the health score, out of 10 by halves, with what makes it good and what costs it points (core/meals/health.ts) */
export interface HealthDto {
  score: number;
  pros: string[];
  cons: string[];
}
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
  /** 1.12: a product's picture (through the server), and when Open Food Facts last changed its page */
  imageUrl?: string;
  dataUpdatedAt?: string;
  /** 1.13: the health score; a product's size (« 400 g »), generic name and food group (PNNS, in English) */
  health?: HealthDto | null;
  quantity?: string;
  genericName?: string;
  kind?: string;
  /** measured in millilitres (a drink, a milk, a soup), and the millilitres of its can or bottle */
  liquid?: boolean;
  packageMl?: number;
  /** NOVA group, 1 (raw) to 4 (ultra-processed) */
  nova?: number;
  /** 1.14: vitamins and minerals per 100 g */
  micros?: Partial<Record<string, number>>;
  /** 1.15: the close Ciqual food they were taken from, when the table had none for this one */
  microsFrom?: string;
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
  /** 1.12: a small picture (the recipe's photo, the product's), and what it is (recipe type, Ciqual category) for its emoji */
  thumbUrl?: string;
  group?: string;
  /** 1.13: its health score out of 10, and an amount in millilitres */
  health?: number | null;
  liquid?: boolean;
  /** 1.14: the vitamins and minerals it brings (core/meals/micros.ts keys) */
  micros?: Partial<Record<string, number>>;
}

export interface MealDay {
  day: string;
  targetKcal?: number;
  totals: Nutrients;
  entries: MealEntry[];
  /** 1.14: the vitamins and minerals of the day, and the share of its calories whose are known (0 to 1) */
  micros?: Partial<Record<string, number>>;
  microsCoverage?: number;
}

/** 1.14: the vitamins and minerals of the last days, and those that run low */
export interface MicrosSummary {
  days: number;
  noted: number;
  coverage: number;
  average: Partial<Record<string, number>>;
  low: string[];
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
  /** the foods that brought the most of it over the period (grams) */
  sugarSources?: NutrientSource[];
  saltSources?: NutrientSource[];
  satFatSources?: NutrientSource[];
}

export interface NutrientSource {
  name: string;
  times: number;
  grams: number;
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
  /** known by an estimate (fast food): the rest of the portion, and its estimated Nutri-Score */
  sugarsG?: number | null;
  satFatG?: number | null;
  saltG?: number | null;
  fiberG?: number | null;
  nutriscore?: Grade | null;
  /** 1.13: its estimated health score, out of 10 */
  health?: number | null;
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
  thumbUrl?: string;
  group?: string;
  health?: number | null;
  liquid?: boolean;
}

/** TREAT (1.9): « Plaisir », pastries and treats; HEALTHY (1.13): « Healthy », put first */
export type RecipeType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DESSERT' | 'TREAT' | 'DRINK' | 'HEALTHY';

export interface Recipe {
  id: string;
  name: string;
  /** the main meal it is for, and all of them (the main one first) */
  type: RecipeType;
  types?: RecipeType[];
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
  /** 1.11: a free photo (Wikimedia Commons): who took it, its licence, its page */
  imageCredit?: string;
  imageLicense?: string;
  imageSource?: string;
  /** 1.13: the health score of its dish (none when entered by hand, or with alcohol) */
  health?: HealthDto | null;
  /** 1.14: vitamins and minerals of a serving */
  micros?: Partial<Record<string, number>>;
  /** each line: its calories for the weight, its food's values per 100 g, whether it counts as fruit and vegetables */
  ingredients?: { foodId?: string; name: string; grams: number; kcal: number; per100?: Nutrients; fruitVeg?: boolean; health?: number | null }[];
  createdAt: string;
}

/** who sees a recipe besides its owner: nobody, the friends, every member */
export type RecipeVisibility = 'PRIVATE' | 'FRIENDS' | 'PUBLIC';

export interface RecipeInput {
  name: string;
  type: RecipeType;
  types?: RecipeType[];
  servings: number;
  notes?: string | null;
  visibility: RecipeVisibility;
  ingredients: { foodId: string; grams: number }[];
  /** calories per serving entered by hand, instead of computed from the ingredients */
  manual?: { kcal: number; proteinG?: number | null; carbsG?: number | null; fatG?: number | null } | null;
  ingredientLines?: string[];
  sourceUrl?: string | null;
}

/** 1.10: a recipe that looks like the one being created: where it comes from, how many ingredients they share */
export interface Lookalike {
  recipe: Recipe;
  origin: 'MINE' | 'FRIENDS' | 'COMMUNITY';
  common: number;
}

/** 1.11: the shopping list, by supermarket aisle (in the order they are walked) */
export type Aisle = 'FRUITS_VEGETABLES' | 'BAKERY' | 'BUTCHER' | 'FISHMONGER' | 'DELI' | 'CHEESE' | 'DAIRY' | 'SAVORY' | 'SWEET' | 'DRINKS' | 'FROZEN' | 'OTHER';

export interface ShoppingItem {
  id: string;
  name: string;
  /** for all the recipes added; none: a line typed by hand */
  grams?: number;
  /** G: weighed, ML: a liquid, PIECE: eggs (pieces) */
  unit: 'G' | 'ML' | 'PIECE';
  pieces?: number;
  aisle: Aisle;
  checked: boolean;
  recipes?: string;
}

export interface ShoppingList {
  items: ShoppingItem[];
  recipes: string[];
}

/** 1.11, « Que faire avec ce que j'ai ? »: an ingredient one can choose */
export interface IngredientFamily {
  key: string;
  label: string;
  recipes: number;
}

/** a recipe with some of the chosen ingredients: how many, and what else it needs */
export interface FoundRecipe {
  recipe: Recipe;
  have: number;
  missing: number;
  missingLabels: string[];
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
  /** each ingredient line with the food it most probably is and its weight (when found) */
  matches?: IngredientMatch[];
  /** the recipe's photo, as a data: URL (only from the sites whose photos may be copied) */
  photo?: string;
}

export interface IngredientMatch {
  line: string;
  grams?: number;
  food?: Food;
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

/** where the foods come from (the pages « Produits industriels » and « Aliments bruts ») */
export interface FoodSources {
  ciqualVersion?: string;
  ciqualFoods: number;
  /** when the Ciqual table was last imported or checked */
  ciqualAt?: string;
  /** the local copy of Open Food Facts (none: asked live) */
  offLocalAt?: string;
  offProducts: number;
}

/** favourite foods and recipes, the newest first */
export interface Favorites {
  foods: Food[];
  recipes: Recipe[];
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
