import "./style.css";
import { confluence, type Candle } from "./engine";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App container not found");
}

app.innerHTML = `
  <div class="app">
    <header>
      <h1>JM FOREX CONFLUENCE AI</h1>
      <p>Analysis & Paper Testing Only</p>
    </header>

    <section class="card">
      <h2>Market Analysis</h2>

      <label>
        Symbol
        <select id="symbol">
          <option>EUR/USD</option>
          <option>GBP/USD</option>
          <option>USD/JPY</option>
          <option>USD/CHF</option>
          <option>AUD/USD</option>
          <option>USD/CAD</option>
          <option>NZD/USD</option>
          <option>EUR/JPY</option>
          <option>GBP/JPY</option>
          <option>XAU/USD</option>
        </select>
      </label>

      <button id="analyze">ANALYZE MARKET</button>

      <div id="result" class="result">
        <p>Choose a market and press ANALYZE MARKET.</p>
      </div>
    </section>
  </div>
`;

const result = document.querySelector<HTMLDivElement>("#result");
const button = document.querySelector<HTMLButtonElement>("#analyze");
const symbolSelect = document.querySelector<HTMLSelectElement>("#symbol");

function makeDemoCandles(count = 100): Candle[] {
  const candles: Candle[] = [];

  let price = 100;

  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open + (i % 7 === 0 ? -0.3 : 0.25);
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;

    candles.push({
      time: i * 60_000,
      open,
      high,
      low,
      close
    });

    price = close;
  }

  return candles;
}

button?.addEventListener("click", () => {
  if (!result || !symbolSelect) return;

  const candles15m = makeDemoCandles(100);
  const candles1h = makeDemoCandles(100);
  const candles4h = makeDemoCandles(100);

  const analysis = confluence({
    h4: candles4h,
    h1: candles1h,
    m15: candles15m
  });

  result.innerHTML = `
    <h3>${symbolSelect.value}</h3>

    <div class="signal">
      ${analysis.status}
    </div>

    <p><strong>Score:</strong> ${analysis.score}</p>
    <p><strong>Reason:</strong> ${analysis.reason}</p>

    <hr>

    <h3>Paper Trading Plan</h3>
    <p><strong>Entry:</strong> ${analysis.plan?.entry ?? "—"}</p>
    <p><strong>Stop:</strong> ${analysis.plan?.stop ?? "—"}</p>
    <p><strong>Target:</strong> ${analysis.plan?.target ?? "—"}</p>
    <p><strong>Risk/Reward:</strong> ${analysis.plan?.rr ?? "—"}</p>

    <small>
      DEMO/SYNTHETIC DATA — NOT LIVE MARKET DATA
    </small>
  `;
});
