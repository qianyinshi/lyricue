import assert from "node:assert/strict";
import test from "node:test";
import { beginLyricTake, previewLyricTake, rewindLyricRecording } from "../src/lib/lyric-recording.ts";
import { createTimingState, parseLyrics, serializeLyrics, timingIssues, timingReducer } from "../src/lib/lyric-timing.ts";

const plain = () => parseLyrics("床前明月光\n疑是地上霜\n举头望明月").lines;
const duration = 12000;

test("backspace removes the previous completed phrase and resumes at the earlier cut", () => {
  const lines = [{ text: "甲", timeMs: 1000, endMs: 3000 }, { text: "乙", timeMs: 3000, endMs: 5000 }, { text: "丙", timeMs: null }];
  const result = rewindLyricRecording(lines, 2, duration);
  assert.equal(result.index, 1);
  assert.equal(result.positionMs, 3000);
  assert.deepEqual(result.lines, [lines[0], { text: "乙", timeMs: null }, lines[2]]);
  const next = beginLyricTake(result.lines, result.index, result.positionMs, duration, "tap", "keyboard");
  assert.equal(next.startMs, lines[0].endMs);
  assert.equal(previewLyricTake(next, 4500)[1].endMs, 4500);
  assert.equal(lines[1].timeMs, 3000, "rewinding must not mutate the saved snapshot");
});

test("backspace skips invisible instrumental cues to re-record the previous real lyric", () => {
  const lines = [{ text: "甲", timeMs: 1000, endMs: 2000 }, { text: "", timeMs: 2000, endMs: 4000 }, { text: "乙", timeMs: null }];
  const result = rewindLyricRecording(lines, 2, duration);
  assert.equal(result.index, 0);
  assert.equal(result.positionMs, 0);
  assert.deepEqual(result.lines, [{ text: "甲", timeMs: null }, lines[1], lines[2]]);
});

test("hold rewind preserves the earlier phrase end and allows a new gap", () => {
  const lines = [{ text: "甲", timeMs: 1000, endMs: 2000 }, { text: "乙", timeMs: 4000, endMs: 5000 }, { text: "丙", timeMs: null }];
  const result = rewindLyricRecording(lines, 2, duration);
  assert.equal(result.positionMs, 2000);
  const next = beginLyricTake(result.lines, result.index, 3500, duration, "hold", "keyboard");
  const completed = previewLyricTake(next, 4800, true);
  assert.deepEqual(completed.slice(0, 2), [lines[0], { text: "乙", timeMs: 3500, endMs: 4800 }]);
});

test("rewind freezes an implicit earlier end and preserves later imported clips", () => {
  const lines = parseLyrics("[00:01]甲\n[00:03]乙\n[00:05]丙").lines;
  const result = rewindLyricRecording(lines, 2, duration);
  assert.deepEqual(result.lines, [{ text: "甲", timeMs: 1000, endMs: 3000 }, { text: "乙", timeMs: null }, lines[2]]);
  assert.equal(result.positionMs, 3000);
  assert.equal(beginLyricTake(result.lines, result.index, 3000, duration, "tap", "keyboard").base[2].timeMs, 5000);
});

test("repeated rewind reaches the audio beginning when it returns to the first phrase", () => {
  const lines = [{ text: "甲", timeMs: 1500, endMs: 3000 }, { text: "乙", timeMs: 3000, endMs: 5000 }, { text: "丙", timeMs: 5000, endMs: 8000 }];
  let result = rewindLyricRecording(lines, lines.length, duration);
  assert.equal(result.index, 2);
  result = rewindLyricRecording(result.lines, result.index, duration);
  assert.equal(result.index, 1);
  result = rewindLyricRecording(result.lines, result.index, duration);
  assert.equal(result.index, 0);
  assert.equal(result.positionMs, 0);
  assert.deepEqual(result.lines, lines.map((line) => ({ text: line.text, timeMs: null })));
  assert.equal(rewindLyricRecording(result.lines, 0, duration).positionMs, 0);
});

test("rewinding an in-progress first phrase clears it and returns to zero while retaining later material", () => {
  for (const first of [{ text: "甲", timeMs: null }, { text: "甲", timeMs: 1500, endMs: 3000 }]) {
    const lines = [first, { text: "乙", timeMs: 5000, endMs: 7000 }];
    const result = rewindLyricRecording(lines, 0, duration);
    assert.equal(result.positionMs, 0);
    assert.equal(result.index, 0);
    assert.deepEqual(result.lines, [{ text: "甲", timeMs: null }, lines[1]]);
    assert.deepEqual(lines[0], first);
  }
  assert.equal(rewindLyricRecording([], 0, duration), null);
  assert.equal(rewindLyricRecording(plain(), -1, duration), null);
});

test("rewind is one undoable edit and ignores absent or invalid completed phrases", () => {
  const state = createTimingState([{ text: "甲", timeMs: 1000, endMs: 3000 }, { text: "乙", timeMs: null }], ["[ti:测试]"]);
  const result = rewindLyricRecording(state.lines, 1, duration);
  const edited = timingReducer(state, { type: "ranges", lines: result.lines, index: result.index });
  assert.equal(edited.past.length, 1);
  assert.deepEqual(timingReducer(edited, { type: "undo" }).lines, state.lines);
  assert.deepEqual(edited.metadata, state.metadata);
  assert.equal(rewindLyricRecording(plain(), 3, duration), null);
  assert.equal(rewindLyricRecording(state.lines, NaN, duration), null);
  assert.equal(rewindLyricRecording(state.lines, 1, 0), null);
});

test("first tap creates the first clip immediately and its end grows with the media clock", () => {
  const lines = plain();
  const take = beginLyricTake(lines, 0, 1000, duration, "tap", "keyboard");
  assert.ok(take);
  assert.deepEqual(previewLyricTake(take, 1000)[0], { text: "床前明月光", timeMs: 1000, endMs: 1000 });
  assert.equal(previewLyricTake(take, 2345)[0].endMs, 2345);
  assert.deepEqual(lines, plain(), "animation frames must not mutate saved lines");
  assert.equal(previewLyricTake(take, 3000)[1].timeMs, null);
});

test("tap cuts end the current phrase and start the next at exactly the same timestamp", () => {
  let lines = plain();
  for (let index = 0; index < 3; index++) {
    const take = beginLyricTake(lines, index, index * 2000 + 1000, duration, "tap", "keyboard");
    lines = previewLyricTake(take, index * 2000 + 3000, true);
    if (index < 2) {
      const next = beginLyricTake(lines, index + 1, lines[index].endMs, duration, "tap", "keyboard");
      assert.equal(next.startMs, lines[index].endMs);
    }
  }
  assert.deepEqual(lines.map((line) => [line.timeMs, line.endMs]), [[1000, 3000], [3000, 5000], [5000, 7000]]);
  assert.equal(timingIssues(lines, duration).size, 0);
  assert.equal(serializeLyrics({ lines, metadata: [] }), "[00:01.000]床前明月光\n[00:03.000]疑是地上霜\n[00:05.000]举头望明月\n[00:07.000]");
});

test("hold release ends one phrase, leaving a gap before the next keydown", () => {
  const first = beginLyricTake(plain(), 0, 1000, duration, "hold", "keyboard");
  let lines = previewLyricTake(first, 2500, true);
  assert.equal(lines[1].timeMs, null);
  const second = beginLyricTake(lines, 1, 4000, duration, "hold", "keyboard");
  lines = previewLyricTake(second, 5000, true);
  assert.equal(lines[0].endMs, 2500);
  assert.equal(lines[1].timeMs, 4000);
  lines = previewLyricTake(beginLyricTake(lines, 2, 6000, duration, "hold", "keyboard"), 8000, true);
  const saved = serializeLyrics({ lines, metadata: [] });
  assert.match(saved, /\[00:02.500\]\n\[00:04.000\]疑是地上霜/);
  assert.deepEqual(parseLyrics(saved).lines, lines);
});

test("one completed phrase is one undo step, regardless of live preview frames", () => {
  const initial = createTimingState(plain());
  const take = beginLyricTake(initial.lines, 0, 1000, duration, "hold", "pointer");
  for (let clock = 1000; clock < 3000; clock += 16) previewLyricTake(take, clock);
  assert.equal(initial.past.length, 0);
  const result = timingReducer(initial, { type: "ranges", lines: previewLyricTake(take, 3000, true), index: 1 });
  assert.equal(result.past.length, 1);
  const undo = timingReducer(result, { type: "undo" });
  assert.deepEqual(undo.lines, initial.lines);
  assert.deepEqual(timingReducer(undo, { type: "redo" }).lines, result.lines);
});

test("last tap/keyup ends the last lyric without creating a phantom next lyric", () => {
  const lines = [{ text: "低头思故乡", timeMs: null }];
  const take = beginLyricTake(lines, 0, 9000, duration, "tap", "pointer");
  const result = previewLyricTake(take, 10500, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].endMs, 10500);
  assert.equal(beginLyricTake(result, 1, 10500, duration, "tap", "pointer"), null);
});

test("hold release at audio end is bounded and preserves the final tail", () => {
  const take = beginLyricTake(plain(), 0, 10000, duration, "hold", "keyboard");
  assert.equal(previewLyricTake(take, 13000, true)[0].endMs, duration);
});

test("rapid release and backwards seek never produce a negative duration", () => {
  const take = beginLyricTake(plain(), 0, 2000, duration, "hold", "keyboard");
  assert.equal(previewLyricTake(take, 2000, true)[0].endMs, 2001);
  assert.equal(previewLyricTake(take, 1000, true)[0].endMs, 2001);
  assert.equal(previewLyricTake(take, NaN, true)[0].endMs, 2001);
});

test("re-recording keeps existing neighboring clips and gaps within their bounds", () => {
  const lines = parseLyrics("[00:01.000]甲\n[00:02.000]\n[00:04.000]乙\n[00:06.000]丙").lines;
  const take = beginLyricTake(lines, 1, 1000, duration, "hold", "keyboard");
  assert.equal(take.startMs, 2000);
  const result = previewLyricTake(take, 9000, true);
  assert.equal(result[0].endMs, 2000);
  assert.equal(result[1].endMs, 6000);
  assert.equal(result[2].timeMs, 6000);
  assert.equal(timingIssues(result, duration).size, 0);
});

test("hold re-recording preserves an implicit previous end rather than extending it", () => {
  const lines = parseLyrics("[00:01.000]甲\n[00:04.000]乙\n[00:08.000]丙").lines;
  const take = beginLyricTake(lines, 1, 5000, duration, "hold", "keyboard");
  const result = previewLyricTake(take, 6000, true);
  assert.equal(result[0].endMs, 4000);
  assert.equal(result[1].timeMs, 5000);
});

test("recording refuses invalid targets, missing audio or starts at/after the end", () => {
  for (const clock of [NaN, Infinity, duration, duration + 1]) assert.equal(beginLyricTake(plain(), 0, clock, duration, "tap", "keyboard"), null);
  assert.equal(beginLyricTake(plain(), 9, 1000, duration, "tap", "keyboard"), null);
  assert.equal(beginLyricTake(plain(), 0, 0, 0, "hold", "pointer"), null);
});
