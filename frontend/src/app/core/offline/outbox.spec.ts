import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Outbox } from './outbox';

describe('Outbox (noted without network)', () => {
  let outbox: Outbox;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('mb.outbox');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    outbox = TestBed.inject(Outbox);
    http = TestBed.inject(HttpTestingController);
  });

  it('keeps every meal, and only the last weigh-in and glasses of a day', () => {
    outbox.add({ kind: 'meal', method: 'POST', url: '/api/me/meals', body: { a: 1 }, day: '2026-11-17' });
    outbox.add({ kind: 'meal', method: 'POST', url: '/api/me/meals', body: { a: 2 }, day: '2026-11-17' });
    outbox.add({ kind: 'water', method: 'PUT', url: '/api/me/water/2026-11-17', body: { glasses: 2 }, day: '2026-11-17' });
    outbox.add({ kind: 'water', method: 'PUT', url: '/api/me/water/2026-11-17', body: { glasses: 3 }, day: '2026-11-17' });
    expect(outbox.pending().map((p) => p.kind)).toEqual(['meal', 'meal', 'water']);
    expect(outbox.pending()[2].body).toEqual({ glasses: 3 });
    // kept on the phone
    expect(JSON.parse(localStorage.getItem('mb.outbox')!)).toHaveLength(3);
  });

  it('sends in order once the account is known, and never what another account left', async () => {
    outbox.add({ kind: 'meal', method: 'POST', url: '/api/me/meals', body: { a: 1 }, day: '2026-11-17' });
    // noted while signed out (no owner): another account signs in, it is dropped
    outbox.setOwner('lea');
    expect(outbox.pending()).toHaveLength(0);
    outbox.add({ kind: 'meal', method: 'POST', url: '/api/me/meals', body: { a: 2 }, day: '2026-11-17' });
    outbox.add({ kind: 'weigh', method: 'PUT', url: '/api/me/logs/2026-11-17', body: { weightKg: 70 }, day: '2026-11-17' });
    const sent: string[] = [];
    outbox.sent.subscribe((p) => sent.push(p.kind));
    const done = outbox.flush();
    http.expectOne('/api/me/meals').flush({});
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/me/logs/2026-11-17').flush({});
    await done;
    expect(sent).toEqual(['meal', 'weigh']);
    expect(outbox.pending()).toHaveLength(0);
  });

  it('stops while the network is away, drops what the server refuses', async () => {
    outbox.setOwner('lea');
    outbox.add({ kind: 'meal', method: 'POST', url: '/api/me/meals', body: { a: 1 }, day: '2026-11-17' });
    let done = outbox.flush();
    http.expectOne('/api/me/meals').error(new ProgressEvent('error'), { status: 0 });
    await done;
    expect(outbox.pending()).toHaveLength(1);
    const refused: string[] = [];
    outbox.refused.subscribe((p) => refused.push(p.kind));
    done = outbox.flush();
    http.expectOne('/api/me/meals').flush({ message: 'invalid_day' }, { status: 400, statusText: 'Bad Request' });
    await done;
    expect(refused).toEqual(['meal']);
    expect(outbox.pending()).toHaveLength(0);
  });
});
