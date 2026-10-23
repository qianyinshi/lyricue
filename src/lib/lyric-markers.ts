export interface LyricMarker { id: number; timeMs: number }

// Allow for media-clock rounding when identifying a marker under the playhead.
const toleranceMs = 10;

export function addLyricMarker(markers: LyricMarker[], marker: LyricMarker, durationMs: number): LyricMarker[] {
  if (!Number.isFinite(marker.timeMs) || !Number.isFinite(durationMs) || durationMs <= 0) return markers;
  const timeMs = Math.max(0, Math.min(durationMs, Math.round(marker.timeMs)));
  if (markers.some((item) => Math.abs(item.timeMs - timeMs) <= toleranceMs)) return markers;
  return [...markers, { ...marker, timeMs }].sort((a, b) => a.timeMs - b.timeMs);
}

export function toggleLyricMarker(markers: LyricMarker[], marker: LyricMarker, durationMs: number): LyricMarker[] {
  const current = lyricMarkerNavigation(markers, marker.timeMs).current;
  return current ? markers.filter((item) => item.id !== current.id) : addLyricMarker(markers, marker, durationMs);
}

export function formatLyricMarkerTime(timeMs: number): string {
  const value = Math.max(0, Math.round(timeMs / 10));
  return `${String(Math.floor(value / 6000)).padStart(2, "0")}:${String(Math.floor(value / 100) % 60).padStart(2, "0")}.${String(value % 100).padStart(2, "0")}`;
}

export function lyricMarkerNavigation(markers: LyricMarker[], positionMs: number) {
  let previous: LyricMarker | undefined;
  for (const marker of markers) {
    if (marker.timeMs >= positionMs - toleranceMs) break;
    previous = marker;
  }
  return {
    current: markers.find((marker) => Math.abs(marker.timeMs - positionMs) <= toleranceMs),
    previous,
    next: markers.find((marker) => marker.timeMs > positionMs + toleranceMs),
  };
}
