import { NO_EDIT, applyFilters, changed, clampZoom, cssFilter } from './photo-edit';

describe('photo touch-ups (1.16)', () => {
  it('says when there is something to save', () => {
    expect(changed(NO_EDIT)).toBe(false);
    // a background alone shows nowhere while the photo covers the frame
    expect(changed({ ...NO_EDIT, background: 'white' })).toBe(false);
    expect(changed({ ...NO_EDIT, turn: 1 })).toBe(true);
    expect(changed({ ...NO_EDIT, zoom: 0.5 })).toBe(true);
    expect(clampZoom(0.01)).toBe(0.3);
    expect(clampZoom(9)).toBe(4);
  });

  it('filters the saved pixels as the preview shows them (CSS filters)', () => {
    expect(cssFilter(NO_EDIT)).toBe('none');
    expect(cssFilter({ ...NO_EDIT, brightness: 1.2 })).toBe('brightness(1.2) contrast(1) saturate(1)');
    const px = () => new Uint8ClampedArray([100, 150, 200, 255, 0, 0, 0, 128]);
    // unchanged: nothing moves
    const same = px();
    applyFilters(same, NO_EDIT);
    expect([...same]).toEqual([...px()]);
    // brighter by a fifth, alpha untouched
    const bright = px();
    applyFilters(bright, { ...NO_EDIT, brightness: 1.2 });
    expect([...bright]).toEqual([120, 180, 240, 255, 0, 0, 0, 128]);
    // more contrast: away from the middle grey, clamped
    const contrast = px();
    applyFilters(contrast, { ...NO_EDIT, contrast: 1.5 });
    expect([...contrast.slice(0, 3)]).toEqual([86, 161, 236]);
    // no colour at all: the grey of the CSS matrix
    const grey = px();
    applyFilters(grey, { ...NO_EDIT, saturation: 0 });
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    expect(grey[0]).toBe(Math.round(0.213 * 100 + 0.715 * 150 + 0.072 * 200));
  });
});

describe('the whole photo in the frame (1.17)', () => {
  it('needs less than the smallest usual size for a very wide photo', async () => {
    const { fitZoom, clampZoom, ZOOM_MIN } = await import('./photo-edit');
    // a 3 by 4 photo upright already fits
    expect(fitZoom(1200, 1600, 0, 0)).toBe(1);
    // a 4 by 3 one: (3/4) / (4/3) of the cover size
    expect(fitZoom(1600, 1200, 0, 0)).toBeCloseTo(0.5625, 3);
    // turned a quarter, it is 3 by 4 again
    expect(fitZoom(1600, 1200, 1, 0)).toBe(1);
    // a panorama, 3 to 1: under the 30 % of the slider, which then goes lower for it
    const pano = fitZoom(3000, 1000, 0, 0);
    expect(pano).toBeLessThan(ZOOM_MIN);
    expect(clampZoom(0.01, pano)).toBe(pano);
    // straightened, it needs a little less
    expect(fitZoom(1200, 1600, 0, 10)).toBeLessThan(1);
  });
});
