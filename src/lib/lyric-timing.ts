export interface LyricLine {
  text: string;
  timeMs: number | null;
  /** Explicit trim; otherwise the next line's start (or audio end) is used. */
  endMs?: number;
}

export interface LyricDocument {
  lines: LyricLine[];
  metadata: string[];
}

const timestampPattern = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;

/** Only whole-line section/instruction tags; keep LRC metadata and inline lyric text. */
export function isSunoMarker(text: string): boolean {
  return /^(?:\[[^[\]\r\n]+\]\s*)+$/.test(text.trim())
    && !/^\[(?:ar|al|ti|au|by|offset|length|re|ve|id):/i.test(text.trim())
    && ![...text.matchAll(timestampPattern)].length;
}

export function stripSunoMarkers(source: string): string {
  return source.split(/\r\n|\n|\r/).flatMap((line) => {
    if (!isSunoMarker(line.replace(timestampPattern, "").trim())) return [line];
    // Keep timed tags as standard empty LRC cues so earlier lyrics don't span the gap.
    const timestamps = [...line.matchAll(timestampPattern)].map((match) => match[0]).join("");
    return timestamps ? [timestamps] : [];
  }).join("\n");
}

/** Expand repeated LRC timestamps and bake offset into times for iOS compatibility. */
export function parseLyrics(source: string, options: { keepSectionTags?: boolean } = {}): LyricDocument {
  const metadata: string[] = [];
  const lines: LyricLine[] = [];
  let offset = 0;
  for (const raw of source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    const tag = /^\[([a-z][\w-]*):(.*)\]$/i.exec(line);
    if (tag && !(options.keepSectionTags && isSunoMarker(line))) {
      if (tag[1].toLowerCase() === "offset") {
        if (/^[+-]?\d+$/.test(tag[2].trim())) offset = Number(tag[2]);
      } else metadata.push(line);
      continue;
    }
    const timestamps = [...line.matchAll(timestampPattern)];
    const text = line.replace(timestampPattern, "").trim();
    if (timestamps.length) {
      for (const match of timestamps) lines.push({
        text,
        timeMs: Number(match[1]) * 60_000 + Number(match[2]) * 1000
          + Number((match[3] ?? "").padEnd(3, "0")),
      });
    } else if (text) lines.push({ text, timeMs: null });
  }
  for (const line of lines) {
    if (line.timeMs !== null) line.timeMs = Math.max(0, line.timeMs + offset);
  }
  // Compact LRC often puts several chorus timestamps on the same source line.
  // Only sort fully timed documents; mixed/plain lyrics retain their editing order.
  if (lines.every((line) => line.timeMs !== null)) lines.sort((a, b) => a.timeMs! - b.timeMs!);
  const lyrics: LyricLine[] = [];
  for (const line of lines) {
    if (line.text) lyrics.push(line);
    else {
      // Standard empty LRC timestamps clear the previous lyric during a gap.
      const previous = lyrics.at(-1);
      if (previous?.timeMs != null && line.timeMs !== null && line.timeMs >= previous.timeMs && previous.endMs === undefined) previous.endMs = line.timeMs;
    }
  }
  return { lines: lyrics, metadata };
}

export function formatLyricTime(timeMs: number): string {
  const value = Math.max(0, Math.round(timeMs));
  return `${String(Math.floor(value / 60_000)).padStart(2, "0")}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
}

export function parseLyricTime(value: string): number | null {
  const match = /^(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 60_000 + Number(match[2]) * 1000
    + Number((match[3] ?? "").padEnd(3, "0")) : null;
}

export function timingIssues(lines: LyricLine[], durationMs: number): Map<number, string> {
  const issues = new Map<number, string>();
  let previous = -1;
  lines.forEach((line, index) => {
    if (line.timeMs === null) issues.set(index, "尚未打轴");
    else {
      if (!Number.isFinite(line.timeMs) || line.timeMs < 0) issues.set(index, "时间无效");
      else if (durationMs > 0 && line.timeMs > durationMs) issues.set(index, "超过音频时长");
      else if (line.timeMs < previous) issues.set(index, "早于上一行，请校准时间");
      if (line.endMs !== undefined) {
        const nextStart = lines[index + 1]?.timeMs;
        if (!Number.isFinite(line.endMs) || line.endMs < line.timeMs) issues.set(index, "结束时间早于开始时间");
        else if (durationMs > 0 && line.endMs > durationMs) issues.set(index, "结束时间超过音频时长");
        else if (nextStart != null && line.endMs > nextStart) issues.set(index, "结束时间与下一句重叠");
      }
      previous = line.timeMs;
    }
  });
  return issues;
}

export function serializeLyrics(document: LyricDocument): string {
  if (timingIssues(document.lines, 0).size) throw new Error("请先完成所有行的打轴并校准时间顺序");
  return [...document.metadata, ...document.lines.flatMap((line, index) => {
    const result = [`[${formatLyricTime(line.timeMs!)}]${line.text}`];
    const nextStart = document.lines[index + 1]?.timeMs;
    if (line.endMs !== undefined && (nextStart == null || line.endMs < nextStart)) result.push(`[${formatLyricTime(line.endMs)}]`);
    return result;
  })].join("\n");
}

export interface TimingSnapshot { lines: LyricLine[]; metadata: string[]; selected: number }
export interface TimingState extends TimingSnapshot { past: TimingSnapshot[]; future: TimingSnapshot[] }
export type TimingAction =
  | { type: "select"; index: number }
  | { type: "time"; index: number; timeMs: number | null; advance?: boolean }
  | { type: "shift"; deltaMs: number; index?: number }
  | { type: "ranges"; lines: LyricLine[]; index: number }
  | { type: "remove-markers" }
  | { type: "reset" }
  | { type: "checkpoint" }
  | { type: "undo" | "redo" };

export function createTimingState(lines: LyricLine[], metadata: string[] = []): TimingState {
  const firstUntimed = lines.findIndex((line) => line.timeMs === null);
  return { lines, metadata, selected: firstUntimed < 0 ? 0 : firstUntimed, past: [], future: [] };
}

export function timingReducer(state: TimingState, action: TimingAction): TimingState {
  if (action.type === "checkpoint") return { ...state, past: [], future: [] };
  if (action.type === "select") return { ...state, selected: Math.max(0, Math.min(action.index, state.lines.length)) };
  if (action.type === "undo" || action.type === "redo") {
    const source = action.type === "undo" ? state.past : state.future;
    const snapshot = source.at(-1);
    if (!snapshot) return state;
    const current = { lines: state.lines, metadata: state.metadata, selected: state.selected };
    return action.type === "undo"
      ? { ...snapshot, past: state.past.slice(0, -1), future: [...state.future, current] }
      : { ...snapshot, past: [...state.past, current], future: state.future.slice(0, -1) };
  }
  const lines = action.type === "remove-markers" ? state.lines.flatMap((line, index) => {
    if (isSunoMarker(line.text)) return [];
    // A removed timed marker still marks the start of an instrumental gap.
    const next = state.lines[index + 1];
    return [{ ...line, ...(line.endMs === undefined && next?.timeMs != null && isSunoMarker(next.text) ? { endMs: next.timeMs } : {}) }];
  }) : action.type === "ranges" ? action.lines : state.lines.map((line, index) => {
    if (action.type === "reset") return { text: line.text, timeMs: null };
    if (action.type === "time" && index === action.index) {
      if (action.timeMs === null || action.advance) return { text: line.text, timeMs: action.timeMs === null ? null : Math.round(action.timeMs) };
      return { ...line, timeMs: Math.round(action.timeMs) };
    }
    if (action.type === "shift" && (action.index === undefined || index === action.index) && line.timeMs !== null) {
      return { ...line, timeMs: line.timeMs + action.deltaMs,
        ...(line.endMs === undefined ? {} : { endMs: line.endMs + action.deltaMs }) };
    }
    return line;
  });
  const selected = action.type === "remove-markers" ? Math.min(lines.length, state.lines.slice(0, state.selected).filter((line) => !isSunoMarker(line.text)).length)
    : action.type === "ranges" ? action.index : action.type === "reset" ? 0
    : action.type === "time" && action.advance ? Math.min(action.index + 1, lines.length) : state.selected;
  const metadata = action.type === "remove-markers" ? state.metadata.filter((tag) => !isSunoMarker(tag)) : state.metadata;
  if (sameLyricRanges(lines, state.lines) && metadata.length === state.metadata.length && selected === state.selected) return state;
  return { lines, metadata, selected, past: [...state.past.slice(-99), { lines: state.lines, metadata: state.metadata, selected: state.selected }], future: [] };
}

export function activeLyricIndex(lines: LyricLine[], timeMs: number): number {
  let active = -1;
  let latest = -1;
  lines.forEach((line, index) => {
    if (line.timeMs !== null && line.timeMs <= timeMs && line.timeMs >= latest) {
      active = index;
      latest = line.timeMs;
    }
  });
  return active >= 0 && lines[active].endMs !== undefined && timeMs >= lines[active].endMs! ? -1 : active;
}

export function sameLyricRanges(a: LyricLine[], b: LyricLine[]): boolean {
  return a.length === b.length && a.every((line, index) => line.timeMs === b[index].timeMs && line.endMs === b[index].endMs);
}

export function lyricEndMs(lines: LyricLine[], index: number, durationMs: number): number {
  return lines[index].endMs ?? lines[index + 1]?.timeMs ?? durationMs;
}

export type LyricEdge = "start" | "end";

/** Shared cuts ripple only into the immediate neighbor; single-edge trims keep it fixed. */
export function lyricBoundaryLimits(lines: LyricLine[], index: number, edge: LyricEdge, durationMs: number, separate = false) {
  const line = lines[index];
  const start = line.timeMs ?? 0;
  const end = lyricEndMs(lines, index, durationMs);
  const previous = lines[index - 1]?.timeMs != null ? lines[index - 1] : undefined;
  const next = lines[index + 1]?.timeMs != null ? lines[index + 1] : undefined;
  const previousEnd = previous ? lyricEndMs(lines, index - 1, durationMs) : 0;
  const shared = edge === "start" ? Boolean(previous && previousEnd === start) : Boolean(next && next.timeMs === end);
  const min = edge === "start" ? (shared && !separate ? (previous!.timeMs ?? 0) : previousEnd) : start;
  const max = edge === "start" ? end : (shared && !separate ? lyricEndMs(lines, index + 1, durationMs) : next?.timeMs ?? durationMs);
  return { min: Math.max(0, min), max: Math.min(durationMs, max), shared: shared && !separate };
}

/** Choose once at pointer-down: the cut itself ripples; the inset handle trims. */
export function lyricBoundaryEditMode(lines: LyricLine[], index: number, edge: LyricEdge, distancePx: number, durationMs: number, thresholdPx = 4): "shared" | "single" {
  if (!lines[index] || lines[index].timeMs === null || !Number.isFinite(distancePx) || distancePx < 0) return "single";
  return distancePx <= thresholdPx && lyricBoundaryLimits(lines, index, edge, durationMs).shared ? "shared" : "single";
}

export function resizeLyricBoundary(lines: LyricLine[], index: number, edge: LyricEdge, timeMs: number, durationMs: number, separate = false): LyricLine[] {
  if (!lines[index] || lines[index].timeMs === null || !Number.isFinite(timeMs)) return lines;
  const limits = lyricBoundaryLimits(lines, index, edge, durationMs, separate);
  if (limits.min > limits.max) return lines;
  const time = Math.round(Math.max(limits.min, Math.min(limits.max, timeMs)));
  if (time === (edge === "start" ? lines[index].timeMs : lyricEndMs(lines, index, durationMs))) return lines;
  const result = lines.map((line) => ({ ...line }));
  if (edge === "start") {
    const previous = result[index - 1];
    // Keep an implicit previous end at its old position for an isolated trim.
    if (previous?.timeMs != null && (previous.endMs !== undefined || separate)) previous.endMs = limits.shared ? time : lyricEndMs(lines, index - 1, durationMs);
    result[index].timeMs = time;
  } else {
    result[index].endMs = time;
    if (limits.shared) result[index + 1].timeMs = time;
  }
  return result;
}

/** Both recording modes ignore empty source lines; timed LRC gaps remain intact. */
export function prepareRecordingLyrics(source: string, removeMarkers: boolean) {
  return parseLyrics(removeMarkers ? stripSunoMarkers(source) : source, { keepSectionTags: true });
}

/** Silence is represented by explicit lyric ends, never a visible empty clip. */
export function compactRecordedLyrics(lines: LyricLine[], durationMs: number): LyricLine[] {
  return lines.flatMap((line, index) => line.text ? [{ ...line, endMs: lyricEndMs(lines, index, durationMs) }] : []);
}

export function lyricBoundaryPreview(lines: LyricLine[], index: number, edge: LyricEdge, separate: boolean, durationMs: number) {
  const line = lines[index];
  if (line?.timeMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const end = lyricEndMs(lines, index, durationMs);
  const boundary = edge === "start" ? line.timeMs : end;
  const startMs = Math.max(0, separate ? edge === "start" ? boundary : Math.max(line.timeMs, boundary - 1000) : boundary - 500);
  const endMs = Math.min(durationMs, separate ? edge === "start" ? Math.min(end, boundary + 1000) : boundary : boundary + 500);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? { startMs, endMs } : null;
}
