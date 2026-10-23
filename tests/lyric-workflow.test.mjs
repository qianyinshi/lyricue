import assert from "node:assert/strict";
import test from "node:test";
import { compactRecordedLyrics, lyricBoundaryPreview, prepareRecordingLyrics } from "../src/lib/lyric-timing.ts";
import { createTimingState, parseLyrics, serializeLyrics, timingReducer } from "../src/lib/lyric-timing.ts";

test("recording preparation removes every blank and whitespace-only line", () => {
  const document = prepareRecordingLyrics("\uFEFF\r\n \r\n[Intro]\r\n甲\r\n \r\n\r\n[Outro]\r\n乙\r\n\r\n", true);
  assert.deepEqual(document.lines, [{ text: "甲", timeMs: null }, { text: "乙", timeMs: null }]);
  assert.deepEqual(parseLyrics("甲\n\n乙").lines.map((line) => line.text), ["甲", "乙"], "default parser remains compact");
});

test("disabling Suno cleanup preserves instructions but still removes every empty line", () => {
  const source = "\n[Intro]\n甲\n\n[Verse: soft piano]\n乙\n[Outro]\n";
  assert.deepEqual(prepareRecordingLyrics(source, true).lines.map((line) => line.text), ["甲", "乙"]);
  assert.deepEqual(prepareRecordingLyrics(source, false).lines.map((line) => line.text), ["[Intro]", "甲", "[Verse: soft piano]", "乙", "[Outro]"]);
  assert.deepEqual(prepareRecordingLyrics("\n \n[Outro]\n", true).lines, []);
  assert.deepEqual(prepareRecordingLyrics("甲", true).lines, [{ text: "甲", timeMs: null }]);
});

test("cleanup preserves metadata, offsets and existing timed interludes", () => {
  const result = prepareRecordingLyrics("[ti:测试]\n[offset:100]\n[00:01]甲\n[00:03][Outro]\n[00:05]乙", true);
  assert.deepEqual(result, { metadata: ["[ti:测试]"], lines: [{ text: "甲", timeMs: 1100, endMs: 3100 }, { text: "乙", timeMs: 5100 }] });
});

test("source blank lines require no extra tap and do not create an instrumental cue", () => {
  const document = prepareRecordingLyrics("甲\n\n\n乙", true);
  document.lines = document.lines.map((line, index) => ({ ...line, timeMs: 1000 + index * 2000, endMs: 3000 + index * 2000 }));
  const saved = serializeLyrics(document);
  assert.equal(saved, "[00:01.000]甲\n[00:03.000]乙\n[00:05.000]");
  assert.deepEqual(parseLyrics(saved).lines, [{ text: "甲", timeMs: 1000 }, { text: "乙", timeMs: 3000, endMs: 5000 }]);
});

test("hiding silent cues keeps implicit lyric ends and gap durations without mutating the recorded draft", () => {
  const lines = [{ text: "甲", timeMs: 1000 }, { text: "", timeMs: 3000, endMs: 5000 }, { text: "乙", timeMs: 5000 }];
  const compact = compactRecordedLyrics(lines, 7000);
  assert.deepEqual(compact, [{ text: "甲", timeMs: 1000, endMs: 3000 }, { text: "乙", timeMs: 5000, endMs: 7000 }]);
  assert.equal(lines[0].endMs, undefined);
  assert.deepEqual(parseLyrics(serializeLyrics({ lines: compact, metadata: [] })).lines, compact);
});

test("shared preview straddles the cut equally from either neighbor; single previews stay on the chosen side", () => {
  const lines = parseLyrics("[00:01]甲\n[00:04]乙\n[00:08]丙").lines;
  for (const [index, edge] of [[0, "end"], [1, "start"]]) assert.deepEqual(lyricBoundaryPreview(lines, index, edge, false, 12000), { startMs: 3500, endMs: 4500 });
  assert.deepEqual(lyricBoundaryPreview(lines, 0, "end", true, 12000), { startMs: 3000, endMs: 4000 });
  assert.deepEqual(lyricBoundaryPreview(lines, 1, "start", true, 12000), { startMs: 4000, endMs: 5000 });
  assert.deepEqual(lines, parseLyrics("[00:01]甲\n[00:04]乙\n[00:08]丙").lines);
});

test("preview clamps to audio and short clips and rejects untimed/invalid ranges", () => {
  const lines = [{ text: "甲", timeMs: 100, endMs: 400 }];
  assert.deepEqual(lyricBoundaryPreview(lines, 0, "start", false, 1000), { startMs: 0, endMs: 600 });
  assert.deepEqual(lyricBoundaryPreview(lines, 0, "end", false, 500), { startMs: 0, endMs: 500 });
  for (const edge of ["start", "end"]) assert.deepEqual(lyricBoundaryPreview(lines, 0, edge, true, 1000), { startMs: 100, endMs: 400 });
  assert.equal(lyricBoundaryPreview(lines, 99, "start", true, 1000), null);
  assert.equal(lyricBoundaryPreview([{ text: "甲", timeMs: null }], 0, "start", false, 1000), null);
  assert.equal(lyricBoundaryPreview(lines, 0, "end", true, NaN), null);
});

test("the refinement checkpoint preserves all recorded data and limits undo to refinement edits", () => {
  const recorded = timingReducer(createTimingState([{ text: "甲", timeMs: null }]), { type: "ranges", lines: [{ text: "甲", timeMs: 1000, endMs: 2000 }], index: 0 });
  const baseline = timingReducer(recorded, { type: "checkpoint" });
  assert.deepEqual(baseline.lines, recorded.lines);
  assert.equal(timingReducer(baseline, { type: "undo" }), baseline);
  const fine = timingReducer(baseline, { type: "ranges", lines: [{ text: "甲", timeMs: 1100, endMs: 2100 }], index: 0 });
  assert.deepEqual(timingReducer(fine, { type: "undo" }).lines, baseline.lines);
});
