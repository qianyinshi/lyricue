import assert from "node:assert/strict";
import test from "node:test";
import {
  activeLyricIndex, createTimingState, formatLyricTime, parseLyrics, parseLyricTime,
  serializeLyrics, timingIssues, timingReducer,
  isSunoMarker, stripSunoMarkers,
} from "../src/lib/lyric-timing.ts";

test("plain lyrics keep repeated lines and ignore paragraph separators / BOM", () => {
  assert.deepEqual(parseLyrics("\uFEFF床前明月光\r\n\r\n疑是地上霜\r床前明月光").lines, [
    { text: "床前明月光", timeMs: null }, { text: "疑是地上霜", timeMs: null }, { text: "床前明月光", timeMs: null },
  ]);
});

test("Suno cleanup removes whole-line tags but preserves inline lyrics, metadata and timed gaps", () => {
  for (const tag of ["[Outro]", " [Verse 1] ", "[Chorus][Instrumental]", "[间奏]", "[Verse: soft piano]"]) assert.equal(isSunoMarker(tag), true);
  for (const lyric of ["唱着 [Outro]", "[ti:静夜思]", "[offset:-100]", "[00:01.500]", "普通歌词", "[]"]) assert.equal(isSunoMarker(lyric), false);
  const source = "[ti:静夜思]\r\n[offset:100]\r\n[Intro]\r\n[00:01]床前明月光\r\n[00:03][Outro]\r\n[00:05]疑是地上霜\r\n保留 [Chorus] 歌词\r\n[End]";
  const clean = stripSunoMarkers(source);
  assert.equal(clean, "[ti:静夜思]\n[offset:100]\n[00:01]床前明月光\n[00:03]\n[00:05]疑是地上霜\n保留 [Chorus] 歌词");
  assert.equal(parseLyrics(clean).lines[0].endMs, 3100);
  assert.equal(stripSunoMarkers(clean), clean);
});

test("removing Suno markers is atomic and undoable, retaining lyric timing, gaps and selection", () => {
  const initial = createTimingState(parseLyrics("[Intro]\n[00:01]甲\n[00:03][Outro]\n[00:05]乙\n[End]").lines);
  const selected = timingReducer(initial, { type: "select", index: 3 });
  const clean = timingReducer(selected, { type: "remove-markers" });
  assert.deepEqual(clean.lines, [{ text: "甲", timeMs: 1000, endMs: 3000 }, { text: "乙", timeMs: 5000 }]);
  assert.equal(clean.selected, 1);
  assert.equal(clean.past.length, 1);
  assert.deepEqual(timingReducer(clean, { type: "undo" }).lines, initial.lines);
  assert.deepEqual(timingReducer(timingReducer(clean, { type: "undo" }), { type: "redo" }).lines, clean.lines);
  assert.equal(timingReducer(clean, { type: "remove-markers" }), clean);
});

test("colon section instructions are removed with the same undo step, preserving LRC metadata", () => {
  const document = parseLyrics("[ti:静夜思]\n[Verse: soft piano]\n[00:01]甲\n[00:02][Outro]");
  const initial = createTimingState(document.lines, document.metadata);
  const clean = timingReducer(initial, { type: "remove-markers" });
  assert.deepEqual(clean.metadata, ["[ti:静夜思]"]);
  assert.equal(serializeLyrics(clean), "[ti:静夜思]\n[00:01.000]甲\n[00:02.000]");
  const undo = timingReducer(clean, { type: "undo" });
  assert.deepEqual(undo.metadata, initial.metadata);
  assert.deepEqual(undo.lines, initial.lines);
});

test("LRC expands repeated timestamps in playback order and preserves metadata", () => {
  const result = parseLyrics("[ti:静夜思]\n[ar:测试音乐人]\n[00:10.1][01:10.123]床前明月光\n[00:20:45]疑是地上霜\n[00:30.00]");
  assert.deepEqual(result.metadata, ["[ti:静夜思]", "[ar:测试音乐人]"]);
  assert.deepEqual(result.lines.map((line) => line.timeMs), [10100, 20450, 70123]);
  assert.equal(result.lines[1].endMs, 30000);
  assert.equal(result.lines[2].text, "床前明月光");
});

test("mixed LRC and plain lines keep source order for completing a partial draft", () => {
  assert.deepEqual(parseLyrics("[00:20]甲\n乙\n[00:10]丙").lines.map((line) => line.timeMs), [20000, null, 10000]);
});

test("positive and negative LRC offsets are baked in once without double application", () => {
  for (const offset of [500, -500]) {
    const result = parseLyrics(`[00:01.250]甲\n[offset:${offset}]`);
    assert.equal(result.lines[0].timeMs, 1250 + offset);
    const serialized = serializeLyrics(result);
    assert.doesNotMatch(serialized, /offset/);
    assert.deepEqual(parseLyrics(serialized), result);
  }
  assert.equal(parseLyrics("[offset:-2000]\n[00:01]甲").lines[0].timeMs, 0);
});

test("millisecond LRC round trips without truncation including long tracks", () => {
  for (const time of [0, 1, 9, 999, 59999, 60000, 123456, 3_600_001]) {
    assert.equal(parseLyricTime(formatLyricTime(time)), time);
  }
  assert.equal(formatLyricTime(59_999.8), "01:00.000");
  assert.equal(parseLyricTime("01:23.4"), 83400);
  for (const invalid of ["", "1", "00:60.000", "-01:23", "00:01.1234", "NaN", "00:01x"]) assert.equal(parseLyricTime(invalid), null);
});

test("missing, negative, nonfinite, out of duration and reversed times block output", () => {
  const lines = [0, null, -1, NaN, 30000, 10000].map((timeMs) => ({ text: "甲", timeMs }));
  const issues = timingIssues(lines, 20000);
  assert.equal(issues.get(1), "尚未打轴");
  assert.equal(issues.get(2), "时间无效");
  assert.equal(issues.get(3), "时间无效");
  assert.equal(issues.get(4), "超过音频时长");
  assert.equal(issues.get(5), "早于上一行，请校准时间");
  assert.throws(() => serializeLyrics({ lines, metadata: [] }));
  assert.equal(timingIssues([{ text: "甲", timeMs: 0 }, { text: "乙", timeMs: 0 }], 1000).size, 0);
});

test("stamping starts at first untimed line, advances, and never overwrites last line accidentally", () => {
  let state = createTimingState([{ text: "甲", timeMs: 0 }, { text: "乙", timeMs: null }]);
  assert.equal(state.selected, 1);
  state = timingReducer(state, { type: "time", index: state.selected, timeMs: 1234.6, advance: true });
  assert.equal(state.lines[1].timeMs, 1235);
  assert.equal(state.selected, 2);
  const finished = timingReducer(state, { type: "time", index: 2, timeMs: 3000, advance: true });
  assert.equal(finished, state);
});

test("undo restores both timing and selection, redo restores result, new edit branches history", () => {
  const initial = createTimingState(parseLyrics("甲\n乙").lines);
  const stamped = timingReducer(initial, { type: "time", index: 0, timeMs: 1000, advance: true });
  const undone = timingReducer(stamped, { type: "undo" });
  assert.deepEqual(undone.lines, initial.lines);
  assert.equal(undone.selected, 0);
  const redone = timingReducer(undone, { type: "redo" });
  assert.deepEqual(redone.lines, stamped.lines);
  assert.equal(redone.selected, 1);
  const branched = timingReducer(undone, { type: "time", index: 0, timeMs: 2000 });
  assert.equal(branched.future.length, 0);
});

test("bulk offset is one undoable edit, preserves untimed lines and relative timing", () => {
  const initial = createTimingState(parseLyrics("[00:01.123]甲\n乙\n[00:02.456]丙").lines);
  const shifted = timingReducer(initial, { type: "shift", deltaMs: 100 });
  assert.deepEqual(shifted.lines.map((line) => line.timeMs), [1223, null, 2556]);
  assert.deepEqual(timingReducer(shifted, { type: "undo" }).lines, initial.lines);
  const nudged = timingReducer(initial, { type: "shift", deltaMs: -100, index: 2 });
  assert.deepEqual(nudged.lines.map((line) => line.timeMs), [1123, null, 2356]);
});

test("reset preserves text, clears timestamps, selects first line and can be undone", () => {
  const initial = createTimingState(parseLyrics("[00:01]甲\n[00:02]乙").lines);
  const reset = timingReducer(initial, { type: "reset" });
  assert.deepEqual(reset.lines, [{ text: "甲", timeMs: null }, { text: "乙", timeMs: null }]);
  assert.equal(reset.selected, 0);
  assert.deepEqual(timingReducer(reset, { type: "undo" }).lines, initial.lines);
});

test("history is bounded and selection does not create editing history", () => {
  let state = createTimingState(parseLyrics("甲").lines);
  state = timingReducer(state, { type: "select", index: 100 });
  assert.equal(state.selected, 1);
  assert.equal(state.past.length, 0);
  for (let timeMs = 0; timeMs < 150; timeMs++) state = timingReducer(state, { type: "time", index: 0, timeMs });
  assert.equal(state.past.length, 100);
});

test("preview chooses latest audible line without relying on selected row or sorted drafts", () => {
  const lines = [{ text: "甲", timeMs: 2000 }, { text: "乙", timeMs: null }, { text: "丙", timeMs: 1000 }];
  assert.equal(activeLyricIndex(lines, 500), -1);
  assert.equal(activeLyricIndex(lines, 1000), 2);
  assert.equal(activeLyricIndex(lines, 2500), 0);
});
