import { describe, expect, it } from 'vitest';
import { PRODUCT_STAGE_CHAPTERS, chapterIndexForProgress } from './product-stage-chapters';

describe('product stage chapters', () => {
  it('defines five sequential chapters', () => {
    expect(PRODUCT_STAGE_CHAPTERS).toHaveLength(5);
    expect(PRODUCT_STAGE_CHAPTERS.map((c) => c.vignette)).toEqual([
      'procure',
      'bind',
      'evidence',
      'review',
      'settlement',
    ]);
  });

  it('maps scroll progress 0..1 to chapter indices', () => {
    expect(chapterIndexForProgress(0)).toBe(0);
    expect(chapterIndexForProgress(0.49)).toBe(2);
    expect(chapterIndexForProgress(1)).toBe(4);
  });

  it('states that settlement approval is not payment', () => {
    const settlement = PRODUCT_STAGE_CHAPTERS.find((chapter) => chapter.vignette === 'settlement');
    expect(settlement?.body).toContain('Approved ≠ paid');
    expect(settlement?.body).toContain('wallet confirmation');
    expect(settlement?.body.toLowerCase()).toContain('live path');
  });
});
