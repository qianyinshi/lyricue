import type { LyricsEditorSession } from 'lyricue';
export interface Project {
  version: 1; fingerprint: string; filename: string; size: number; durationMs: number;
  sourceLyrics: string; removeSuno: boolean; session: LyricsEditorSession; updatedAt: number;
}
export const projectKey = (fingerprint: string) => 'lyricue.project.' + fingerprint;
/** Storage is deliberately injected so unavailable storage never blocks the editor. */
export class ProjectStore {
  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) { this.storage = storage; }
  read(fingerprint: string): Project | null {
    try {
      const raw: unknown = JSON.parse(this.storage.getItem(projectKey(fingerprint)) ?? 'null');
      if (!raw || typeof raw !== 'object') return null;
      const project = raw as Project;
      if (project.version !== 1 || project.fingerprint !== fingerprint || typeof project.filename !== 'string' || typeof project.sourceLyrics !== 'string' || typeof project.removeSuno !== 'boolean' || !Number.isFinite(project.durationMs) || project.durationMs <= 0 || !Number.isFinite(project.size) || project.size < 0 || !Number.isFinite(project.updatedAt) || !project.session) return null;
      return project;
    } catch { return null; }
  }
  write(project: Project) {
    this.storage.setItem(projectKey(project.fingerprint), JSON.stringify(project));
  }
  preference(key: string) { try { return this.storage.getItem('lyricue.' + key); } catch { return null; } }
  setPreference(key: string, value: string) { this.storage.setItem('lyricue.' + key, value); }
  draft(fingerprint: string) { return this.preference('lyrics-draft.' + fingerprint); }
  saveDraft(fingerprint: string, text: string) { this.setPreference('lyrics-draft.' + fingerprint, text); }
  clearDraft(fingerprint: string) { try { this.storage.removeItem('lyricue.lyrics-draft.' + fingerprint); } catch { /* Main project remains intact. */ } }
}
