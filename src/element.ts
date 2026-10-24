import type { LyricsEditorElement, LyricsEditorOptions, LyricsEditorEventDetails, LyricsEditorTheme, LyricsEditorColors } from './types.js';
import type { LyricDocument } from './lib/lyric-timing.js';
import type { RecordingMode } from './lib/lyric-recording.js';
import { parseLyrics } from './lib/lyric-timing.js';
import { EditorView, copyDocument, type ViewSnapshot } from './components/EditorView.js';
import editorCSS from './components/editor.css?raw';
import timingCSS from './components/lyric-timing.css?raw';
import timelineCSS from './components/lyric-timeline.css?raw';

/** Explicit, idempotent registration. Importing this module is safe without a DOM. */
export function defineLyricsEditor(tagName = 'lyrics-editor', registry?: CustomElementRegistry): CustomElementConstructor {
  const target = registry ?? globalThis.customElements;
  if (!target || typeof HTMLElement === 'undefined') throw new Error('defineLyricsEditor requires a browser with Custom Elements. Use /core in Node.js.');
  const existing = target.get(tagName); if (existing) return existing;
  class NativeLyricsEditor extends HTMLElement implements LyricsEditorElement {
    static observedAttributes = ['audio-src', 'lyrics', 'mode', 'save-label', 'hide-save', 'keyboard-disabled', 'no-unload-guard', 'autofocus', 'keyboard-scope', 'locale', 'theme'];
    private options: LyricsEditorOptions = { audioSrc: '', lyrics: '', mode: 'tap' };
    private view: EditorView | null = null;
    private saved: ViewSnapshot | undefined;
    private pending = false;
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: 'open', delegatesFocus: true });
      const style = document.createElement('style');
      style.textContent = ':host{display:block;min-width:0}:host([hidden]),[hidden]{display:none!important}' + editorCSS + timingCSS + timelineCSS;
      shadow.append(style);
      // Honor properties assigned before the custom element definition was loaded.
      for (const name of ['audioSrc', 'lyrics', 'mode', 'keyboardEnabled', 'preventUnload', 'showSave', 'saveLabel', 'keyboardScope', 'locale', 'theme', 'colors'] as const) {
        if (Object.prototype.hasOwnProperty.call(this, name)) {
          const value = this[name]; delete (this as unknown as Record<string, unknown>)[name];
          (this as unknown as Record<string, unknown>)[name] = value;
        }
      }
    }
    connectedCallback() {
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      this.schedule();
    }
    disconnectedCallback() {
      // A same-task DOM move preserves the session, playback and pointer state.
      queueMicrotask(() => {
        if (this.isConnected || !this.view) return;
        this.saved = this.view.snapshot(); this.view.destroy(); this.view = null;
      });
    }
    attributeChangedCallback(name: string, previous: string | null, value: string | null) {
      if (previous === value) return;
      if (name === 'audio-src') this.options.audioSrc = value ?? '';
      if (name === 'lyrics') this.options.lyrics = value ?? '';
      if (name === 'mode') this.options.mode = value === 'hold' ? 'hold' : 'tap';
      if (name === 'save-label') this.options.saveLabel = value ?? undefined;
      if (name === 'hide-save') this.options.showSave = value === null;
      if (name === 'keyboard-disabled') this.options.keyboardEnabled = value === null;
      if (name === 'no-unload-guard') this.options.preventUnload = value === null;
      if (name === 'keyboard-scope') this.options.keyboardScope = value === 'page' ? 'page' : 'focused';
      if (name === 'theme') this.options.theme = value === 'dark' || value === 'auto' ? value : 'light';
      if (name === 'locale') this.options.locale = value === 'en' ? 'en' : 'zh-CN';
      if (name === 'autofocus') this.options.autoFocus = value !== null;
      if (['audio-src', 'lyrics', 'mode'].includes(name)) this.reset(); else this.view?.updateOptions(this.options);
    }
    private schedule() {
      if (this.pending) return; this.pending = true;
      queueMicrotask(() => {
        this.pending = false; if (!this.isConnected || this.view) return;
        this.view = new EditorView(this.options, (type, detail) => this.emit(type, detail), this.saved);
        this.shadowRoot!.append(this.view.root);
      });
    }
    private reset() { this.saved = undefined; this.view?.destroy(); this.view = null; if (this.isConnected) this.schedule(); }
    private emit<K extends keyof LyricsEditorEventDetails>(type: K, detail: LyricsEditorEventDetails[K]) {
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
    load(options: LyricsEditorOptions) {
      this.options = { ...this.options, ...options, colors: { ...(options.colors ?? this.options.colors) }, lyrics: typeof options.lyrics === 'string' ? options.lyrics : copyDocument(options.lyrics) }; this.reset();
    }
    get audioSrc() { return this.options.audioSrc; }
    set audioSrc(value: string) { if (value !== this.options.audioSrc) { this.options.audioSrc = value; this.reset(); } }
    get lyrics() { return typeof this.options.lyrics === 'string' ? this.options.lyrics : copyDocument(this.options.lyrics); }
    set lyrics(value: string | LyricDocument) { this.options.lyrics = typeof value === 'string' ? value : copyDocument(value); this.reset(); }
    get mode() { return this.options.mode ?? 'tap'; }
    set mode(value: RecordingMode) { if (value !== this.mode) { this.options.mode = value === 'hold' ? 'hold' : 'tap'; this.reset(); } }
    get keyboardEnabled() { return this.options.keyboardEnabled !== false; }
    set keyboardEnabled(value: boolean) { this.options.keyboardEnabled = Boolean(value); this.view?.updateOptions(this.options); }
    get keyboardScope() { return this.options.keyboardScope ?? 'focused'; }
    set keyboardScope(value: 'focused' | 'page') { this.options.keyboardScope = value; this.view?.updateOptions(this.options); }
    get locale() { return this.options.locale ?? 'zh-CN'; }
    set locale(value: 'zh-CN' | 'en') { this.options.locale = value; this.view?.updateOptions(this.options); }
    get theme() { return this.options.theme ?? 'light'; }
    set theme(value: LyricsEditorTheme) { this.options.theme = value === 'auto' || value === 'dark' ? value : 'light'; this.view?.updateOptions(this.options); }
    get colors() { return { ...this.options.colors }; }
    set colors(value: LyricsEditorColors) { this.options.colors = { ...value }; this.view?.updateOptions(this.options); }
    get preventUnload() { return this.options.preventUnload !== false; }
    set preventUnload(value: boolean) { this.options.preventUnload = Boolean(value); this.view?.updateOptions(this.options); }
    get showSave() { return this.options.showSave !== false; }
    set showSave(value: boolean) { this.options.showSave = Boolean(value); this.view?.updateOptions(this.options); }
    get saveLabel() { return this.options.saveLabel ?? '保存歌词'; }
    set saveLabel(value: string) { this.options.saveLabel = value; this.view?.updateOptions(this.options); }
    pause(preserveTapPhrase = false) { this.view?.pause(preserveTapPhrase); }
    requestClose() { if (this.view) this.view.requestClose(); else this.emit('lyrics-request-close', { dirty: false }); }
    getDocument() { return this.view?.getDocument() ?? (this.saved ? copyDocument(this.saved.state) : copyDocument(typeof this.options.lyrics === 'string' ? parseLyrics(this.options.lyrics) : this.options.lyrics)); }
    focus(options?: FocusOptions) { if (this.view) this.view.focus(); else super.focus(options); }
  }
  target.define(tagName, NativeLyricsEditor); return NativeLyricsEditor;
}
