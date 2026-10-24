import type { LyricDocument } from './lib/lyric-timing.js';
import type { RecordingMode } from './lib/lyric-recording.js';

export type LyricsEditorTheme = 'light' | 'dark' | 'auto';
/** CSS color values; omitted keys use the active theme palette. */
export interface LyricsEditorColors {
  accent?: string; accentActive?: string; onAccent?: string;
  background?: string; surface?: string; text?: string; muted?: string; border?: string;
  waveform?: string; waveformBackground?: string; rulerBackground?: string; trackBackground?: string; grid?: string;
  clipBackground?: string; clipText?: string; marker?: string; markerBackground?: string; markerText?: string;
}

export type LyricsEditorPhase = 'rough' | 'complete' | 'refine';
export interface LyricsEditorResult { lyrics: string; document: LyricDocument }
export interface LyricsEditorOptions {
  audioSrc: string;
  lyrics: string | LyricDocument;
  mode?: RecordingMode;
  saveLabel?: string;
  showSave?: boolean;
  autoFocus?: boolean;
  keyboardEnabled?: boolean;
  /** Opt-in page shortcuts. Dialogs, text fields and other editors keep their keys. */
  keyboardScope?: 'focused' | 'page';
  locale?: 'zh-CN' | 'en';
  theme?: LyricsEditorTheme;
  colors?: LyricsEditorColors;
  preventUnload?: boolean;
}
export interface LyricsEditorEventDetails {
  'lyrics-save': LyricsEditorResult;
  'lyrics-change': LyricDocument;
  'lyrics-dirty-change': { dirty: boolean };
  'lyrics-phase-change': { phase: LyricsEditorPhase };
  'lyrics-request-close': { dirty: boolean };
}
export type LyricsEditorEventMap = { [K in keyof LyricsEditorEventDetails]: CustomEvent<LyricsEditorEventDetails[K]> };
export interface LyricsEditorElement extends HTMLElement {
  audioSrc: string;
  lyrics: string | LyricDocument;
  mode: RecordingMode;
  keyboardEnabled: boolean;
  keyboardScope: 'focused' | 'page';
  locale: 'zh-CN' | 'en';
  theme: LyricsEditorTheme;
  colors: LyricsEditorColors;
  preventUnload: boolean;
  showSave: boolean;
  saveLabel: string;
  /** Replace the editing session, including undo history, markers and playback. */
  load: (options: LyricsEditorOptions) => void;
  /** Pause playback. Pass true to preserve an open tap phrase; hold phrases always commit. */
  pause: (preserveTapPhrase?: boolean) => void;
  requestClose: () => void;
  getDocument: () => LyricDocument;
  addEventListener<K extends keyof LyricsEditorEventMap>(type: K, listener: (this: LyricsEditorElement, event: LyricsEditorEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof LyricsEditorEventMap>(type: K, listener: (this: LyricsEditorElement, event: LyricsEditorEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
}
declare global { interface HTMLElementTagNameMap { 'lyrics-editor': LyricsEditorElement } }
