/** File handles are structured-cloned by IndexedDB. No File or audio bytes are stored. */
export interface AudioFileHandle {
  name: string;
  getFile(): Promise<File>;
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
}
export interface RememberedFile { handle: AudioFileHandle; fingerprint: string }
export type PickerWindow = Window & { showOpenFilePicker?: (options: { multiple: boolean; excludeAcceptAllOption: boolean; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<AudioFileHandle[]> };
export class FileHandleStore {
  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('lyricue-files', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('handles')) request.result.createObjectStore('handles'); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); }; request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('file_store_blocked'));
    });
  }
  async read(): Promise<RememberedFile | null> {
    let db: IDBDatabase | undefined;
    try {
      db = await this.open();
      return await new Promise((resolve, reject) => {
        const request = db!.transaction('handles', 'readonly').objectStore('handles').get('last');
        request.onsuccess = () => { const value = request.result as RememberedFile | undefined; resolve(value && typeof value.fingerprint === 'string' && typeof value.handle?.getFile === 'function' ? value : null); }; request.onerror = () => reject(request.error);
      });
    } catch { return null; } finally { db?.close(); }
  }
  async remember(value: RememberedFile | null): Promise<boolean> {
    let db: IDBDatabase | undefined;
    try {
      db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db!.transaction('handles', 'readwrite'); const store = transaction.objectStore('handles');
        if (value) store.put(value, 'last'); else store.delete('last');
        transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error);
      });
      return true;
    } catch { return false; } finally { db?.close(); }
  }
}
