import { defineLyricsEditor, type LyricsEditorElement, type LyricsEditorSession, type LyricDocument, type RecordingMode } from 'lyricue';
import { prepareRecordingLyrics, serializeLyrics, stripSunoMarkers, readEditorSession, createTimingState } from 'lyricue/core';
import { integrationExamples } from './integration-examples';
import { renderModeIllustration } from './mode-illustration';
import { demoMedia } from './demo-audio';
import { audioFingerprint, audioDuration, fetchAudioFile } from './audio-files';
import { FileHandleStore, type AudioFileHandle, type RememberedFile, type PickerWindow } from './file-handles';
import { installCacheReset } from './cache-reset';
import { ProjectStore, type Project } from './projects';
import { strings, type Locale, type Message } from './strings';
import './page.css';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog')];
const dialog = (id: string) => $<HTMLDialogElement>('#' + id + '-dialog');
const source = $<HTMLTextAreaElement>('#source'), stripTags = $<HTMLInputElement>('#strip-tags');
const audioInput = $<HTMLInputElement>('#audio'), lyricsInput = $<HTMLInputElement>('#lyrics-file');
const handles = new FileHandleStore();
const pickerWindow = window as PickerWindow;
let manualStart = false;
let rememberedFile: RememberedFile | null = null;
let fileHandleRecovery: Promise<void> = Promise.resolve();
let resuming = false;
const menu = $<HTMLDetailsElement>('#file-menu');
const storage = new ProjectStore({
  getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key),
});
const storedLocale = storage.preference('locale');
let locale: Locale = storedLocale === 'zh-CN' || storedLocale === 'en' ? storedLocale : navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
const t = (key: Message) => strings[key][locale === 'zh-CN' ? 0 : 1];
const modePreference = () => { const mode = storage.preference('recording-mode'); return mode === 'tap' || mode === 'hold' ? mode : null; };
let editor: LyricsEditorElement | null = null;
let project: Project | null = null;
let audioURL = '';
let pickerOpen = false;
let operation: AbortController | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = '';
let storageFailed = false;
let resetting = false;
let message: Message | null = null;
let pending: { file: File; url: string; fingerprint: string; durationMs: number; lyrics: string; handle?: AudioFileHandle } | null = null;
let exportResult: { lyrics: string; filename: string } | null = null;
let confirmation: { title: Message; note: Message; action: Message } | null = null;
let alertMessage: { title: Message; note?: Message } | null = null;
let automaticHelp = false;
let loadingTitle: Message = 'fileLoading';

function setPreference(key: string, value: string) {
  if (resetting) return;
  try { storage.setPreference(key, value); } catch { failStorage(); }
}
function failStorage() { storageFailed = true; if (editor) editor.preventUnload = true; showMessage('storageFailed'); }
function showMessage(key: Message | null) { message = key; $('#message').hidden = !key; $('#message').textContent = key ? t(key) : ''; }
function syncKeyboard() {
  const welcome = !$('#welcome').hidden;
  const summary = menu.querySelector('summary')!;
  summary.setAttribute('aria-disabled', String(welcome)); summary.tabIndex = welcome ? -1 : 0;
  $<HTMLButtonElement>('#new-music').disabled = welcome;
  $('#welcome-footer').hidden = !welcome;
  if (welcome) menu.open = false;
  if (editor) editor.keyboardEnabled = !welcome && !pickerOpen && !menu.open && !dialogs.some(d => d.open);
}
function pause() { editor?.pause(true); }
function closeDialog(node: HTMLDialogElement, value = '') { node.close(value); syncKeyboard(); }
function showDialog(node: HTMLDialogElement) { pause(); menu.open = false; if (!node.open) node.showModal(); syncKeyboard(); }
function releaseURL(url: string) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }
function cancelPending() { if (pending) releaseURL(pending.url); pending = null; }
function cancelDialog(node: HTMLDialogElement) {
  if (node.id === 'complete-dialog') return;
  if (node.id === 'loading-dialog') { operation?.abort(); operation = null; }
  if (node.id === 'lyrics-dialog' || node.id === 'mode-dialog') cancelPending();
  closeDialog(node, 'cancel');
}
for (const node of dialogs) {
  node.addEventListener('close', () => { syncKeyboard(); if (editor && !$('#workspace').hidden && !pickerOpen && !dialogs.some(other => other.open)) editor.focus(); if (node.id === 'mode-dialog') for (const illustration of node.querySelectorAll('.mode-illustration')) illustration.replaceChildren(); queueMicrotask(presentCompletion); });
  node.addEventListener('cancel', event => { event.preventDefault(); cancelDialog(node); });
  for (const button of node.querySelectorAll<HTMLButtonElement>('[data-close]')) button.addEventListener('click', () => cancelDialog(node));
  node.addEventListener('click', event => { if (event.target !== node || ['loading-dialog', 'confirm-dialog', 'complete-dialog'].includes(node.id)) return; const b = node.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) cancelDialog(node); });
}
function confirmAction(title: Message, note: Message, action: Message): Promise<boolean> {
  confirmation = { title, note, action }; renderConfirmation();
  return new Promise(resolve => {
    const node = dialog('confirm'); node.returnValue = 'cancel';
    node.addEventListener('close', () => { confirmation = null; resolve(node.returnValue === 'confirm'); }, { once: true }); showDialog(node);
  });
}
function renderConfirmation() { if (!confirmation) return; $('#confirm-title').textContent = t(confirmation.title); $('#confirm-note').textContent = t(confirmation.note); $('#confirm-yes').textContent = t(confirmation.action); }
$('#confirm-yes').addEventListener('click', () => closeDialog(dialog('confirm'), 'confirm'));
$('#confirm-no').addEventListener('click', () => closeDialog(dialog('confirm'), 'cancel'));
function alert(title: Message, note?: Message) { alertMessage = { title, note }; renderAlert(); showDialog(dialog('alert')); }
function renderAlert() { if (!alertMessage) return; $('#alert-title').textContent = t(alertMessage.title); $('#alert-note').hidden = !alertMessage.note; $('#alert-note').textContent = alertMessage.note ? t(alertMessage.note) : ''; }

function saveNow() {
  clearTimeout(saveTimer); saveTimer = undefined;
  if (resetting || !project || !editor) return;
  const session = editor.getSession(); if (!session) return;
  const next = { ...project, session };
  const serialized = JSON.stringify({ ...next, updatedAt: 0 });
  if (serialized === lastSaved && !storageFailed) return;
  try {
    project = { ...next, updatedAt: Date.now() }; storage.write(project); lastSaved = serialized; storageFailed = false; editor.preventUnload = false;
    if (message === 'storageFailed') showMessage(null);
  } catch { failStorage(); }
}
function scheduleSave() {
  if (resetting || saveTimer || !project) return;
  saveTimer = setTimeout(saveNow, 250);
}
function hasTiming(session = editor?.getSession()) { return Boolean(session && (session.take || session.state.lines.some(line => line.timeMs !== null))); }
function refreshWorkspace() {
  if (!editor || !project) return;
  const session = editor.getSession(); if (!session) return;
  const stage = session.phase === 'refine' ? 'refine' : 'rough';
  for (const value of ['rough', 'refine'] as const) {
    const step = $('#step-' + value); step.classList.toggle('is-current', value === stage); step.classList.toggle('is-complete', value === 'rough' && stage === 'refine');
    if (value === stage) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
  }
  $('#playground').setAttribute('aria-labelledby', 'step-' + stage + '-label');
  for (const id of ['#replace-audio', '#edit-lyrics', '#mode']) {
    if (stage === 'refine') $(id).setAttribute('aria-disabled', 'true'); else $(id).removeAttribute('aria-disabled');
  }
  $('#restart').toggleAttribute('disabled', !hasTiming(session) && !session.hasStarted);
  $('#mode-name').textContent = t(session.mode);
  $('#lyrics-preview').textContent = session.state.lines.map(line => line.text).join('\n');
}
function renderAudioCard() {
  if (!project) return;
  $('#audio-name').textContent = project.filename;
  const seconds = Math.round(project.durationMs / 1000);
  const clock = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  $('#audio-meta').textContent = (project.filename.split('.').pop()?.toUpperCase() ?? '') + ' · ' + clock;
}
function refreshModeIllustrations() {
  if (!dialog('mode').open) return;
  for (const node of document.querySelectorAll<HTMLElement>('.mode-illustration')) renderModeIllustration(node, node.dataset.mode === 'hold' ? 'hold' : 'tap', locale);
}
function renderLocale() {
  $('#start-own [data-i18n]').dataset.i18n = hasSavedWork() ? 'newMusic' : 'ownAudio';
  document.documentElement.lang = locale;
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) node.textContent = t(node.dataset.i18n as Message);
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria as Message));
  $('#lang-zh').setAttribute('aria-pressed', String(locale === 'zh-CN')); $('#lang-en').setAttribute('aria-pressed', String(locale === 'en'));
  if (editor) { editor.locale = locale; editor.saveLabel = t('export'); }
  $('#lyrics-submit').textContent = t(pending ? 'next' : 'apply');
  $('#rough-help').textContent = t((editor?.mode ?? modePreference()) === 'hold' ? 'roughHold' : 'roughTap');
  $('#loading-title').textContent = t(loadingTitle);
  renderAudioCard(); refreshWorkspace(); refreshModeIllustrations(); renderConfirmation(); renderAlert(); showMessage(message);
}
function switchLanguage() { locale = locale === 'en' ? 'zh-CN' : 'en'; setPreference('locale', locale); renderLocale(); }
$('#lang-zh').addEventListener('click', switchLanguage); $('#lang-en').addEventListener('click', switchLanguage);
for (const [stack, code] of Object.entries(integrationExamples)) $('#' + stack + '-code').textContent = code;

function showHelp(automatic = false) {
  automaticHelp = automatic; $('#help-preference').hidden = !automatic;
  const hidden = storage.preference('hide-help') === 'true'; $<HTMLInputElement>('#hide-help').checked = hidden;
  $('#rough-help').textContent = t((editor?.mode ?? modePreference()) === 'hold' ? 'roughHold' : 'roughTap'); showDialog(dialog('help'));
}
$('#help').addEventListener('click', () => showHelp());
$('#hide-help').addEventListener('change', () => { if (!automaticHelp) return; const checked = $<HTMLInputElement>('#hide-help').checked; setPreference('hide-help', String(checked)); });
$('#usage').addEventListener('click', () => showDialog(dialog('usage')));
menu.querySelector('summary')!.addEventListener('click', event => { if (!$('#welcome').hidden) event.preventDefault(); });
menu.addEventListener('toggle', () => { if (!$('#welcome').hidden) menu.open = false; else if (menu.open) pause(); syncKeyboard(); });
document.addEventListener('pointerdown', event => { if (menu.open && !event.composedPath().includes(menu)) menu.open = false; });
menu.addEventListener('keydown', event => {
  if (!$('#welcome').hidden) { event.preventDefault(); return; }
  if (event.key === 'Escape') { event.preventDefault(); menu.open = false; menu.querySelector('summary')?.focus(); }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); menu.open = true;
  const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const at = items.indexOf(document.activeElement as HTMLButtonElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length; items[index]?.focus();
});

function presentCompletion() {
  if (editor?.getSession()?.phase !== 'complete' || dialogs.some(node => node.open)) return;
  showDialog(dialog('complete'));
}
$('#begin-refine').addEventListener('click', () => {
  if (!editor?.setPhase('refine')) return;
  closeDialog(dialog('complete')); refreshWorkspace(); saveNow();
});
function sidebarAction(action: () => void) {
  if (editor?.getSession()?.phase === 'refine') { alert('refineLockedTitle', 'refineLockedNote'); return; }
  action();
}
function plain(document: LyricDocument): LyricDocument { return { metadata: [...document.metadata], lines: document.lines.map(line => ({ text: line.text, timeMs: null })) }; }
function bindEditor(node: LyricsEditorElement) {
  node.addEventListener('lyrics-session-change', scheduleSave);
  node.addEventListener('lyrics-change', () => { refreshWorkspace(); scheduleSave(); });
  node.addEventListener('lyrics-phase-change', () => { refreshWorkspace(); scheduleSave(); presentCompletion(); });
  node.addEventListener('lyrics-dirty-change', () => { refreshWorkspace(); scheduleSave(); });
  node.addEventListener('lyrics-save', event => {
    saveNow(); exportResult = { lyrics: event.detail.lyrics, filename: (project?.filename ?? 'lyrics').replace(/\.[^.]+$/, '') + '.lrc' };
    $<HTMLTextAreaElement>('#export-content').value = exportResult.lyrics; showDialog(dialog('export'));
  });
}
function loadEditor(lyricsDocument: LyricDocument, mode: RecordingMode, session?: LyricsEditorSession) {
  if (!editor) { editor = document.createElement('lyrics-editor'); editor.id = 'editor'; bindEditor(editor); $('#editor-mount').append(editor); }
  editor.load({ audioSrc: audioURL, lyrics: lyricsDocument, mode, session, theme: 'auto', locale, showRoughPreview: true, keyboardScope: 'page', preventUnload: storageFailed, keyboardEnabled: false, saveLabel: t('export') });
  queueMicrotask(() => { refreshWorkspace(); syncKeyboard(); saveNow(); });
}
function freshSession(document: LyricDocument, mode: RecordingMode, scale = 80): LyricsEditorSession {
  return { version: 1, state: createTimingState(document.lines, document.metadata), original: document, mode,
    phase: document.lines.length && document.lines.every(line => line.timeMs !== null) ? 'refine' : 'rough',
    markers: [], positionMs: 0, hasStarted: false, take: null, viewport: { scale, scrollLeft: 0 } };
}
function enterWorkspace(file: File, url: string, fingerprint: string, durationMs: number, text: string, removeSuno: boolean, mode: RecordingMode, restored?: Project, handle?: AudioFileHandle, isDemo = false) {
  saveNow(); const previous = audioURL; audioURL = url; lastSaved = '';
  const initial = prepareRecordingLyrics(text, removeSuno);
  const initialSession = freshSession(initial, mode);
  project = restored ? { ...restored, filename: file.name, size: file.size, durationMs } : { version: 1, fingerprint, filename: file.name, size: file.size, durationMs, sourceLyrics: text, removeSuno, updatedAt: Date.now(), session: initialSession };
  setPreference('last-source', handle ? 'file-handle' : isDemo ? 'demo' : 'file');
  void handles.remember(handle ? { handle, fingerprint } : null).then(saved => { if (handle && !saved && project?.fingerprint === fingerprint) showMessage('handleUnavailable'); });
  rememberedFile = handle ? { handle, fingerprint } : null; $('#resume-project').hidden = true;
  pending = null; $('#welcome').hidden = true; $('#workspace').hidden = false;
  loadEditor(project.session.state, mode, project.session);
  if (previous !== audioURL) releaseURL(previous);
  renderAudioCard(); renderLocale(); showMessage(null);
  if (storage.preference('hide-help') !== 'true') showHelp(true);
}
function startPending(mode: RecordingMode) {
  if (!pending) return; const next = pending;
  setPreference('recording-mode', mode); storage.clearDraft(next.fingerprint);
  enterWorkspace(next.file, next.url, next.fingerprint, next.durationMs, next.lyrics, stripTags.checked, mode, undefined, next.handle);
}
function openMode() {
  const selected = editor?.mode ?? modePreference() ?? 'tap';
  for (const node of document.querySelectorAll<HTMLButtonElement>('[data-recording-mode]')) node.setAttribute('aria-pressed', String(node.dataset.recordingMode === selected));
  showDialog(dialog('mode')); refreshModeIllustrations();
}
let applyingMode = false;
for (const card of document.querySelectorAll<HTMLButtonElement>('[data-recording-mode]')) card.addEventListener('click', () => {
  void (async () => {
    if (applyingMode) return; applyingMode = true;
    try {
      const mode = card.dataset.recordingMode === 'hold' ? 'hold' : 'tap';
      if (pending) { closeDialog(dialog('mode')); startPending(mode); return; }
      if (!project || !editor) return;
      if (mode !== editor.mode && hasTiming() && !await confirmAction('modeResetTitle', 'modeResetWarning', 'changeMode')) return;
      closeDialog(dialog('mode')); setPreference('recording-mode', mode);
      if (mode !== editor.mode) { const document = plain(editor.getDocument()); project.sourceLyrics = document.lines.map(line => line.text).join('\n'); loadEditor(document, mode); }
    } finally { applyingMode = false; }
  })();
});
$('#mode').addEventListener('click', () => sidebarAction(openMode));
for (const query of ['(prefers-reduced-motion: reduce)', '(prefers-color-scheme: dark)']) window.matchMedia(query).addEventListener('change', refreshModeIllustrations);

function refreshTags() { $('#suno-field').hidden = stripSunoMarkers(source.value) === source.value.replace(/\r\n|\r/g, '\n'); $('#form-message').hidden = true; }
function showLyrics() {
  const fingerprint = pending?.fingerprint ?? project?.fingerprint;
  let value = pending?.lyrics ?? project?.sourceLyrics ?? '';
  if (!pending && editor) { const document = editor.getDocument(); value = document.lines.every(line => line.timeMs !== null) ? serializeLyrics(document) : document.lines.map(line => line.text).join('\n'); }
  source.value = (fingerprint ? storage.draft(fingerprint) : null) ?? value;
  stripTags.checked = pending ? true : project?.removeSuno ?? true; refreshTags(); $('#lyrics-submit').textContent = t(pending ? 'next' : 'apply'); showDialog(dialog('lyrics')); source.focus();
}
source.addEventListener('input', () => { refreshTags(); const fingerprint = pending?.fingerprint ?? project?.fingerprint; if (!resetting && fingerprint && source.value.length <= 1024 * 1024) { try { storage.saveDraft(fingerprint, source.value); } catch { failStorage(); } } });
$('#edit-lyrics').addEventListener('click', () => sidebarAction(showLyrics));
$<HTMLFormElement>('#lyrics-form').addEventListener('submit', event => {
  event.preventDefault(); void (async () => {
    if (new Blob([source.value]).size > 1024 * 1024) { $('#form-message').textContent = t('textSize'); $('#form-message').hidden = false; return; }
    const document = prepareRecordingLyrics(source.value, stripTags.checked);
    if (!document.lines.length) { $('#form-message').textContent = t('empty'); $('#form-message').hidden = false; source.focus(); return; }
    if (pending) {
      pending.lyrics = source.value; closeDialog(dialog('lyrics'));
      const mode = modePreference(); if (mode) startPending(mode); else openMode(); return;
    }
    if (!editor || !project) return;
    const current = editor.getDocument();
    if (JSON.stringify(current) === JSON.stringify(document) || source.value === current.lines.map(line => line.text).join('\n')) { storage.clearDraft(project.fingerprint); closeDialog(dialog('lyrics')); return; }
    if (hasTiming() && !await confirmAction('lyricsReplaceTitle', 'lyricsReplaceWarning', 'apply')) return;
    project.sourceLyrics = source.value; project.removeSuno = stripTags.checked; storage.clearDraft(project.fingerprint); closeDialog(dialog('lyrics')); loadEditor(document, editor.mode);
  })();
});
async function confirmNewProject() {
  if (!project && !hasSavedWork()) return true;
  return confirmAction('replaceTitle', project ? 'replaceWarning' : 'replaceSavedWarning', 'confirm');
}
async function requestAudio(confirmReplacement = true) {
  manualStart = true; pause(); menu.open = false; saveNow();
  if (confirmReplacement && !await confirmNewProject()) return;
  pickerOpen = true; syncKeyboard();
  if (pickerWindow.showOpenFilePicker) {
    try {
      const [handle] = await pickerWindow.showOpenFilePicker({ multiple: false, excludeAcceptAllOption: false, types: [{ description: t('audio'), accept: { 'audio/*': ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.mp4'] } }] });
      if (!handle) return; const file = await handle.getFile(); if (resetting) return; pickerOpen = false;
      const controller = showLoading('fileLoading'); void prepareFile(file, controller, { kind: 'file', handle });
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) alert('fileMissing'); }
    finally { pickerOpen = false; syncKeyboard(); }
  } else { audioInput.value = ''; audioInput.click(); }
}
for (const id of ['#start-own', '#new-music']) $(id).addEventListener('click', () => void requestAudio());
$('#replace-audio').addEventListener('click', () => sidebarAction(() => void requestAudio()));
for (const input of [audioInput, lyricsInput]) input.addEventListener('cancel', () => { pickerOpen = false; syncKeyboard(); });
function uploadLyrics() { pause(); pickerOpen = true; syncKeyboard(); lyricsInput.value = ''; lyricsInput.click(); }
$('#dialog-upload-lyrics').addEventListener('click', uploadLyrics);
lyricsInput.addEventListener('change', () => {
  void (async () => { try {
    const file = lyricsInput.files?.[0]; if (!file) return;
    if (file.size > 1024 * 1024) { alert('textSize'); return; }
    source.value = await file.text(); source.dispatchEvent(new Event('input')); source.focus();
  } catch { alert('textFailed'); } finally { pickerOpen = false; syncKeyboard(); } })();
});
function showLoading(title: Message) {
  operation?.abort(); operation = new AbortController(); loadingTitle = title; $('#loading-title').textContent = t(title);
  $<HTMLProgressElement>('#load-progress').removeAttribute('value'); $('#load-detail').textContent = ''; showDialog(dialog('loading')); return operation;
}
$('#cancel-loading').addEventListener('click', () => cancelDialog(dialog('loading')));
type AudioLoadRequest = { kind: 'file'; handle?: AudioFileHandle; expectedFingerprint?: string } | { kind: 'demo'; intent: 'new' | 'resume' };
async function prepareFile(file: File, controller: AbortController, request: AudioLoadRequest) {
  let url = '';
  try {
    if (resetting || controller.signal.aborted) return;
    if (file.size > 100 * 1024 * 1024) throw new Error('audioSize');
    url = URL.createObjectURL(file);
    const [hash, durationMs] = await Promise.all([audioFingerprint(file, controller.signal), audioDuration(url, controller.signal)]);
    if (resetting || controller.signal.aborted) { releaseURL(url); return; }
    const demo = request.kind === 'demo';
    const handle = request.kind === 'file' ? request.handle : undefined;
    if (request.kind === 'file' && request.expectedFingerprint && hash !== request.expectedFingerprint) throw new Error('fileChanged');
    const saved = demo && request.intent === 'new' ? null : storage.read(hash); const session = saved ? readEditorSession(saved.session) : null;
    if (session?.phase === 'rough' && !session.take && session.state.lines.length && session.state.lines.every(line => line.timeMs !== null)) session.phase = 'refine';
    if (demo && request.intent === 'resume' && (!saved || !session)) throw new Error('fileChanged');
    closeDialog(dialog('loading')); operation = null;
    if (saved && session) { enterWorkspace(file, url, hash, durationMs, saved.sourceLyrics, saved.removeSuno, session.mode, { ...saved, session }, handle, demo); return; }
    if (demo) {
      storage.clearDraft(hash);
      const mode = modePreference() ?? 'tap'; setPreference('recording-mode', mode);
      enterWorkspace(file, url, hash, durationMs, demoMedia.lyrics, true, mode, undefined, undefined, true); return;
    }
    pending = { file, url, fingerprint: hash, durationMs, lyrics: '', handle }; showLyrics();
  } catch (error) {
    releaseURL(url); if (controller.signal.aborted) return;
    closeDialog(dialog('loading')); operation = null; alert(error instanceof Error && error.message === 'audioSize' ? 'audioSize' : error instanceof Error && error.message === 'fileChanged' ? 'fileChanged' : 'audioInvalid');
  }
}
audioInput.addEventListener('change', () => { const file = audioInput.files?.[0]; pickerOpen = false; syncKeyboard(); if (!file) return; const controller = showLoading('fileLoading'); void prepareFile(file, controller, { kind: 'file' }); });
async function startDemo(resume = false) {
  manualStart = true; pause(); saveNow();
  if (!resume && !await confirmNewProject()) return;
  const controller = showLoading('demoLoading');
  try {
    const file = await fetchAudioFile(demoMedia, controller.signal, (received, total) => {
      const progress = $<HTMLProgressElement>('#load-progress');
      if (total > 0) { progress.max = total; progress.value = received; }
      $('#load-detail').textContent = (received / 1024 / 1024).toFixed(1) + (total > 0 ? ' / ' + (total / 1024 / 1024).toFixed(1) : '') + ' MB';
    });
    await prepareFile(file, controller, { kind: 'demo', intent: resume ? 'resume' : 'new' });
  } catch { if (!controller.signal.aborted) { closeDialog(dialog('loading')); operation = null; alert('demoFailed'); } }
}
$('#start-demo').addEventListener('click', () => void startDemo());
$('#restart').addEventListener('click', () => {
  void (async () => {
    menu.open = false; pause(); if (!editor || !project || (!hasTiming() && !editor.getSession()?.hasStarted)) return;
    if (!await confirmAction('restartTitle', 'restartWarning', 'restart')) return;
    const previous = editor.getSession(); if (!previous) return;
    const document = plain(editor.getDocument()); project.sourceLyrics = document.lines.map(line => line.text).join('\n');
    loadEditor(document, editor.mode, freshSession(document, editor.mode, previous.viewport.scale));
    showMessage(null);
    if (storage.preference('hide-help') !== 'true') showHelp(true);
  })();
});
$('#download-lrc').addEventListener('click', () => {
  if (!exportResult) return;
  const url = URL.createObjectURL(new Blob([exportResult.lyrics], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = exportResult.filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) button.addEventListener('click', () => { void (async () => {
  try { await navigator.clipboard.writeText($('#' + button.dataset.copy).textContent ?? ''); $('#copy-status').textContent = t('copied'); button.textContent = t('copied'); setTimeout(() => { button.textContent = t('copy'); }, 1600); }
  catch { $('#copy-status').textContent = t('copyFailed'); }
})(); });
// Pausing before flushing preserves a tap phrase, and commits a released physical hold.
const flush = () => { pause(); saveNow(); };
window.addEventListener('pagehide', flush); window.addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('storage', event => { if (event.key === 'lyricue.locale') { const value = storage.preference('locale'); if (value === 'en' || value === 'zh-CN') { locale = value; renderLocale(); } } });
// No Blob, File or URL is serialized; uploaded audio is released when the page leaves memory.
window.addEventListener('pagehide', event => { if (!event.persisted) { releaseURL(audioURL); } });
async function restoreFile() {
  if (resetting || !rememberedFile || operation) return;
  const { handle, fingerprint: expected } = rememberedFile;
  try {
    const permission = await handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') { $('#resume-project').hidden = false; showMessage('permissionNeeded'); return; }
    const controller = showLoading('restoreLoading');
    try { const file = await handle.getFile(); if (!controller.signal.aborted) await prepareFile(file, controller, { kind: 'file', handle, expectedFingerprint: expected }); }
    catch { if (!controller.signal.aborted) { closeDialog(dialog('loading')); operation = null; showMessage('fileMissing'); $('#resume-project').hidden = false; } }
  } catch { showMessage('fileMissing'); $('#resume-project').hidden = false; }
}
$('#resume-project').addEventListener('click', () => {
  void (async () => {
    if (resuming) return;
    resuming = true;
    try {
      await fileHandleRecovery;
      if (resetting) return;
      manualStart = true;
      if (project && editor) { $('#welcome').hidden = true; $('#workspace').hidden = false; syncKeyboard(); editor.focus(); }
      else if (rememberedFile) await restoreFile();
      else if (storage.preference('last-source') === 'demo') await startDemo(true);
      else await requestAudio(false);
    } finally { resuming = false; }
  })();
});
function hasSavedWork() {
  try {
    return Object.keys(localStorage).some(key => {
      if (!key.startsWith('lyricue.project.')) return false;
      return Boolean(readEditorSession(storage.read(key.slice('lyricue.project.'.length))?.session));
    });
  } catch { return false; }
}
async function recoverLastFile() {
  const saved = hasSavedWork();
  $('#resume-project').hidden = !saved;
  $('#resume-project').classList.toggle('is-primary', saved);
  $('#start-own').classList.toggle('is-primary', !saved);
  if (storage.preference('last-source') !== 'file-handle' || !pickerWindow.showOpenFilePicker) return;
  const remembered = await handles.read();
  if (resetting || manualStart || !remembered || project || pending || operation || !readEditorSession(storage.read(remembered.fingerprint)?.session)) return;
  // Startup reads only saved handle metadata; audio loading requires Continue.
  rememberedFile = remembered;
}
installCacheReset(() => {
  if (resetting) return;
  resetting = true; manualStart = true; clearTimeout(saveTimer); saveTimer = undefined;
  operation?.abort(); operation = null;
  if (editor) { editor.preventUnload = false; editor.keyboardEnabled = false; editor.pause(true); editor.remove(); editor = null; }
  cancelPending(); releaseURL(audioURL); audioURL = ''; project = null; rememberedFile = null;
  document.documentElement.inert = true;
});
defineLyricsEditor(); renderLocale(); syncKeyboard(); fileHandleRecovery = recoverLastFile();
