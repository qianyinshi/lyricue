/** An original synthesized loop. No recordings, external requests, or copyrighted samples. */
export function createDemoAudio(): Blob {
  const rate = 22050, duration = 20, count = rate * duration;
  const samples = new Float32Array(count);
  const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  const pluck = (midi: number, start: number, length: number, gain: number) => {
    const from = Math.floor(start * rate), size = Math.min(Math.floor(length * rate), count - from), hz = frequency(midi);
    for (let i = 0; i < size; i++) {
      const time = i / rate, attack = Math.min(1, time / .008), release = Math.min(1, (size - i) / (rate * .06));
      const phase = time * hz * 2 * Math.PI;
      samples[from + i] += gain * attack * release * Math.exp(-time * 2.4) * (Math.sin(phase) + .22 * Math.sin(phase * 2) + .08 * Math.sin(phase * 3));
    }
  };
  const chords = [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 57, 60], [43, 50, 55, 62]];
  for (let bar = 0; bar < 8; bar++) {
    const chord = chords[bar % chords.length], start = bar * 2.5;
    pluck(chord[0] - 12, start, 2.3, .2);
    for (let beat = 0; beat < 8; beat++) pluck(chord[[1, 2, 3, 2, 1, 3, 2, 3][beat]], start + beat * .3125, 1.15, beat % 2 ? .075 : .1);
    if (bar % 2) pluck(chord[3] + 12, start + 1.25, 1.1, .07);
  }
  const bytes = new ArrayBuffer(44 + count * 2), view = new DataView(bytes);
  const write = (offset: number, value: string) => [...value].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); write(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const fade = Math.min(1, i / (rate * .04), (count - i) / (rate * .35));
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i] * fade)) * 32767), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
