import { Injectable, inject } from '@angular/core';
import { MealsStore } from './meals/meals.store';
import { PhotosStore } from './photos/photos.store';
import { TrackingStore } from './tracking/tracking.store';

/** Forgets everything loaded for the signed-in account (sign-out, account deleted). */
@Injectable({ providedIn: 'root' })
export class UserDataService {
  private readonly tracking = inject(TrackingStore);
  private readonly photos = inject(PhotosStore);
  private readonly meals = inject(MealsStore);

  clear(): void {
    this.tracking.clear();
    this.photos.clear();
    this.meals.clear();
  }
}
