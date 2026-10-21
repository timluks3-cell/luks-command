export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
export function json(data: unknown, status = 200, headers = cors) {
  return new Response(JSON.stringify(data), { status, headers });
}
// Built-in fetch avoids additional runtime packages or credential storage.
export async function rpc(name: string, body: unknown, key: string, authorization = `Bearer ${key}`) {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `Database call failed: ${response.status}`);
  return data;
}
