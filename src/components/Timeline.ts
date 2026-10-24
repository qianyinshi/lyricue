import { formatLyricTime, lyricBoundaryEditMode, lyricBoundaryLimits, lyricEndMs, resizeLyricBoundary, sameLyricRanges, type LyricEdge, type LyricLine } from '../lib/lyric-timing.js';
import type { AudioWaveform } from '../lib/audio-waveform.js';
import { formatLyricMarkerTime, type LyricMarker } from '../lib/lyric-markers.js';
import { translate } from './i18n.js';
import { element, attr, text } from './dom.js';

export interface TimelineData {
  lines: LyricLine[]; selected: number; durationMs: number; positionMs: number; playing: boolean;
  keyboardEnabled: boolean; markers: LyricMarker[]; currentMarkerID?: number; recordingIndex?: number;
  readonly: boolean; waveform: AudioWaveform | null;
}
interface Callbacks {
  select: (index: number) => void; seek: (ms: number) => void; change: (lines: LyricLine[], index: number) => void;
  pause: () => void; audition: (index: number) => void;
  boundary: (index: number, edge: LyricEdge, separate: boolean, lines?: LyricLine[]) => void;
}
interface BoundaryDrag {
  kind: 'boundary'; original: LyricLine[]; result: LyricLine[]; index: number; edge: LyricEdge;
  clientX: number; initialX: number; moved: boolean; separate: boolean; unsnapped: boolean; grabOffsetMs: number;
}
type Drag = BoundaryDrag | { kind: 'scrub' };
const HEIGHT = 220, RULER = 32, WAVE_HEIGHT = 96;
function rulerStep(scale: number) {
  return [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000]
    .find(step => step / 1000 * scale >= 80) ?? 600000;
}

export class Timeline {
  readonly root = element('section', 'lyric-timeline');
  readonly viewport = element('div', 'lyric-timeline-scroll');
  private content = element('div', 'lyric-timeline-content');
  private canvas = element('canvas');
  private selection = element('div', 'lyric-timeline-wave-selection');
  private playhead = element('div', 'lyric-timeline-playhead');
  private pending = element('div', 'lyric-timeline-pending');
  private clips = new Map<number, HTMLDivElement>();
  private markerNodes = new Map<number, HTMLDivElement>();
  private data: TimelineData | null = null;
  private scale = 80;
  private locale: 'zh-CN' | 'en' = 'zh-CN';
  setLocale(locale: 'zh-CN' | 'en' = 'zh-CN') { this.locale = locale; this.paintKey = ''; this.render(); }
  private drag: Drag | null = null;
  private dragFrame = 0;
  private observer: ResizeObserver;
  private paintKey = '';
  private paintedWave: AudioWaveform | null = null;
  private rendering = false;
  private lastMarker: number | undefined;
  private hovered: { index: number; edge: LyricEdge; separate: boolean } | null = null;

  constructor(private callbacks: Callbacks) {
    attr(this.root, 'aria-label', '歌词时间线微调'); attr(this.root, 'part', 'timeline');
    const tracks = element('div', 'lyric-timeline-tracks'); this.root.append(tracks); tracks.append(this.viewport); this.viewport.append(this.content);
    this.content.append(this.canvas, this.selection, this.pending, this.playhead); this.playhead.append(element('i'));
    attr(this.selection, 'aria-hidden', true); attr(this.playhead, 'aria-hidden', true);
    this.viewport.tabIndex = 0; attr(this.viewport, 'role', 'region'); attr(this.viewport, 'aria-label', '音频与歌词轨道，横向滚动查看');
    this.viewport.addEventListener('scroll', () => this.render());
    this.viewport.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); this.zoom(this.pps * Math.exp(-event.deltaY * .003), event.clientX - this.viewport.getBoundingClientRect().left);
    }, { passive: false });
    this.content.addEventListener('pointerdown', event => {
      if (!this.data || this.data.readonly || event.button !== 0 || (event.target as HTMLElement).closest('button, input')) return;
      this.callbacks.pause(); this.callbacks.seek(this.timeAt(event.clientX)); this.drag = { kind: 'scrub' }; this.content.setPointerCapture(event.pointerId);
    });
    this.content.addEventListener('pointermove', event => {
      if (this.drag?.kind === 'boundary') {
        this.drag.clientX = event.clientX; this.drag.unsnapped = event.shiftKey;
        if (Math.abs(event.clientX - this.drag.initialX) >= 2) this.drag.moved = true;
        if (this.drag.moved) this.updateBoundary(this.drag);
      } else if (this.drag?.kind === 'scrub') this.callbacks.seek(this.timeAt(event.clientX));
    });
    this.content.addEventListener('pointerup', event => {
      this.finishDrag(true); if (this.content.hasPointerCapture(event.pointerId)) this.content.releasePointerCapture(event.pointerId);
    });
    this.content.addEventListener('pointercancel', () => this.finishDrag(false));
    this.content.addEventListener('lostpointercapture', () => { if (this.drag) this.finishDrag(false); });
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.drag) { event.preventDefault(); event.stopPropagation(); this.finishDrag(false); }
    });
    this.observer = new ResizeObserver(() => this.render()); this.observer.observe(this.viewport);
  }
  private get fitScale() { return this.viewport.clientWidth / Math.max((this.data?.durationMs ?? 0) / 1000, .001); }
  private get pps() { return Math.max(this.fitScale, this.scale); }
  private get width() { return Math.max(this.viewport.clientWidth, (this.data?.durationMs ?? 0) / 1000 * this.pps); }
  update(data: TimelineData) { this.data = data; this.render(); }
  handleZoom(event: KeyboardEvent) {
    if (!this.data?.keyboardEnabled || event.metaKey || event.ctrlKey || event.altKey || !['+', '=', '-', '0'].includes(event.key)) return false;
    event.preventDefault();
    if (event.key === '0') { this.scale = this.fitScale; this.viewport.scrollLeft = 0; this.render(); }
    else this.zoom(this.pps * (event.key === '-' ? 1 / 1.5 : 1.5));
    return true;
  }
  private zoom(next: number, x = this.viewport.clientWidth / 2) {
    const anchor = (this.viewport.scrollLeft + x) / this.pps * 1000;
    this.scale = Math.min(Math.max(this.fitScale, 1000), Math.max(this.fitScale, next));
    this.content.style.width = this.width + 'px'; this.viewport.scrollLeft = Math.max(0, anchor / 1000 * this.pps - x); this.render();
  }
  private reveal(time: number) {
    const cursor = time / 1000 * this.pps;
    if (cursor < this.viewport.scrollLeft + 16 || cursor > this.viewport.scrollLeft + this.viewport.clientWidth - 24)
      this.viewport.scrollLeft = Math.max(0, cursor - this.viewport.clientWidth * .2);
  }
  private render() {
    if (!this.data || this.rendering) return;
    this.rendering = true;
    try {
      const d = this.data, lines = this.drag?.kind === 'boundary' ? this.drag.result : d.lines;
      this.root.classList.toggle('is-readonly', d.readonly); this.content.style.width = this.width + 'px';
      if (!this.drag && d.playing) this.reveal(d.positionMs);
      if (!this.drag && d.currentMarkerID !== this.lastMarker && d.currentMarkerID !== undefined) {
        const marker = d.markers.find(marker => marker.id === d.currentMarkerID); if (marker) this.reveal(marker.timeMs);
      }
      this.lastMarker = d.currentMarkerID;
      this.paint(); this.playhead.style.left = d.positionMs / 1000 * this.pps + 'px';
      const selected = lines[d.selected]; this.selection.hidden = !selected?.text || selected.timeMs == null;
      if (selected?.timeMs != null) {
        this.selection.style.left = selected.timeMs / 1000 * this.pps + 'px';
        this.selection.style.width = Math.max(0, lyricEndMs(lines, d.selected, d.durationMs) - selected.timeMs) / 1000 * this.pps + 'px';
      }
      const visible = new Set<number>();
      lines.forEach((line, index) => {
        if (line.timeMs === null || !line.text) return;
        const end = lyricEndMs(lines, index, d.durationMs), left = line.timeMs / 1000 * this.pps, width = Math.max(2, (end - line.timeMs) / 1000 * this.pps);
        if (left + width < this.viewport.scrollLeft - 24 || left > this.viewport.scrollLeft + this.viewport.clientWidth + 24) return;
        visible.add(index);
        let node = this.clips.get(index);
        if (!node) { node = this.makeClip(index); this.clips.set(index, node); this.content.append(node); }
        node.classList.toggle('is-selected', index === d.selected); node.classList.toggle('is-recording', index === d.recordingIndex);
        node.style.left = left + 'px'; node.style.width = width + 'px';
        attr(node, 'title', d.readonly ? null : line.text + '\n' + formatLyricTime(line.timeMs) + ' → ' + formatLyricTime(end));
        const label = node.querySelector<HTMLButtonElement>('.lyric-clip-text')!; text(label, line.text); label.disabled = d.readonly;
        attr(label, 'aria-label', (this.locale === 'en' ? 'Select lyric ' : '选中歌词片段 ') + (index + 1) + ': ' + line.text); attr(label, 'aria-pressed', index === d.selected);
        for (const edge of ['start', 'end'] as const) {
          let handle = node.querySelector<HTMLButtonElement>('.is-' + edge);
          if (d.readonly) { handle?.remove(); continue; }
          if (!handle) { handle = this.makeEdge(index, edge); node.append(handle); }
          attr(handle, 'aria-label', this.locale === 'en' ? 'Line ' + (index + 1) + ' ' + edge + ' boundary' : '第 ' + (index + 1) + ' 行' + (edge === 'start' ? '开始' : '结束') + '边界');
          const limits = lyricBoundaryLimits(lines, index, edge, d.durationMs);
          const separate = this.hovered?.index === index && this.hovered.edge === edge ? this.hovered.separate : !limits.shared;
          this.setEdgeMode(handle, separate);
          attr(handle, 'aria-valuemin', limits.min); attr(handle, 'aria-valuemax', limits.max);
          const value = edge === 'start' ? line.timeMs : end; attr(handle, 'aria-valuenow', value); attr(handle, 'aria-valuetext', formatLyricTime(value));
        }
      });
      for (const [index, node] of this.clips) if (!visible.has(index)) { node.remove(); this.clips.delete(index); }
      const pendingIndex = selected?.text ? d.selected : lines.findIndex((line, index) => index > d.selected && line.text);
      const pending = lines[pendingIndex]; this.pending.hidden = !pending || !(selected?.timeMs === null || !selected?.text);
      if (!this.pending.hidden) {
        text(this.pending, pending.text); this.pending.dataset.pendingIndex = String(pendingIndex);
        attr(this.pending, 'aria-label', (this.locale === 'en' ? 'Next line: ' : '待打轴：') + pending.text); attr(this.pending, 'aria-live', 'polite');
        this.pending.style.left = Math.max(this.viewport.scrollLeft + 12, Math.min(d.positionMs / 1000 * this.pps + 12, this.viewport.scrollLeft + this.viewport.clientWidth - 120)) + 'px';
      }
      const markerIDs = new Set(d.markers.map(marker => marker.id));
      for (const [id, node] of this.markerNodes) if (!markerIDs.has(id)) { node.remove(); this.markerNodes.delete(id); }
      for (const marker of d.markers) {
        let node = this.markerNodes.get(marker.id);
        if (!node) { node = element('div', 'lyric-timeline-marker'); node.append(element('span')); this.markerNodes.set(marker.id, node); this.content.append(node); }
        node.dataset.markerId = String(marker.id); node.dataset.timeMs = String(marker.timeMs);
        node.classList.toggle('is-current', marker.id === d.currentMarkerID); node.classList.toggle('is-near-end', this.width - marker.timeMs / 1000 * this.pps < 70);
        attr(node, 'aria-label', (this.locale === 'en' ? 'Marker ' : '标记 ') + formatLyricMarkerTime(marker.timeMs)); text(node.firstElementChild as HTMLElement, formatLyricMarkerTime(marker.timeMs));
        node.style.left = Math.min(this.width - 1, marker.timeMs / 1000 * this.pps) + 'px';
      }
    } finally { this.rendering = false; }
  }
  private makeClip(index: number) {
    const node = element('div', 'lyric-timeline-clip'); node.dataset.clipIndex = String(index);
    const label = element('button', 'lyric-clip-text'); label.type = 'button'; label.addEventListener('click', () => this.callbacks.audition(index)); node.append(label); return node;
  }
  private setEdgeMode(node: HTMLElement, separate: boolean) {
    node.dataset.editMode = separate ? 'single' : 'shared'; node.style.cursor = separate ? 'ew-resize' : 'col-resize';
    attr(node, 'title', translate(separate ? '单侧编辑：只调整本句' : '双侧编辑：同时调整相邻两句', this.locale));
  }
  private makeEdge(index: number, edge: LyricEdge) {
    const handle = element('button', 'lyric-clip-edge is-' + edge); handle.type = 'button'; handle.append(element('i'));
    attr(handle, 'role', 'slider'); attr(handle, 'aria-label', this.locale === 'en' ? 'Line ' + (index + 1) + ' ' + edge + ' boundary' : '第 ' + (index + 1) + ' 行' + (edge === 'start' ? '开始' : '结束') + '边界'); attr(handle, 'aria-orientation', 'horizontal');
    const hover = (event: PointerEvent) => {
      if (this.drag || !this.data || this.data.readonly) return;
      const separate = this.pointerMode(event.clientX, index, edge, event.pointerType === 'touch') === 'single';
      this.hovered = { index, edge, separate }; this.setEdgeMode(handle, separate);
    };
    handle.addEventListener('pointerenter', hover); handle.addEventListener('pointermove', hover);
    handle.addEventListener('pointerleave', () => { if (!this.drag) { this.hovered = null; this.render(); } });
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !this.data || this.data.readonly) return;
      event.preventDefault(); event.stopPropagation(); handle.focus({ preventScroll: true });
      this.callbacks.pause(); this.callbacks.select(index);
      const lines = this.data.lines, boundary = edge === 'start' ? lines[index].timeMs! : lyricEndMs(lines, index, this.data.durationMs);
      const separate = this.pointerMode(event.clientX, index, edge, event.pointerType === 'touch') === 'single';
      this.hovered = { index, edge, separate };
      this.drag = { kind: 'boundary', original: lines, result: lines, index, edge, clientX: event.clientX, initialX: event.clientX, moved: false, separate, unsnapped: event.shiftKey, grabOffsetMs: boundary - this.timeAt(event.clientX) };
      this.content.setPointerCapture(event.pointerId); this.content.classList.add('is-resizing'); this.content.style.cursor = separate ? 'ew-resize' : 'col-resize';
      this.dragFrame = requestAnimationFrame(() => this.autoScroll());
    });
    handle.addEventListener('click', event => event.stopPropagation());
    handle.addEventListener('keydown', event => {
      if (!this.data?.keyboardEnabled || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      const separate = handle.dataset.editMode === 'single';
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); if (!event.repeat) { this.callbacks.pause(); this.callbacks.boundary(index, edge, separate); } return;
      }
      if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.shiftKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); this.callbacks.pause();
      const lines = this.data.lines, limits = lyricBoundaryLimits(lines, index, edge, this.data.durationMs), value = edge === 'start' ? lines[index].timeMs! : lyricEndMs(lines, index, this.data.durationMs);
      const next = event.key === 'Home' ? limits.min : event.key === 'End' ? limits.max : value + (event.key === 'ArrowLeft' ? -1 : 1);
      this.callbacks.change(resizeLyricBoundary(lines, index, edge, next, this.data.durationMs), index);
    });
    return handle;
  }
  private timeAt(clientX: number) { return Math.max(0, Math.min(this.data!.durationMs, (clientX - this.viewport.getBoundingClientRect().left + this.viewport.scrollLeft) / this.pps * 1000)); }
  private pointerMode(clientX: number, index: number, edge: LyricEdge, touch: boolean) {
    const d = this.data!, boundary = edge === 'start' ? d.lines[index].timeMs! : lyricEndMs(d.lines, index, d.durationMs);
    return lyricBoundaryEditMode(d.lines, index, edge, Math.abs(this.timeAt(clientX) - boundary) / 1000 * this.pps, d.durationMs, touch ? 8 : 4);
  }
  private updateBoundary(drag: BoundaryDrag) {
    const d = this.data!; let time = this.timeAt(drag.clientX) + drag.grabOffsetMs;
    if (!drag.unsnapped) {
      const candidates = [0, d.durationMs, d.positionMs], shared = lyricBoundaryLimits(drag.original, drag.index, drag.edge, d.durationMs, drag.separate).shared;
      drag.original.forEach((line, index) => {
        if (index === drag.index || line.timeMs == null) return;
        if (!(shared && drag.edge === 'end' && index === drag.index + 1)) candidates.push(line.timeMs);
        if (!(shared && drag.edge === 'start' && index === drag.index - 1)) candidates.push(lyricEndMs(drag.original, index, d.durationMs));
      });
      let closest = 6 / this.pps * 1000; const unsnapped = time;
      for (const candidate of candidates) if (Math.abs(candidate - unsnapped) < closest) { closest = Math.abs(candidate - unsnapped); time = candidate; }
    }
    drag.result = resizeLyricBoundary(drag.original, drag.index, drag.edge, time, d.durationMs, drag.separate); this.render();
  }
  private autoScroll() {
    const drag = this.drag; if (drag?.kind !== 'boundary') return;
    const rect = this.viewport.getBoundingClientRect(), distance = drag.clientX < rect.left + 32 ? drag.clientX - rect.left - 32 : drag.clientX > rect.right - 32 ? drag.clientX - rect.right + 32 : 0;
    if (distance && drag.moved) { this.viewport.scrollLeft += Math.max(-18, Math.min(18, distance / 3)); this.updateBoundary(drag); }
    this.dragFrame = requestAnimationFrame(() => this.autoScroll());
  }
  private finishDrag(commit: boolean) {
    const drag = this.drag; this.drag = null; cancelAnimationFrame(this.dragFrame); this.content.classList.remove('is-resizing'); this.content.style.cursor = ''; this.render();
    if (commit && drag?.kind === 'boundary') {
      if (!sameLyricRanges(drag.original, drag.result)) this.callbacks.change(drag.result, drag.index);
      this.callbacks.boundary(drag.index, drag.edge, drag.separate, drag.result);
    }
  }
  private paint() {
    const d = this.data!, width = this.viewport.clientWidth, left = this.viewport.scrollLeft, pps = this.pps, step = rulerStep(pps);
    const styles = getComputedStyle(this.root);
    const color = (name: string, fallback: string) => styles.getPropertyValue('--lyrics-' + name).trim() || fallback;
    const palette = { ruler: color('ruler-background', '#f6f6f4'), waveBackground: color('wave-background', '#f8faf8'), track: color('track-background', '#fcfcfb'), grid: color('grid', '#e5e7e3'), text: color('muted', '#656565'), waveform: color('waveform', '#688276') };
    const ratio = window.devicePixelRatio || 1, key = [width, left, pps, d.durationMs, ratio, ...Object.values(palette)].join(':');
    if (key === this.paintKey && this.paintedWave === d.waveform) return;
    this.paintKey = key; this.paintedWave = d.waveform;
    const ctx = this.canvas.getContext('2d'); if (!ctx || !width) return;
    this.canvas.width = Math.round(width * ratio); this.canvas.height = HEIGHT * ratio; this.canvas.style.width = width + 'px'; this.canvas.style.height = HEIGHT + 'px'; ctx.scale(ratio, ratio);
    attr(this.canvas, 'aria-label', translate(d.waveform ? '真实音频波形' : '音频波形待加载', this.locale));
    ctx.fillStyle = palette.ruler; ctx.fillRect(0, 0, width, RULER); ctx.fillStyle = palette.waveBackground; ctx.fillRect(0, RULER, width, WAVE_HEIGHT); ctx.fillStyle = palette.track; ctx.fillRect(0, RULER + WAVE_HEIGHT, width, HEIGHT); ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
    const fromMs = left / pps * 1000, toMs = Math.min(d.durationMs, (left + width) / pps * 1000);
    for (let time = Math.floor(fromMs / step) * step; time <= toMs; time += step) {
      const x = time / 1000 * pps - left; ctx.strokeStyle = palette.grid; ctx.beginPath(); ctx.moveTo(x + .5, RULER - 6); ctx.lineTo(x + .5, HEIGHT); ctx.stroke(); ctx.fillStyle = palette.text; ctx.fillText(formatLyricTime(time).slice(0, step >= 1000 ? -4 : undefined), x + 5, 18);
    }
    const middle = RULER + WAVE_HEIGHT / 2; ctx.strokeStyle = palette.grid; ctx.beginPath(); ctx.moveTo(0, middle + .5); ctx.lineTo(width, middle + .5); ctx.stroke();
    const wave = d.waveform; if (!wave) return;
    ctx.strokeStyle = palette.waveform; ctx.beginPath(); const heightScale = (WAVE_HEIGHT / 2 - 9) / Math.max(wave.peak, .00001);
    for (let x = 0; x < width; x++) {
      const from = Math.max(0, Math.floor((fromMs + x / pps * 1000) / wave.binMs)), to = Math.min(wave.min.length, Math.max(from + 1, Math.ceil((fromMs + (x + 1) / pps * 1000) / wave.binMs)));
      let low = 0, high = 0; for (let bin = from; bin < to; bin++) { low = Math.min(low, wave.min[bin]); high = Math.max(high, wave.max[bin]); }
      ctx.moveTo(x + .5, middle - high * heightScale); ctx.lineTo(x + .5, middle - low * heightScale);
    }
    ctx.stroke();
  }
  destroy() { this.observer.disconnect(); cancelAnimationFrame(this.dragFrame); this.drag = null; }
}
