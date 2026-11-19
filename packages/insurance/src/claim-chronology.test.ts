import { describe, expect, it } from 'vitest';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import {
  computeClaimChronology,
  isWithinClaimWindow,
  parseClaimTimestamp,
  readClaimPolicyWindow,
} from './claim-chronology';

const start = Date.parse('2026-11-19T19:37:14.000Z');
const end = start + 86_400_000;
const window = {
  source: 'procurement_terms' as const,
  start: start / 1000,
  end: end / 1000,
  waitingSeconds: 0,
};

describe('server claim chronology', () => {
  it.each([
    [start - 1, 'before_inception', false],
    [start, 'at_inception', true],
    [start + 241_431, 'during_coverage', true],
    [end, 'at_expiry', true],
    [end + 1, 'after_expiry', false],
  ] as const)('classifies %s as %s at millisecond precision', (epochMs, relation, inWindow) => {
    const raw = new Date(epochMs).toISOString();
    const result = computeClaimChronology(
      'policy',
      window,
      { id: 'incident', source: 'intake', raw },
      true,
    );
    expect(result).toMatchObject({
      relation,
      issue: null,
      boundary: 'inclusive',
      startsAt: { raw: start / 1000, epochMs: start },
      incident: { raw, epochMs, source: 'intake' },
    });
    expect(isWithinClaimWindow(result, end + 1000)).toBe(inWindow);
    expect(isWithinClaimWindow(result, epochMs - 1)).toBe(false);
  });
  it('normalizes offsets without dropping timestamp provenance or legacy milliseconds', () => {
    const raw = '2026-11-19T13:41:15.431-06:00';
    const result = computeClaimChronology(
      'policy',
      {
        source: 'legacy_terms',
        start: '2026-11-19T19:41:15.430Z',
        end: '2026-11-19T19:41:15.431Z',
        waitingSeconds: 1,
      },
      { id: 'incident', source: 'intake', raw },
      true,
    );
    expect(result).toMatchObject({
      incident: { raw, epochMs: Date.parse('2026-11-19T19:41:15.431Z') },
      relation: 'at_expiry',
      waitingPeriodSatisfied: false,
    });
    expect(isWithinClaimWindow(result, end)).toBe(true);
  });
  it.each([
    null,
    '2026-11-19',
    '2026-11-19T13:41:15.431',
    '2026-11-19T19:41:15-00:00',
    '2026-11-19T19:41:15+24:00',
    '2026-11-19T19:41:15+06:60',
    '2026-02-30T19:41:15Z',
    '2026-11-19T19:41:15.4311Z',
    '2026-11-19T24:00:00Z',
  ])('rejects ambiguous, invalid or unsupported timestamps %s', (raw) => {
    expect(parseClaimTimestamp(raw)).toBeNull();
    const result = computeClaimChronology(
      'policy',
      window,
      { id: 'incident', source: 'intake', raw },
      true,
    );
    expect(result.relation).toBe('unresolved');
    expect(result.issue).toBe(
      raw === null ? 'missing_incident_timestamp' : 'invalid_incident_timestamp',
    );
  });
  it('fails closed on missing policy time, unlinked observations and ambiguous policy sources', () => {
    const observation = { id: 'incident', source: 'intake', raw: new Date(start).toISOString() };
    expect(
      computeClaimChronology('policy', { ...window, end: null }, observation, true).issue,
    ).toBe('missing_policy_timestamp');
    expect(
      computeClaimChronology('policy', { ...window, end: window.start }, observation, true).issue,
    ).toBe('invalid_policy_window');
    expect(computeClaimChronology('policy', window, observation, false).issue).toBe(
      'unlinked_incident',
    );
    const db = openDatabase();
    const repo = new InsuranceRepository(db);
    const existing = {} as NonNullable<ReturnType<typeof repo.getProcurementPolicy>>;
    const legacy = {} as NonNullable<ReturnType<typeof repo.getPolicy>>;
    repo.getProcurementPolicy = () => existing;
    repo.getPolicy = () => legacy;
    expect(
      computeClaimChronology('policy', readClaimPolicyWindow(repo, 'policy'), observation, true),
    ).toMatchObject({ relation: 'unresolved', issue: 'ambiguous_policy' });
    db.close();
  });
});
