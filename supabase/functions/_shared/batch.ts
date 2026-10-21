import { inDenmark, parseCsodDate, scanSource, atsKind } from './scan-core.ts';
function iso(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function prepareSourceResult(result: any) {
  const checked = Array.isArray(result.checked) ? result.checked : [];
  const candidates = checked.filter((job: any) => inDenmark(job.location, job.country))
    .filter((job: any) => /^https?:\/\//i.test(String(job.url || '')))
    .map((job: any) => ({
      title: String(job.title || 'Job opportunity').slice(0, 500), company: job.companyOverride || result.source.name,
      job_url: job.url, location: job.country && !inDenmark(job.location) ? [job.location,'Denmark'].filter(Boolean).join(', ') : (job.location || null), country_code: 'DK', verified: !!job.verified,
      score: Math.min(100, Math.max(0, Number(job.score) || 0)),
      reason: String(job.reason || '').slice(0, 4000), snippet: String(job.snippet || '').slice(0, 1800),
      published_at: job.publishedRaw ? parseCsodDate(job.publishedRaw) : iso(job.publishedAt), deadline: iso(job.deadline),
    }));
  return { source_id: result.source.id, source_name: result.source.name, ok: !!result.searchOk,
    provider: result.provider || 'unknown', ats_url: result.atsUrl && atsKind(result.atsUrl) ? result.atsUrl : null, error: result.error ? String(result.error).slice(0, 2000) : null,
    found: checked.length, rejected: checked.length - candidates.filter((job: any) => job.verified).length, candidates };
}
export async function collectBatch(sources: any[], profile: any, timeoutMs = 65000, scan = scanSource) {
  return await Promise.all(sources.map(async source => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([scan(source, profile), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Source exceeded scan time budget')), timeoutMs);
      })]);
      return prepareSourceResult(result);
    } catch (error) {
      return prepareSourceResult({ source, checked: [], searchOk: false, provider: 'worker', error: String(error) });
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }));
}
