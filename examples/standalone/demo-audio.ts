import lyrics from './assets/yuexia-duzhuo-changle-gongwu.txt?raw';

/** Maintainer-provided demo media; bundled only with the playground, never the npm package. */
export const demoMedia = {
  audioURL: new URL('./assets/yuexia-duzhuo-changle-gongwu.mp3', import.meta.url).href,
  filename: '月下独酌 · 长乐宫舞.mp3',
  mimeType: 'audio/mpeg',
  lyrics,
};
