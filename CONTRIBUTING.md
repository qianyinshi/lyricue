# Contributing to Lyricue

Use Node.js 22.18 or newer (24 recommended) and npm. All development happens in this repository; no sibling repository or external workspace is required.

```sh
npm ci
npm run dev
npm run check
npm test
npm run verify:package
npm run build:demo
```

- Keep runtime and peer dependencies empty. The UI uses native DOM APIs and Shadow DOM.
- Keep reusable timing algorithms in `src/lib/`, exported through `src/core.ts`.
- Preserve millisecond precision, non-overlapping ranges, keyboard focus, pointer cancellation, and cleanup on disconnect.
- Treat lyrics as untrusted text: render them with `textContent`, not `innerHTML`.
- Update the English and Chinese READMEs when public properties, events, or session behavior changes.
- Add meaningful regression coverage for behavior changes; test the built package outside the source tree.
- Do not commit generated `dist/`, `node_modules/`, tarballs, credentials, or user audio.

The example synthesizes its own test audio. Please avoid copyrighted recordings or private user data in issues and pull requests.

Submit changes through a pull request with a concise explanation of the behavior and validation. This repository uses the MIT license.

The playground is also the GitHub Pages site. Keep it usable without external audio or a backend, preserve local-only file handling, and check the production output under `/lyricue/`. Pages setup is documented in `docs/github-pages.md`.
