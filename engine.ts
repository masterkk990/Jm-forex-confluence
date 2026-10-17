// JM Forex Confluence AI - deterministic analysis engine. Pure functions, no I/O, no randomness.
// Analysis only. A score = agreement among rules, NOT a probability of profit.
export type Candle = { t: number; o: number; h: number; l: number; c: number; complete: boolean };
export type Dir = 'bull' | 'bear';
export const INTERVAL_MS = { '15min': 9e5, '1h': 36e5, '4h': 144e5 } as const;

/** Normalize provider rows ({datetime,open,high,low,close}) -> ascending, deduped, validated candles.
 *  Last candle is 'complete' only if its period has ended (t + interval <= now). Invalid rows are dropped. */
export function normalize(rows: any[], intervalMs: number, now: number): Candle[] {
  const m = new Map<number, Candle>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const t = Date.parse(String(r?.datetime ?? '').replace(' ', 'T') + (String(r?.datetime).length <= 10 || /[zZ+]/.test(String(r?.datetime)) ? '' : 'Z'));
    const [o, h, l, c] = [r?.open, r?.high, r?.low, r?.close].map(Number);
    if (![t, o, h, l, c].every(Number.isFinite) || h < l || h < Math.max(o, c) || l > Math.min(o, c)) continue;
    m.set(t, { t, o, h, l, c, complete: t + intervalMs <= now });
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}
export const isStale = (cs: Candle[], intervalMs: number, now: number) =>
  !cs.length || now - cs[cs.length - 1].t > 2 * intervalMs;

// ---- Indicators (NaN where inputs are insufficient) ----
export function ema(v: number[], p: number): number[] {
  const out = v.map(() => NaN); if (v.length < p) return out;
  let e = v.slice(0, p).reduce((a, b) => a + b, 0) / p; out[p - 1] = e; const k = 2 / (p + 1);
  for (let i = p; i < v.length; i++) { e = v[i] * k + e * (1 - k); out[i] = e; } return out;
}
/** Wilder RSI */
export function rsi(v: number[], p = 14): number[] {
  const out = v.map(() => NaN); if (v.length <= p) return out;
  let g = 0, l = 0; for (let i = 1; i <= p; i++) { const d = v[i] - v[i - 1]; d > 0 ? (g += d) : (l -= d); }
  g /= p; l /= p; out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < v.length; i++) { const d = v[i] - v[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return out;
}
/** MACD(12,26,9): line = EMA12-EMA26; signal = EMA9 of line (seeded from first valid value). */
export function macd(v: number[], f = 12, s = 26, sg = 9) {
  const ef = ema(v, f), es = ema(v, s), line = v.map((_, i) => ef[i] - es[i]);
  const first = line.findIndex(Number.isFinite), signal = v.map(() => NaN);
  if (first >= 0) ema(line.slice(first), sg).forEach((x, i) => (signal[first + i] = x));
  return { line, signal, hist: line.map((x, i) => x - signal[i]) };
}
/** Wilder ATR(14) */
export function atr(cs: Candle[], p = 14): number[] {
  const out = cs.map(() => NaN); if (cs.length <= p) return out;
  const tr = cs.map((c, i) => i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - cs[i - 1].c), Math.abs(c.l - cs[i - 1].c)));
  let a = tr.slice(1, p + 1).reduce((x, y) => x + y, 0) / p; out[p] = a;
  for (let i = p + 1; i < cs.length; i++) { a = (a * (p - 1) + tr[i]) / p; out[i] = a; } return out;
}

// ---- Structure ----
export type Swing = { i: number; price: number; type: 'high' | 'low' };
/** Fractal swing: strict extreme over n candles each side. Confirmed only once n later candles exist,
 *  so a swing at index i never depends on candles after i+n (no look-ahead). */
export function swings(cs: Candle[], n = 2): Swing[] {
  const out: Swing[] = [];
  for (let i = n; i < cs.length - n; i++) {
    let hi = true, lo = true;
    for (let j = i - n; j <= i + n; j++) { if (j === i) continue;
      if (cs[j].h >= cs[i].h) hi = false; if (cs[j].l <= cs[i].l) lo = false; }
    if (hi) out.push({ i, price: cs[i].h, type: 'high' }); if (lo) out.push({ i, price: cs[i].l, type: 'low' });
  } return out;
}
/** Trend: bull = last 2 swing highs rising AND last 2 lows rising (HH+HL); bear = LH+LL; else range. */
export function trendOf(sw: Swing[]): Dir | 'range' {
  const H = sw.filter(s => s.type === 'high').slice(-2), L = sw.filter(s => s.type === 'low').slice(-2);
  if (H.length < 2 || L.length < 2) return 'range';
  if (H[1].price > H[0].price && L[1].price > L[0].price) return 'bull';
  if (H[1].price < H[0].price && L[1].price < L[0].price) return 'bear';
  return 'range';
}
/** FVG: bullish if high[i-2] < low[i] (zone = that gap); bearish if low[i-2] > high[i]. Unfilled while no later
 *  candle's low (bull) / high (bear) has traded through the far edge of the zone. Returns latest unfilled. */
export function latestFVG(cs: Candle[]): { dir: Dir; lo: number; hi: number; i: number } | null {
  for (let i = cs.length - 1; i >= 2; i--) {
    const a = cs[i - 2], c = cs[i];
    if (a.h < c.l && !cs.slice(i + 1).some(x => x.l <= a.h)) return { dir: 'bull', lo: a.h, hi: c.l, i };
    if (a.l > c.h && !cs.slice(i + 1).some(x => x.h >= a.l)) return { dir: 'bear', lo: c.h, hi: a.l, i };
  } return null;
}

export type TF = { trend: Dir | 'range'; bos: Dir | null; choch: Dir | null; close: number; rsi: number; macdHist: number;
  ema20: number | null; ema50: number | null; ema200: number | null; atr: number; fvg: ReturnType<typeof latestFVG>;
  lastHigh: Swing | null; lastLow: Swing | null };
export const MIN_CANDLES = 60;
/** Analyze one timeframe using COMPLETED candles only. BOS = close beyond last swing in trend direction.
 *  CHOCH = close beyond the last opposing swing against the prevailing trend (first sign of reversal). */
export function analyzeTF(all: Candle[]): TF | null {
  const cs = all.filter(c => c.complete); if (cs.length < MIN_CANDLES) return null;
  const sw = swings(cs), trend = trendOf(sw), close = cs[cs.length - 1].c;
  const lastHigh = [...sw].reverse().find(s => s.type === 'high') ?? null, lastLow = [...sw].reverse().find(s => s.type === 'low') ?? null;
  let bos: Dir | null = null, choch: Dir | null = null;
  if (lastHigh && close > lastHigh.price) trend === 'bear' ? (choch = 'bull') : trend === 'bull' && (bos = 'bull');
  if (lastLow && close < lastLow.price) trend === 'bull' ? (choch = 'bear') : trend === 'bear' && (bos = 'bear');
  const v = cs.map(c => c.c), at = (a: number[]) => a[a.length - 1], nn = (x: number) => (Number.isFinite(x) ? x : null);
  const r = at(rsi(v)), h = at(macd(v).hist), a = at(atr(cs));
  if (![r, h, a].every(Number.isFinite)) return null;
  return { trend, bos, choch, close, rsi: r, macdHist: h, ema20: nn(at(ema(v, 20))), ema50: nn(at(ema(v, 50))), ema200: nn(at(ema(v, 200))),
    atr: a, fvg: latestFVG(cs), lastHigh, lastLow };
}

// ---- Confluence ----
export const DEFAULT_WEIGHTS = { h4Trend: 30, h1Structure: 20, m15Entry: 15, momentum: 15, srBreakout: 10, fvgPullback: 10 };
export type Weights = typeof DEFAULT_WEIGHTS;
export const riskReward = (entry: number, stop: number, target: number) => {
  const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
  return risk > 0 && (target - entry) * (entry - stop) > 0 ? reward / risk : null;
};
export type Check = { name: string; pass: boolean; weight: number; gate: boolean };
export type Result = { status: 'BUY BIAS' | 'SELL BIAS' | 'WAIT' | 'UNAVAILABLE'; score: number | null; reasons: string[];
  checks: Check[]; plan: null | { entry: number; invalidation: number; stop: number; target: number; rr: number } };

export function confluence(h4: Candle[] | null, h1: Candle[] | null, m15: Candle[] | null, now: number, w: Weights = DEFAULT_WEIGHTS, tpR = 2): Result {
  const un = (r: string): Result => ({ status: 'UNAVAILABLE', score: null, reasons: [r], checks: [], plan: null });
  const sets: [string, Candle[] | null, number][] = [['4H', h4, INTERVAL_MS['4h']], ['1H', h1, INTERVAL_MS['1h']], ['15M', m15, INTERVAL_MS['15min']]];
  for (const [n, cs, ms] of sets) { if (!cs || !cs.length) return un(`${n} data missing`); if (isStale(cs, ms, now)) return un(`${n} data stale`); }
  const [A, B, C] = [h4, h1, m15].map(c => analyzeTF(c!));
  if (!A || !B || !C) return un('Insufficient candles or indicator inputs (need ≥60 completed candles per timeframe)');
  const score = (d: Dir) => {
    const s = d === 'bull' ? 1 : -1;
    const checks: Check[] = [
      { name: `4H trend ${d}`, pass: A.trend === d, weight: w.h4Trend, gate: true },
      { name: `1H structure ${d} (no opposing CHOCH)`, pass: B.trend === d && B.choch !== (d === 'bull' ? 'bear' : 'bull'), weight: w.h1Structure, gate: true },
      { name: `15M entry: ${d} BOS/CHOCH`, pass: C.bos === d || C.choch === d, weight: w.m15Entry, gate: true },
      { name: 'Momentum: RSI & MACD hist agree', pass: (C.rsi - 50) * s > 0 && C.macdHist * s > 0, weight: w.momentum, gate: false },
      { name: 'Breakout/structure context (1H BOS or 15M close beyond swing)', pass: B.bos === d || C.bos === d, weight: w.srBreakout, gate: false },
      { name: 'Unfilled FVG in direction (15M/1H)', pass: C.fvg?.dir === d || B.fvg?.dir === d, weight: w.fvgPullback, gate: false }];
    const tot = checks.reduce((a, c) => a + c.weight, 0);
    return { checks, pct: Math.round(checks.reduce((a, c) => a + (c.pass ? c.weight : 0), 0) / tot * 100) };
  };
  const bu = score('bull'), be = score('bear');
  const ok = (r: ReturnType<typeof score>) => r.checks.filter(c => c.gate).every(c => c.pass);
  const dir: Dir | null = ok(bu) ? 'bull' : ok(be) ? 'bear' : null;
  if (!dir) { const r = bu.pct >= be.pct ? bu : be;
    return { status: 'WAIT', score: r.pct, checks: r.checks, plan: null,
      reasons: ['Timeframes disagree or entry conditions not met', ...r.checks.filter(c => c.gate && !c.pass).map(c => `Failed: ${c.name}`)] }; }
  const r = dir === 'bull' ? bu : be, entry = C.close;
  const inv = dir === 'bull' ? C.lastLow?.price : C.lastHigh?.price;
  let plan: Result['plan'] = null;
  if (inv !== undefined && (dir === 'bull' ? inv < entry : inv > entry)) {
    const stop = dir === 'bull' ? inv - 0.25 * C.atr : inv + 0.25 * C.atr, risk = Math.abs(entry - stop);
    const target = dir === 'bull' ? entry + tpR * risk : entry - tpR * risk, rr = riskReward(entry, stop, target);
    if (rr) plan = { entry, invalidation: inv, stop, target, rr }; }
  return { status: dir === 'bull' ? 'BUY BIAS' : 'SELL BIAS', score: r.pct, checks: r.checks, plan,
    reasons: r.checks.filter(c => c.pass).map(c => `Passed: ${c.name}`).concat(plan ? [] : ['Stop/target could not be calculated reliably']) };
}
