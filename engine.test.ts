// All data below is SYNTHETIC TEST FIXTURE DATA - never live market data.
import test from 'node:test'; import assert from 'node:assert/strict';
import * as E from './engine.ts';
const NOW = Date.UTC(2026, 0, 1);
function series(n: number, slope: number, ms: number, end = NOW): E.Candle[] {
  return Array.from({ length: n }, (_, i) => { const c = 100 + i * slope + 3 * Math.sin(i / 2.2);
    return { t: end - (n - i) * ms, o: c, c, h: c + 0.3, l: c - 0.3, complete: true }; });
}
test('EMA seeds with SMA and is NaN before period', () => {
  const e = E.ema([1, 2, 3, 4, 5], 3); assert.ok(isNaN(e[1])); assert.equal(e[2], 2); assert.equal(e[3], 3); assert.equal(e[4], 4); });
test('RSI is 100 when only gains, 0 when only losses', () => {
  assert.equal(E.rsi(Array.from({ length: 30 }, (_, i) => i), 14).at(-1), 100);
  assert.equal(E.rsi(Array.from({ length: 30 }, (_, i) => -i), 14).at(-1), 0); });
test('ATR of constant-range candles equals the range', () => {
  const cs = Array.from({ length: 30 }, (_, i) => ({ t: i, o: 10, h: 11, l: 9, c: 10, complete: true }));
  assert.equal(E.atr(cs).at(-1), 2); });
test('MACD of flat series is zero; NaN until enough data', () => {
  const m = E.macd(Array(60).fill(5)); assert.equal(m.hist.at(-1), 0); assert.ok(isNaN(E.macd([1, 2, 3]).line[2])); });
test('normalize sorts, dedupes, drops invalid, flags forming candle', () => {
  const rows = [{ datetime: '2026-01-01 00:00:00', open: '1', high: '2', low: '0.5', close: '1.5' },
    { datetime: '2025-12-31 23:00:00', open: '1', high: '2', low: '0.5', close: '1.5' },
    { datetime: '2025-12-31 23:00:00', open: '1', high: '2', low: '0.5', close: '1.6' },
    { datetime: '2025-12-31 22:00:00', open: 'x', high: '2', low: '0.5', close: '1.5' },
    { datetime: '2025-12-31 21:00:00', open: '1', high: '0.1', low: '0.5', close: '1.5' }];
  const cs = E.normalize(rows, E.INTERVAL_MS['1h'], NOW + 1000);
  assert.equal(cs.length, 2); assert.ok(cs[0].t < cs[1].t); assert.equal(cs[0].c, 1.6);
  assert.equal(cs[0].complete, true); assert.equal(cs[1].complete, false); });
test('normalize tolerates malformed input', () => { assert.deepEqual(E.normalize(null as any, 1, 1), []); });
test('swings never look ahead: prefix swings are a subset with identical indices', () => {
  const cs = series(120, 0.2, 9e5), full = E.swings(cs);
  for (const k of [60, 80, 100]) for (const s of E.swings(cs.slice(0, k))) assert.ok(full.some(f => f.i === s.i && f.type === s.type && f.price === s.price));
  assert.ok(E.swings(cs.slice(0, 80)).every(s => s.i <= 77)); });
test('trend detection', () => {
  assert.equal(E.trendOf(E.swings(series(120, 0.5, 9e5))), 'bull');
  assert.equal(E.trendOf(E.swings(series(120, -0.5, 9e5))), 'bear'); });
test('FVG: 3-candle definition and fill', () => {
  const mk = (h: number, l: number) => ({ t: 0, o: l, c: h, h, l, complete: true });
  const up = [mk(10, 9), mk(13, 10), mk(15, 11.5)]; const f = E.latestFVG(up)!;
  assert.deepEqual([f.dir, f.lo, f.hi], ['bull', 10, 11.5]);
  assert.equal(E.latestFVG([...up, mk(14, 9.5)]), null); });
test('risk/reward', () => {
  assert.equal(E.riskReward(100, 99, 102), 2); assert.equal(E.riskReward(100, 101, 98), 2);
  assert.equal(E.riskReward(100, 99, 98), null); assert.equal(E.riskReward(100, 100, 101), null); });
test('UNAVAILABLE for missing, stale, and too-short data - never BUY/SELL', () => {
  const ok = (ms: number) => series(120, 0.3, ms);
  assert.equal(E.confluence(null, ok(36e5), ok(9e5), NOW).status, 'UNAVAILABLE');
  assert.equal(E.confluence(ok(144e5), ok(36e5), ok(9e5), NOW + 5 * 144e5).status, 'UNAVAILABLE');
  assert.equal(E.confluence(series(20, 0.3, 144e5), ok(36e5), ok(9e5), NOW).status, 'UNAVAILABLE'); });
test('WAIT when timeframes disagree', () => {
  const r = E.confluence(series(120, -0.5, 144e5), series(120, 0.5, 36e5), series(120, 0.5, 9e5), NOW);
  assert.equal(r.status, 'WAIT'); assert.equal(r.plan, null); });
test('BUY BIAS only when all gates pass; deterministic; plan has valid RR', () => {
  const h4 = series(120, 0.5, 144e5), h1 = series(120, 0.5, 36e5); let hit: E.Result | null = null, m15: E.Candle[] = [];
  for (let n = 60; n <= 160 && !hit; n++) { m15 = series(n, 0.5, 9e5); const r = E.confluence(h4, h1, m15, NOW); if (r.status === 'BUY BIAS') hit = r; }
  assert.ok(hit, 'fixture should reach a bullish 15M BOS'); assert.deepEqual(E.confluence(h4, h1, m15, NOW), hit);
  assert.ok(hit!.plan!.stop < hit!.plan!.entry && hit!.plan!.target > hit!.plan!.entry); assert.ok(Math.abs(hit!.plan!.rr - 2) < 1e-9); });
