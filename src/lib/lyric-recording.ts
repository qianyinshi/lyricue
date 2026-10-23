import type { LyricLine } from "./lyric-timing.js";

export type RecordingMode = "tap" | "hold";
export interface LyricTake {
  base: LyricLine[];
  index: number;
  startMs: number;
  mode: RecordingMode;
  input: "keyboard" | "pointer";
  durationMs: number;
}

/** Discard the previous completed phrase, preserving text and all earlier cuts. */
export function rewindLyricRecording(base: LyricLine[], cursor: number, durationMs: number) {
  if (!Number.isInteger(cursor) || cursor < 0 || !base.length || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  let index = cursor === 0 ? 0 : Math.min(cursor, base.length) - 1;
  if (cursor > 0) while (index >= 0 && (base[index].timeMs === null || !base[index].text)) index--;
  if (index < 0) return null;
  const previous = base[index - 1];
  const positionMs = index === 0 ? 0 : (previous?.timeMs != null ? previous.endMs : undefined) ?? base[index].timeMs!;
  if (!Number.isFinite(positionMs) || positionMs < 0 || positionMs >= durationMs) return null;
  const lines = base.map((line, lineIndex) => {
    if (lineIndex === index) return { text: line.text, timeMs: null };
    // Freeze an implicit end before removing the start it used to follow.
    if (lineIndex === index - 1 && line.timeMs !== null && line.endMs === undefined) return { ...line, endMs: positionMs };
    return line;
  });
  return { lines, index, positionMs };
}

export function beginLyricTake(base: LyricLine[], index: number, timeMs: number, durationMs: number, mode: RecordingMode, input: LyricTake["input"]): LyricTake | null {
  if (!base[index] || !Number.isFinite(timeMs) || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const previous = base[index - 1];
  const minimum = previous?.endMs ?? previous?.timeMs ?? 0;
  const maximum = Math.min(durationMs, base[index + 1]?.timeMs ?? durationMs);
  const startMs = Math.round(Math.max(minimum, Math.min(maximum, timeMs)));
  if (!Number.isFinite(startMs) || startMs >= maximum) return null;
  return { base, index, startMs, mode, input, durationMs };
}

/** A growing clip is a preview, not an edit/history entry on every animation frame. */
export function previewLyricTake(take: LyricTake, timeMs: number, final = false): LyricLine[] {
  const lines = take.base.map((line) => ({ ...line }));
  const maximum = Math.min(take.durationMs, lines[take.index + 1]?.timeMs ?? take.durationMs);
  const clockMs = Number.isFinite(timeMs) ? timeMs : take.startMs;
  const endMs = Math.round(Math.max(take.startMs + (final ? 1 : 0), Math.min(maximum, clockMs)));
  const previous = lines[take.index - 1];
  const oldStart = lines[take.index].timeMs;
  // Re-recording one existing line must not stretch the previous phrase across a new gap.
  if (take.mode === "hold" && previous?.timeMs != null && previous.endMs === undefined && oldStart !== null) previous.endMs = Math.min(oldStart, take.startMs);
  lines[take.index] = { text: lines[take.index].text, timeMs: take.startMs, endMs };
  return lines;
}
