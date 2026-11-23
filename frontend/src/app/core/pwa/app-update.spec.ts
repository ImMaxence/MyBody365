import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { TodoStore } from '../support/support-api';
import { AppUpdate } from './app-update';

/** the service worker as the app sees it: versions announced by hand */
class FakeWorker {
  readonly isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<unknown>();
  checks = 0;
  checkForUpdate(): Promise<boolean> {
    this.checks++;
    return Promise.resolve(false);
  }
  activateUpdate(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('AppUpdate (a new version while the app stays open, 1.20.2)', () => {
  let worker: FakeWorker;
  let update: AppUpdate;
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');

  beforeEach(() => {
    // the app in front: a new version waits to be asked for, nothing reloads by itself
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    worker = new FakeWorker();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SwUpdate, useValue: worker }] });
    update = TestBed.inject(AppUpdate);
    update.start();
  });

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>)['visibilityState'];
    if (visibility) Object.defineProperty(Document.prototype, 'visibilityState', visibility);
  });

  it('says a downloaded version: ready, and the red dot on the Profile tab', () => {
    const todo = TestBed.inject(TodoStore);
    expect(update.ready()).toBe(false);
    expect(todo.profile()).toBe(false);
    worker.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(update.ready()).toBe(false);
    worker.versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    expect(update.ready()).toBe(true);
    expect(todo.profile()).toBe(true);
  });

  it('looks again when the Profile opens, at most every 2 minutes, and no more once one is ready', () => {
    update.checkSoon();
    update.checkSoon();
    expect(worker.checks).toBe(1);
    worker.versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    (update as unknown as { asked: number }).asked = 0;
    update.checkSoon();
    expect(worker.checks).toBe(1);
  });
});
