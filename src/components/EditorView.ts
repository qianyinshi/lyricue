import { compactRecordedLyrics, createTimingState, lyricBoundaryPreview, lyricEndMs, parseLyrics, sameLyricRanges, serializeLyrics, timingIssues, timingReducer, type LyricDocument, type LyricEdge, type TimingAction, type TimingState } from '../lib/lyric-timing.js';
import { beginLyricTake, previewLyricTake, rewindLyricRecording, type LyricTake, type RecordingMode } from '../lib/lyric-recording.js';
import { addLyricMarker, lyricMarkerNavigation, toggleLyricMarker, type LyricMarker } from '../lib/lyric-markers.js';
import { buildAudioWaveform, type AudioWaveform } from '../lib/audio-waveform.js';
import type { LyricsEditorOptions, LyricsEditorEventDetails, LyricsEditorPhase } from '../types.js';
import { Timeline } from './Timeline.js';
import { PlaybackPreview } from './PlaybackPreview.js';
import { translateUI } from './i18n.js';
import { element, text, attr, button, keycap, icon } from './dom.js';

export const copyDocument = (document: LyricDocument): LyricDocument => ({ lines: document.lines.map(line => ({ ...line })), metadata: [...document.metadata] });
type Emit = <K extends keyof LyricsEditorEventDetails>(type: K, detail: LyricsEditorEventDetails[K]) => void;
export interface ViewSnapshot {
  state: TimingState; original: LyricDocument; mode: RecordingMode; phase: LyricsEditorPhase;
  markers: LyricMarker[]; positionMs: number; hasStarted: boolean; waveform: AudioWaveform | null;
}

export class EditorView {
  readonly root = element('div', 'lyrics-editor lyric-timing-workspace');
  private audio = element('audio');
  private label = element('div', 'lyric-phase-label');
  private empty = element('div', 'lyric-timing-empty');
  private waveStatus = element('div', 'lyric-waveform-status');
  private waveText = element('span');
  private retryWave = button('重试波形', () => void this.loadWaveform());
  private footer = element('div', 'lyric-timing-footer');
  private footerInfo = element('div');
  private status = element('span', 'lyric-editor-status');
  private hints = element('small', 'lyric-keyboard-hints');
  private playback = button('播放', () => this.togglePlayback());
  private save = button('保存歌词', () => this.apply(), true);
  private retry = button('重试音频', () => { this.mediaError = ''; this.ready = false; this.audio.load(); this.render(); });
  private complete = element('div', 'lyric-rough-complete');
  private timeline: Timeline;
  private preview = new PlaybackPreview();
  private state: TimingState;
  private original: LyricDocument;
  private mode: RecordingMode;
  private phase: LyricsEditorPhase;
  private take: LyricTake | null = null;
  private markers: LyricMarker[];
  private markerID: number;
  private durationMs = 0;
  private positionMs = 0;
  private hasStarted = false;
  private ready = false;
  private waiting = false;
  private mediaError = '';
  private waveform: AudioWaveform | null = null;
  private waveformError = '';
  private waveformLoading = false;
  private waveformAbort: AbortController | null = null;
  private auditionEnd: number | null = null;
  private frame = 0;
  private destroyed = false;
  private listeners = new AbortController();
  private renderedPhase: LyricsEditorPhase | null = null;
  private previousDirty: boolean | null = null;
  private previousPhase: LyricsEditorPhase | null = null;
  private keys: Record<string, HTMLButtonElement> = {};
  private captions: Record<string, HTMLElement> = {};

  constructor(private options: LyricsEditorOptions, private emit: Emit, snapshot?: ViewSnapshot) {
    this.options = { ...options };
    this.original = snapshot?.original ?? copyDocument(typeof options.lyrics === 'string' ? parseLyrics(options.lyrics) : options.lyrics);
    this.state = snapshot?.state ?? createTimingState(copyDocument(this.original).lines, [...this.original.metadata]);
    this.mode = snapshot?.mode ?? options.mode ?? 'tap';
    this.phase = snapshot?.phase ?? (this.state.lines.every(line => line.timeMs !== null) ? 'refine' : 'rough');
    this.markers = snapshot?.markers ?? []; this.markerID = Math.max(0, ...this.markers.map(marker => marker.id)) + 1;
    this.positionMs = snapshot?.positionMs ?? 0; this.hasStarted = snapshot?.hasStarted ?? false; this.waveform = snapshot?.waveform ?? null;
    this.root.tabIndex = 0; attr(this.root, 'aria-label', '歌词打轴工作区'); attr(this.root, 'part', 'editor');
    attr(this.label, 'role', 'status'); attr(this.status, 'role', 'status'); attr(this.waveStatus, 'role', 'status'); attr(this.empty, 'role', 'status');
    attr(this.label, 'part', 'phase-label'); attr(this.footer, 'part', 'footer');
    this.hints.id = 'lyrics-editor-help'; attr(this.root, 'aria-describedby', this.hints.id);
    this.waveStatus.append(this.waveText, this.retryWave); this.footerInfo.append(this.status, this.hints); this.footer.append(this.footerInfo, this.retry, this.playback, this.save);
    const thumb = icon('thumb'); thumb.classList.add('lyric-complete-icon');
    const completeText = element('p'); completeText.append(document.createTextNode('接下来，拖拽歌词滑块的位置或边界，'), element('br'), document.createTextNode('精细调整每一句歌词的精确时间。'));
    this.complete.append(thumb, element('h2', '', '粗打完成'), completeText, button('开始精调', () => { this.phase = 'refine'; this.positionMs = 0; this.audio.currentTime = 0; this.render(); this.publish(); this.focus(); }, true));
    attr(this.complete, 'role', 'status');
    this.timeline = new Timeline({ select: index => { this.finishTake(); this.dispatch({ type: 'select', index }); },
      seek: ms => this.seek(ms), change: (lines, index) => this.dispatch({ type: 'ranges', lines, index }), pause: () => this.pause(),
      audition: index => this.auditionLine(index), boundary: (index, edge, separate, lines) => this.auditionBoundary(index, edge, separate, lines) });
    this.root.append(this.label, this.audio, this.empty, this.timeline.root, this.waveStatus, this.complete, this.preview.root, this.footer);
    this.timeline.setLocale(this.options.locale);
    this.setupAudio(); this.setupKeyboard();
    this.render();
    queueMicrotask(() => { if (!this.destroyed) { this.publish(true); if (this.options.autoFocus) this.focus(); } });
    if (!this.waveform) void this.loadWaveform();
  }
  updateOptions(options: LyricsEditorOptions) {
    const changedLocale = options.locale !== this.options.locale; this.options = { ...options };
    if (changedLocale) { this.renderedPhase = null; this.timeline.setLocale(options.locale); }
    this.render();
  }
  private get playing() { return !this.audio.paused && !this.audio.ended; }
  private get dirty() {
    return !sameLyricRanges(this.state.lines, this.original.lines) || this.state.lines.some((line, index) => line.text !== this.original.lines[index]?.text)
      || this.state.metadata.join('\n') !== this.original.metadata.join('\n') || this.take !== null || this.markers.length > 0;
  }
  getDocument() { return copyDocument({ lines: this.take ? previewLyricTake(this.take, this.audio.currentTime * 1000) : this.state.lines, metadata: this.state.metadata }); }
  focus() { this.root.focus({ preventScroll: true }); }
  pause(preserveTapPhrase = false) { if (!preserveTapPhrase || this.mode === 'hold') this.finishTake(); this.audio.pause(); this.updatePosition(); }
  requestClose() { const dirty = this.dirty; this.pause(); this.emit('lyrics-request-close', { dirty: dirty || this.dirty }); }
  snapshot(): ViewSnapshot {
    this.pause();
    return { state: this.state, original: this.original, phase: this.phase, mode: this.mode, markers: this.markers, positionMs: this.positionMs, hasStarted: this.hasStarted, waveform: this.waveform };
  }
  private publish(changed = false) {
    if (this.destroyed) return;
    if (changed) this.emit('lyrics-change', copyDocument(this.state));
    if (this.dirty !== this.previousDirty) { this.previousDirty = this.dirty; this.emit('lyrics-dirty-change', { dirty: this.dirty }); }
    if (this.phase !== this.previousPhase) { this.previousPhase = this.phase; this.emit('lyrics-phase-change', { phase: this.phase }); }
  }
  private dispatch(action: TimingAction) {
    const previous = this.state; this.state = timingReducer(previous, action); this.render();
    this.publish(previous.lines !== this.state.lines || previous.metadata !== this.state.metadata);
  }
  private startTake(input: LyricTake['input']) {
    if (this.take || !this.ready || this.waiting || this.mediaError) return;
    if (this.audio.ended) this.audio.currentTime = 0;
    this.take = beginLyricTake(this.state.lines, this.state.selected, this.audio.currentTime * 1000, this.durationMs, this.mode, input);
    if (!this.take) return;
    this.auditionEnd = null; this.updatePosition(); this.publish(); void this.play();
  }
  private finishTake(continueTap = false) {
    if (!this.take) return this.state.lines;
    const active = this.take, lines = previewLyricTake(active, this.audio.currentTime * 1000, true), nextIndex = Math.min(active.index + 1, lines.length);
    this.take = continueTap && active.mode === 'tap' ? beginLyricTake(lines, nextIndex, lines[active.index].endMs!, active.durationMs, active.mode, active.input) : null;
    this.state = timingReducer(this.state, { type: 'ranges', lines, index: nextIndex });
    if (!this.take && lines.every(line => line.timeMs !== null)) {
      this.audio.pause(); this.audio.currentTime = 0; this.positionMs = 0; this.phase = 'complete';
      this.state = timingReducer(this.state, { type: 'ranges', lines: compactRecordedLyrics(lines, this.durationMs), index: 0 });
      this.state = timingReducer(this.state, { type: 'checkpoint' }); this.focus();
    }
    this.render(); this.publish(true); return lines;
  }
  private cancelTake() {
    if (!this.take) return false;
    this.take = null; this.audio.pause(); this.render(); this.publish(); return true;
  }
  private record(input: LyricTake['input'] = 'keyboard') {
    if (this.take) { if (this.take.mode === 'tap' && !this.audio.paused) this.finishTake(true); }
    else this.startTake(input);
  }
  private rewind() {
    if (this.phase !== 'rough' || !this.ready || this.mediaError) return;
    const result = rewindLyricRecording(this.state.lines, this.take?.index ?? this.state.selected, this.durationMs); if (!result) return;
    this.take = null; this.audio.currentTime = result.positionMs / 1000;
    this.take = this.mode === 'tap' && result.index > 0 ? beginLyricTake(result.lines, result.index, result.positionMs, this.durationMs, this.mode, 'keyboard') : null;
    this.auditionEnd = null; this.dispatch({ type: 'ranges', lines: result.lines, index: result.index }); this.updatePosition(); void this.play();
  }
  private async play() {
    if (!Number.isFinite(this.audio.duration)) return;
    if (this.audio.ended) this.audio.currentTime = 0;
    try { await this.audio.play(); }
    catch (error) {
      if (this.destroyed || (error instanceof DOMException && error.name === 'AbortError')) return;
      this.cancelTake(); this.mediaError = '播放失败，请重试或重新选择音频。'; this.render();
    }
  }
  private togglePlayback() {
    if (!this.ready || this.mediaError) return;
    if (this.phase === 'refine') this.auditionEnd = null;
    if (this.audio.paused) void this.play();
    else { if (this.mode === 'hold') this.finishTake(); this.audio.pause(); this.updatePosition(); }
  }
  private seek(ms: number) {
    this.finishTake(); this.auditionEnd = null;
    if (!this.ready) return;
    this.audio.currentTime = Math.max(0, Math.min(this.durationMs, ms)) / 1000; this.updatePosition();
  }
  private jump(direction: 'previous' | 'next') {
    const marker = lyricMarkerNavigation(this.markers, this.audio.currentTime * 1000)[direction]; if (marker) { this.pause(); this.seek(marker.timeMs); }
  }
  private mark() {
    if (this.phase === 'complete' || !this.ready || this.mediaError) return;
    const marker = { id: this.markerID, timeMs: this.audio.currentTime * 1000 };
    const next = this.phase === 'refine' ? toggleLyricMarker(this.markers, marker, this.durationMs) : addLyricMarker(this.markers, marker, this.durationMs);
    if (next.length > this.markers.length) this.markerID++; this.markers = next; this.render(); this.publish();
  }
  private auditionLine(index: number) {
    const lines = this.finishTake(), start = lines[index]?.timeMs; if (start == null || !this.ready) return;
    const end = lyricEndMs(lines, index, this.durationMs); this.dispatch({ type: 'select', index });
    this.audio.currentTime = start / 1000; this.positionMs = start; this.auditionEnd = end;
    if (end > start) void this.play(); else { this.audio.pause(); this.auditionEnd = null; } this.render();
  }
  private auditionBoundary(index: number, edge: LyricEdge, separate: boolean, lines = this.state.lines) {
    const range = lyricBoundaryPreview(lines, index, edge, separate, this.durationMs); if (!range || !this.ready) return;
    this.dispatch({ type: 'select', index }); this.audio.currentTime = range.startMs / 1000; this.positionMs = range.startMs; this.auditionEnd = range.endMs; this.render(); void this.play();
  }
  private apply() {
    if (this.phase !== 'refine' || !this.ready || this.take || !this.state.lines.length || timingIssues(this.state.lines, this.durationMs).size) return;
    this.pause(); const document = copyDocument(this.state); this.emit('lyrics-save', { lyrics: serializeLyrics(document), document });
  }
  private updatePosition() {
    if (this.destroyed) return;
    if (this.auditionEnd !== null && this.audio.currentTime * 1000 >= this.auditionEnd) {
      const end = this.auditionEnd; this.auditionEnd = null; this.audio.pause(); this.audio.currentTime = end / 1000;
    }
    this.positionMs = this.audio.currentTime * 1000; this.render();
  }
  private tick = () => { this.updatePosition(); if (!this.destroyed && this.playing) this.frame = requestAnimationFrame(this.tick); };
  private setupAudio() {
    const signal = this.listeners.signal;
    this.audio.preload = 'auto'; this.audio.src = this.options.audioSrc;
    this.audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
        this.durationMs = Math.round(this.audio.duration * 1000); this.ready = true;
        this.positionMs = Math.min(this.positionMs, this.durationMs); this.audio.currentTime = this.positionMs / 1000;
      } else this.mediaError = '无法读取音频时长，请重新选择可播放的音乐文件。'; this.render();
    }, { signal });
    this.audio.addEventListener('timeupdate', () => this.updatePosition(), { signal });
    this.audio.addEventListener('play', () => { this.hasStarted = true; cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(this.tick); this.render(); }, { signal });
    this.audio.addEventListener('pause', () => { if (this.audio.paused) { cancelAnimationFrame(this.frame); this.updatePosition(); } }, { signal });
    this.audio.addEventListener('ended', () => { if (this.audio.ended) { this.finishTake(); this.render(); } }, { signal });
    for (const event of ['waiting', 'seeking']) this.audio.addEventListener(event, () => { this.waiting = true; this.render(); }, { signal });
    for (const event of ['canplay', 'seeked']) this.audio.addEventListener(event, () => { this.waiting = false; this.render(); }, { signal });
    this.audio.addEventListener('error', () => { this.finishTake(); this.ready = false; this.mediaError = '音频加载失败或浏览器不支持此格式，请重试或重新选择音频。'; this.render(); }, { signal });
  }
  private setupKeyboard() {
    const signal = this.listeners.signal;
    this.root.addEventListener('pointerdown', () => { if (!this.root.contains(this.root.getRootNode() instanceof ShadowRoot ? (this.root.getRootNode() as ShadowRoot).activeElement : document.activeElement)) this.focus(); }, { capture: true, signal });
    // Capture suppresses local keycaps and boundary commands too while the host opens a confirmation.
    this.root.addEventListener('keydown', event => { if (this.options.keyboardEnabled === false && event.key !== 'Tab') { event.preventDefault(); event.stopPropagation(); } }, { capture: true, signal });
    this.root.addEventListener('keydown', event => {
      if (this.options.keyboardScope !== 'page' || ![' ', 'Enter'].includes(event.key)) return;
      this.onKeyDown(event, true); if (event.defaultPrevented) event.stopPropagation();
    }, { capture: true, signal });
    this.root.addEventListener('keydown', event => this.onKeyDown(event), { signal });
    document.addEventListener('keydown', event => {
      if (this.options.keyboardScope !== 'page' || event.composedPath().includes(this.root)) return;
      const target = event.composedPath()[0];
      if (document.querySelector('dialog[open]') || !(target instanceof HTMLElement) || target.closest('input, textarea, select, [contenteditable]:not([contenteditable=false]), lyrics-editor')) return;
      this.onKeyDown(event, true);
    }, { signal });
    window.addEventListener('keyup', event => {
      if (this.options.keyboardEnabled !== false && event.key === ' ' && this.take?.mode === 'hold' && this.take.input === 'keyboard') { event.preventDefault(); this.finishTake(); }
    }, { signal });
    const blur = () => { if (this.take && !this.audio.paused) this.pause(); };
    this.root.addEventListener('focusout', event => { if (this.options.keyboardScope !== 'page' && !this.root.contains(event.relatedTarget as Node | null)) blur(); }, { signal });
    window.addEventListener('blur', blur, { signal }); document.addEventListener('visibilitychange', () => { if (document.hidden) blur(); }, { signal });
    window.addEventListener('beforeunload', event => { if (this.options.preventUnload !== false && this.dirty) { event.preventDefault(); event.returnValue = ''; } }, { signal });
  }
  private onKeyDown(event: KeyboardEvent, fromPage = false) {
    if (this.options.keyboardEnabled === false || event.isComposing || event.defaultPrevented) return;
    const target = fromPage ? this.root : event.target as HTMLElement;
    if (event.key === 'Escape') { event.preventDefault(); if (!this.cancelTake()) this.requestClose(); return; }
    if (this.phase === 'complete' || target.closest('input, textarea, select, [contenteditable=true]')) return;
    if (this.timeline.handleZoom(event)) return;
    const command = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    if (command && key === 'z') { event.preventDefault(); if (!event.repeat) { if (event.shiftKey) { if (!this.take) this.dispatch({ type: 'redo' }); } else if (!this.cancelTake()) this.dispatch({ type: 'undo' }); } return; }
    if (command && key === 'enter') { event.preventDefault(); if (!event.repeat) this.apply(); return; }
    if (command || event.altKey || ![' ', 'p', 'l', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'delete', 'backspace'].includes(key)) return;
    if (key === 'enter' && target.closest('button') && !target.closest('.lyric-clip-text')) return;
    event.preventDefault(); if (event.repeat) return;
    if (key === ' ') { if (this.phase === 'rough') this.record(); else this.togglePlayback(); }
    if (key === 'p' || key === 'enter') this.togglePlayback();
    if (key === 'l') this.mark();
    if (key === 'arrowup' || key === 'arrowdown') { this.finishTake(); this.dispatch({ type: 'select', index: this.state.selected + (key === 'arrowup' ? -1 : 1) }); }
    if (key === 'arrowleft' || key === 'arrowright') {
      if (this.phase === 'refine') this.jump(key === 'arrowleft' ? 'previous' : 'next');
      else this.seek(this.audio.currentTime * 1000 + (key === 'arrowleft' ? -1 : 1) * (event.shiftKey ? 1000 : 5000));
    }
    if (key === 'backspace') this.rewind();
    if (key === 'delete' && this.phase === 'rough') { this.cancelTake(); this.dispatch({ type: 'time', index: this.state.selected, timeMs: null }); }
  }
  private async loadWaveform() {
    this.waveformAbort?.abort(); const controller = new AbortController(); this.waveformAbort = controller;
    this.waveformLoading = true; this.waveformError = ''; this.render();
    try {
      const response = await fetch(this.options.audioSrc, { signal: controller.signal }); if (!response.ok) throw new Error('waveform_fetch_failed');
      const bytes = await response.arrayBuffer(); if (controller.signal.aborted) return;
      const audio = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes); if (controller.signal.aborted || this.destroyed) return;
      this.waveform = buildAudioWaveform(Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index)), audio.sampleRate);
    } catch { if (!controller.signal.aborted && !this.destroyed) this.waveformError = '无法生成波形，请重试。也可以继续播放音频并调整歌词边界。'; }
    finally { if (!controller.signal.aborted && !this.destroyed) { this.waveformLoading = false; this.render(); } }
  }
  private buildHints() {
    this.keys = {}; this.captions = {}; this.hints.replaceChildren();
    const group = (id: string, node: HTMLButtonElement, caption: string) => {
      const row = element('span'), label = element('span', '', caption); row.append(node, label); this.hints.append(row); this.keys[id] = node; this.captions[id] = label; return row;
    };
    if (this.phase === 'rough') {
      group('enter', keycap('回车：开始/暂停打轴', 'Enter', '回车', () => this.togglePlayback(), 'enter'), '开始/暂停打轴');
      const hold = this.mode === 'hold' ? { start: () => this.record('pointer'), end: () => { if (this.take?.mode === 'hold' && this.take.input === 'pointer') this.finishTake(); }, cancel: () => { if (this.take?.input === 'pointer') this.cancelTake(); } } : undefined;
      group('space', keycap(this.mode === 'tap' ? '空格：进入下一句' : '空格：按住开始，松开结束', 'Space', '空格', () => {
        if (this.mode === 'hold' && this.take?.input === 'pointer') this.finishTake(); else this.record(this.mode === 'hold' ? 'pointer' : 'keyboard');
      }, 'space', hold), this.mode === 'tap' ? '进入下一句' : '按住开始，松开结束');
      group('backspace', keycap('退格：重打上一句', 'Backspace', '退格', () => this.rewind(), 'backspace'), '重打上一句');
      group('mark', keycap('L：添加标记', 'L', 'L', () => this.mark()), '添加标记');
    } else if (this.phase === 'refine') {
      const enter = keycap('回车：播放/暂停', 'Enter', '回车', () => this.togglePlayback(), 'enter'), space = keycap('空格：播放/暂停', 'Space', '空格', () => this.togglePlayback(), 'space');
      const row = group('enter', enter, '播放/暂停'); row.insertBefore(space, row.lastChild); row.insertBefore(document.createTextNode(' / '), space); this.keys.space = space;
      const left = keycap('左方向键：上一个标记', 'ArrowLeft', '', () => this.jump('previous'), 'left'), right = keycap('右方向键：下一个标记', 'ArrowRight', '', () => this.jump('next'), 'right');
      const navigation = group('left', left, '定位到上一个/下一个标记'); navigation.insertBefore(right, navigation.lastChild); this.keys.right = right;
      group('mark', keycap('L：打标/取消打标', 'L', 'L', () => this.mark()), '打标/取消打标');
    }
  }
  private render() {
    if (this.destroyed) return;
    if (this.renderedPhase !== this.phase) { this.renderedPhase = this.phase; this.buildHints(); }
    const complete = this.phase === 'complete', refine = this.phase === 'refine', lines = this.take ? previewLyricTake(this.take, this.positionMs) : this.state.lines;
    this.label.hidden = complete; this.complete.hidden = !complete; this.footer.hidden = complete; this.preview.root.hidden = !refine;
    this.empty.hidden = complete || this.ready; this.timeline.root.hidden = complete || !this.ready;
    text(this.label, refine ? '拖拽歌词方块边缘，精细调整每句话的位置。' : (this.mode === 'tap' ? '点击空格键切换下一句歌词' : '按住空格键标记当前句，松开切换下一句歌词') + '。打错了也不要紧，继续打完，然后再调整。');
    text(this.empty, this.mediaError || '正在加载音频轨道…');
    this.waveStatus.hidden = complete || !this.ready || (!this.waveformLoading && !this.waveformError); text(this.waveText, this.waveformLoading ? '正在读取音频并生成波形…' : this.waveformError); this.retryWave.hidden = !this.waveformError;
    const navigation = lyricMarkerNavigation(this.markers, this.positionMs);
    if (this.ready && !complete) this.timeline.update({ lines, selected: this.take?.index ?? this.state.selected, durationMs: this.durationMs, positionMs: this.positionMs, playing: this.playing,
      keyboardEnabled: this.options.keyboardEnabled !== false, markers: this.markers, currentMarkerID: navigation.current?.id, recordingIndex: this.take?.index, readonly: !refine, waveform: this.waveform });
    if (refine) this.preview.update(this.state.lines, this.positionMs);
    const issues = timingIssues(lines, this.durationMs), invalid = [...issues.keys()].some(index => lines[index].timeMs !== null);
    const status = this.mediaError || (!lines.length ? '没有可编辑的歌词，请传入歌词后重新打开编辑器。' : !this.ready ? '正在加载音频…' : this.waiting ? '正在缓冲…' : invalid ? refine ? '时间范围无效，请拖拽歌词边界调整' : '时间范围无效，请选句后按 Delete 重打' : '');
    text(this.status, status); this.status.hidden = !status;
    const disabled = !this.ready || Boolean(this.mediaError);
    for (const key of Object.values(this.keys)) key.disabled = disabled;
    if (this.keys.enter) this.keys.enter.parentElement!.classList.toggle('is-highlighted', !this.playing);
    if (!refine && this.keys.space) { this.keys.space.disabled = !this.take && (disabled || this.waiting || !this.state.lines[this.state.selected]); this.keys.space.parentElement!.classList.toggle('is-highlighted', this.playing); text(this.captions.enter, this.playing ? '暂停' : this.hasStarted ? '继续打轴' : '开始/暂停打轴'); }
    if (refine && this.keys.left) { this.keys.left.disabled = disabled || !navigation.previous; this.keys.right.disabled = disabled || !navigation.next; attr(this.keys.mark, 'aria-pressed', Boolean(navigation.current)); }
    this.retry.hidden = !this.mediaError; this.playback.hidden = !refine; this.playback.disabled = disabled;
    const playbackLabel = this.playing ? '暂停' : '播放'; if (this.playback.getAttribute('aria-label') !== playbackLabel) { attr(this.playback, 'aria-label', playbackLabel); this.playback.replaceChildren(icon(this.playing ? 'pause' : 'play'), document.createTextNode(playbackLabel)); }
    this.save.hidden = !refine || this.options.showSave === false; text(this.save, this.options.saveLabel ?? '保存歌词'); this.save.disabled = disabled || !lines.length || issues.size > 0 || Boolean(this.take);
    attr(this.root, 'aria-describedby', complete ? null : this.hints.id);
    this.root.dataset.phase = this.phase;
    translateUI(this.root, this.options.locale);
    this.root.lang = this.options.locale ?? 'zh-CN';
  }
  destroy() {
    this.destroyed = true; this.listeners.abort(); this.waveformAbort?.abort(); this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    cancelAnimationFrame(this.frame); this.timeline.destroy(); this.preview.destroy(); this.root.remove();
  }
}
