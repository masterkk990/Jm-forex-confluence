# JM Forex Confluence AI (core)
Analysis/paper-testing only. Not trade execution; score ≠ win probability.
- `src/engine.ts` – normalize, RSI/MACD/EMA/ATR, swings, BOS/CHOCH, FVG, confluence. Rules are documented in code comments.
- `src/engine.test.ts` – `node --test src/engine.test.ts` (Node 22.6+; synthetic fixtures only).
- `supabase/functions/candles` – key-safe proxy. Deploy: `supabase secrets set TWELVEDATA_API_KEY=...` then `supabase functions deploy candles`.
Scoring: score = Σ weight(passed checks) / Σ weight × 100. BUY/SELL requires all three gates (4H trend, 1H structure, 15M BOS/CHOCH).
