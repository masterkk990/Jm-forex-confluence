// Supabase Edge Function: server-side Twelve Data proxy. Key lives only in Deno.env (supabase secrets set TWELVEDATA_API_KEY=...).
const SYMBOLS = new Set(['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/JPY','GBP/JPY','XAU/USD']);
const IV: Record<string, number> = { '15min': 9e5, '1h': 36e5, '4h': 144e5 };
const cache = new Map<string, { at: number; body: unknown }>(), inflight = new Map<string, Promise<unknown>>();
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Content-Type': 'application/json' };
const reply = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const u = new URL(req.url), symbol = u.searchParams.get('symbol') ?? '', interval = u.searchParams.get('interval') ?? '';
  if (!SYMBOLS.has(symbol) || !(interval in IV)) return reply({ error: 'invalid_params' }, 400);
  const key = Deno.env.get('TWELVEDATA_API_KEY');
  if (!key) return reply({ error: 'api_key_not_configured' }, 503);
  const k = `${symbol}|${interval}`, hit = cache.get(k);
  if (hit && Date.now() - hit.at < Math.min(IV[interval] / 4, 60_000)) return reply({ ...(hit.body as object), cached: true });
  let p = inflight.get(k);                       // dedupe concurrent requests
  if (!p) {
    p = fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=250&timezone=UTC&apikey=${key}`)
      .then(async (r) => {
        const j = await r.json();
        if (j.status === 'error' || !Array.isArray(j.values)) {   // never forward key; map provider errors
          const code = j.code === 429 ? 'rate_limited' : j.code === 401 ? 'invalid_api_key' : j.code === 400 ? 'invalid_symbol' : 'provider_error';
          return { error: code, retryAfterSec: code === 'rate_limited' ? 60 : undefined };
        }
        const body = { symbol, interval, provider: 'Twelve Data', fetchedAt: Date.now(), values: j.values };
        cache.set(k, { at: Date.now(), body }); return body;
      }).catch(() => ({ error: 'network_error' })).finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  const body = (await p) as { error?: string };
  return reply(body, body.error ? (body.error === 'rate_limited' ? 429 : 502) : 200);
});

