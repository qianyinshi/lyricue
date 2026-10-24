import assert from 'node:assert/strict';
import test from 'node:test';
import { audioDuration, audioFingerprint, fetchAudioFile } from '../examples/standalone/audio-files.ts';

const media = { audioURL: 'https://example.invalid/demo.mp3', filename: 'demo.mp3', mimeType: 'audio/mpeg' };

test('fingerprints identify audio bytes independently of filename and honor cancellation', async () => {
 const signal = new AbortController().signal;
 const first = await audioFingerprint(new File(['audio'], 'a.mp3'), signal);
 assert.equal(first, await audioFingerprint(new File(['audio'], 'renamed.mp3'), signal));
 assert.notEqual(first, await audioFingerprint(new File(['new audio'], 'a.mp3'), signal));
 await assert.rejects(audioFingerprint(new File(['audio'], 'a.mp3'), AbortSignal.abort()), { name:'AbortError' });
});

class TestAudio extends EventTarget {
 duration = 1.23456; src = ''; loads = 0;
 removeAttribute(name) { if (name === 'src') this.src = ''; }
 load() { this.loads++; this.dispatchEvent(new Event('error')); }
}
function installAudio(t) {
 const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
 const audio = new TestAudio();
 Object.defineProperty(globalThis, 'document', { configurable:true, value:{createElement:()=>audio} });
 t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document; });
 return audio;
}
test('metadata reading settles once and releases the audio source before resolving', async t => {
 const audio = installAudio(t);
 const result = audioDuration('blob:fixture', new AbortController().signal);
 audio.dispatchEvent(new Event('loadedmetadata')); audio.dispatchEvent(new Event('loadedmetadata'));
 assert.equal(await result, 1235); assert.equal(audio.src, ''); assert.equal(audio.loads, 1);
});
test('cancelled metadata reading releases the source and ignores late metadata', async t => {
 const audio = installAudio(t), controller = new AbortController();
 const result = audioDuration('blob:fixture', controller.signal); controller.abort();
 await assert.rejects(result, {name:'AbortError'});
 audio.dispatchEvent(new Event('loadedmetadata')); assert.equal(audio.src, ''); assert.equal(audio.loads, 1);
 await assert.rejects(audioDuration('blob:unused', AbortSignal.abort()), {name:'AbortError'}); assert.equal(audio.src, '');
});
test('demo downloads preserve bytes and media type, report progress, and release the stream', async t => {
 const response = new Response(new Uint8Array([1,2,3,4]), {headers:{'content-length':'4'}});
 t.mock.method(globalThis, 'fetch', async () => response);
 const progress = [], file = await fetchAudioFile(media, new AbortController().signal, (...value) => progress.push(value));
 assert.equal(file.name, 'demo.mp3'); assert.equal(file.type, 'audio/mpeg');
 assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1,2,3,4]); assert.deepEqual(progress.at(-1), [4,4]);
 assert.equal(response.body.locked, false);
});
test('an aborted demo download cannot produce a replacement file', async t => {
 const controller = new AbortController();
 const response = new Response(new ReadableStream({start(stream){stream.enqueue(new Uint8Array([1]));stream.enqueue(new Uint8Array([2]));stream.close();}}));
 t.mock.method(globalThis, 'fetch', async () => response);
 await assert.rejects(fetchAudioFile(media, controller.signal, () => controller.abort()), {name:'AbortError'});
 assert.equal(response.body.locked, false);
});
