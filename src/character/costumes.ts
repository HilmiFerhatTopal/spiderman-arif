/**
 * Hero costumes. The suit is built once; every vertex belongs to a colour slot
 * and a costume only fills the slots (see setCostume in rig.ts), so switching
 * is a buffer write, not a rebuild. Names shown in the menu live in tr.ts.
 */

export const COSTUME_IDS = ['redGold', 'redNavy', 'blackGold', 'blackWhite'] as const;
export type CostumeId = (typeof COSTUME_IDS)[number];

export const DEFAULT_COSTUME: CostumeId = 'redNavy';

/**
 * Colour slots: main suit colour (mask, chest, gloves, boots), side and leg
 * panels, trims and emblem, lens fill, lens rims and seams, and dark hardware
 * (wrist launchers, soles).
 */
export const SLOTS = ['primary', 'secondary', 'accent', 'lens', 'rim', 'detail'] as const;
export type Slot = (typeof SLOTS)[number];

type Rgb = readonly [number, number, number];

export interface Costume {
  /** Linear-ish RGB per slot (vertex colours). */
  colors: Readonly<Record<Slot, Rgb>>;
  /** Self-illumination per slot, 0..1 (kept low so the cel ramp still reads). */
  emit: Readonly<Record<Slot, number>>;
}

const LENS: Rgb = [0.93, 0.95, 0.97];
const RIM: Rgb = [0.025, 0.025, 0.03];

export const COSTUMES: Readonly<Record<CostumeId, Costume>> = {
  redGold: {
    colors: { primary: [0.62, 0.05, 0.06], secondary: [0.7, 0.44, 0.07], accent: [1.0, 0.76, 0.22], lens: LENS, rim: RIM, detail: [0.1, 0.07, 0.06] },
    emit: { primary: 0, secondary: 0.05, accent: 0.22, lens: 0.18, rim: 0, detail: 0 },
  },
  redNavy: {
    colors: { primary: [0.66, 0.05, 0.07], secondary: [0.04, 0.08, 0.27], accent: [0.03, 0.03, 0.05], lens: LENS, rim: RIM, detail: [0.06, 0.06, 0.08] },
    emit: { primary: 0, secondary: 0, accent: 0, lens: 0.18, rim: 0, detail: 0 },
  },
  blackGold: {
    colors: { primary: [0.05, 0.05, 0.06], secondary: [0.12, 0.12, 0.14], accent: [1.0, 0.72, 0.18], lens: LENS, rim: [0.55, 0.38, 0.08], detail: [0.03, 0.03, 0.035] },
    emit: { primary: 0, secondary: 0, accent: 0.3, lens: 0.2, rim: 0.1, detail: 0 },
  },
  blackWhite: {
    colors: { primary: [0.045, 0.045, 0.05], secondary: [0.62, 0.63, 0.66], accent: [0.9, 0.9, 0.92], lens: LENS, rim: [0.6, 0.6, 0.62], detail: [0.03, 0.03, 0.035] },
    emit: { primary: 0, secondary: 0, accent: 0.12, lens: 0.2, rim: 0.05, detail: 0 },
  },
};

export function isCostumeId(v: unknown): v is CostumeId {
  return typeof v === 'string' && (COSTUME_IDS as readonly string[]).includes(v);
}

/** CSS colour of a slot (menu swatches), sRGB hex from the vertex colour. */
export function slotCss(id: CostumeId, slot: Slot): string {
  const c = COSTUMES[id].colors[slot];
  const hex = (x: number): string =>
    Math.round(Math.min(1, Math.max(0, x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;
}
