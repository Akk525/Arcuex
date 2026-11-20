import { describe, expect, it, vi } from 'vitest';
import * as runtime from '@/lib/server/runtime-config';
import { resourceMetadataUrl } from './http';

describe('MCP public origin behind a proxy edge', () => {
  it('advertises the configured public origin, not the container request URL', () => {
    const real = runtime.getRuntimeConfig();
    const spy = vi
      .spyOn(runtime, 'getRuntimeConfig')
      .mockReturnValue({ ...real, enforced: true, origin: 'https://mcp.arcuex.example' });
    try {
      expect(resourceMetadataUrl(new Request('https://0.0.0.0:8080/api/mcp'))).toBe(
        'https://mcp.arcuex.example/.well-known/oauth-protected-resource/api/mcp',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
