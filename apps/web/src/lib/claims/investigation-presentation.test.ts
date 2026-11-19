import { describe, expect, it } from 'vitest';
import {
  evidenceAnchor,
  examinerExecutionLabel,
  resolveEvidenceTargets,
} from './investigation-presentation';

describe('claims investigation presentation', () => {
  const current = { id: 'current', kind: 'verification', label: 'Verifier record' };
  const stale = { id: 'stale', kind: 'verification', label: 'Verifier record', stale: true };
  const proof = { id: 'proof', kind: 'record', label: 'Proof submission' };

  it('resolves citations to exact same-case records and preserves stale status', () => {
    expect(
      resolveEvidenceTargets(['proof', 'current', 'stale', 'proof'], [current, stale, proof]),
    ).toEqual([proof, current, stale]);
    expect(resolveEvidenceTargets(['proof', 'current'], [current, proof], 'verification')).toEqual([
      null,
      current,
    ]);
    expect(evidenceAnchor('verification', current.id)).not.toBe(
      evidenceAnchor('manifest', current.id),
    );
  });

  it('does not expose unavailable, ambiguous, malformed or external references', () => {
    expect(
      resolveEvidenceTargets(
        ['another-case', 'https://example.org', null, 'current'],
        [current, current],
      ),
    ).toEqual([null, null, null, null]);
    expect(resolveEvidenceTargets(undefined, [current])).toEqual([]);
  });

  it('labels live inference only using explicit recorded execution and provider', () => {
    expect(examinerExecutionLabel('live', 'openai')).toContain('LIVE OPENAI');
    expect(examinerExecutionLabel('test_double', 'openai')).toContain('TEST DOUBLE');
    for (const [execution, provider] of [
      [undefined, 'openai'],
      ['live', undefined],
      ['unknown', 'openai'],
    ])
      expect(examinerExecutionLabel(execution, provider)).toBe('Examiner source unavailable');
  });
});
