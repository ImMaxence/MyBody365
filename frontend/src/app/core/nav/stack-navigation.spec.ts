import { ActivatedRouteSnapshot } from '@angular/router';
import { depthOf, navKind } from './stack-navigation';

/** a chain of route snapshots, root first, each with its data */
function chain(...data: Record<string, unknown>[]): ActivatedRouteSnapshot {
  const nodes = data.map((d) => ({ data: d, firstChild: null, parent: null }) as unknown as ActivatedRouteSnapshot);
  nodes.forEach((n, i) => {
    Object.assign(n, { firstChild: nodes[i + 1] ?? null, parent: nodes[i - 1] ?? null });
  });
  return nodes[0];
}

describe('stack navigation', () => {
  it('reads the depth of the deepest route that declares one', () => {
    expect(depthOf(chain({}, {}, { depth: 0 }))).toBe(0);
    expect(depthOf(chain({}, {}, { depth: 1, back: '/app/account' }))).toBe(1);
    // admin tabs inherit the depth of the admin screen
    expect(depthOf(chain({}, {}, { depth: 1 }, {}))).toBe(1);
    expect(depthOf(chain({}, {}))).toBe(0);
  });

  it('pushes deeper screens, pops back, fades between tabs', () => {
    expect(navKind(0, 1)).toBe('push');
    expect(navKind(1, 0)).toBe('pop');
    expect(navKind(0, 0)).toBe('fade');
    expect(navKind(1, 1)).toBe('fade');
  });
});
