# GitHub Pages playground

The public tool is served at https://qianyinshi.github.io/lyricue/. It uses the actual component, native dialogs and a single editing session, with no UI framework or backend. The welcome screen offers a local audio workflow or the bundled song “月下独酌 · 长乐宫舞”. Demo audio is fetched only after choosing the demo, with cancellable download progress. The demo link always starts a fresh project with the current bundled lyrics, even when the same song has saved progress. Like choosing new local audio, it confirms replacement before loading whenever saved work exists; Continue previous work restores the saved demo session instead. Local audio is followed by a text/LRC entry dialog and a remembered timing-mode choice.

A two-pass guide explains rough timing, L markers and refinement. The automatic guide places its remembered opt-out at the left of the footer, aligned with Got it; opening Help manually hides that preference. Both stages display real audio waveforms and scrolling lyrics, with a centered, read-only step indicator. Completing rough timing opens a thumbs-up dialog whose action enters refinement; supplied timed LRC enters refinement directly. In refinement, the sidebar actions are visibly unavailable; activating them explains that changing materials clears timing and directs the user to File → Restart timing. File → Restart timing clears timing, markers and history after confirmation. Replacing audio and starting a new track warn first; cancelling any setup step leaves the current work intact. All dialogs and file pickers pause playback and never automatically resume it. The logo is a static brand mark, and routine saving/restoration/privacy status text is omitted from the interface.

Projects, including the open tap phrase, markers, undo/redo history, playback position, zoom and horizontal scroll, are stored per SHA-256 audio fingerprint in localStorage. Lyrics-entry drafts and locale, mode and guide preferences are also saved. No audio bytes, URLs or decoded waveforms are stored. On reselecting the same bytes, even under a different name, the app restores the project paused. Different audio with the same name gets its own project. Storage quota or access failures are visible and recommend exporting LRC; existing saved projects are not silently evicted.

On secure contexts in browsers with File System Access API, the selected file handle is structured-cloned into IndexedDB, separately from editing state. Every visit starts on the welcome screen. Saved handle metadata may be read at startup, but the audio and editing session load only after the user chooses Continue previous work. That action requests read permission if needed; already-granted access does not require picking the file again. Missing, changed or inaccessible files fall back to reselecting audio. Browsers without this API use a normal file input. The app never writes to the selected audio file. Clearing site data removes saved projects and handles.

The app supports English and Chinese, remembers the language, and follows system light/dark changes. Integrate contains installation and HTML/React/Vue native accordion examples. Export previews LRC before an explicit download using the audio filename with an `.lrc` extension. Only the active editing view receives global shortcuts; native buttons, dialogs, text fields and file controls preserve their own keyboard behavior.

## Local preview

```sh
npm ci
npm run build:demo
npm run preview:demo
```

The demo source is `examples/standalone/`. `base: './'` makes its JS and CSS work under `/lyricue/` as well as at a custom-domain root. Production files go to `demo-dist/`; the independently installable library remains in `dist/`. Neither output is committed. There is no client-side routing or server dependency.

## Initial repository setup

1. Push the source to `main`, or run **Deploy demo to GitHub Pages** from the Actions tab.
2. The official `actions/configure-pages` step uses `enablement: true` to initialize a missing Pages site. The next step explicitly selects the GitHub Actions publishing source if the site was previously configured for a branch, preventing the default Jekyll README build from replacing the demo.
3. Check the workflow's `github-pages` deployment URL.

If organization policy blocks automatic initialization, a repository administrator can open **Settings → Pages** and set **Source** to **GitHub Actions**, then rerun the workflow.

The workflow runs package checks, logic tests, a real tarball consumption check, and the demo build before uploading the Pages artifact. The build job has `pages: write` for initialization, and only the deployment job has `id-token: write`; it does not publish npm packages. Ordinary pull requests build the demo through CI without deploying.

If `actions/configure-pages` reports that Pages cannot be found, first confirm that Pages is enabled with the GitHub Actions source. Do not change repository visibility, add tokens to code, or replace Pages with another hosting service as a workaround.

## Updates

Push changes to `main` to rebuild and publish automatically. A `workflow_dispatch` trigger also supports manual rebuilds. Keep the homepage and the README links consistent if the repository name or domain changes.

Default media lives in `examples/standalone/assets/`: the complete 4:17 song is encoded as 192 kbps AAC in an M4A container with faststart, and the lyrics are preserved as UTF-8 text. `demo-audio.ts` supplies the asset URL, original display name and duration. Vite emits the audio with a content hash and a relative URL compatible with `/lyricue/`. The playground removes Suno section tags by default. The supplied lyrics have no timestamps, so the demo starts in rough timing. Refinement uses the user’s completed timings, never invented timestamps.

These assets are only deployed with the playground and are excluded from the npm package. Visitor-selected audio and lyrics stay in the browser. To replace the defaults, update the assets and their metadata together, then check playback, waveforms, lyrics and export filenames in both languages.

## Resetting local app data

Run `window.lyricueUtils.clearCacheAndReload()` in the browser console to clear Lyricue projects, lyrics drafts, preferences, remembered IndexedDB file handles and app-owned Cache Storage, unregister this app’s service workers, and reload. Pending saves and media loading stop before clearing; other open Lyricue tabs also stop saving and reload on completion. Data belonging to other apps on the same origin is preserved. This utility is part of the standalone app, not the npm component API.
