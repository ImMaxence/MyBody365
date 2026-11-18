import { Injectable, inject } from '@angular/core';
import { MealsStore } from './meals/meals.store';
import { PhotosStore } from './photos/photos.store';
import { TodoStore } from './support/support-api';
import { TrackingStore } from './tracking/tracking.store';
import { Outbox } from './offline/outbox';
import { TimerRun } from './engage/timer-run';
import { RecipesView } from './meals/recipes-view';
import { WaterStore } from './tracking/water.store';
import { FavoritesStore } from './meals/favorites.store';

/** Forgets everything loaded for the signed-in account (sign-out, account deleted). */
@Injectable({ providedIn: 'root' })
export class UserDataService {
  private readonly tracking = inject(TrackingStore);
  private readonly photos = inject(PhotosStore);
  private readonly meals = inject(MealsStore);
  private readonly todo = inject(TodoStore);
  private readonly outbox = inject(Outbox);
  private readonly timer = inject(TimerRun);
  private readonly recipesView = inject(RecipesView);
  private readonly water = inject(WaterStore);
  private readonly favorites = inject(FavoritesStore);

  clear(): void {
    this.tracking.clear();
    this.photos.clear();
    this.meals.clear();
    this.todo.clear();
    // signed out: what was noted offline is not sent for anyone else
    this.outbox.clear();
    this.timer.stop();
    this.recipesView.clear();
    this.water.clear();
    this.favorites.clear();
    this.outbox.setOwner(null);
  }
}
