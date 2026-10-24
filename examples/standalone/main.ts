import { defineLyricsEditor, type LyricsEditorElement, type LyricsEditorPhase, type LyricDocument } from 'lyricue';
import { prepareRecordingLyrics, serializeLyrics, stripSunoMarkers } from 'lyricue/core';
import { integrationExamples } from './integration-examples';
import { renderModeIllustration } from './mode-illustration';
import { createDemoAudio } from './demo-audio';
import './page.css';

type Locale = 'zh-CN' | 'en';
type Stage = 'rough' | 'refine';
const strings = {
  intro: ['超好用的零依赖歌词打轴工具', 'A delightfully simple, zero-dependency lyrics timing tool.'],
  rough: ['快速粗打', 'Quick timing'], refine: ['精调时间轴', 'Fine-tune timeline'], audio: ['音频', 'Audio'],
  demo: ['使用示例音频', 'Use demo audio'], demoName: ['示例音乐.wav', 'Demo instrumental.wav'],
  lyrics: ['待打轴歌词', 'Lyrics to time'], edit: ['编辑', 'Edit'], editLyrics: ['编辑歌词', 'Edit lyrics'], upload: ['上传', 'Upload'], mode: ['打轴方式', 'Recording mode'],
  tap: ['点按模式', 'Tap mode'], hold: ['长按模式', 'Hold mode'],
  chooseMode: ['选择你喜欢的打轴方式', 'Choose your timing mode'], recommended: ['推荐', 'Recommended'], applyMode: ['应用方式', 'Apply mode'],
  tapDescription: ['点一下空格，进入下一句。句与句连续衔接，自动去除所有空行。', 'Tap Space to advance to the next line. Lines connect continuously; empty lines are removed.'],
  holdDescription: ['按住空格开始一句，松开结束。句与句之间可以留白，自动去除所有空行。', 'Hold Space to start a line, release to end it. Leave gaps between lines; empty lines are removed.'], suno: ['自动去除 Suno 段落标记', 'Remove Suno section tags'],
  cancel: ['取消', 'Cancel'], apply: ['应用歌词', 'Apply lyrics'], close: ['关闭', 'Close'], usage: ['使用方法', 'Using Lyricue'],
  install: ['安装', 'Install'], use: ['使用', 'Use'], installNote: ['npm 版本即将发布，目前可以从源码构建并安装。', 'The npm release is coming soon. For now, build and pack from source.'],
  copy: ['复制代码', 'Copy code'], copied: ['已复制', 'Copied'], copyFailed: ['无法访问剪贴板，请手动选择代码复制。', 'Clipboard unavailable. Select the code to copy it.'],
  docs: ['完整文档', 'Full documentation'], replaceTitle: ['替换当前会话？', 'Replace this session?'], replaceNote: ['当前的打轴结果和标记将被重置。', 'Your current timing and markers will be reset.'], replace: ['替换', 'Replace'],
  empty: ['请至少输入一句歌词。', 'Add at least one line of lyrics.'], audioSize: ['请选择小于 100 MB 的音频。', 'Choose audio smaller than 100 MB.'],
  audioInvalid: ['无法读取该音频，请选择浏览器支持的音频格式。', 'Cannot read this audio. Choose a format supported by your browser.'],
  textSize: ['歌词文件不能超过 1 MB。', 'Lyrics files must be smaller than 1 MB.'], textFailed: ['无法读取歌词文件，请重试。', 'Cannot read the lyrics file. Try again.'],
  export: ['导出 LRC', 'Export LRC'], download: ['保存下载', 'Download LRC'], lrcLyrics: ['LRC 格式歌词', 'LRC lyrics'], integrate: ['集成', 'Integrate'],
  htmlNote: ['将包内整个 dist 文件夹复制到 HTML 文件旁的 vendor/lyricue/ 目录，然后通过 HTTP 服务打开页面。', 'Copy the entire package dist folder to vendor/lyricue/ beside this HTML file, then serve it over HTTP.'],
} satisfies Record<string, [string, string]>;
type Message = keyof typeof strings;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
function initialLocale(): Locale {
  try { const stored = localStorage.getItem('lyricue.locale'); if (stored === 'en' || stored === 'zh-CN') return stored; } catch { /* Storage may be unavailable in private contexts. */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}
let locale = initialLocale();
const t = (key: Message) => strings[key][locale === 'zh-CN' ? 0 : 1];
const editors = { rough: $<LyricsEditorElement>('#rough-editor'), refine: $<LyricsEditorElement>('#refine-editor') };
const source = $<HTMLTextAreaElement>('#source'), stripTags = $<HTMLInputElement>('#strip-tags');
const audioInput = $<HTMLInputElement>('#audio'), lyricsInput = $<HTMLInputElement>('#lyrics-file');
let recordingMode: 'tap' | 'hold' = 'tap';
const timedSample = '[00:01.000]Let the morning find you\n[00:04.500]\n[00:05.000]With a little room to breathe\n[00:08.500]\n[00:09.000]Every word can have its moment\n[00:12.500]\n[00:13.000]Every note can find its place\n[00:16.500]\n[00:17.000]We can bring it all together\n[00:19.500]';
let lyrics = timedSample;
let activeStage: Stage = 'rough';
const phases: Record<Stage, LyricsEditorPhase> = { rough: 'rough', refine: 'refine' };
const dirty: Record<Stage, boolean> = { rough: false, refine: false };
let audioFile: File | null = null, audioURL = URL.createObjectURL(createDemoAudio()), durationMs = 20000;
let pickerOpen = false, messageKey: Message | null = null;
let pendingExport: { lyrics: string; filename: string } | null = null;
for (const [stack, code] of Object.entries(integrationExamples)) $('#' + stack + '-code').textContent = code;
const active = () => editors[activeStage];
const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog')];
const currentPhase = () => phases[activeStage];

function syncKeyboard() {
  const blocked = pickerOpen || dialogs.some(dialog => dialog.open);
  for (const stage of ['rough', 'refine'] as const) editors[stage].keyboardEnabled = !blocked && stage === activeStage;
}
function pause() { active().pause(true); }
function showMessage(key: Message | null) { messageKey = key; $('#message').hidden = !key; $('#message').textContent = key ? t(key) : ''; }
function closeDialog(dialog: HTMLDialogElement, value = '') { dialog.close(value); syncKeyboard(); }
function showDialog(dialog: HTMLDialogElement) { pause(); dialog.showModal(); syncKeyboard(); }
for (const dialog of dialogs) {
  dialog.addEventListener('close', () => { syncKeyboard(); if (dialog.id === 'mode-dialog' && !dialog.open) for (const node of dialog.querySelectorAll('.mode-illustration')) node.replaceChildren(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-close]')) button.addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog); } });
}
function confirmReplacement(scope?: Stage): Promise<boolean> {
  if (scope ? !dirty[scope] : !dirty.rough && !dirty.refine) return Promise.resolve(true);
  const dialog = $<HTMLDialogElement>('#confirm-dialog');
  return new Promise(resolve => {
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'replace'), { once: true });
    showDialog(dialog);
  });
}
$('#confirm-no').addEventListener('click', () => closeDialog($<HTMLDialogElement>('#confirm-dialog'), 'cancel'));
$('#confirm-yes').addEventListener('click', () => closeDialog($<HTMLDialogElement>('#confirm-dialog'), 'replace'));
function refreshTabs() {
  const stage = currentPhase() === 'refine' ? 'refine' : 'rough';
  for (const name of ['rough', 'refine'] as const) {
    const tab = $('#tab-' + name); tab.setAttribute('aria-selected', String(name === stage)); tab.tabIndex = name === stage ? 0 : -1;
  }
  $('#playground').setAttribute('aria-labelledby', 'tab-' + stage);
  $('#mode-field').hidden = stage !== 'rough';
}
function renderAudioCard() {
  $('#audio-name').textContent = audioFile?.name ?? t('demoName');
  const seconds = Math.round(durationMs / 1000);
  const clock = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  const format = audioFile?.name.split('.').pop()?.toUpperCase() || 'WAV';
  const size = audioFile ? ' · ' + (audioFile.size / 1024 / 1024).toFixed(1) + ' MB' : '';
  $('#audio-meta').textContent = format + ' · ' + clock + size;
}
function renderLocale() {
  document.documentElement.lang = locale;
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) node.textContent = t(node.dataset.i18n as Message);
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria as Message));
  $('#lang-zh').setAttribute('aria-pressed', String(locale === 'zh-CN')); $('#lang-en').setAttribute('aria-pressed', String(locale === 'en'));
  renderAudioCard();
  for (const editor of Object.values(editors)) { editor.locale = locale; editor.saveLabel = t('export'); }
  $('#mode-name').textContent = t(recordingMode);
  refreshModeIllustrations();
  showMessage(messageKey);
}
function switchLanguage() {
  locale = locale === 'en' ? 'zh-CN' : 'en';
  try { localStorage.setItem('lyricue.locale', locale); } catch { /* Continue without persistence. */ }
  renderLocale();
}
$('#lang-zh').addEventListener('click', switchLanguage); $('#lang-en').addEventListener('click', switchLanguage);
function prepared() { return prepareRecordingLyrics(lyrics, stripTags.checked); }
function plainDocument(document: LyricDocument): LyricDocument { return { ...document, lines: document.lines.map(line => ({ ...line, timeMs: null, endMs: undefined })) }; }
function refineDocument(document: LyricDocument): LyricDocument {
  if (document.lines.every(line => line.timeMs !== null)) return document;
  const slot = durationMs / Math.max(document.lines.length, 1);
  return { ...document, lines: document.lines.map((line, index) => ({ ...line, timeMs: Math.round(index * slot), endMs: Math.round((index + 1) * slot) })) };
}
function load(stage: Stage, document: LyricDocument) {
  editors[stage].load({ audioSrc: audioURL, lyrics: document, mode: recordingMode, keyboardScope: 'page', locale, autoFocus: false, saveLabel: t('export'), keyboardEnabled: stage === activeStage && !dialogs.some(dialog => dialog.open) });
  dirty[stage] = false;
  phases[stage] = document.lines.every(line => line.timeMs !== null) ? 'refine' : 'rough';
}
function loadBoth() {
  const document = prepared(); load('rough', plainDocument(document)); load('refine', refineDocument(document));
  $('#lyrics-preview').textContent = document.lines.map(line => line.text).join('\n');
  renderAudioCard();
  $('#use-demo').hidden = !audioFile; showMessage(null); refreshTabs(); syncKeyboard();
}
async function switchStage(stage: Stage) {
  pause();
  // A completed recording stays in its original instance, preserving markers and history.
  if (stage === 'refine' && currentPhase() === 'refine') return;
  if (stage === 'rough' && phases.rough !== 'rough') {
    if (!await confirmReplacement()) return;
    load('rough', plainDocument(prepared()));
  }
  activeStage = stage;
  for (const name of ['rough', 'refine'] as const) editors[name].hidden = name !== stage;
  refreshTabs(); syncKeyboard();
}
for (const stage of ['rough', 'refine'] as const) {
  $('#tab-' + stage).addEventListener('click', () => void switchStage(stage));
  $('#tab-' + stage).addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); event.stopPropagation(); const next = stage === 'rough' ? 'refine' : 'rough'; void switchStage(next); $('#tab-' + next).focus();
  });
}
$('#usage').addEventListener('click', () => showDialog($<HTMLDialogElement>('#usage-dialog')));
function refreshTags() { $('#suno-field').hidden = stripSunoMarkers(source.value) === source.value.replace(/\r\n|\r/g, '\n'); $('#form-message').hidden = true; }
$('#edit-lyrics').addEventListener('click', () => {
  // Include any work already done, so opening this dialog never silently loses timing.
  const document = active().getDocument();
  source.value = currentPhase() === 'refine' ? serializeLyrics(document) : document.lines.map(line => line.text).join('\n');
  refreshTags(); showDialog($<HTMLDialogElement>('#lyrics-dialog')); source.focus();
});
source.addEventListener('input', refreshTags);
$<HTMLFormElement>('#lyrics-form').addEventListener('submit', event => {
  event.preventDefault();
  void (async () => {
    const document = prepareRecordingLyrics(source.value, stripTags.checked);
    if (!document.lines.length) { $('#form-message').textContent = t('empty'); $('#form-message').hidden = false; source.focus(); return; }
    if (!await confirmReplacement()) return;
    lyrics = stripTags.checked ? stripSunoMarkers(source.value) : source.value;
    closeDialog($<HTMLDialogElement>('#lyrics-dialog'));
    activeStage = document.lines.every(line => line.timeMs !== null) ? 'refine' : 'rough';
    for (const stage of ['rough', 'refine'] as const) editors[stage].hidden = stage !== activeStage;
    loadBoth();
  })();
});
function choose(input: HTMLInputElement) { pause(); pickerOpen = true; syncKeyboard(); input.value = ''; input.click(); }
$('#upload-audio').addEventListener('click', () => choose(audioInput)); $('#upload-lyrics').addEventListener('click', () => choose(lyricsInput));
for (const input of [audioInput, lyricsInput]) input.addEventListener('cancel', () => { pickerOpen = false; syncKeyboard(); });
async function readDuration(url: string): Promise<number> {
  const audio = document.createElement('audio');
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(false), 15000);
    const finish = (ok: boolean) => { clearTimeout(timeout); const duration = audio.duration; audio.removeAttribute('src'); audio.load(); if (ok && Number.isFinite(duration) && duration > 0) resolve(Math.round(duration * 1000)); else reject(new Error('invalid_audio')); };
    audio.addEventListener('loadedmetadata', () => finish(true), { once: true }); audio.addEventListener('error', () => finish(false), { once: true }); audio.preload = 'metadata'; audio.src = url;
  });
}
audioInput.addEventListener('change', () => {
  void (async () => {
    const file = audioInput.files?.[0];
    try {
      if (!file) return;
      if (file.size > 100 * 1024 * 1024) { showMessage('audioSize'); return; }
      const nextURL = URL.createObjectURL(file);
      try {
        const duration = await readDuration(nextURL);
        if (!await confirmReplacement()) { URL.revokeObjectURL(nextURL); return; }
        const previousURL = audioURL; audioURL = nextURL; audioFile = file; durationMs = duration; loadBoth(); URL.revokeObjectURL(previousURL);
      } catch { URL.revokeObjectURL(nextURL); showMessage('audioInvalid'); }
    } finally { pickerOpen = false; syncKeyboard(); }
  })();
});
lyricsInput.addEventListener('change', () => {
  void (async () => {
    try {
      const file = lyricsInput.files?.[0]; if (!file) return;
      if (file.size > 1024 * 1024) { showMessage('textSize'); return; }
      const value = await file.text();
      if (!prepareRecordingLyrics(value, stripTags.checked).lines.length) { showMessage('empty'); return; }
      source.value = value; refreshTags(); showDialog($<HTMLDialogElement>('#lyrics-dialog')); source.focus();
    } catch { showMessage('textFailed'); } finally { pickerOpen = false; syncKeyboard(); }
  })();
});
$('#use-demo').addEventListener('click', () => {
  pause(); void (async () => { if (!await confirmReplacement()) return; const previousURL = audioURL; audioURL = URL.createObjectURL(createDemoAudio()); audioFile = null; durationMs = 20000; loadBoth(); URL.revokeObjectURL(previousURL); })();
});
function refreshModeIllustrations() {
  if (!$<HTMLDialogElement>('#mode-dialog').open) return;
  for (const node of document.querySelectorAll<HTMLElement>('.mode-illustration')) renderModeIllustration(node, node.dataset.mode === 'hold' ? 'hold' : 'tap', locale);
}
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refreshModeIllustrations);
$('#mode').addEventListener('click', () => {
  $<HTMLInputElement>('#mode-dialog input[value="' + recordingMode + '"]').checked = true;
  showDialog($<HTMLDialogElement>('#mode-dialog')); refreshModeIllustrations();
});
$<HTMLFormElement>('#mode-form').addEventListener('submit', event => {
  event.preventDefault();
  void (async () => {
    const next = $<HTMLInputElement>('#mode-dialog input:checked').value === 'hold' ? 'hold' : 'tap';
    if (next !== recordingMode) {
      if (!await confirmReplacement('rough')) return;
      recordingMode = next; load('rough', plainDocument(prepared()));
      $('#mode-name').textContent = t(recordingMode); refreshTabs();
    }
    closeDialog($<HTMLDialogElement>('#mode-dialog'));
  })();
});
for (const stage of ['rough', 'refine'] as const) {
  editors[stage].addEventListener('lyrics-dirty-change', event => { dirty[stage] = event.detail.dirty; });
  editors[stage].addEventListener('lyrics-phase-change', event => { phases[stage] = event.detail.phase; if (stage === activeStage) refreshTabs(); });
  editors[stage].addEventListener('lyrics-save', event => {
    pendingExport = { lyrics: event.detail.lyrics, filename: (audioFile?.name.replace(/\.[^.]+$/, '') || 'lyricue-demo') + '.lrc' };
    $<HTMLTextAreaElement>('#export-content').value = pendingExport.lyrics;
    $('#export-filename').textContent = pendingExport.filename;
    showDialog($<HTMLDialogElement>('#export-dialog'));
  });
}
$('#download-lrc').addEventListener('click', () => {
  if (!pendingExport) return;
  const url = URL.createObjectURL(new Blob([pendingExport.lyrics], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = pendingExport.filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', () => { void (async () => {
    try {
      await navigator.clipboard.writeText($('#' + button.dataset.copy).textContent ?? '');
      $('#copy-status').textContent = t('copied'); button.textContent = t('copied');
      setTimeout(() => { button.textContent = t('copy'); }, 1600);
    } catch { $('#copy-status').textContent = t('copyFailed'); }
  })(); });
}
window.addEventListener('pagehide', event => { pause(); if (!event.persisted) URL.revokeObjectURL(audioURL); });
defineLyricsEditor(); renderLocale(); loadBoth();
