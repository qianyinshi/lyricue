# Lyricue repository guidance

Lyricue is an independent, MIT-licensed lyrics timing Web Component. Do not depend on a sibling application repository, its configuration, tools, API, or node_modules.

- Runtime and peer dependencies must remain empty. Use native DOM APIs and Shadow DOM; no framework or modal dependency.
- Keep pure timing, recording, marker and waveform algorithms in `src/lib/` and export them from `/core` without DOM side effects.
- Preserve the public DOM properties, methods, events and tag documented in both READMEs. Registration is explicit and idempotent; `/register` is the optional side-effect entry.
- Preserve stable nodes during playback, focused-instance keyboard routing, pointer cancellation, millisecond precision, and cleanup on disconnect. Reconnecting must not start playback automatically.
- Lyrics are untrusted text. Use `textContent`; only package-owned static SVG markup may use `innerHTML`.
- Use Node.js 22.18+ (24 recommended). Run `npm run check`, `npm test`, `npm run verify:package`, `npm run build:demo`, and `git diff --check` for relevant changes.
- Do not commit generated dist files, dependencies, tarballs, credentials, or user media.
- npm publication and remote repository writes require explicit user authorization. `private: true` currently prevents accidental npm publishing.

- The GitHub Pages playground lives in `examples/standalone/`, builds to ignored `demo-dist/`, and deploys from `main` using `.github/workflows/pages.yml`. Do not mix its output with library `dist/` or upload visitor files. Keep asset paths compatible with a project subpath.
