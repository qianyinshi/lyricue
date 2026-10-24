# GitHub Pages playground

The public demo is served at https://qianyinshi.github.io/lyricue/. It uses the actual built component, with the maintainer-provided song “字节圈 1012” and its lyrics. It can also load local audio and plain or LRC lyrics, record timing, refine boundaries, and preview LRC in a native dialog before downloading. No visitor audio or lyrics are uploaded. The single-screen app supports English and Chinese, remembered in local storage, and follows live system light/dark changes across the page, editor and dialogs. The header Integrate button opens a native dialog with installation and native HTML, React and Vue accordion examples (a shared details name keeps one expanded at a time). Lyrics are previewed in the sidebar and edited or uploaded through native dialogs. Quick timing and refinement preserve separate demo sessions. The workbench uses a natural height and is vertically centered, with a compact music file card and a plain-text lyrics preview. The current recording mode is plain text with a separate Edit link that opens native animated selection cards that apply on click, and sidebar edit/upload actions use theme-colored links. Only the active editor receives page-wide shortcuts; dialogs and file pickers pause playback without auto-resuming.

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

Default media lives in `examples/standalone/assets/`: the complete 4:17 song is encoded as 192 kbps AAC in an M4A container with faststart, and the lyrics are preserved as UTF-8 text. `demo-audio.ts` supplies the asset URL, original display name and duration. Vite emits the audio with a content hash and a relative URL compatible with `/lyricue/`. The playground removes Suno section tags by default. Since the supplied lyrics have no timestamps, the refinement demo initially spreads lines evenly across the song; rough timing starts with untimed lyrics.

These assets are only deployed with the playground and are excluded from the npm package. Visitor-selected audio and lyrics stay in the browser. To replace the defaults, update the assets and their metadata together, then check playback, waveforms, lyrics and export filenames in both languages.
