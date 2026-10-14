import type { Game } from '../game';
import { MODE_NAMES } from '../player/player';
import { tuning } from '../config/tuning';
import {
  anchorAvailability,
  cityRoute,
  emptyBotInput,
  fuzz,
  parkRoute,
  ropeTest,
  stepWithInput,
  traversalBot,
  type BotInput,
} from './testDrivers';

declare global {
  interface Window {
    __game?: Record<string, unknown>;
  }
}

/** Deterministic test API, installed in dev builds only. */
export function installTestApi(game: Game): void {
  const held: BotInput = emptyBotInput();
  const prev: BotInput = emptyBotInput();
  const api = {
    ready: true,
    game,
    tuning,
    setManual(on: boolean): void {
      game.loop.manual = on;
      game.playing = true;
    },
    setInput(partial: Partial<BotInput>): void {
      Object.assign(held, partial);
    },
    setLook(yaw: number, pitch: number): void {
      game.rig.setLook(yaw, pitch);
    },
    step(n: number): unknown {
      for (let i = 0; i < n; i++) stepWithInput(game, held, prev);
      return api.state();
    },
    state(): Record<string, unknown> {
      const p = game.player;
      return {
        pos: [p.pos.x, p.pos.y, p.pos.z],
        vel: [p.vel.x, p.vel.y, p.vel.z],
        speed: p.speed,
        mode: MODE_NAMES[p.mode],
        grounded: p.grounded,
        rope: { attached: p.rope.attached, anchor: [p.rope.anchor.x, p.rope.anchor.y, p.rope.anchor.z], length: p.rope.length, good: p.rope.goodWindow },
        swingTarget: p.swingTarget.valid,
        zipTarget: p.zipTarget.valid,
        camera: [game.rig.position.x, game.rig.position.y, game.rig.position.z],
        yaw: game.rig.yaw,
        pitch: game.rig.pitch,
        stats: { ...p.stats },
        events: game.eventLog.slice(-20).map((e) => e.type),
      };
    },
    teleport(x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): void {
      game.player.teleport(x, y, z, vx, vy, vz);
      game.prevPos.copy(game.player.pos);
      game.snapCamera();
    },
    renderFrame(): Record<string, number> {
      game.renderOnce();
      const info = game.renderer.info;
      return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
    },
    layoutStats(): unknown {
      return { ...game.layout.stats, colliders: game.world.count, park: game.layout.park, spawn: game.layout.spawn };
    },
    ropeTest: (withDrag: boolean) => ropeTest(game, withDrag),
    fuzz: (seed: number, seconds: number) => fuzz(game, seed, seconds),
    anchorAvailability: (seed: number, count: number) => anchorAvailability(game, seed, count),
    cityBot: (maxSeconds = 300) => traversalBot(game, 'city', cityRoute(game), maxSeconds),
    parkBot: (maxSeconds = 200, diag = false) => traversalBot(game, 'park', parkRoute(game), maxSeconds, undefined, diag),
    cityBotDiag: (maxSeconds = 300) => traversalBot(game, 'city', cityRoute(game), maxSeconds, undefined, true),
    simTiming(): { msPerTick: number; ticks: number } {
      return { msPerTick: game.simTimeMs / Math.max(1, game.simTicksMeasured), ticks: game.simTicksMeasured };
    },
  };
  window.__game = api as unknown as Record<string, unknown>;
}
