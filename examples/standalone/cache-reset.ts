const owned = (name: string) => /^lyricue(?:[.:-]|$)/.test(name);
function clearStorage(storage: Storage) {
  for (const key of Object.keys(storage)) if (owned(key)) storage.removeItem(key);
}
function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    const timeout = setTimeout(() => reject(new Error(`Cannot clear ${name}. Close other Lyricue tabs and try again.`)), 5000);
    request.onsuccess = () => { clearTimeout(timeout); resolve(); };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
  });
}
async function clearAppCaches() {
  const tasks: Promise<unknown>[] = [];
  tasks.push(Promise.resolve().then(() => clearStorage(localStorage)));
  tasks.push(Promise.resolve().then(() => clearStorage(sessionStorage)));
  tasks.push((async () => {
    const names = new Set(['lyricue-files']);
    if (typeof indexedDB.databases === 'function') for (const database of await indexedDB.databases()) if (database.name && owned(database.name)) names.add(database.name);
    await Promise.all([...names].map(deleteDatabase));
  })());
  if ('caches' in window) tasks.push((async () => { const names = await caches.keys(); await Promise.all(names.filter(owned).map(name => caches.delete(name))); })());
  if ('serviceWorker' in navigator) tasks.push((async () => {
    const scope = new URL('./', location.href).href;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(registration => registration.scope.startsWith(scope)).map(registration => registration.unregister()));
  })());
  const results = await Promise.allSettled(tasks);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Lyricue cache reset could not finish.');
}
export function installCacheReset(stopSaving: () => void) {
  let pending: Promise<void> | null = null;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('lyricue-reset') : null;
  channel?.addEventListener('message', event => {
    if (event.data === 'start') stopSaving();
    if (event.data === 'done') location.reload();
  });
  window.lyricueUtils = Object.freeze({
    clearCacheAndReload() {
      if (pending) return pending;
      stopSaving(); channel?.postMessage('start');
      pending = clearAppCaches().then(() => { channel?.postMessage('done'); location.reload(); }).catch(error => { pending = null; throw error; });
      return pending;
    },
  });
}
declare global {
  interface Window { lyricueUtils: { clearCacheAndReload(): Promise<void> } }
}
