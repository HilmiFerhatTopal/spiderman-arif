/** Small DOM and number-formatting helpers shared by the UI modules. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Appends a text node to `parent` and returns it for cheap in-place updates. */
export function textNode(parent: Node, initial = ''): Text {
  const t = document.createTextNode(initial);
  parent.appendChild(t);
  return t;
}

/** Writes a text node only when its content actually changes. */
export function setText(t: Text, value: string): void {
  if (t.data !== value) t.data = value;
}

/** Wraps static, trusted SVG markup (icons defined in this module set) in a span. */
export function icon(svgMarkup: string, className = 'sk-icon'): HTMLSpanElement {
  const span = el('span', className);
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svgMarkup;
  return span;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Rounds to the nearest multiple of `step` without float noise (0.1 + 0.2 style). */
export function roundToStep(v: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number((Math.round(v / step) * step).toFixed(decimals));
}

const LOCALE = 'tr-TR';
const percentFmt = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
const decimal2Fmt = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedFmt = new Intl.NumberFormat(LOCALE, { signDisplay: 'exceptZero', maximumFractionDigits: 0 });
const integerFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, useGrouping: false });

/** 0.8 -> "%80" (Turkish places the percent sign first). */
export function formatPercent(fraction: number): string {
  return percentFmt.format(fraction);
}

/** 1.05 -> "1,05". */
export function formatDecimal2(v: number): string {
  return decimal2Fmt.format(v);
}

/** 5 -> "+5", 0 -> "0", -10 -> "-10". */
export function formatSigned(v: number): string {
  return signedFmt.format(Math.round(v));
}

export function formatInteger(v: number): string {
  return integerFmt.format(Math.round(v));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Race clock: seconds -> "m:ss.cc" (truncated to centiseconds; invalid input reads as 0). */
export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  // Round to milliseconds first so values like 1.15 do not truncate to 1.14.
  const cs = Math.floor(Math.round(s * 1000) / 10);
  const minutes = Math.floor(cs / 6000);
  const secs = Math.floor(cs / 100) % 60;
  const centi = cs % 100;
  return `${minutes}:${pad2(secs)}.${pad2(centi)}`;
}

/** Hour of day (0..24) -> "HH:MM". */
export function formatClock(hour: number): string {
  const h = Number.isFinite(hour) ? clamp(hour, 0, 24) : 0;
  const total = Math.round(h * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** CSS clip-path polygon for a comic starburst with `points` spikes. */
export function starburstPolygon(points: number, inner: number): string {
  const parts: string[] = [];
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    // Slightly irregular spikes read as hand-drawn.
    const r = i % 2 === 0 ? (i % 4 === 0 ? 1 : 0.9) : inner;
    const x = 50 + Math.cos(a) * 50 * r;
    const y = 50 + Math.sin(a) * 50 * r;
    parts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${parts.join(', ')})`;
}
