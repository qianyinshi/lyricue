import type { LyricDocument, TimingState } from './lib/lyric-timing.js';
import type { LyricTake, RecordingMode } from './lib/lyric-recording.js';

export type LyricsEditorTheme = 'light' | 'dark' | 'auto';
/** CSS color values; omitted keys use the active theme palette. */
export interface LyricsEditorColors {
  accent?: string; accentActive?: string; onAccent?: string;
  background?: string; surface?: string; text?: string; muted?: string; border?: string;
  waveform?: string; waveformBackground?: string; rulerBackground?: string; trackBackground?: string; grid?: string;
  clipBackground?: string; clipText?: string; marker?: string; markerBackground?: string; markerText?: string;
}

import type { LyricMarker } from './lib/lyric-markers.js';

/** Serializable editing state. Audio bytes, URLs and waveform buffers are never included. */
export interface LyricsEditorSession {
  version: 1; state: TimingState; original: LyricDocument; mode: RecordingMode;
  phase: LyricsEditorPhase; markers: LyricMarker[]; positionMs: number; hasStarted: boolean;
  take: LyricTake | null; viewport: { scale: number; scrollLeft: number };
}

export interface LyricsEditorLoadState {
  status: 'loading' | 'ready' | 'error';
  error?: 'audio' | 'waveform' | 'lyrics';
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
  /** Show the live lyric preview during rough timing too. */
  showRoughPreview?: boolean;
  /** Restore a validated, versioned session, always paused. */
  session?: LyricsEditorSession;
}
export interface LyricsEditorEventDetails {
  'lyrics-load-state-change': LyricsEditorLoadState;
  'lyrics-session-change': Record<string, never>;
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
  getSession: () => LyricsEditorSession | null;
  /** Ready only after playable audio data, lyrics and the waveform are available. */
  getLoadState: () => LyricsEditorLoadState;
  /** Refinement is available only after every line is timed and no take is open. */
  setPhase: (phase: 'rough' | 'refine') => boolean;
  addEventListener<K extends keyof LyricsEditorEventMap>(type: K, listener: (this: LyricsEditorElement, event: LyricsEditorEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof LyricsEditorEventMap>(type: K, listener: (this: LyricsEditorElement, event: LyricsEditorEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
}
declare global { interface HTMLElementTagNameMap { 'lyrics-editor': LyricsEditorElement } }
