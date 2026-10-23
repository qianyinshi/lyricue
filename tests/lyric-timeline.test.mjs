import assert from "node:assert/strict";
import test from "node:test";
import { activeLyricIndex, createTimingState, lyricBoundaryEditMode, lyricBoundaryLimits, lyricEndMs, parseLyrics, resizeLyricBoundary, serializeLyrics, timingIssues, timingReducer } from "../src/lib/lyric-timing.ts";
import { buildAudioWaveform } from "../src/lib/audio-waveform.ts";

const lyrics = () => parseLyrics("[00:01.000]床前明月光\n[00:04.000]疑是地上霜\n[00:08.000]举头望明月").lines;
const duration = 12000;

test("the shared cut hit zone edits both sides while inset hits trim only the selected side", () => {
  for (const [index, edge] of [[0, "end"], [1, "start"]]) {
    for (const distance of [0, 2, 4]) assert.equal(lyricBoundaryEditMode(lyrics(), index, edge, distance, duration), "shared");
    for (const distance of [4.1, 8, 12]) assert.equal(lyricBoundaryEditMode(lyrics(), index, edge, distance, duration), "single");
  }
});

test("separate gap edges, outer song edges and untimed lyrics are always single-sided", () => {
  const lines = lyrics(); lines[0].endMs = 3000;
  assert.equal(lyricBoundaryEditMode(lines, 0, "end", 0, duration), "single");
  assert.equal(lyricBoundaryEditMode(lines, 1, "start", 0, duration), "single");
  assert.equal(lyricBoundaryEditMode(lines, 0, "start", 0, duration), "single");
  assert.equal(lyricBoundaryEditMode(lines, 2, "end", 0, duration), "single");
  assert.equal(lyricBoundaryEditMode([{ text: "待打轴", timeMs: null }], 0, "start", 0, duration), "single");
  assert.equal(lyricBoundaryEditMode(lines, 99, "end", 0, duration), "single");
  assert.equal(lyricBoundaryEditMode(lines, 1, "end", NaN, duration), "single");
});

test("pointer-chosen edit modes preserve neighboring cuts and gaps without a modifier", () => {
  const lines = lyrics();
  const shared = lyricBoundaryEditMode(lines, 0, "end", 2, duration);
  const coupled = resizeLyricBoundary(lines, 0, "end", 4500, duration, shared === "single");
  assert.equal(coupled[0].endMs, 4500); assert.equal(coupled[1].timeMs, 4500);
  const single = lyricBoundaryEditMode(lines, 0, "end", 11, duration);
  const tail = resizeLyricBoundary(lines, 0, "end", 3500, duration, single === "single");
  assert.equal(tail[0].endMs, 3500); assert.equal(tail[1].timeMs, 4000);
  const headMode = lyricBoundaryEditMode(lines, 1, "start", 11, duration);
  const head = resizeLyricBoundary(lines, 1, "start", 4500, duration, headMode === "single");
  assert.equal(head[0].endMs, 4000); assert.equal(head[1].timeMs, 4500);
  assert.deepEqual(parseLyrics(serializeLyrics({ lines: tail, metadata: [] })).lines, tail);
});

test("LRC blank timestamps become explicit clip ends and round trip with interludes", () => {
  const source = "[ti:静夜思]\n[00:00.000]\n[00:01.123]床前明月光\n[00:03.456]\n[00:04.000]疑是地上霜\n[00:06.789]";
  const document = parseLyrics(source);
  assert.deepEqual(document.lines, [
    { text: "床前明月光", timeMs: 1123, endMs: 3456 },
    { text: "疑是地上霜", timeMs: 4000, endMs: 6789 },
  ]);
  assert.deepEqual(parseLyrics(serializeLyrics(document)), document);
});

test("clip default ends follow next start, and final clip follows audio duration", () => {
  const lines = lyrics();
  assert.deepEqual(lines.map((_, index) => lyricEndMs(lines, index, duration)), [4000, 8000, duration]);
  lines[0].endMs = 3000;
  assert.equal(lyricEndMs(lines, 0, duration), 3000);
});

test("shared cut drag updates both neighbors and leaves other boundaries stable", () => {
  const original = lyrics();
  const resized = resizeLyricBoundary(original, 0, "end", 5123, duration);
  assert.equal(resized[0].endMs, 5123);
  assert.equal(resized[1].timeMs, 5123);
  assert.equal(lyricEndMs(resized, 1, duration), 8000);
  assert.deepEqual(original, lyrics(), "drag calculation must not mutate history");
  assert.equal(timingIssues(resized, duration).size, 0);
});

test("moving a shared start keeps explicit previous ends joined", () => {
  const lines = lyrics();
  lines[0].endMs = 4000;
  const resized = resizeLyricBoundary(lines, 1, "start", 3210, duration);
  assert.equal(resized[0].endMs, 3210);
  assert.equal(resized[1].timeMs, 3210);
  assert.equal(timingIssues(resized, duration).size, 0);
});

test("independent tail trim creates an interlude without moving the next lyric", () => {
  const resized = resizeLyricBoundary(lyrics(), 0, "end", 3000, duration, true);
  assert.equal(resized[0].endMs, 3000);
  assert.equal(resized[1].timeMs, 4000);
  const saved = serializeLyrics({ lines: resized, metadata: [] });
  assert.match(saved, /\[00:03.000\]\n\[00:04.000\]疑是地上霜/);
  assert.deepEqual(parseLyrics(saved).lines, resized);
});

test("independent head trim freezes the previous implicit end to preserve the new gap", () => {
  const resized = resizeLyricBoundary(lyrics(), 1, "start", 5000, duration, true);
  assert.equal(resized[0].endMs, 4000);
  assert.equal(resized[1].timeMs, 5000);
  assert.equal(lyricEndMs(resized, 1, duration), 8000);
  assert.equal(timingIssues(resized, duration).size, 0);
});

test("boundaries clamp to audio and adjacent material, never crossing or overlapping", () => {
  const lines = lyrics();
  assert.equal(resizeLyricBoundary(lines, 0, "start", -999, duration)[0].timeMs, 0);
  assert.equal(resizeLyricBoundary(lines, 0, "end", 999999, duration)[1].timeMs, 8000);
  assert.equal(resizeLyricBoundary(lines, 1, "end", -999, duration)[1].endMs, 4000);
  const gaps = resizeLyricBoundary(lines, 0, "end", 3000, duration, true);
  assert.equal(lyricBoundaryLimits(gaps, 1, "start", duration).min, 3000);
  assert.equal(resizeLyricBoundary(gaps, 0, "end", 9000, duration)[0].endMs, 4000);
  assert.equal(resizeLyricBoundary(gaps, 1, "start", 0, duration)[1].timeMs, 3000);
});

test("the final lyric can end before the audio and survive exporting/re-importing", () => {
  const resized = resizeLyricBoundary(lyrics(), 2, "end", 10567, duration);
  const saved = serializeLyrics({ lines: resized, metadata: [] });
  assert.ok(saved.endsWith("[00:10.567]"));
  assert.deepEqual(parseLyrics(saved).lines, resized);
  assert.equal(activeLyricIndex(resized, 11000), -1);
});

test("preview clears during gaps instead of returning an earlier lyric", () => {
  const lines = lyrics();
  lines[1].endMs = 6000;
  assert.equal(activeLyricIndex(lines, 5999), 1);
  assert.equal(activeLyricIndex(lines, 6000), -1);
  assert.equal(activeLyricIndex(lines, 8000), 2);
});

test("invalid explicit ends block serialization and duration validation", () => {
  for (const endMs of [0, 5000, NaN, Infinity]) {
    const lines = lyrics(); lines[0].endMs = endMs;
    assert.ok(timingIssues(lines, duration).has(0));
    assert.throws(() => serializeLyrics({ lines, metadata: [] }));
  }
  const lines = lyrics(); lines[2].endMs = 13000;
  assert.equal(timingIssues(lines, duration).get(2), "结束时间超过音频时长");
});

test("one drag is one atomic undo step for both sides of a cut", () => {
  const original = createTimingState(lyrics());
  const edited = timingReducer(original, { type: "ranges", lines: resizeLyricBoundary(original.lines, 0, "end", 4500, duration), index: 0 });
  assert.equal(edited.past.length, 1);
  const undo = timingReducer(edited, { type: "undo" });
  assert.deepEqual(undo.lines, original.lines);
  assert.deepEqual(timingReducer(undo, { type: "redo" }).lines, edited.lines);
});

test("bulk shifting, resetting and re-recording account for explicit ends", () => {
  const lines = lyrics(); lines[0].endMs = 3000;
  const initial = createTimingState(lines);
  const shifted = timingReducer(initial, { type: "shift", deltaMs: 100 });
  assert.equal(shifted.lines[0].endMs, 3100);
  const reset = timingReducer(shifted, { type: "reset" });
  assert.ok(reset.lines.every((line) => line.endMs === undefined && line.timeMs === null));
  assert.equal(timingReducer(initial, { type: "time", index: 0, timeMs: 2000, advance: true }).lines[0].endMs, undefined);
  assert.equal(timingReducer(initial, { type: "time", index: 0, timeMs: null }).lines[0].endMs, undefined);
});

test("unchanged pointer positions don't create artificial edits", () => {
  const lines = lyrics();
  assert.equal(resizeLyricBoundary(lines, 0, "end", 4000, duration), lines);
  const initial = createTimingState(lines);
  assert.equal(timingReducer(initial, { type: "ranges", lines, index: 0 }), initial);
});

test("repeated boundary adjustments always preserve valid nonoverlapping ranges", () => {
  let lines = lyrics();
  for (let index = 0; index < 80; index++) {
    lines = resizeLyricBoundary(lines, index % 3, index % 2 ? "start" : "end", (index * 7919) % 14000 - 1000, duration, index % 4 === 0);
    assert.equal(timingIssues(lines, duration).size, 0, `adjustment ${index}`);
  }
});

test("waveform uses real extrema from all channels, including final partial bin", () => {
  const result = buildAudioWaveform([new Float32Array([0, 0.5, -0.25, 0, 0.8]), new Float32Array([-1, 0, 0, 0.75, 0])], 2000);
  assert.deepEqual([...result.min], [-1, -0.25, 0]);
  assert.deepEqual([...result.max], [0.5, 0.75, Math.fround(0.8)]);
  assert.equal(result.peak, 1);
  assert.equal(result.binMs, 1);
  assert.equal(result.durationMs, 2.5);
});

test("silent audio produces a flat waveform rather than placeholder peaks", () => {
  const result = buildAudioWaveform([new Float32Array(1000)], 1000);
  assert.equal(result.peak, 0);
  assert.ok(result.min.every((value) => value === 0));
  assert.ok(result.max.every((value) => value === 0));
});

test("a partially recorded timeline can be trimmed without timing unrecorded neighbors", () => {
  const lines = [{ text: "甲", timeMs: null }, { text: "乙", timeMs: 2000, endMs: 3000 }, { text: "丙", timeMs: null }];
  const head = resizeLyricBoundary(lines, 1, "start", 1000, duration, true);
  assert.equal(head[1].timeMs, 1000);
  assert.deepEqual(head[0], lines[0]);
  const tail = resizeLyricBoundary(head, 1, "end", 4000, duration);
  assert.equal(tail[1].endMs, 4000);
  assert.deepEqual(tail[2], lines[2]);
});
