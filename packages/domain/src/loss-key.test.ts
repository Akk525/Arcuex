import { describe, expect, it } from 'vitest';
import {
  exposureKeyPreimage,
  incidentRefPreimage,
  lossKeyPreimage,
  lossLotPreimage,
} from './loss-key';

describe('loss-key helpers', () => {
  it('builds a stable human-readable preimage distinct from claim ids', () => {
    const a = lossKeyPreimage({
      chainId: 5042002,
      policyEntityId: 'pol-1',
      exposureId: 'exp-1',
      incidentId: 'inc-1',
      lossLotId: 'lot-1',
    });
    const b = lossKeyPreimage({
      chainId: 5042002,
      policyEntityId: 'pol-1',
      exposureId: 'exp-1',
      incidentId: 'inc-1',
      lossLotId: 'lot-1',
    });
    expect(a).toBe(b);
    expect(a).toContain('arcuex:loss');
    expect(a).not.toContain('arcuex:claim');
  });

  it('separates exposure / incident / lot namespaces', () => {
    expect(exposureKeyPreimage('x')).toBe('arcuex:exposure:x');
    expect(incidentRefPreimage('i')).toBe('arcuex:incident:i');
    expect(lossLotPreimage('l')).toBe('arcuex:loss-lot:l');
  });
});
