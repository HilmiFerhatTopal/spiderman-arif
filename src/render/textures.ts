import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
} from 'three';
import { tr } from '../i18n/tr';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/**
 * Window atlas: 8 styles side by side, one window cell per tile (128 px).
 * RGB is a shading multiplier for the wall/frame, alpha marks glass (1) vs
 * wall (0). Built as a DataTexture so alpha-0 texels keep their RGB (a canvas
 * upload would premultiply them away). Styles: 0 curtain wall, 1 punched,
 * 2 narrow pair, 3 arched, 4 industrial, 5 ribbon, 6 art-deco strip,
 * 7 storefront.
 */
export function makeWindowAtlas(): Texture {
  const T = 128;
  const W = T * 8;
  const [, shadeCtx] = canvas(W, T);
  shadeCtx.fillStyle = '#fff';
  shadeCtx.fillRect(0, 0, W, T);
  drawShades(shadeCtx, T);
  const [, maskCtx] = canvas(W, T);
  maskCtx.fillStyle = '#000';
  maskCtx.fillRect(0, 0, W, T);
  drawGlass(maskCtx, T);
  const sh = shadeCtx.getImageData(0, 0, W, T).data;
  const mk = maskCtx.getImageData(0, 0, W, T).data;
  const data = new Uint8Array(W * T * 4);
  for (let i = 0; i < W * T; i++) {
    data[i * 4] = sh[i * 4]!;
    data[i * 4 + 1] = sh[i * 4 + 1]!;
    data[i * 4 + 2] = sh[i * 4 + 2]!;
    data[i * 4 + 3] = mk[i * 4]!;
  }
  const tex = new DataTexture(data, W, T, RGBAFormat, UnsignedByteType);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Glass areas (white) per style. */
function drawGlass(g: CanvasRenderingContext2D, T: number): void {
  const f = (x: number, y: number, w: number, h: number): void => {
    g.fillStyle = '#fff';
    g.fillRect(x, y, w, h);
  };
  for (let s = 0; s < 8; s++) {
    const o = s * T;
    switch (s) {
      case 0:
        f(o + 3, 0, T - 6, T * 0.8);
        break;
      case 1:
        f(o + T * 0.22, T * 0.22, T * 0.56, T * 0.54);
        break;
      case 2:
        for (const fx of [0.16, 0.56]) f(o + T * (fx + 0.03), T * 0.17, T * 0.22, T * 0.62);
        break;
      case 3: {
        const cx = o + T / 2,
          w = T * 0.5,
          top = T * 0.18,
          bot = T * 0.82;
        g.fillStyle = '#fff';
        g.beginPath();
        g.rect(cx - w / 2, top + w / 2, w, bot - top - w / 2);
        g.arc(cx, top + w / 2, w / 2, Math.PI, 0);
        g.fill();
        break;
      }
      case 4:
        f(o + T * 0.11, T * 0.13, T * 0.78, T * 0.66);
        break;
      case 5:
        f(o, T * 0.28, T, T * 0.5);
        break;
      case 6:
        f(o + T * 0.3, 0, T * 0.4, T * 0.74);
        break;
      case 7:
        f(o + 4, T * 0.12, T - 8, T * 0.7);
        f(o + T * 0.63, T * 0.34, T * 0.16, T * 0.3);
        break;
    }
  }
  // Mullions are drawn as frame shading but must also cut the glass mask.
  const cut = (x: number, y: number, w: number, h: number): void => {
    g.fillStyle = '#000';
    g.fillRect(x, y, w, h);
  };
  cut(T / 2 - 2, 0, 4, T * 0.8);
  cut(T + T / 2 - 2, T * 0.22, 4, T * 0.54);
  cut(3 * T + T / 2 - 2, T * 0.43, 4, T * 0.39);
  for (let i = 1; i < 4; i++) cut(4 * T + T * 0.11 + (T * 0.78 * i) / 4 - 1.5, T * 0.13, 3, T * 0.66);
  for (let j = 1; j < 3; j++) cut(4 * T + T * 0.11, T * 0.13 + (T * 0.66 * j) / 3 - 1.5, T * 0.78, 3);
  cut(5 * T + T - 3, T * 0.28, 3, T * 0.5);
  cut(7 * T + T * 0.6, T * 0.3, T * 0.03, T * 0.52);
  cut(7 * T + T / 3, T * 0.12, 3, T * 0.7);
  for (const fx of [0.16, 0.56]) cut(2 * T + T * fx, T * 0.45, T * 0.28, 3);
}

/** Opaque grey shading for frames, mullions and sills (multiplies the wall colour). */
function drawShades(g: CanvasRenderingContext2D, T: number): void {
  const f = (x: number, y: number, w: number, h: number, shade: number): void => {
    const v = Math.round(255 * shade);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, y, w, h);
  };
  for (let s = 0; s < 8; s++) {
    const o = s * T;
    switch (s) {
      case 0:
        f(o + T / 2 - 2, 0, 4, T * 0.8, 0.55);
        f(o, T * 0.8, T, T * 0.2, 0.82);
        f(o, 0, 3, T, 0.6);
        f(o + T - 3, 0, 3, T, 0.6);
        break;
      case 1:
        f(o + T * 0.18, T * 0.18, T * 0.64, T * 0.62, 0.62);
        f(o + T / 2 - 2, T * 0.22, 4, T * 0.54, 0.6);
        f(o + T * 0.15, T * 0.8, T * 0.7, T * 0.06, 0.78);
        f(o + T * 0.15, T * 0.12, T * 0.7, T * 0.06, 0.85);
        break;
      case 2:
        for (const fx of [0.16, 0.56]) {
          f(o + T * fx, T * 0.14, T * 0.28, T * 0.68, 0.6);
          f(o + T * fx, T * 0.45, T * 0.28, 3, 0.6);
        }
        break;
      case 3: {
        const cx = o + T / 2,
          w = T * 0.5,
          top = T * 0.18,
          bot = T * 0.82;
        g.fillStyle = 'rgb(150,150,150)';
        g.beginPath();
        g.rect(cx - w / 2 - 4, top + w / 2, w + 8, bot - top - w / 2);
        g.arc(cx, top + w / 2, w / 2 + 4, Math.PI, 0);
        g.fill();
        f(cx - 2, top + w / 2, 4, bot - top - w / 2, 0.6);
        f(cx - w / 2 - 6, bot, w + 12, 7, 0.8);
        break;
      }
      case 4:
        f(o + T * 0.08, T * 0.1, T * 0.84, T * 0.72, 0.5);
        for (let i = 1; i < 4; i++) f(o + T * 0.11 + (T * 0.78 * i) / 4 - 1.5, T * 0.13, 3, T * 0.66, 0.45);
        for (let j = 1; j < 3; j++) f(o + T * 0.11, T * 0.13 + (T * 0.66 * j) / 3 - 1.5, T * 0.78, 3, 0.45);
        break;
      case 5:
        f(o, T * 0.26, T, 4, 0.6);
        f(o, T * 0.78, T, 4, 0.6);
        f(o + T - 3, T * 0.28, 3, T * 0.5, 0.55);
        break;
      case 6:
        f(o + T * 0.3, T * 0.74, T * 0.4, T * 0.26, 0.7);
        f(o + T * 0.26, 0, T * 0.04, T, 0.55);
        f(o + T * 0.7, 0, T * 0.04, T, 0.55);
        break;
      case 7:
        f(o, T * 0.82, T, T * 0.18, 0.55);
        f(o, T * 0.06, T, T * 0.06, 0.5);
        f(o + T * 0.6, T * 0.3, T * 0.22, T * 0.52, 0.42);
        f(o + T / 3, T * 0.12, 3, T * 0.7, 0.5);
        break;
    }
  }
}

const SIGN_COLORS: Array<[string, string, string]> = [
  ['#0f5c63', '#ffb020', '#f4efe6'],
  ['#d9334a', '#fff3d6', '#2a1a20'],
  ['#2a2f8f', '#7fe0ff', '#ffffff'],
  ['#1d1d1d', '#ff5fa2', '#ffe14d'],
  ['#ffcc33', '#1d1d1d', '#d9334a'],
  ['#3a8f4a', '#ffffff', '#ffe14d'],
  ['#6b2fa3', '#ffd0f0', '#ffffff'],
  ['#e8742a', '#1d1d1d', '#fff3d6'],
];

/**
 * Sign atlas: 16 shop signs (4x4 grid of 256x128 tiles) followed by 8
 * billboards (2x4 grid of 512x256 tiles) below. All names are fictional.
 */
export function makeSignAtlas(): { texture: Texture; signRect: (i: number) => [number, number, number, number]; boardRect: (i: number) => [number, number, number, number] } {
  const W = 1024,
    H = 1024;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#111';
  g.fillRect(0, 0, W, H);
  const font = (px: number): string => `900 ${px}px Impact, "Arial Black", "Arial Narrow", system-ui, sans-serif`;
  const fit = (text: string, maxW: number, start: number): number => {
    let px = start;
    g.font = font(px);
    while (g.measureText(text).width > maxW && px > 10) {
      px -= 2;
      g.font = font(px);
    }
    return px;
  };
  tr.signs.forEach((name, i) => {
    const x = (i % 4) * 256,
      y = Math.floor(i / 4) * 128;
    const [bg, fg, ac] = SIGN_COLORS[i % SIGN_COLORS.length]!;
    g.fillStyle = bg;
    g.fillRect(x + 4, y + 4, 248, 120);
    g.strokeStyle = ac;
    g.lineWidth = 6;
    g.strokeRect(x + 10, y + 10, 236, 108);
    const px = fit(name, 212, 54);
    g.font = font(px);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, x + 128, y + 66);
  });
  tr.billboards.forEach(([head, sub], i) => {
    const x = (i % 2) * 512,
      y = 512 + Math.floor(i / 2) * 128;
    const [bg, fg, ac] = SIGN_COLORS[(i + 3) % SIGN_COLORS.length]!;
    const grd = g.createLinearGradient(x, y, x + 512, y + 128);
    grd.addColorStop(0, bg);
    grd.addColorStop(1, ac);
    g.fillStyle = grd;
    g.fillRect(x + 4, y + 4, 504, 120);
    // Halftone dots for the comic look.
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let yy = y + 10; yy < y + 124; yy += 10) for (let xx = x + 10; xx < x + 508; xx += 10) {
      g.beginPath();
      g.arc(xx + ((yy / 10) % 2) * 5, yy, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    let px = fit(head, 470, 64);
    g.font = font(px);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = '#111';
    g.strokeText(head, x + 256, y + 50);
    g.fillText(head, x + 256, y + 50);
    px = fit(sub, 440, 34);
    g.font = font(px);
    g.fillStyle = '#fff';
    g.fillText(sub, x + 256, y + 100);
  });
  // Helipad decal at the bottom-right (256x256 at 768,768).
  {
    const x = 768,
      y = 768,
      s = 256;
    g.fillStyle = '#2b2f36';
    g.fillRect(x, y, s, s);
    g.strokeStyle = '#ffb020';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#f4efe6';
    g.font = font(150);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', x + s / 2, y + s / 2 + 8);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.flipY = false;
  tex.needsUpdate = true;
  return {
    texture: tex,
    signRect: (i: number) => {
      const k = i % 16;
      return [((k % 4) * 256) / W, (Math.floor(k / 4) * 128) / H, 256 / W, 128 / H];
    },
    boardRect: (i: number) => {
      const k = i % 8;
      return [((k % 2) * 512) / W, (512 + Math.floor(k / 2) * 128) / H, 512 / W, 128 / H];
    },
  };
}

export const HELIPAD_RECT: [number, number, number, number] = [768 / 1024, 768 / 1024, 256 / 1024, 256 / 1024];
