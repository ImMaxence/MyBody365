import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { Food } from '../../core/api/models';
import { MealsStore } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { BarcodeScannerComponent } from './barcode-scanner.component';

/** The scanner as a page of its own: the product found goes back to the add screen, ready for its amount. */
@Component({
  selector: 'app-barcode-scan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarcodeScannerComponent],
  template: `
    <main>
      <app-barcode-scanner [level]="1" (found)="found($event)" (closed)="close()" />
    </main>
  `,
})
export class BarcodeScanPage {
  private readonly store = inject(MealsStore);
  private readonly stack = inject(StackNavigation);

  protected found(food: Food): void {
    this.store.pick.set({ kind: 'FOOD', id: food.id });
    this.stack.back('/app/meals/add');
  }

  protected close(): void {
    this.stack.back('/app/meals/add');
  }
}
