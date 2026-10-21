import { json, rpc } from '../_shared/backend.ts';
import { collectBatch } from '../_shared/batch.ts';
// Vault token is checked by a service-only RPC before any task/profile is returned.
export async function handleWorker(req: Request) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const token = req.headers.get('x-luks-worker-token') || '';
  if (token.length < 32 || token.length > 256) return json({ error: 'unauthorized' }, 401);
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  let claim: any;
  try {
    claim = await rpc('luks_claim_scan_batch', { p_token: token }, service);
    if (!claim) return json({ ok: true, idle: true });
    const results = await collectBatch(claim.sources, claim.profile);
    const saved = await rpc('luks_finish_scan_batch', { p_work_id: claim.work_id, p_lease: claim.lease, p_results: results }, service);
    return json({ ok: true, ...saved });
  } catch (error) {
    const message = String(error);
    if (/invalid worker token/i.test(message)) return json({ error: 'unauthorized' }, 401);
    if (claim) {
      try { await rpc('luks_fail_scan_batch', { p_work_id: claim.work_id, p_lease: claim.lease, p_error: message.slice(0, 2000) }, service); }
      catch { /* Expired leases are recovered by the next scheduled claim. */ }
    }
    console.error('scan-worker batch failed', { work_id: claim?.work_id, error: message });
    return json({ error: 'Scan batch failed; saved progress will be retried.' }, 500);
  }
}
Deno.serve(handleWorker);
