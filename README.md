# Lyricue

A zero-dependency Web Component for syncing lyrics to music, featuring audio waveforms, keyboard controls, and precise timeline editing.

[Live playground](https://qianyinshi.github.io/lyricue/) · [简体中文](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

Lyricue works in plain HTML, React, Vue, or any other application that can host a custom element. It does not include a modal, router, authentication, storage, or a backend.

> The npm package has not been published. Use a local tarball for now. `private: true` remains in the manifest to prevent accidental publication.

## Features

- Real audio waveforms decoded in the browser, with zoom, scrolling, and a following playhead.
- Tap or hold Space to record lyric timing; pause, resume, and redo the previous line.
- Single-sided trims and shared boundaries, automatic snippet previews, undo, and redo.
- Temporary time markers, keyboard navigation, clickable keycaps, and scrolling lyric preview.
- LRC import/export with repeated timestamps, offsets, explicit endings, and instrumental gaps.
- Shadow DOM style isolation, CSS custom properties, and typed DOM events.
- A framework-independent `/core` entry for LRC and timing algorithms, usable in Node.js.

The current UI is in Simplified Chinese. Times are represented as integer milliseconds.

## Quick start

Node.js **22.18+** is required for development; Node.js 24 is recommended. From a fresh clone:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4185`. The playground includes an original 20-second instrumental loop, or accepts your own audio and lyrics. It supports recording, refinement, and LRC download without uploading files. The editor controls are currently in Chinese.

To build and create an installable package:

```sh
npm run verify:package
npm pack
```

Install the resulting tarball in another project:

```sh
npm install /path/to/lyricue-0.1.0.tgz
```

```ts
import { defineLyricsEditor } from 'lyricue';

defineLyricsEditor(); // Safe to call more than once.
const editor = document.createElement('lyrics-editor');
editor.load({
  audioSrc: '/song.mp3',
  lyrics: 'First lyric line\nSecond lyric line',
  mode: 'tap',
});
editor.addEventListener('lyrics-save', event => {
  console.log(event.detail.lyrics);   // LRC string
  console.log(event.detail.document); // Detached document snapshot
});
document.querySelector('#container')!.append(editor);
```

Styles are included automatically. No CSS import or framework dependency is needed. To register the default tag as a side effect instead:

```ts
import 'lyricue/register';
```

### Plain HTML, without a build tool

Copy the entire built `dist/` directory to your static server, preserving the relative paths between its files:

```html
<lyrics-editor
  audio-src="/song.mp3"
  lyrics="First lyric line&#10;Second lyric line"
  mode="tap"
></lyrics-editor>
<script type="module" src="/vendor/lyricue/register.js"></script>
```

Serve the page over HTTP. Modern browser support for Custom Elements, Shadow DOM, Web Audio, Pointer Events, ResizeObserver, and AbortSignal event listeners is required.

## GitHub Pages demo

The [public playground](https://qianyinshi.github.io/lyricue/) is built from the same component exported by this package. Pushes to `main` publish it through GitHub Actions after checks and tests pass. See [Pages setup and local preview](docs/github-pages.md).

```sh
npm run build:demo
npm run preview:demo
```

The demo outputs to `demo-dist/`, separately from the library in `dist/`. Relative asset URLs support the `/lyricue/` project path and custom domains.

## Sessions and options

`editor.load(options)` replaces the editing session, resetting playback, undo history, and markers. Fully timed LRC opens in refinement mode. Plain or partially timed lyrics start with rough timing, followed by refinement.

| Property / option | Attribute | Default | Purpose |
| --- | --- | --- | --- |
| `audioSrc` | `audio-src` | `''` | Audio URL, including same-origin, CORS-enabled, signed, or Blob URLs |
| `lyrics` | `lyrics` | `''` | Initial string or `LyricDocument`; the attribute accepts a string |
| `mode` | `mode` | `'tap'` | `'tap'` or `'hold'`; fixed during a session |
| `saveLabel` | `save-label` | `'保存歌词'` | Save button label |
| `showSave` | `hide-save` (inverse) | `true` | Show the save button |
| `keyboardEnabled` | `keyboard-disabled` (inverse) | `true` | Enable shortcuts and keyboard activation |
| `preventUnload` | `no-unload-guard` (inverse) | `true` | Warn before leaving with unsaved edits |
| `autoFocus` (load option) | `autofocus` | `false` | Focus the editor when a session mounts |

Setting `audioSrc`, `lyrics`, or `mode` separately also resets the session. Use one `load()` call when replacing several inputs. Presentation options update without discarding edits. Boolean attributes depend on presence: remove `keyboard-disabled` to enable shortcuts; setting it to `"false"` still disables them.

Initialization and initial events run in the next microtask. Register listeners before loading or mounting the editor. Properties assigned before custom-element registration are preserved.

When removed from the DOM, the editor pauses playback, commits an open phrase, and releases requests, global listeners, observers, and animation frames. Reconnecting the same element restores its draft, history, and markers while remaining paused. A synchronous DOM move preserves the session. Explicitly call `load()` to start over.

## Events and methods

All events are typed `CustomEvent`s with `bubbles: true` and `composed: true`.

| Event | `event.detail` |
| --- | --- |
| `lyrics-save` | `{ lyrics: string, document: LyricDocument }` |
| `lyrics-change` | Initial or committed `LyricDocument`; not emitted on every playback frame |
| `lyrics-dirty-change` | `{ dirty: boolean }`, including an open take and temporary markers |
| `lyrics-phase-change` | `{ phase: 'rough' \| 'complete' \| 'refine' }` |
| `lyrics-request-close` | `{ dirty: boolean }`, from Escape or `requestClose()` |

Documents returned by events and `getDocument()` are detached snapshots. The host owns saving and closing; a save event does not persist data or automatically clear the dirty state.

- `load(options)`: replace the session.
- `pause()`: pause and commit an open phrase. Enter preserves the phrase in tap mode instead.
- `focus()`: focus the workspace and activate its keyboard shortcuts.
- `requestClose()`: pause and ask the host to handle closing.
- `getDocument()`: get the current snapshot, including an in-progress phrase. It may contain untimed lines; validate before serialization.

### Your own modal or drawer

```ts
editor.addEventListener('lyrics-request-close', event => {
  if (!event.detail.dirty || window.confirm('Discard unsaved changes?')) {
    dialog.close();
    editor.remove();
  }
});
closeButton.addEventListener('click', () => editor.requestClose());
```

The host supplies the container, setup screens, close confirmation, and route protection. Disable shortcuts while a custom confirmation is open, then restore them and call `editor.focus()`.

### React

React is used only by your application. This adapter also works with React 18:

```tsx
import { useLayoutEffect, useRef } from 'react';
import { defineLyricsEditor } from 'lyricue';

export function Editor() {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    defineLyricsEditor();
    const editor = document.createElement('lyrics-editor');
    editor.addEventListener('lyrics-save', event => console.log(event.detail.lyrics));
    editor.load({ audioSrc: '/song.mp3', lyrics: 'First line\nSecond line' });
    container.current!.append(editor);
    return () => editor.remove();
  }, []);
  return <div ref={container} />;
}
```

### Vue

Call `defineLyricsEditor()` and configure Vue's `isCustomElement` compiler option for `lyrics-editor`:

```html
<lyrics-editor audio-src="/song.mp3" :lyrics.prop="sourceLyrics"
  @lyrics-save="saveLyrics($event.detail.lyrics)" />
```

Other frameworks can use the same properties, methods, and DOM events.

## Keyboard controls

Shortcuts apply only to the focused editor. They do not intercept input elsewhere or in another instance. On-screen keycaps also support mouse input.

| Key | Rough timing | Refinement |
| --- | --- | --- |
| Enter | Start/pause; hold mode commits before pausing | Play/pause |
| Space | Advance a line, or hold to start/release to end | Play/pause |
| Backspace | Redo the previous line; the first line returns to 0 | — |
| L | Add a marker | Add/remove the current marker |
| Left/right | Seek backward/forward | Previous/next marker |
| Cmd/Ctrl+Z | Undo | Undo |
| Cmd/Ctrl+Shift+Z | Redo | Redo |
| `+` / `-` / `0` | Zoom in/out/fit | Zoom in/out/fit |
| Cmd/Ctrl+Enter | — | Save |

Ctrl/Cmd+wheel zooms. Hold Shift while dragging to disable snapping. With a boundary focused, Shift+left/right adjusts it by 1 ms; Enter/Space previews it. Markers remain local to the session and are not written to LRC.

## Core API

```ts
import { parseLyrics, serializeLyrics, timingIssues, prepareRecordingLyrics } from 'lyricue/core';
const document = prepareRecordingLyrics(sourceText, true); // Optionally strip Suno section tags.
const timed = parseLyrics('[00:01.200]First line\n[00:03.000]');
if (timingIssues(timed.lines, 120000).size === 0) console.log(serializeLyrics(timed));
```

The core also exports waveform, recording, boundary, and marker helpers. Untimed lines have `timeMs: null`; optional `endMs` records an explicit end. Empty timed LRC cues preserve instrumental gaps.

The root module can be imported in Node.js, but registration and rendering require a browser. `/register` skips registration without a Custom Elements environment.

## Styling and audio

Shadow DOM encapsulates the built-in light appearance. Customize through inherited CSS variables:

```css
lyrics-editor {
  --lyrics-editor-accent: #246c52;
  --lyrics-editor-accent-active: #17513c;
  --lyrics-editor-text: #242424;
  --lyrics-editor-muted: #656565;
  --lyrics-editor-border: #d9ded9;
  --lyrics-editor-font-family: system-ui, sans-serif;
}
```

`::part(editor)`, `::part(timeline)`, and `::part(preview)` expose outer styling surfaces. Global class selectors do not cross the shadow boundary.

Waveform generation fetches and decodes the whole audio file. Cross-origin servers must allow GET from the host page's origin; playback alone does not imply permission to fetch waveform data. Audio servers should support HTTP Range for accurate seeking and snippet previews. Supported formats depend on the browser. Waveform failure exposes a retry action while playback remains available.

The host owns authorization, signed URLs, file-size limits, persistence, and Blob URL cleanup. Lyricue does not proxy audio or store credentials. Load a new session when changing the source or replacing an expired URL.

## Development and releases

```sh
npm run check          # ESLint and TypeScript
npm test               # 65 timing, recording, waveform and marker tests
npm run build          # ESM and declarations
npm run verify:package # Pack and install in a separate, framework-free project
```

Package verification checks the public file allowlist, zero runtime/peer/transitive dependencies, Node imports, LRC round trips, and strict NodeNext consumer types. CI runs these checks on Node.js 22 and 24 without access to another repository.

Before publishing, confirm npm name ownership and the version, remove `private: true`, verify the tarball, then publish explicitly. CI does not publish packages.

## License

[MIT](LICENSE).
