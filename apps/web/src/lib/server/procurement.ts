export { ProcurementService, ProcurementError } from '@arcuex/agent-sdk';
import { ProcurementError } from '@arcuex/agent-sdk';
export function check(value: unknown, message: string, code = 'INVALID_INPUT'): asserts value {
  if (!value) throw new ProcurementError(code, message);
}
export function text(value: unknown, name: string): string {
  check(typeof value === 'string' && value.length > 0 && value.length <= 160, `${name} required`);
  return value;
}
