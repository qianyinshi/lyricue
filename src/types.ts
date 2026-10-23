import type { LyricDocument } from './lib/lyric-timing.js';
import type { RecordingMode } from './lib/lyric-recording.js';

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
  preventUnload: boolean;
  showSave: boolean;
  saveLabel: string;
  /** Replace the editing session, including undo history, markers and playback. */
  load: (options: LyricsEditorOptions) => void;
  /** Pause playback and commit an open phrase. Enter preserves a tap phrase instead. */
  pause: () => void;
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
