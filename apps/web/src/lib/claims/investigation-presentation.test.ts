import { describe, expect, it } from 'vitest';
import {
  evidenceAnchor,
  groupTimelineDays,
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

  it('groups timeline instants by UTC without changing the persisted event order', () => {
    const steps = [
      { time: '2026-11-18T23:40:00-01:00', id: 'one' },
      { time: '2026-11-19T00:40:00Z', id: 'two' },
      { time: '2026-11-20T00:00:00Z', id: 'next' },
      { time: 'unknown', id: 'unknown' },
    ];
    expect([...groupTimelineDays(steps)]).toEqual([
      ['2026-11-19', steps.slice(0, 2)],
      ['2026-11-20', steps.slice(2, 3)],
      ['', steps.slice(3)],
    ]);
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
