/** Browser-only media preparation. No audio bytes or URLs are persisted. */
export async function audioFingerprint(file: File, signal: AbortSignal) {
  signal.throwIfAborted();
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  signal.throwIfAborted();
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function audioDuration(url: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const audio = document.createElement('audio');
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      const duration = audio.duration;
      clearTimeout(timeout);
      signal.removeEventListener('abort', aborted);
      audio.removeEventListener('loadedmetadata', loaded);
      audio.removeEventListener('error', failed);
      audio.removeAttribute('src'); audio.load();
      if (error) reject(error);
      else if (Number.isFinite(duration) && duration > 0) resolve(Math.round(duration * 1000));
      else reject(new Error('invalid_audio'));
    };
    const aborted = () => finish(signal.reason);
    const loaded = () => finish();
    const failed = () => finish(new Error('invalid_audio'));
    const timeout = setTimeout(failed, 15000);
    signal.addEventListener('abort', aborted, { once: true });
    audio.addEventListener('loadedmetadata', loaded);
    audio.addEventListener('error', failed);
    audio.preload = 'metadata'; audio.src = url;
  });
}

export async function fetchAudioFile(media: { audioURL: string; filename: string; mimeType: string }, signal: AbortSignal,
  onProgress: (received: number, total: number) => void): Promise<File> {
  const response = await fetch(media.audioURL, { signal });
  if (!response.ok) throw new Error('audio_fetch_failed');
  const total = Number(response.headers.get('content-length'));
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = response.body?.getReader();
  let received = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        chunks.push(value); received += value.byteLength; onProgress(received, total);
      }
    } finally { reader.releaseLock(); }
  } else chunks.push(new Uint8Array(await response.arrayBuffer()));
  signal.throwIfAborted();
  return new File(chunks, media.filename, { type: media.mimeType });
}
