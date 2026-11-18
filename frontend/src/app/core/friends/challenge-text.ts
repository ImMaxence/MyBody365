import type { I18nService } from '../i18n/i18n.service';
import type { Challenge } from './friends-api';

/**
 * Where a challenge stands, in words (1.9): « Tu es en tête », « Tu es 2e sur 3 » while it goes on; who won once it is
 * over (« Tu gagnes avec 7 jours sur 7 », « Léa gagne… », a tie). Empty for an invitation not answered yet.
 */
export function challengeStanding(c: Challenge, i18n: I18nService): string {
  const joined = c.members.filter((m) => m.status === 'JOINED');
  const me = joined.find((m) => m.me);
  if (!joined.length || !me) return '';
  if (c.ended) {
    const best = joined.filter((m) => m.rank === 1);
    const done = best[0].done;
    if (best.length > 1) return i18n.t('friends.challenges.tie', { done, total: c.length, names: best.map((m) => (m.me ? i18n.t('friends.challenges.you') : m.name)).join(', ') });
    return best[0].me ? i18n.t('friends.challenges.youWon', { done, total: c.length }) : i18n.t('friends.challenges.winner', { name: best[0].name, done, total: c.length });
  }
  if (joined.length < 2) return '';
  return me.rank === 1 ? i18n.t('friends.challenges.leader') : i18n.t('friends.challenges.rank', { n: me.rank, total: joined.length });
}

/** « Jour 3 sur 7 », or « Commence aujourd’hui » the first day before anything is done */
export function challengeDay(c: Challenge, i18n: I18nService): string {
  return i18n.t('friends.challenges.dayOf', { n: Math.max(1, c.elapsed), total: c.length });
}
