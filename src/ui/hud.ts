import { tr } from '../i18n/tr';
import type { HudState } from './ui';
import { clamp, el, formatInteger, formatTime, setText, starburstPolygon, textNode } from './dom';

/** Speed (m/s) at which the speed bar is full. */
const SPEED_BAR_FULL = 70;
/** Above this speed (m/s) the bar switches to its "hot" look. */
const SPEED_HOT = 55;
/** How long the good-release burst stays on screen (s). */
const BURST_TIME = 0.9;
/** Shock ring around the crosshair on a good release (s). */
const SHOCK_TIME = 0.4;

type RingState = NonNullable<HudState['ring']>;

/**
 * Per-frame HUD. Every DOM write is guarded by a cached value so a frame
 * where nothing visible changed touches nothing; moving parts (anchor marker,
 * burst, speed bar) only change transforms/opacity, which never trigger layout.
 */
export class Hud {
  /** Full-screen layer: crosshair, marker, burst, speed/altitude panel (minimap is appended by the UI). */
  readonly layer: HTMLDivElement;
  /** Ring-race timer, placed by the UI in the top-centre stack. */
  readonly ringPanel: HTMLDivElement;
  /** FPS counter, independent of HUD visibility. */
  readonly fpsEl: HTMLDivElement;

  private readonly xh: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly burst: HTMLDivElement;
  private readonly shock: HTMLDivElement;
  private readonly speedText: Text;
  private readonly altText: Text;
  private readonly speedBar: HTMLDivElement;
  private readonly speedFill: HTMLDivElement;

  private readonly ringRoute: Text;
  private readonly ringTime: Text;
  private readonly ringProg: Text;
  private readonly ringBest: Text;
  private readonly ringDone: Text;
  private readonly fpsText: Text;

  private xhValid = false;
  private xhZip = false;
  private xhGood = false;
  private markerOn = false;
  private markerZip = false;
  private markerX = Number.NaN;
  private markerY = Number.NaN;
  private speedShown = Number.NaN;
  private altShown = Number.NaN;
  private barStep = -1;
  private barHot = false;
  private burstStep = -1;
  private ringOn = false;
  private ringIsDone = false;
  private ringHasBest = false;
  private ringIsNew = false;
  private fpsShown: number | null = null;
  private fpsTier = '';

  constructor() {
    this.layer = el('div', 'sk-hud');

    // Crosshair: ring, centre dot, four ticks and the zip-only secondary tick.
    this.xh = el('div', 'sk-xh');
    this.xh.append(
      el('div', 'sk-xh-ring'),
      el('div', 'sk-xh-dot'),
      el('div', 'sk-xh-tick sk-t'),
      el('div', 'sk-xh-tick sk-r'),
      el('div', 'sk-xh-tick sk-b'),
      el('div', 'sk-xh-tick sk-l'),
      el('div', 'sk-xh-zip'),
    );

    this.marker = el('div', 'sk-marker');
    this.marker.append(el('div', 'sk-marker-gem'));

    this.shock = el('div', 'sk-shock');

    this.burst = el('div', 'sk-burst');
    const burstInner = el('div', 'sk-burst-inner');
    const star = starburstPolygon(14, 0.74);
    const starInk = el('div', 'sk-burst-star sk-ink');
    const starFill = el('div', 'sk-burst-star');
    starInk.style.clipPath = star;
    starFill.style.clipPath = star;
    burstInner.append(starInk, starFill, el('div', 'sk-burst-text', tr.hud.goodRelease));
    this.burst.append(burstInner);

    // Speed and altitude panel (bottom-left).
    const readout = el('div', 'sk-readout');
    const speedBlock = el('div', 'sk-ro-block');
    const speedValue = el('div', 'sk-ro-value');
    const speedNum = el('span', 'sk-ro-num');
    this.speedText = textNode(speedNum, '0');
    speedValue.append(speedNum, el('span', 'sk-ro-unit', tr.hud.kmh));
    this.speedBar = el('div', 'sk-ro-bar');
    this.speedFill = el('div', 'sk-ro-bar-fill');
    this.speedBar.append(this.speedFill);
    speedBlock.append(el('div', 'sk-ro-label', tr.hud.speed), speedValue, this.speedBar);

    const altBlock = el('div', 'sk-ro-block sk-ro-alt');
    const altValue = el('div', 'sk-ro-value');
    const altNum = el('span', 'sk-ro-num');
    this.altText = textNode(altNum, '0');
    altValue.append(altNum, el('span', 'sk-ro-unit', tr.hud.m));
    altBlock.append(el('div', 'sk-ro-label', tr.hud.altitude), altValue);
    readout.append(speedBlock, el('div', 'sk-ro-sep'), altBlock);

    this.layer.append(this.shock, this.xh, this.marker, this.burst, readout);

    // Ring-race timer (top-centre).
    this.ringPanel = el('div', 'sk-ring');
    const head = el('div', 'sk-ring-head');
    const route = el('span', 'sk-ring-route');
    this.ringRoute = textNode(route);
    head.append(el('span', 'sk-ring-tag', tr.hud.ringRun), route);
    const time = el('div', 'sk-ring-time');
    this.ringTime = textNode(time, formatTime(0));
    const done = el('div', 'sk-ring-done');
    this.ringDone = textNode(done);
    const foot = el('div', 'sk-ring-foot');
    const prog = el('span', 'sk-ring-prog');
    this.ringProg = textNode(prog);
    const best = el('span', 'sk-ring-best');
    this.ringBest = textNode(best);
    foot.append(prog, best);
    this.ringPanel.append(head, time, done, foot, el('div', 'sk-ring-new', tr.hud.ringNewBest));

    // FPS counter (top-right).
    this.fpsEl = el('div', 'sk-fps');
    const fpsNum = el('span', 'sk-fps-num');
    this.fpsText = textNode(fpsNum, '0');
    this.fpsEl.append(el('span', 'sk-fps-label', tr.hud.fps), fpsNum);
  }

  /** Updates everything except the FPS counter (call only while the HUD is visible). */
  update(s: HudState): void {
    this.updateCrosshair(s);
    this.updateMarker(s);
    this.updateBurst(s.goodFlash);
    this.updateReadout(s.speed, s.altitude);
    this.updateRing(s.ring);
  }

  updateFps(fps: number | null): void {
    const v = fps === null || !Number.isFinite(fps) ? null : Math.max(0, Math.round(fps));
    if (v === this.fpsShown) return;
    if ((v === null) !== (this.fpsShown === null)) this.fpsEl.classList.toggle('is-on', v !== null);
    this.fpsShown = v;
    if (v === null) return;
    setText(this.fpsText, formatInteger(v));
    const tier = v >= 55 ? 'is-good' : v >= 30 ? 'is-mid' : 'is-bad';
    if (tier !== this.fpsTier) {
      if (this.fpsTier) this.fpsEl.classList.remove(this.fpsTier);
      this.fpsEl.classList.add(tier);
      this.fpsTier = tier;
    }
  }

  private updateCrosshair(s: HudState): void {
    const valid = s.anchorValid;
    const zipOnly = !s.anchorValid && s.zipValid;
    const good = s.goodWindow;
    if (valid !== this.xhValid) {
      this.xh.classList.toggle('is-valid', valid);
      this.xhValid = valid;
    }
    if (zipOnly !== this.xhZip) {
      this.xh.classList.toggle('is-zip', zipOnly);
      this.xhZip = zipOnly;
    }
    if (good !== this.xhGood) {
      this.xh.classList.toggle('is-good', good);
      this.xhGood = good;
    }
  }

  private updateMarker(s: HudState): void {
    const p = s.anchorScreen;
    const on = p !== null && (s.anchorValid || s.zipValid) && Number.isFinite(p.x) && Number.isFinite(p.y);
    if (on !== this.markerOn) {
      this.marker.classList.toggle('is-on', on);
      this.markerOn = on;
    }
    if (!on || p === null) return;
    const zip = !s.anchorValid;
    if (zip !== this.markerZip) {
      this.marker.classList.toggle('is-zip', zip);
      this.markerZip = zip;
    }
    // Clamp far off-screen projections so the transform stays sane.
    const x = clamp(p.x, -4000, 12000);
    const y = clamp(p.y, -4000, 12000);
    if (Math.abs(x - this.markerX) < 0.2 && Math.abs(y - this.markerY) < 0.2) return;
    this.markerX = x;
    this.markerY = y;
    this.marker.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  /** Data-driven pop: the burst is a pure function of the time since the release. */
  private updateBurst(sinceGood: number): void {
    const active = Number.isFinite(sinceGood) && sinceGood >= 0 && sinceGood < BURST_TIME;
    const step = active ? Math.round(sinceGood * 120) : -1;
    if (step === this.burstStep) return;
    this.burstStep = step;
    if (!active) {
      this.burst.style.opacity = '0';
      this.shock.style.opacity = '0';
      return;
    }
    const t = sinceGood;
    let scale: number;
    if (t < 0.12) {
      const u = t / 0.12;
      scale = 0.3 + 0.95 * (1 - (1 - u) * (1 - u));
    } else if (t < 0.24) {
      const u = (t - 0.12) / 0.12;
      scale = 1.25 - 0.25 * u * (2 - u);
    } else {
      scale = 1 + (t - 0.24) * 0.08;
    }
    const opacity = t < 0.04 ? t / 0.04 : t > 0.62 ? Math.max(0, 1 - (t - 0.62) / (BURST_TIME - 0.62)) : 1;
    const rise = -t * 26;
    this.burst.style.opacity = opacity.toFixed(3);
    this.burst.style.transform = `translate(-50%, -50%) translateY(${rise.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    if (t < SHOCK_TIME) {
      const u = t / SHOCK_TIME;
      this.shock.style.opacity = (1 - u).toFixed(3);
      this.shock.style.transform = `scale(${(1 + u * 5).toFixed(3)})`;
    } else {
      this.shock.style.opacity = '0';
    }
  }

  private updateReadout(speed: number, altitude: number): void {
    const v = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    const kmh = Math.round(v * 3.6);
    if (kmh !== this.speedShown) {
      this.speedShown = kmh;
      setText(this.speedText, formatInteger(kmh));
    }
    const alt = Number.isFinite(altitude) ? Math.round(altitude) : 0;
    if (alt !== this.altShown) {
      this.altShown = alt;
      setText(this.altText, formatInteger(alt));
    }
    const step = Math.round(clamp(v / SPEED_BAR_FULL, 0, 1) * 200);
    if (step !== this.barStep) {
      this.barStep = step;
      this.speedFill.style.transform = `scaleX(${(step / 200).toFixed(3)})`;
    }
    const hot = v >= SPEED_HOT;
    if (hot !== this.barHot) {
      this.speedBar.classList.toggle('is-hot', hot);
      this.barHot = hot;
    }
  }

  private updateRing(ring: HudState['ring']): void {
    const on = ring !== null;
    if (on !== this.ringOn) {
      this.ringPanel.classList.toggle('is-on', on);
      this.ringOn = on;
    }
    if (ring === null) return;
    setText(this.ringRoute, ring.routeName);
    const fin = ring.finished;
    const done = fin !== null;
    if (done !== this.ringIsDone) {
      this.ringPanel.classList.toggle('is-done', done);
      this.ringIsDone = done;
    }
    let bestText = '';
    if (fin !== null) {
      setText(this.ringDone, tr.hud.ringDone(formatTime(fin.time)));
      bestText = tr.hud.ringBest(formatTime(fin.best));
    } else {
      setText(this.ringTime, formatTime(ring.time));
      setText(this.ringProg, this.progressText(ring));
      if (ring.best !== null && Number.isFinite(ring.best)) bestText = tr.hud.ringBest(formatTime(ring.best));
    }
    const hasBest = bestText !== '';
    if (hasBest) setText(this.ringBest, bestText);
    if (hasBest !== this.ringHasBest) {
      this.ringPanel.classList.toggle('has-best', hasBest);
      this.ringHasBest = hasBest;
    }
    const isNew = fin !== null && fin.newBest;
    if (isNew !== this.ringIsNew) {
      this.ringPanel.classList.toggle('is-new', isNew);
      this.ringIsNew = isNew;
    }
  }

  private progressText(ring: RingState): string {
    const total = Math.max(0, Math.round(ring.total));
    const index = clamp(Math.round(ring.index), 0, total);
    return tr.hud.ringProgress(index, total);
  }
}
