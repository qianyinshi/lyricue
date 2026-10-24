import type { LyricsEditorColors, LyricsEditorOptions, LyricsEditorTheme } from '../types.js';

const colorProperties: Record<keyof LyricsEditorColors, string> = {
  accent: 'accent', accentActive: 'accent-active', onAccent: 'on-accent',
  background: 'background', surface: 'surface', text: 'text', muted: 'muted', border: 'border',
  waveform: 'waveform', waveformBackground: 'waveform-background',
  rulerBackground: 'ruler-background', trackBackground: 'track-background', grid: 'grid',
  clipBackground: 'clip-background', clipText: 'clip-text',
  marker: 'marker', markerBackground: 'marker-background', markerText: 'marker-text',
};

/** Presentation changes never replace the session or its stable DOM nodes. */
export class EditorTheme {
  private preference: LyricsEditorTheme = 'light';
  private media = matchMedia('(prefers-color-scheme: dark)');
  constructor(private root: HTMLElement, options: LyricsEditorOptions, onChange: () => void, signal: AbortSignal) {
    this.update(options);
    this.media.addEventListener('change', () => {
      if (this.preference !== 'auto') return;
      this.applyScheme(); onChange();
    }, { signal });
  }
  private applyScheme() {
    const resolved = this.preference === 'auto' ? this.media.matches ? 'dark' : 'light' : this.preference;
    this.root.dataset.theme = resolved;
    this.root.style.colorScheme = resolved;
  }
  update(options: LyricsEditorOptions) {
    this.preference = options.theme ?? 'light'; this.applyScheme();
    for (const [key, property] of Object.entries(colorProperties)) {
      const value = options.colors?.[key as keyof LyricsEditorColors];
      const name = '--lyrics-editor-' + property;
      if (typeof value === 'string' && CSS.supports('color', value)) this.root.style.setProperty(name, value);
      else this.root.style.removeProperty(name);
    }
  }
}
