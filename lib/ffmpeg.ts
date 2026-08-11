export type FFmpegStatus = "idle" | "loading" | "success" | "error";
export type FFmpegLoadPhase =
  | "idle"
  | "downloading-core"
  | "downloading-wasm"
  | "initializing"
  | "switching-source"
  | "processing"
  | "ready"
  | "error";

export interface FFmpegSnapshot {
  status: FFmpegStatus;
  phase: FFmpegLoadPhase;
  progress: number;
  loaded: boolean;
  source: string | null;
  attempt: number;
  totalSources: number;
  error: string | null;
}

export interface AudioProbeResult {
  codec: string;
  codecLongName: string;
  bitRate: number | null;
  sampleRate: number | null;
  channels: number | null;
  duration: number | null;
}

export const FFMPEG_CORE_CACHE_NAME = "mcsd_ffmpeg_core_cache_v2";
export const FFMPEG_PREFERRED_CDN_KEY = "mcsd_ffmpeg_preferred_cdn_v1";
export const FFMPEG_PREFERRED_CDN_LOCK_KEY = "mcsd_ffmpeg_preferred_cdn_lock_v1";
export const FFMPEG_VERSION = "0.12.15";
export const FFMPEG_CORE_VERSION = "0.12.10";
export const MINECRAFT_AUDIO_SAMPLE_RATE = 44100;
export const MINECRAFT_AUDIO_CHANNELS = 2;
export const FFMPEG_CDN_BASES = [
  "https://unpkg.zhimg.com/@ffmpeg/core@0.12.10/dist/umd",
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
  "https://gcore.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
  "https://fastly.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
  "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd",
  "https://unpkg.zhihu.com/@ffmpeg/core@0.12.10/dist/umd",
  "https://cdn.osyb.cn/npm/@ffmpeg/core@0.12.10/dist/umd",
] as const;

export type FFmpegCdnBase = (typeof FFMPEG_CDN_BASES)[number];

const DEFAULT_CDN: FFmpegCdnBase = FFMPEG_CDN_BASES[1];
const SERVER_SNAPSHOT: FFmpegSnapshot = {
  status: "idle",
  phase: "idle",
  progress: 0,
  loaded: false,
  source: DEFAULT_CDN,
  attempt: 0,
  totalSources: FFMPEG_CDN_BASES.length,
  error: null,
};

export class FFmpegService {
  private static instance: FFmpegService;
  private ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg | null = null;
  private fetchFile: ((file: File | Blob) => Promise<Uint8Array>) | null = null;
  private loaded = false;
  private loadTask: Promise<void> | null = null;
  private preferredCdnOverride: FFmpegCdnBase | null = null;
  private snapshot: FFmpegSnapshot = { ...SERVER_SNAPSHOT };
  private listeners = new Set<() => void>();
  private statusListeners = new Set<(status: FFmpegStatus) => void>();
  private progressListeners = new Set<(progress: number) => void>();
  private operationQueue: Promise<void> = Promise.resolve();
  private operationId = 0;

  private constructor() {
    void 0;
  }

  public static getInstance(): FFmpegService {
    if (!this.instance) this.instance = new FFmpegService();
    return this.instance;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getSnapshot = (): FFmpegSnapshot => this.snapshot;

  public getServerSnapshot = (): FFmpegSnapshot => SERVER_SNAPSHOT;

  private updateSnapshot(patch: Partial<FFmpegSnapshot>): void {
    const previous = this.snapshot;
    this.snapshot = { ...previous, ...patch };

    if (patch.status && patch.status !== previous.status) {
      for (const listener of this.statusListeners) listener(patch.status);
    }
    if (typeof patch.progress === "number" && patch.progress !== previous.progress) {
      for (const listener of this.progressListeners) listener(patch.progress);
    }
    for (const listener of this.listeners) listener();
  }

  public onStatus(callback: (status: FFmpegStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.snapshot.status);
    return () => this.statusListeners.delete(callback);
  }

  public onProgress(
    callback: (progress: number) => void,
    options?: { immediate?: boolean },
  ): () => void {
    this.progressListeners.add(callback);
    if (options?.immediate !== false) callback(this.snapshot.progress);
    return () => this.progressListeners.delete(callback);
  }

  public setPreferredCdn(baseURL: string, options?: { lock?: boolean }): void {
    if (!FFMPEG_CDN_BASES.includes(baseURL as FFmpegCdnBase)) return;
    this.preferredCdnOverride = baseURL as FFmpegCdnBase;
    try {
      localStorage.setItem(FFMPEG_PREFERRED_CDN_KEY, baseURL);
      if (typeof options?.lock === "boolean") {
        localStorage.setItem(FFMPEG_PREFERRED_CDN_LOCK_KEY, options.lock ? "1" : "0");
      }
    } catch {
      void 0;
    }
  }

  public setPreferredCdnLock(locked: boolean): void {
    try {
      localStorage.setItem(FFMPEG_PREFERRED_CDN_LOCK_KEY, locked ? "1" : "0");
    } catch {
      void 0;
    }
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.operationQueue.then(operation, operation);
    this.operationQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private getPreferredCdn(): FFmpegCdnBase {
    if (this.preferredCdnOverride) return this.preferredCdnOverride;
    try {
      const stored = localStorage.getItem(FFMPEG_PREFERRED_CDN_KEY);
      if (FFMPEG_CDN_BASES.includes(stored as FFmpegCdnBase)) return stored as FFmpegCdnBase;

      const settings = localStorage.getItem("mcsd.settings.v0");
      if (settings) {
        const parsed = JSON.parse(settings) as { selectedSource?: string };
        if (FFMPEG_CDN_BASES.includes(parsed.selectedSource as FFmpegCdnBase)) {
          return parsed.selectedSource as FFmpegCdnBase;
        }
      }
    } catch {
      void 0;
    }
    return DEFAULT_CDN;
  }

  private getCdnCandidates(): FFmpegCdnBase[] {
    const preferred = this.getPreferredCdn();
    const preferredIndex = FFMPEG_CDN_BASES.indexOf(preferred);
    return [
      ...FFMPEG_CDN_BASES.slice(preferredIndex),
      ...FFMPEG_CDN_BASES.slice(0, preferredIndex),
    ];
  }

  private async fetchAssetAsBlobUrl(
    url: string,
    mimeType: string,
    onProgress: (progress: number) => void,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);

    try {
      let response: Response | undefined;
      let cache: Cache | null = null;

      if (typeof caches !== "undefined") {
        try {
          cache = await caches.open(FFMPEG_CORE_CACHE_NAME);
          response = (await cache.match(url)) ?? undefined;
        } catch {
          cache = null;
        }
      }

      if (!response) {
        response = await fetch(url, {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        if (cache) {
          try {
            await cache.put(url, response.clone());
          } catch {
            void 0;
          }
        }
      }

      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const totalBytes = Number(response.headers.get("content-length")) || 0;

      if (!response.body) {
        const blob = await response.blob();
        onProgress(1);
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
      }

      const reader = response.body.getReader();
      const chunks: ArrayBuffer[] = [];
      let receivedBytes = 0;
      onProgress(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = new Uint8Array(value);
        chunks.push(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
        receivedBytes += chunk.byteLength;
        if (totalBytes > 0) onProgress(Math.min(1, receivedBytes / totalBytes));
      }

      onProgress(1);
      return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  public async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadTask) return this.loadTask;

    this.loadTask = (async () => {
      if (typeof window === "undefined") {
        this.updateSnapshot({ status: "error", phase: "error", error: "ffmpeg.wasm does not support nodejs" });
        throw new Error("ffmpeg.wasm does not support nodejs");
      }

      this.updateSnapshot({
        status: "loading",
        phase: "idle",
        progress: 0,
        loaded: false,
        attempt: 0,
        totalSources: FFMPEG_CDN_BASES.length,
        error: null,
      });

      try {
        const [{ FFmpeg }, util] = await Promise.all([
          import("@ffmpeg/ffmpeg"),
          import("@ffmpeg/util"),
        ]);
        this.fetchFile = util.fetchFile;

        const candidates = this.getCdnCandidates();
        let lastError: unknown = null;

        for (let index = 0; index < candidates.length; index += 1) {
          const baseURL = candidates[index];
          const candidate = new FFmpeg();
          const objectUrls: string[] = [];

          this.updateSnapshot({
            status: "loading",
            phase: "downloading-core",
            progress: 0,
            source: baseURL,
            attempt: index + 1,
            totalSources: candidates.length,
            error: null,
          });

          try {
            const coreURL = await this.fetchAssetAsBlobUrl(
              `${baseURL}/ffmpeg-core.js`,
              "text/javascript",
              (progress) => this.updateSnapshot({ progress: Math.round(progress * 10) }),
            );
            objectUrls.push(coreURL);

            this.updateSnapshot({ phase: "downloading-wasm", progress: 10 });
            const wasmURL = await this.fetchAssetAsBlobUrl(
              `${baseURL}/ffmpeg-core.wasm`,
              "application/wasm",
              (progress) => this.updateSnapshot({ progress: 10 + Math.round(progress * 85) }),
            );
            objectUrls.push(wasmURL);

            this.updateSnapshot({ phase: "initializing", progress: 96 });
            await candidate.load({ coreURL, wasmURL });
            candidate.on("progress", ({ progress }) => {
              this.updateSnapshot({
                status: "loading",
                phase: "processing",
                progress: Math.min(100, Math.round(progress * 100)),
              });
            });

            this.ffmpeg = candidate;
            this.loaded = true;
            this.setPreferredCdn(baseURL);
            this.updateSnapshot({
              status: "success",
              phase: "ready",
              progress: 100,
              loaded: true,
              source: baseURL,
              error: null,
            });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            try {
              candidate.terminate();
            } catch {
              void 0;
            }
            for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);

            this.updateSnapshot({
              status: "loading",
              phase: "switching-source",
              progress: 0,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (lastError || !this.loaded) {
          throw lastError instanceof Error ? lastError : new Error("All FFmpeg download sources failed");
        }
      } catch (error) {
        this.loaded = false;
        this.updateSnapshot({
          status: "error",
          phase: "error",
          progress: 0,
          loaded: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        this.loadTask = null;
      }
    })();

    return this.loadTask;
  }

  public async probeAudio(file: File | Blob): Promise<AudioProbeResult> {
    await this.load();

    if (!this.ffmpeg || !this.fetchFile) {
      this.updateSnapshot({ status: "error", phase: "error", error: "ffmpeg not initialized" });
      throw new Error("ffmpeg not initialized");
    }

    return this.runExclusive(async () => {
      if (!this.ffmpeg || !this.fetchFile) throw new Error("ffmpeg not initialized");
      const operationId = ++this.operationId;
      const inputName = `probe-input-${operationId}`;
      const outputName = `probe-output-${operationId}.json`;

      try {
        await this.ffmpeg.writeFile(inputName, await this.fetchFile(file));
        const exitCode = await this.ffmpeg.ffprobe([
          "-v",
          "error",
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=codec_name,codec_long_name,bit_rate,sample_rate,channels:format=bit_rate,duration",
          "-of",
          "json",
          inputName,
          "-o",
          outputName,
        ]);
        if (exitCode !== 0) throw new Error(`ffprobe exited with code ${exitCode}`);

        const data = await this.ffmpeg.readFile(outputName);
        const json = typeof data === "string" ? data : new TextDecoder().decode(data);
        const parsed = JSON.parse(json) as {
          streams?: Array<{
            codec_name?: string;
            codec_long_name?: string;
            bit_rate?: string;
            sample_rate?: string;
            channels?: number;
          }>;
          format?: { bit_rate?: string; duration?: string };
        };
        const stream = parsed.streams?.[0];
        const toFiniteNumber = (value: string | number | undefined) => {
          const numeric = Number(value);
          return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
        };

        return {
          codec: stream?.codec_name?.trim() || "unknown",
          codecLongName: stream?.codec_long_name?.trim() || stream?.codec_name?.trim() || "Unknown",
          bitRate: toFiniteNumber(stream?.bit_rate) ?? toFiniteNumber(parsed.format?.bit_rate),
          sampleRate: toFiniteNumber(stream?.sample_rate),
          channels: toFiniteNumber(stream?.channels),
          duration: toFiniteNumber(parsed.format?.duration),
        };
      } finally {
        try {
          await this.ffmpeg.deleteFile(inputName);
        } catch {
          void 0;
        }
        try {
          await this.ffmpeg.deleteFile(outputName);
        } catch {
          void 0;
        }
        this.updateSnapshot({ status: "success", phase: "ready", progress: 100, error: null });
      }
    });
  }

  public async toOGG(file: File | Blob): Promise<{ blob: Blob; url: string }> {
    await this.load();

    if (!this.ffmpeg || !this.fetchFile) {
      this.updateSnapshot({ status: "error", phase: "error", error: "ffmpeg not initialized" });
      throw new Error("ffmpeg not initialized");
    }

    return this.runExclusive(async () => {
      if (!this.ffmpeg || !this.fetchFile) throw new Error("ffmpeg not initialized");
      this.updateSnapshot({ status: "loading", phase: "processing", progress: 0, error: null });
      const operationId = ++this.operationId;
      const inputName = `convert-input-${operationId}`;
      const outputName = `convert-output-${operationId}.ogg`;
      const logMessages: string[] = [];
      const onLog = ({ message }: { message: string }) => {
        const normalized = message.trim();
        if (!normalized) return;
        logMessages.push(normalized);
        if (logMessages.length > 12) logMessages.shift();
      };
      this.ffmpeg.on("log", onLog);

      try {
        await this.ffmpeg.writeFile(inputName, await this.fetchFile(file));
        const exitCode = await this.ffmpeg.exec([
          "-i",
          inputName,
          "-vn",
          "-acodec",
          "libvorbis",
          "-ar",
          String(MINECRAFT_AUDIO_SAMPLE_RATE),
          "-ac",
          String(MINECRAFT_AUDIO_CHANNELS),
          outputName,
        ]);
        if (exitCode !== 0) {
          const detail = logMessages.slice(-3).join(" | ");
          throw new Error(detail || `ffmpeg exited with code ${exitCode}`);
        }

        const data = await this.ffmpeg.readFile(outputName);
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
        const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const blob = new Blob([arrayBuffer], { type: "audio/ogg" });
        const url = URL.createObjectURL(blob);
        this.updateSnapshot({ status: "success", phase: "ready", progress: 100, error: null });
        return { blob, url };
      } finally {
        this.ffmpeg.off("log", onLog);
        try {
          await this.ffmpeg.deleteFile(inputName);
        } catch {
          void 0;
        }
        try {
          await this.ffmpeg.deleteFile(outputName);
        } catch {
          void 0;
        }
      }
    });
  }
}

const ffmpeg = FFmpegService.getInstance();
export default ffmpeg;
