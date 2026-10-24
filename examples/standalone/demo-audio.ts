import lyrics from './assets/zijiequan-1012.txt?raw';

/** Maintainer-provided demo media; bundled only with the playground, never the npm package. */
export const demoMedia = {
  audioURL: new URL('./assets/zijiequan-1012.m4a', import.meta.url).href,
  filename: '字节圈 1012.m4a',
  durationMs: 257440,
  lyrics,
};
