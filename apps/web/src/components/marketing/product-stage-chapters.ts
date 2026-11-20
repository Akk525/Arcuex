export const PRODUCT_STAGE_CHAPTERS = [
  {
    id: 'procure',
    title: 'Procure coverage',
    body: 'Agents and owners request priced terms against published products.',
    vignette: 'procure' as const,
  },
  {
    id: 'bind',
    title: 'Delegate and bind',
    body: 'A checked delegation may quote and bind inside its limit and premium allowance. Checkout waits for the policyholder wallet.',
    vignette: 'bind' as const,
  },
  {
    id: 'evidence',
    title: 'Exchange evidence',
    body: 'The case asks the agent for specific records. Review waits until that exchange is complete or the window closes.',
    vignette: 'evidence' as const,
  },
  {
    id: 'review',
    title: 'Human review',
    body: 'A person reads the file and any advisory note, then decides. AI advice never authorizes a payout.',
    vignette: 'review' as const,
  },
  {
    id: 'settlement',
    title: 'Settlement',
    body: 'A reviewer can approve the claim. Approved ≠ paid. On the live path, settlement still requires wallet confirmation.',
    vignette: 'settlement' as const,
  },
] as const;

export type ProductStageChapter = (typeof PRODUCT_STAGE_CHAPTERS)[number];
export type ProductStageVignette = ProductStageChapter['vignette'];

export function chapterIndexForProgress(progress: number): number {
  const n = PRODUCT_STAGE_CHAPTERS.length;
  const p = Math.min(1, Math.max(0, progress));
  return Math.min(n - 1, Math.floor(p * n));
}
