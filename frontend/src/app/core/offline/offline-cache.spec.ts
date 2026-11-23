import { HttpClient, HttpErrorResponse, HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { KEPT_HEADER, Network, networkInterceptor } from './network';
import { OfflineCache, keptAt, offlineCacheInterceptor, unreachable } from './offline-cache';

describe('offline (1.18): the answers kept on the phone, and the log of the network', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let cache: OfflineCache;
  let network: Network;

  beforeEach(() => {
    localStorage.removeItem('mb.netlog');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([offlineCacheInterceptor, networkInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    cache = TestBed.inject(OfflineCache);
    network = TestBed.inject(Network);
    cache.setOwner('lea');
  });

  afterEach(() => backend.verify());

  it('gives the last answer back when the request never gets through, and says the network is away', async () => {
    const first = firstValueFrom(http.get<{ kg: number }>('/api/me/summary'));
    backend.expectOne('/api/me/summary').flush({ kg: 81.2 });
    expect(await first).toEqual({ kg: 81.2 });
    expect(network.online()).toBe(true);

    const again = firstValueFrom(http.get<{ kg: number }>('/api/me/summary', { observe: 'response' }));
    backend.expectOne('/api/me/summary').error(new ProgressEvent('error'), { status: 0 });
    const r = (await again) as HttpResponse<{ kg: number }>;
    expect(r.body).toEqual({ kg: 81.2 });
    expect(keptAt(r)).toBeGreaterThan(0);
    expect(r.headers.get(KEPT_HEADER)).toBeTruthy();
    // the failure still told the app it is offline, since when, and the log has it
    expect(network.online()).toBe(false);
    expect(network.since()).not.toBeNull();
    expect(network.log().at(-1)?.kind).toBe('lost');
  });

  it('fails as before with nothing kept, and never keeps another account’s answer for this one', async () => {
    const first = firstValueFrom(http.get('/api/me/water/2026-11-23'));
    backend.expectOne('/api/me/water/2026-11-23').flush({ glasses: 3 });
    await first;
    cache.setOwner('max');
    const other = firstValueFrom(http.get('/api/me/water/2026-11-23'));
    backend.expectOne('/api/me/water/2026-11-23').error(new ProgressEvent('error'), { status: 0 });
    await expect(other).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('keeps no admin page, and lets a refusal of the server through', async () => {
    const admin = firstValueFrom(http.get('/api/admin/summary'));
    backend.expectOne('/api/admin/summary').flush({ pending: 1 });
    await admin;
    const again = firstValueFrom(http.get('/api/admin/summary'));
    backend.expectOne('/api/admin/summary').error(new ProgressEvent('error'), { status: 0 });
    await expect(again).rejects.toBeInstanceOf(HttpErrorResponse);

    const meals = firstValueFrom(http.get('/api/me/meals/2026-11-23'));
    backend.expectOne('/api/me/meals/2026-11-23').flush({ entries: [] });
    await meals;
    const refused = firstValueFrom(http.get('/api/me/meals/2026-11-23'));
    backend.expectOne('/api/me/meals/2026-11-23').flush({ message: 'not_found' }, { status: 404, statusText: 'Not Found' });
    await expect(refused).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('forgets a loss of a few seconds, and writes down a longer one with its return', () => {
    network.unreachable();
    network.reachable();
    expect(network.log()).toHaveLength(0);
    expect(network.backAt()).toBeNull();

    const t = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(t);
    network.unreachable();
    vi.spyOn(Date, 'now').mockReturnValue(t + 12 * 60_000);
    network.reachable();
    network.noteSent(3);
    const back = network.log().at(-1)!;
    expect(back.kind).toBe('back');
    expect(back.since).toBe(t);
    expect(back.sent).toBe(3);
    expect(network.backAt()).toBe(t + 12 * 60_000);
    expect(JSON.parse(localStorage.getItem('mb.netlog')!)).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it('goes on with a loss left open by an earlier start, and closes it at the first answer when started online', () => {
    const at = Date.now() - 3_600_000;
    localStorage.setItem('mb.netlog', JSON.stringify([{ kind: 'lost', at }]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fresh = TestBed.inject(Network);
    // started online (the test's browser says so): the first answer closes it, said as seen when the app was opened again
    fresh.reachable();
    const back = fresh.log().at(-1)!;
    expect(back).toEqual(expect.objectContaining({ kind: 'back', since: at, late: true }));
    // lost again: a loss of its own
    fresh.unreachable();
    expect(fresh.log().filter((e) => e.kind === 'lost')).toHaveLength(2);
    expect(fresh.since()).toBeGreaterThan(at);
  });

  it('tells a request that never got through from one the server refused', () => {
    expect(unreachable(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(unreachable(new HttpErrorResponse({ status: 502 }))).toBe(true);
    expect(unreachable(new HttpErrorResponse({ status: 404 }))).toBe(false);
    expect(unreachable(new HttpErrorResponse({ status: 401 }))).toBe(false);
  });
});
