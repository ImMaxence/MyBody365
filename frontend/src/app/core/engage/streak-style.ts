/**
 * The streak's own look (1.8): an icon and a colour chosen by the member, the flame in orange unless changed. The
 * icons are emoji (drawn by the phone itself: a real flame, a real flexed arm); the colour tints the tile under it
 * and its glow. The keys are the server's (MeController.STREAK_ICONS, STREAK_COLORS).
 */
export const STREAK_ICONS = [
  { key: 'flame', emoji: '🔥' },
  { key: 'muscle', emoji: '💪' },
  { key: 'bolt', emoji: '⚡' },
  { key: 'star', emoji: '⭐' },
  { key: 'trophy', emoji: '🏆' },
  { key: 'heart', emoji: '❤️' },
  { key: 'rocket', emoji: '🚀' },
  { key: 'diamond', emoji: '💎' },
  { key: 'sprout', emoji: '🌱' },
  { key: 'medal', emoji: '🥇' },
  { key: 'crown', emoji: '👑' },
  { key: 'sun', emoji: '☀️' },
  { key: 'runner', emoji: '🏃' },
  { key: 'apple', emoji: '🍎' },
] as const;

/** each colour: the tile's gradient (from, to) and its glow */
export const STREAK_COLORS = [
  { key: 'orange', from: '#ff6a2b', to: '#ffb03b', glow: 'rgba(255, 106, 43, 0.45)' },
  { key: 'red', from: '#e5233b', to: '#ff6b5b', glow: 'rgba(229, 35, 59, 0.42)' },
  { key: 'pink', from: '#e93d8f', to: '#ff8ac0', glow: 'rgba(233, 61, 143, 0.42)' },
  { key: 'violet', from: '#7b4dff', to: '#b48cff', glow: 'rgba(123, 77, 255, 0.42)' },
  { key: 'blue', from: '#2563eb', to: '#5ea8ff', glow: 'rgba(37, 99, 235, 0.42)' },
  { key: 'cyan', from: '#0aa5b8', to: '#4fe0d2', glow: 'rgba(10, 165, 184, 0.42)' },
  { key: 'green', from: '#16a34a', to: '#7bd96a', glow: 'rgba(22, 163, 74, 0.42)' },
  { key: 'gold', from: '#d99a06', to: '#ffd84d', glow: 'rgba(217, 154, 6, 0.42)' },
] as const;

export type StreakIcon = (typeof STREAK_ICONS)[number]['key'];
export type StreakColor = (typeof STREAK_COLORS)[number]['key'];

export function streakEmoji(icon?: string | null): string {
  return STREAK_ICONS.find((i) => i.key === icon)?.emoji ?? '🔥';
}

/** the CSS variables of a colour: --st-from, --st-to, --st-glow */
export function streakTint(color?: string | null): Record<string, string> {
  const c = STREAK_COLORS.find((x) => x.key === color) ?? STREAK_COLORS[0];
  return { '--st-from': c.from, '--st-to': c.to, '--st-glow': c.glow };
}
