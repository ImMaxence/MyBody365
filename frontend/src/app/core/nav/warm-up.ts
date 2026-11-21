import { inject } from '@angular/core';
import { TABS } from '../../app.tabs';
import { SessionStore } from '../auth/session.store';
import { FriendsStore } from '../friends/friends.store';
import { MealsStore } from '../meals/meals.store';
import { PhotosStore } from '../photos/photos.store';
import { TrackingStore } from '../tracking/tracking.store';
import { WaterStore } from '../tracking/water.store';
import { holdSplash } from '../ui/boot-splash';

/**
 * 1.16: while the logo is on screen at start, the five tabs' code and what they show are loaded, so that each tab opens
 * on its content instead of waiting for it. The logo waits for the tabs, Today's summary, meals and friends (a little
 * longer at most, core/ui/boot-splash.ts); the photos, the curve and the glasses come behind. To call in an injection
 * context, in the browser, once signed in.
 */
export function warmUp(): void {
  const tracking = inject(TrackingStore);
  const meals = inject(MealsStore);
  const friends = inject(FriendsStore);
  const photos = inject(PhotosStore);
  const water = inject(WaterStore);
  const session = inject(SessionStore);
  const tabs = Object.values(TABS).map((load) => load().catch(() => undefined));
  holdSplash(Promise.allSettled([...tabs, tracking.ensure(), meals.ensureToday(), friends.ensure()]));
  void photos.ensureFresh().catch(() => undefined);
  void tracking.ensureLogs().catch(() => undefined);
  if (session.account()?.waterGoal) water.load();
}
