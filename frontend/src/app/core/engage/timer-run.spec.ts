import { TestBed } from '@angular/core/testing';
import { EngageApi, TimerAlert } from './engage-api';
import { TimerRun } from './timer-run';

describe('TimerRun (the workout timer, for the whole app)', () => {
  const T0 = new Date('2026-11-17T18:00:00Z').getTime();
  let api: { timerAlerts: ReturnType<typeof vi.fn>; cancelTimerAlerts: ReturnType<typeof vi.fn> };

  function visibility(state: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function fresh(): TimerRun {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: EngageApi, useValue: api }] });
    return TestBed.inject(TimerRun);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    localStorage.removeItem('mb-timer-run');
    api = { timerAlerts: vi.fn().mockResolvedValue(undefined), cancelTimerAlerts: vi.fn().mockResolvedValue(undefined) };
    visibility('visible');
  });

  afterEach(() => {
    TestBed.inject(TimerRun).stop();
    vi.useRealTimers();
  });

  it('goes through ready, efforts and rests on the real clock', () => {
    const run = fresh();
    run.start({ work: 20, rest: 10, rounds: 2 });
    expect([run.phase(), run.shown()]).toEqual(['prep', 5]);
    vi.advanceTimersByTime(5_000);
    expect([run.phase(), run.round(), run.shown()]).toEqual(['work', 1, 20]);
    vi.advanceTimersByTime(20_000);
    expect(run.phase()).toBe('rest');
    // paused: the clock no longer runs
    run.toggle();
    vi.advanceTimersByTime(60_000);
    expect([run.state(), run.phase(), run.shown()]).toEqual(['paused', 'rest', 10]);
    run.toggle();
    vi.advanceTimersByTime(10_000);
    expect([run.phase(), run.round()]).toEqual(['work', 2]);
    vi.advanceTimersByTime(20_000);
    expect(run.state()).toBe('done');
  });

  it('off screen, hands the coming changes to the server, and takes them back on return', () => {
    const run = fresh();
    run.start({ work: 20, rest: 10, rounds: 2 });
    visibility('hidden');
    expect(api.timerAlerts).toHaveBeenCalledTimes(1);
    const alerts = api.timerAlerts.mock.calls[0][0] as TimerAlert[];
    expect(alerts.map((a) => [a.phase, a.round, (new Date(a.at).getTime() - T0) / 1000])).toEqual([
      ['WORK', 1, 5],
      ['REST', 1, 25],
      ['WORK', 2, 35],
      ['DONE', 2, 55],
    ]);
    // the phone stopped the page for 40 s (locked screen): on return, exactly where it should be
    vi.setSystemTime(T0 + 40_000);
    visibility('visible');
    expect(api.cancelTimerAlerts).toHaveBeenCalledTimes(1);
    expect([run.phase(), run.round(), run.shown()]).toEqual(['work', 2, 15]);
  });

  it('survives the app being closed by the system', () => {
    const first = fresh();
    first.start({ work: 30, rest: 0, rounds: 3 });
    // the app is reopened 50 s later: 5 s of ready, a first effort of 30 s, 15 s into the second
    vi.setSystemTime(T0 + 50_000);
    const again = fresh();
    expect([again.state(), again.phase(), again.round(), again.shown()]).toEqual(['running', 'work', 2, 15]);
    // long after its end: done, then forgotten after three hours
    vi.setSystemTime(T0 + 4 * 3600_000);
    expect(fresh().state()).toBe('idle');
  });
});
