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
import { FriendsStore } from './friends/friends.store';
import { ShoppingStore } from './meals/shopping.store';
import { HealthStore } from './health/health.store';

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
  private readonly friends = inject(FriendsStore);
  private readonly shopping = inject(ShoppingStore);
  private readonly health = inject(HealthStore);

  clear(): void {
    this.tracking.clear();
    this.photos.clear();
    this.meals.clear();
    this.todo.clear();
    // signed out: what was noted offline is not sent for anyone else
    this.outbox.clear();
    void this.photos.queue.clear();
    this.timer.stop();
    this.recipesView.clear();
    this.water.clear();
    this.favorites.clear();
    this.friends.clear();
    this.shopping.clear();
    this.health.clear();
    this.outbox.setOwner(null);
  }
}
