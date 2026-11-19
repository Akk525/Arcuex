/** Run outside the isolated app. Holds only an OpenAI key and a candidate-specific system API token. */
import { examineClaimsWithOpenAI } from '../../../packages/insurance/src/openai-claims-examiner';
export async function processExaminerRequest(config: {
  baseUrl: string;
  caseId: string;
  requestId: string;
  systemToken: string;
  gateToken?: string;
  apiKey: string;
  request?: typeof fetch;
  inferenceRequest?: typeof fetch;
  execution?: 'live' | 'test_double';
}) {
  const base = new URL(config.baseUrl);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname))
    throw new Error('Examiner requires HTTPS or localhost');
  if (base.hostname === 'arcuex-nov20-beta-production.up.railway.app')
    throw new Error('Plan A is forbidden');
  if (!config.apiKey || !config.systemToken)
    throw new Error('Separate worker credentials required');
  const request = config.request ?? fetch;
  const url = new URL(`/api/claims/cases/${encodeURIComponent(config.caseId)}/investigation`, base);
  const call = async (body: unknown) => {
    const r = await request(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(50000),
      headers: {
        'content-type': 'application/json',
        origin: base.origin,
        authorization: `Bearer ${config.systemToken}`,
        ...(config.gateToken ? { 'x-arcuex-acceptance-gate': config.gateToken } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error ?? 'Examiner worker request failed');
    return json;
  };
  const snapshot = await call({ action: 'examiner_start', requestId: config.requestId });
  try {
    const report = await examineClaimsWithOpenAI(snapshot.dossier, {
      apiKey: config.apiKey,
      request: config.inferenceRequest,
    });
    await call({
      action: 'examiner_finish',
      report: {
        ...report,
        requestId: config.requestId,
        dossierDigest: snapshot.digest,
        execution: config.execution ?? 'live',
      },
    });
    return { completed: true, responseId: report.responseId, usage: report.usage };
  } catch (error) {
    await call({ action: 'examiner_failure', requestId: config.requestId }).catch(() => {});
    throw error;
  }
}
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const [baseUrl, caseId, requestId] = process.argv.slice(2);
  if (!baseUrl || !caseId)
    throw new Error(
      'Usage: claims-examiner-worker.mts BASE_URL CASE_ID [REQUEST_ID]; without REQUEST_ID watches this claim for five minutes',
    );
  const config = {
    baseUrl,
    caseId,
    systemToken: process.env.CLAIMS_SYSTEM_API_TOKEN ?? '',
    gateToken: process.env.ARCUEX_ACCEPTANCE_GATE_TOKEN,
    apiKey: process.env.OPENAI_API_KEY ?? '',
  };
  try {
    if (!config.apiKey || !config.systemToken)
      throw new Error(
        'Configure OPENAI_API_KEY and candidate-specific CLAIMS_SYSTEM_API_TOKEN in worker environment only',
      );
    if (requestId)
      console.log(JSON.stringify(await processExaminerRequest({ ...config, requestId })));
    else {
      const base = new URL(baseUrl);
      if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname))
        throw new Error('HTTPS or localhost required');
      if (base.hostname === 'arcuex-nov20-beta-production.up.railway.app')
        throw new Error('Plan A forbidden');
      const deadline = Date.now() + 300000;
      let attempts = 0;
      while (Date.now() < deadline && attempts < 6) {
        const response = await fetch(
          new URL(`/api/claims/cases/${encodeURIComponent(caseId)}/investigation`, base),
          {
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
            headers: {
              authorization: `Bearer ${config.systemToken}`,
              ...(config.gateToken ? { 'x-arcuex-acceptance-gate': config.gateToken } : {}),
            },
          },
        );
        if (!response.ok)
          throw new Error(`Dossier unavailable (HTTP ${response.status}); worker stopped`);
        const view = (await response.json()) as {
          entries: Array<{ id: string; kind: string; payload: { requestId?: string } }>;
        };
        const job = view.entries.find(
          (e) =>
            e.kind === 'examiner_request' &&
            !view.entries.some(
              (r) =>
                ['examiner_started', 'examiner_report', 'examiner_failure'].includes(r.kind) &&
                r.payload.requestId === e.id,
            ),
        );
        if (job) {
          attempts++;
          console.log(
            JSON.stringify(await processExaminerRequest({ ...config, requestId: job.id })),
          );
        } else await new Promise((r) => setTimeout(r, 2500));
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Examiner unavailable');
    process.exitCode = 1;
  }
}
