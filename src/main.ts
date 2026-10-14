import { Game } from './game';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const seedParam = new URLSearchParams(location.search).get('seed');
  const seed = seedParam ? Number(seedParam) | 0 : 1337;
  const game = new Game({ seed, canvas });
  await game.init();
  game.playing = true;
  canvas.addEventListener('click', () => {
    game.input.enabled = true;
    game.input.requestLock();
  });
  game.start();
  if (import.meta.env.DEV) {
    const { installTestApi } = await import('./debug/testApi');
    installTestApi(game);
  }
}

boot().catch((e) => {
  console.error(e);
});
