import type { LyricsEditorSession } from '../types.js';
import type { LyricLine, TimingSnapshot } from './lyric-timing.js';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const mode = (value: unknown) => value === 'tap' || value === 'hold';
const phase = (value: unknown) => value === 'rough' || value === 'complete' || value === 'refine';
const metadata = (value: unknown): value is string[] => Array.isArray(value) && value.every(tag => typeof tag === 'string');
const lines = (value: unknown): value is LyricLine[] => Array.isArray(value) && value.length <= 10000 && value.every(line =>
  record(line) && typeof line.text === 'string' && (line.timeMs === null || number(line.timeMs)) && (line.endMs === undefined || number(line.endMs)));
const snapshot = (value: unknown): value is TimingSnapshot => record(value) && lines(value.lines) && metadata(value.metadata)
  && Number.isInteger(value.selected) && number(value.selected) && value.selected <= value.lines.length;
const history = (value: unknown) => Array.isArray(value) && value.length <= 100 && value.every(snapshot);

/** Validate stored data before constructing any DOM or restoring editing state. */
export function readEditorSession(value: unknown): LyricsEditorSession | null {
  if (!record(value) || value.version !== 1) return null;
  const { state, original, markers, viewport, take } = value;
  if (!record(state) || !snapshot(state) || !history(state.past) || !history(state.future)) return null;
  if (!record(original) || !lines(original.lines) || !metadata(original.metadata)) return null;
  if (!mode(value.mode) || !phase(value.phase) || !number(value.positionMs) || typeof value.hasStarted !== 'boolean') return null;
  if (!Array.isArray(markers) || !markers.every(marker => record(marker) && Number.isInteger(marker.id) && number(marker.id) && number(marker.timeMs))) return null;
  if (new Set(markers.map(marker => marker.id)).size !== markers.length) return null;
  if (!record(viewport) || !number(viewport.scale) || viewport.scale === 0 || viewport.scale > 1000000 || !number(viewport.scrollLeft)) return null;
  if (take !== null) {
    if (!record(take) || !lines(take.base) || take.base.length !== state.lines.length) return null;
    if (take.base.some((line, index) => line.text !== state.lines[index].text)) return null;
    if (take.mode !== value.mode || value.phase !== 'rough' || (take.input !== 'keyboard' && take.input !== 'pointer')) return null;
    if (!Number.isInteger(take.index) || !number(take.index) || !take.base[take.index]) return null;
    if (!number(take.startMs) || !number(take.durationMs) || take.startMs >= take.durationMs) return null;
  }
  if (value.phase !== 'rough' && (!state.lines.length || take || state.lines.some(line => line.timeMs === null))) return null;
  try { return structuredClone(value) as unknown as LyricsEditorSession; }
  catch { return null; }
}
