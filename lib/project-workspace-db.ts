import type { AudioEventWeights } from "@/lib/audio-event-weight";

export type PersistedWorkspaceAudio = {
  id: string;
  blob: Blob;
  fileName: string;
  fileType: string;
  lastModified: number;
  originalName: string;
  name: string;
  key: string;
  size: number;
  format: string;
  codec: string | null;
  codecLongName: string | null;
  bitRate: number | null;
  sampleRate: number | null;
  channels: number | null;
  duration: number | null;
  analysisStatus: "analyzing" | "ready" | "error";
  conversionStatus: "idle" | "queued" | "converting" | "converted" | "skipped" | "error";
};

export type PersistedProjectWorkspace = {
  projectId: string;
  schemaVersion: 1;
  updatedAt: number;
  activeStep: number;
  eventEditorMode: "novice" | "basic" | "advanced";
  audioFiles: PersistedWorkspaceAudio[];
  customEventSuffixes: Record<string, string>;
  customEventNames?: string[];
  audioEventBindings: Record<string, string[]>;
  audioEventWeights?: AudioEventWeights;
  audioSubtitles?: Record<string, string>;
};

export type PersistedProjectVersionMetadata = {
  name: string;
  key: string;
  description: string;
  platform: "java" | "bedrock";
  javaPackFormat: string;
  gameVersion?: string;
  iconDataUrl: string | null;
  version: string;
  releaseChannel: "stable" | "beta" | "preview";
};

export type PersistedProjectVersion = {
  snapshotId: string;
  projectId: string;
  versionTag: string;
  createdAt: number;
  project: PersistedProjectVersionMetadata;
  workspace: PersistedProjectWorkspace;
};

export type ProjectStorageUsage = {
  projectId: string;
  currentBytes: number;
  historyBytes: number;
  historyCount: number;
  totalBytes: number;
};

const DATABASE_NAME = "mcsd-project-workspaces";
const DATABASE_VERSION = 2;
const WORKSPACE_STORE = "workspaces";
const VERSION_HISTORY_STORE = "version-history";
const VERSION_HISTORY_PROJECT_INDEX = "projectId";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WORKSPACE_STORE)) {
        database.createObjectStore(WORKSPACE_STORE, { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains(VERSION_HISTORY_STORE)) {
        const historyStore = database.createObjectStore(VERSION_HISTORY_STORE, {
          keyPath: "snapshotId",
        });
        historyStore.createIndex(VERSION_HISTORY_PROJECT_INDEX, "projectId", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked"));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

export async function loadProjectWorkspace(projectId: string) {
  const database = await openDatabase();
  return new Promise<PersistedProjectWorkspace | null>((resolve, reject) => {
    const transaction = database.transaction(WORKSPACE_STORE, "readonly");
    const request = transaction.objectStore(WORKSPACE_STORE).get(projectId);
    request.onsuccess = () => resolve((request.result as PersistedProjectWorkspace | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Unable to load project workspace"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Workspace read was aborted"));
  });
}

export async function saveProjectWorkspace(workspace: PersistedProjectWorkspace) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
    transaction.objectStore(WORKSPACE_STORE).put(workspace);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save project workspace"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Workspace save was aborted"));
  });
}

export async function deleteProjectWorkspace(projectId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [WORKSPACE_STORE, VERSION_HISTORY_STORE],
      "readwrite",
    );
    transaction.objectStore(WORKSPACE_STORE).delete(projectId);
    const historyIndex = transaction
      .objectStore(VERSION_HISTORY_STORE)
      .index(VERSION_HISTORY_PROJECT_INDEX);
    const historyCursor = historyIndex.openKeyCursor(IDBKeyRange.only(projectId));
    historyCursor.onsuccess = () => {
      const cursor = historyCursor.result;
      if (!cursor) return;
      transaction.objectStore(VERSION_HISTORY_STORE).delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete project workspace"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Workspace deletion was aborted"));
  });
}

export async function saveProjectVersionSnapshot(snapshot: PersistedProjectVersion) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_HISTORY_STORE, "readwrite");
    transaction.objectStore(VERSION_HISTORY_STORE).put(snapshot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save version history"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Version history save was aborted"));
  });
}

export async function listProjectVersionSnapshots(projectId?: string) {
  const database = await openDatabase();
  return new Promise<PersistedProjectVersion[]>((resolve, reject) => {
    const transaction = database.transaction(VERSION_HISTORY_STORE, "readonly");
    const store = transaction.objectStore(VERSION_HISTORY_STORE);
    const request = projectId
      ? store.index(VERSION_HISTORY_PROJECT_INDEX).getAll(projectId)
      : store.getAll();
    request.onsuccess = () => {
      const snapshots = request.result as PersistedProjectVersion[];
      resolve(snapshots.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to load version history"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Version history read was aborted"));
  });
}

export async function deleteProjectVersionSnapshots(projectId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_HISTORY_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_HISTORY_STORE);
    const request = store.index(VERSION_HISTORY_PROJECT_INDEX).openKeyCursor(IDBKeyRange.only(projectId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear version history"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Version history cleanup was aborted"));
  });
}

export async function deleteProjectVersionSnapshot(snapshotId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_HISTORY_STORE, "readwrite");
    transaction.objectStore(VERSION_HISTORY_STORE).delete(snapshotId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete version history"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Version history deletion was aborted"));
  });
}

function estimateWorkspaceBytes(workspace: PersistedProjectWorkspace) {
  const audioBytes = workspace.audioFiles.reduce((total, audio) => total + audio.blob.size, 0);
  const metadataBytes = new Blob([JSON.stringify(workspace)]).size;
  return audioBytes + metadataBytes;
}

function estimateVersionBytes(snapshot: PersistedProjectVersion) {
  return estimateWorkspaceBytes(snapshot.workspace) + new Blob([JSON.stringify(snapshot.project)]).size;
}

export async function getProjectStorageUsage() {
  const database = await openDatabase();
  return new Promise<ProjectStorageUsage[]>((resolve, reject) => {
    const transaction = database.transaction(
      [WORKSPACE_STORE, VERSION_HISTORY_STORE],
      "readonly",
    );
    const workspaceRequest = transaction.objectStore(WORKSPACE_STORE).getAll();
    const historyRequest = transaction.objectStore(VERSION_HISTORY_STORE).getAll();

    transaction.oncomplete = () => {
      const usage = new Map<string, ProjectStorageUsage>();
      for (const workspace of workspaceRequest.result as PersistedProjectWorkspace[]) {
        const currentBytes = estimateWorkspaceBytes(workspace);
        usage.set(workspace.projectId, {
          projectId: workspace.projectId,
          currentBytes,
          historyBytes: 0,
          historyCount: 0,
          totalBytes: currentBytes,
        });
      }
      for (const snapshot of historyRequest.result as PersistedProjectVersion[]) {
        const entry = usage.get(snapshot.projectId) ?? {
          projectId: snapshot.projectId,
          currentBytes: 0,
          historyBytes: 0,
          historyCount: 0,
          totalBytes: 0,
        };
        const snapshotBytes = estimateVersionBytes(snapshot);
        entry.historyBytes += snapshotBytes;
        entry.historyCount += 1;
        entry.totalBytes += snapshotBytes;
        usage.set(snapshot.projectId, entry);
      }
      resolve([...usage.values()].sort((a, b) => b.totalBytes - a.totalBytes));
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to inspect project storage"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Storage inspection was aborted"));
  });
}
