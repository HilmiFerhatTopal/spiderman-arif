import { Vector3 } from 'three';

/** Snapshot of the player's intent for one simulation tick. */
export interface TickInput {
  /** Strafe right (+1) / left (-1). */
  moveX: number;
  /** Forward (+1) / back (-1). */
  moveY: number;
  jump: boolean;
  jumpPressed: boolean;
  sprint: boolean;
  dive: boolean;
  swing: boolean;
  swingPressed: boolean;
  swingReleased: boolean;
  zip: boolean;
  zipPressed: boolean;
  /** Mouse wheel notches this tick: positive reels in. */
  reel: number;
  yaw: number;
  pitch: number;
  /** Aim ray (camera centre ray) used for targeting. */
  aimOrigin: Vector3;
  aimDir: Vector3;
}

export function emptyTickInput(): TickInput {
  return {
    moveX: 0,
    moveY: 0,
    jump: false,
    jumpPressed: false,
    sprint: false,
    dive: false,
    swing: false,
    swingPressed: false,
    swingReleased: false,
    zip: false,
    zipPressed: false,
    reel: 0,
    yaw: 0,
    pitch: 0,
    aimOrigin: new Vector3(),
    aimDir: new Vector3(0, 0, -1),
  };
}

export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  dive: ['KeyC', 'KeyQ'],
} as const;

type ActionKey = keyof typeof KEYS;

/**
 * Keyboard and mouse state with pointer lock. Edges (press/release) are
 * latched until the next simulation tick consumes them, so short taps between
 * ticks are never lost.
 */
export class Input {
  private held = new Set<string>();
  private pressedSinceTick = new Set<string>();
  private mouseHeld = [false, false, false];
  private mousePressedSinceTick = [false, false, false];
  private mouseReleasedSinceTick = [false, false, false];
  private wheelAcc = 0;
  mouseDX = 0;
  mouseDY = 0;
  pointerLocked = false;
  /** Gameplay input is ignored while false (menus open). */
  enabled = false;
  private keyListeners: Array<(code: string, e: KeyboardEvent) => void> = [];
  private settleUntil = 0;
  private settleEvents = 0;
  private lockListeners: Array<(locked: boolean) => void> = [];

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', () => {
      this.pointerLocked = false;
    });
  }

  onKey(listener: (code: string, e: KeyboardEvent) => void): void {
    this.keyListeners.push(listener);
  }

  onLock(listener: (locked: boolean) => void): void {
    this.lockListeners.push(listener);
  }

  requestLock(): void {
    if (document.pointerLockElement === this.element) return;
    try {
      const result = this.element.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {
          /* Browser refused (e.g. too soon after Esc); the next click retries. */
        });
      }
    } catch {
      /* Pointer lock unsupported; mouse look still works while dragging is not required. */
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  keyHeld(code: string): boolean {
    return this.held.has(code);
  }

  isHeld(action: ActionKey): boolean {
    for (const code of KEYS[action]) if (this.held.has(code)) return true;
    return false;
  }

  private wasPressed(action: ActionKey): boolean {
    for (const code of KEYS[action]) if (this.pressedSinceTick.has(code)) return true;
    return false;
  }

  /** Fill a tick snapshot from live device state and clear latched edges. */
  sample(out: TickInput, yaw: number, pitch: number): void {
    const on = this.enabled;
    const f = on && this.isHeld('forward') ? 1 : 0;
    const b = on && this.isHeld('back') ? 1 : 0;
    const l = on && this.isHeld('left') ? 1 : 0;
    const r = on && this.isHeld('right') ? 1 : 0;
    out.moveX = r - l;
    out.moveY = f - b;
    out.jump = on && this.isHeld('jump');
    out.jumpPressed = on && this.wasPressed('jump');
    out.sprint = on && this.isHeld('sprint');
    out.dive = on && this.isHeld('dive');
    out.swing = on && this.mouseHeld[0]!;
    out.swingPressed = on && this.mousePressedSinceTick[0]!;
    out.swingReleased = on && this.mouseReleasedSinceTick[0]!;
    out.zip = on && this.mouseHeld[2]!;
    out.zipPressed = on && this.mousePressedSinceTick[2]!;
    out.reel = on ? this.wheelAcc : 0;
    out.yaw = yaw;
    out.pitch = pitch;
    this.pressedSinceTick.clear();
    this.mousePressedSinceTick.fill(false);
    this.mouseReleasedSinceTick.fill(false);
    this.wheelAcc = 0;
  }

  consumeMouse(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  clearAll(): void {
    this.held.clear();
    this.pressedSinceTick.clear();
    this.mouseHeld.fill(false);
    this.mousePressedSinceTick.fill(false);
    this.mouseReleasedSinceTick.fill(false);
    this.wheelAcc = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const gameKey =
      e.code === 'Space' ||
      e.code.startsWith('Arrow') ||
      e.code === 'Backquote' ||
      e.code === 'Tab' ||
      (this.pointerLocked && (e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'KeyW'));
    if (gameKey && !(e.target instanceof HTMLInputElement)) e.preventDefault();
    if (!e.repeat) {
      this.held.add(e.code);
      this.pressedSinceTick.add(e.code);
      for (const l of this.keyListeners) l(e.code, e);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private onBlur = (): void => {
    this.held.clear();
    this.mouseHeld.fill(false);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button > 2) return;
    if (!this.pointerLocked) return;
    this.mouseHeld[e.button] = true;
    this.mousePressedSinceTick[e.button] = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button > 2) return;
    if (this.mouseHeld[e.button]) this.mouseReleasedSinceTick[e.button] = true;
    this.mouseHeld[e.button] = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    // Browsers can report the jump from the cursor position to the lock
    // centre as movement right after locking: ignore that settle window.
    if (performance.now() < this.settleUntil || this.settleEvents > 0) {
      this.settleEvents--;
      return;
    }
    // Guard against the occasional huge spike some browsers emit on lock.
    const dx = Math.abs(e.movementX) > 600 ? 0 : e.movementX;
    const dy = Math.abs(e.movementY) > 600 ? 0 : e.movementY;
    this.mouseDX += dx;
    this.mouseDY += dy;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.pointerLocked) return;
    e.preventDefault();
    // Wheel up (negative deltaY) reels in.
    this.wheelAcc += e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
  };

  private onLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.element;
    this.settleUntil = performance.now() + 150;
    this.settleEvents = 2;
    if (!this.pointerLocked) {
      this.mouseHeld.fill(false);
      this.mouseDX = 0;
      this.mouseDY = 0;
    }
    for (const l of this.lockListeners) l(this.pointerLocked);
  };
}
