import { activeLyricIndex, type LyricLine } from '../lib/lyric-timing.js';
import { element, attr } from './dom.js';

export class PlaybackPreview {
  readonly root = element('div', 'lyric-playback-preview');
  private lines: LyricLine[] | null = null;
  private active = -2;
  private anchor = -2;
  private observer: ResizeObserver;
  constructor() {
    attr(this.root, 'role', 'region'); attr(this.root, 'aria-label', '滚动歌词预览'); attr(this.root, 'part', 'preview');
    this.observer = new ResizeObserver(() => this.center()); this.observer.observe(this.root);
  }
  update(lines: LyricLine[], positionMs: number) {
    const changed = this.lines !== lines;
    if (changed) {
      this.lines = lines;
      this.root.replaceChildren(...lines.flatMap((line, index) => {
        if (!line.text) return [];
        const row = element('p', '', line.text); row.dataset.lyricRow = String(index); return [row];
      }));
    }
    const active = activeLyricIndex(lines, positionMs);
    const anchor = active >= 0 ? active : lines.reduce((last, line, index) => line.timeMs !== null && line.timeMs <= positionMs ? index : last, 0);
    if (active !== this.active || changed) {
      this.active = active;
      for (const row of this.root.querySelectorAll<HTMLElement>('p')) {
        const current = Number(row.dataset.lyricRow) === active;
        row.classList.toggle('is-active', current); attr(row, 'aria-current', current ? 'true' : null);
      }
    }
    if (anchor !== this.anchor || changed) {
      this.anchor = anchor; this.observer.disconnect(); this.observer.observe(this.root);
      const row = this.row(); if (row) this.observer.observe(row); this.center();
    }
  }
  private row() { return this.root.querySelector<HTMLElement>('[data-lyric-row="' + this.anchor + '"]'); }
  private center() {
    const row = this.row(); if (!row || this.root.hidden) return;
    this.root.scrollTo({ top: row.offsetTop - (this.root.clientHeight - row.offsetHeight) / 2,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  destroy() { this.observer.disconnect(); }
}
