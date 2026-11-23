import { TestBed } from '@angular/core/testing';
import { I18nService } from '../i18n/i18n.service';
import { challengeDay, challengeStanding } from './challenge-text';
import type { Challenge, ChallengeMember } from './friends-api';

function member(name: string, done: number, rank: number, me = false, status: ChallengeMember['status'] = 'JOINED'): ChallengeMember {
  return { id: name, name, status, me, done, days: [], rank };
}

function challenge(members: ChallengeMember[], ended = false): Challenge {
  return { id: 'c', kind: 'WEIGH', startDay: '2026-11-12', endDay: '2026-11-18', length: 7, elapsed: 3, ended, owner: true, ownerName: 'Léa', myStatus: 'JOINED', members };
}

describe('challenge texts', () => {
  let i18n: I18nService;
  // 1.20: the app's texts are a file of their own, loaded as the app opens
  beforeEach(async () => {
    i18n = TestBed.inject(I18nService);
    await i18n.loadApp('fr');
  });

  it('says where I stand while it goes on, the ties sharing a rank', () => {
    expect(challengeDay(challenge([]), i18n)).toBe('Jour 3 sur 7');
    expect(challengeStanding(challenge([member('Léa', 3, 1, true), member('Hugo', 2, 2)]), i18n)).toBe('Tu es en tête');
    expect(challengeStanding(challenge([member('Hugo', 3, 1), member('Léa', 2, 2, true), member('Inès', 2, 2)]), i18n)).toBe('Tu es 2e sur 3');
    // alone so far (the others invited): nothing to compare
    expect(challengeStanding(challenge([member('Léa', 3, 1, true), member('Hugo', 0, 0, false, 'INVITED')]), i18n)).toBe('');
  });

  it('says who won once it is over, ties included', () => {
    expect(challengeStanding(challenge([member('Léa', 7, 1, true), member('Hugo', 5, 2)], true), i18n)).toBe('Tu gagnes avec 7 jours sur 7');
    expect(challengeStanding(challenge([member('Hugo', 6, 1), member('Léa', 5, 2, true)], true), i18n)).toBe('Hugo gagne avec 6 jours sur 7');
    expect(challengeStanding(challenge([member('Hugo', 6, 1), member('Léa', 6, 1, true)], true), i18n)).toBe('Ex æquo à 6 jours sur 7 : Hugo, toi');
  });
});
