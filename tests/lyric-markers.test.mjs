import assert from "node:assert/strict";
import test from "node:test";
import { addLyricMarker, formatLyricMarkerTime, lyricMarkerNavigation, toggleLyricMarker } from "../src/lib/lyric-markers.ts";

test("markers retain their identities after rewinding and are navigated in time order", () => {
  const first = addLyricMarker([], { id: 1, timeMs: 5000 }, 12000);
  const markers = addLyricMarker(first, { id: 2, timeMs: 2000 }, 12000);
  assert.deepEqual(first, [{ id: 1, timeMs: 5000 }]);
  assert.deepEqual(markers.map((marker) => marker.id), [2, 1]);
  assert.equal(lyricMarkerNavigation(markers, 0).next.id, 2);
  assert.equal(lyricMarkerNavigation(markers, 3000).previous.id, 2);
  assert.equal(lyricMarkerNavigation(markers, 3000).next.id, 1);
  assert.equal(lyricMarkerNavigation(markers, 12000).previous.id, 1);
});

test("navigation skips the current marker despite media clock rounding, without wrapping", () => {
  const markers = [{ id: 1, timeMs: 0 }, { id: 2, timeMs: 2000 }, { id: 3, timeMs: 12000 }];
  assert.deepEqual(lyricMarkerNavigation(markers, 2000.4), { previous: markers[0], current: markers[1], next: markers[2] });
  assert.equal(lyricMarkerNavigation(markers, 0).previous, undefined);
  assert.equal(lyricMarkerNavigation(markers, 12000).next, undefined);
  assert.deepEqual(lyricMarkerNavigation([], 0), { previous: undefined, current: undefined, next: undefined });
});

test("adding markers clamps to audio, rounds milliseconds and avoids duplicate locations", () => {
  const zero = addLyricMarker([], { id: 1, timeMs: -10 }, 12000);
  assert.equal(zero[0].timeMs, 0);
  assert.equal(addLyricMarker(zero, { id: 2, timeMs: 0.3 }, 12000), zero);
  assert.equal(addLyricMarker([], { id: 3, timeMs: 600.6 }, 12000)[0].timeMs, 601);
  assert.equal(addLyricMarker([], { id: 4, timeMs: 15000 }, 12000)[0].timeMs, 12000);
  for (const duration of [0, NaN, Infinity]) assert.equal(addLyricMarker(zero, { id: 5, timeMs: 1000 }, duration), zero);
  assert.equal(addLyricMarker(zero, { id: 5, timeMs: NaN }, 12000), zero);
});

test("refinement toggles only the marker at the playhead and retains other positions", () => {
  const markers = [{ id: 1, timeMs: 1000 }, { id: 2, timeMs: 4000 }];
  const removed = toggleLyricMarker(markers, { id: 3, timeMs: 1000.4 }, 12000);
  assert.deepEqual(removed, [markers[1]]);
  assert.equal(markers.length, 2);
  const added = toggleLyricMarker(removed, { id: 3, timeMs: 2000 }, 12000);
  assert.deepEqual(added, [{ id: 3, timeMs: 2000 }, markers[1]]);
  assert.deepEqual(toggleLyricMarker(added, { id: 4, timeMs: 2000 }, 12000), removed);
});

test("marker labels display time to ten milliseconds, including second and minute rollover", () => {
  assert.equal(formatLyricMarkerTime(0), "00:00.00");
  assert.equal(formatLyricMarkerTime(12344), "00:12.34");
  assert.equal(formatLyricMarkerTime(12346), "00:12.35");
  assert.equal(formatLyricMarkerTime(59999), "01:00.00");
  assert.equal(formatLyricMarkerTime(6000010), "100:00.01");
});
