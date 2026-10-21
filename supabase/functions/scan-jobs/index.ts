import { cors, json, rpc } from '../_shared/backend.ts';
// Collection is owned by scan-worker; this public endpoint requires a user JWT.
export async function handleRequest(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: 'unauthorized' }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const request = await rpc('luks_request_scan', { p_request_id: body.scan_request_id || null },
      Deno.env.get('SUPABASE_ANON_KEY')!, authorization);
    // Old browser clients stop their batch loop; the server keeps processing.
    return json({ ok: true, queued: true, done: true, request_id: request.request_id,
      run_id: request.run_id, next_offset: 0, total: request.total });
  } catch (error) {
    const message = String(error);
    return json({ error: message }, /unauthorized|JWT|permission|not found/i.test(message) ? 403 : 500);
  }
}
Deno.serve(handleRequest);
