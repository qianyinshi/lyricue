import { defineLyricsEditor, type LyricsEditorElement, type LyricsEditorPhase } from 'lyricue';
import { parseLyrics, prepareRecordingLyrics, stripSunoMarkers } from 'lyricue/core';
import { createDemoAudio } from './demo-audio';
import './page.css';

defineLyricsEditor();
const editor = document.querySelector<LyricsEditorElement>('lyrics-editor')!;
const source = document.querySelector<HTMLTextAreaElement>('#source')!;
const audioInput = document.querySelector<HTMLInputElement>('#audio')!;
const mode = document.querySelector<HTMLSelectElement>('#mode')!;
const result = document.querySelector<HTMLTextAreaElement>('#result')!;
const stripTags = document.querySelector<HTMLInputElement>('#strip-tags')!;
const formMessage = document.querySelector<HTMLElement>('#form-message')!;
const audioName = document.querySelector<HTMLElement>('#audio-name')!;
const currentAudio = document.querySelector<HTMLElement>('#current-audio')!;
const useDemo = document.querySelector<HTMLButtonElement>('#use-demo')!;
const toggleSource = document.querySelector<HTMLButtonElement>('#toggle-source')!;
const copyLRC = document.querySelector<HTMLButtonElement>('#copy-lrc')!;
const exportStatus = document.querySelector<HTMLElement>('#export-status')!;
const status = document.querySelector<HTMLElement>('#dirty')!;
const tip = document.querySelector<HTMLElement>('#editor-tip')!;
const demo = createDemoAudio();
const timedSample = '[00:01.000]Let the morning find you\n[00:04.500]\n[00:05.000]With a little room to breathe\n[00:08.500]\n[00:09.000]Every word can have its moment\n[00:12.500]\n[00:13.000]Every note can find its place\n[00:16.500]\n[00:17.000]We can bring it all together\n[00:19.500]';
const plainSample = parseLyrics(timedSample).lines.map(line => line.text).join('\n');
let selectedFile: File | null = null;
let activeURL = '';
let activeFilename = 'lyricue-demo';
let dirty = false;
let phase: LyricsEditorPhase = 'refine';

function refreshSource() {
  const document = prepareRecordingLyrics(source.value, stripTags.checked);
  const timed = document.lines.length > 0 && document.lines.every(line => line.timeMs !== null);
  documentElement('#mode-field').hidden = timed;
  documentElement('#suno-field').hidden = stripSunoMarkers(source.value) === source.value.replace(/\r\n|\r/g, '\n');
  toggleSource.textContent = timed ? 'Try plain lyrics' : 'Use timed sample';
  formMessage.hidden = true;
}
function documentElement(selector: string) { return document.querySelector<HTMLElement>(selector)!; }
function updateStatus() {
  status.textContent = dirty ? 'Unsaved timing' : 'Ready to explore';
  tip.textContent = phase === 'rough'
    ? 'Press Enter to play, then use Space to mark each line. You can refine it afterward.'
    : phase === 'complete' ? 'First pass complete. Continue to refinement to adjust each line.'
      : 'Play the demo, then drag the edges of a lyric to hear the difference.';
}
function openEditor(autoFocus = true) {
  const document = prepareRecordingLyrics(source.value, stripTags.checked);
  if (!document.lines.length) { formMessage.textContent = 'Add at least one line of lyrics to begin.'; formMessage.hidden = false; source.focus(); return; }
  if (dirty && !window.confirm('Replace this session? Your unsaved timing and markers will be lost.')) return;
  const nextURL = URL.createObjectURL(selectedFile ?? demo), previousURL = activeURL;
  editor.load({ audioSrc: nextURL, lyrics: document, mode: mode.value === 'hold' ? 'hold' : 'tap', autoFocus, saveLabel: 'Export LRC' });
  activeURL = nextURL; if (previousURL) URL.revokeObjectURL(previousURL);
  activeFilename = selectedFile?.name.replace(/\.[^.]+$/, '') || 'lyricue-demo';
  currentAudio.textContent = selectedFile?.name || 'Demo instrumental · 20s';
  dirty = false; formMessage.hidden = true; updateStatus();
}
source.value = timedSample;
source.addEventListener('input', refreshSource);
stripTags.addEventListener('change', refreshSource);
toggleSource.addEventListener('click', () => { source.value = toggleSource.textContent === 'Try plain lyrics' ? plainSample : timedSample; refreshSource(); });
document.querySelector<HTMLFormElement>('#setup')!.addEventListener('submit', event => { event.preventDefault(); openEditor(); });
audioInput.addEventListener('change', () => {
  const file = audioInput.files?.[0]; if (!file) return;
  if (file.size > 100 * 1024 * 1024) { formMessage.textContent = 'Choose an audio file smaller than 100 MB.'; formMessage.hidden = false; audioInput.value = ''; return; }
  selectedFile = file; audioName.textContent = file.name; useDemo.hidden = false; formMessage.hidden = true;
});
useDemo.addEventListener('click', () => { selectedFile = null; audioInput.value = ''; audioName.textContent = 'Original demo instrumental'; useDemo.hidden = true; });
editor.addEventListener('lyrics-dirty-change', event => { dirty = event.detail.dirty; updateStatus(); });
editor.addEventListener('lyrics-phase-change', event => { phase = event.detail.phase; updateStatus(); });
editor.addEventListener('lyrics-save', event => {
  result.value = event.detail.lyrics; copyLRC.disabled = false;
  const filename = activeFilename + '.lrc'; exportStatus.textContent = filename + ' downloaded';
  const url = URL.createObjectURL(new Blob([event.detail.lyrics], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function copy(value: string, button: HTMLButtonElement) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(value); button.textContent = 'Copied'; documentElement('#copy-status').textContent = 'Copied to clipboard.';
    setTimeout(() => { button.textContent = label; }, 1600);
  } catch { documentElement('#copy-status').textContent = 'Clipboard unavailable. Select the text to copy it.'; }
}
copyLRC.addEventListener('click', () => void copy(result.value, copyLRC));
const copyCode = document.querySelector<HTMLButtonElement>('#copy-code')!;
copyCode.addEventListener('click', () => void copy(documentElement('#usage-code').textContent ?? '', copyCode));
window.addEventListener('pagehide', event => { if (!event.persisted) URL.revokeObjectURL(activeURL); });
refreshSource(); openEditor(false);
