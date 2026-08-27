"use client";

import { Accordion, Button, Dropdown, Label, Modal, Popover, Switch } from "@heroui/react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  CircleOff,
  CircleX,
  Clock3,
  Cpu,
  Download,
  FileAudio,
  FolderOpen,
  Gauge,
  HardDrive,
  History,
  Ellipsis,
  Info,
  LoaderCircle,
  PackageOpen,
  Pause,
  PencilLine,
  Play,
  Plus,
  RefreshCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { WaveformIcon } from "@phosphor-icons/react";
import Image from "next/image";
import dynamic from "next/dynamic";
import type JSZip from "jszip";
import { pinyin } from "pinyin-pro";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  CreateOrImportModal,
  type ImportDetectedPack,
  type OnDetectAudioPack,
  ProjectInfoModal,
  type ImportPackOptions,
  type ImportPackProgress,
  type NewProjectData,
  type PackPlatform,
} from "@/app/ui/create-project-modal";
import { AboutModal } from "@/app/ui/about-modal";
import { BasicEventBindingModal } from "@/app/ui/basic-event-binding-modal";
import { NoviceEventManager } from "@/app/ui/novice-event-manager";
import { ExportWorkspace } from "@/app/ui/export-workspace";
import { MobileWorkspace } from "@/app/ui/mobile-workspace";
import { ComplianceFooter } from "@/app/ui/compliance-footer";
import ffmpeg, {
  FFMPEG_CDN_BASES,
  FFMPEG_CORE_VERSION,
  FFMPEG_VERSION,
  MINECRAFT_AUDIO_CHANNELS,
  MINECRAFT_AUDIO_SAMPLE_RATE,
  type AudioProbeResult,
} from "@/lib/ffmpeg";
import {
  deleteProjectVersionSnapshot,
  deleteProjectVersionSnapshots,
  deleteProjectWorkspace,
  getProjectStorageUsage,
  listProjectVersionSnapshots,
  loadProjectWorkspace,
  saveProjectVersionSnapshot,
  saveProjectWorkspace,
  type PersistedProjectVersionMetadata,
  type PersistedProjectVersion,
  type PersistedProjectWorkspace,
  type ProjectStorageUsage,
  type PersistedWorkspaceAudio,
} from "@/lib/project-workspace-db";
import {
  buildLegacySoundMappings,
  convertLegacySoundMappingsToMcsd,
  deriveCustomEventNames,
  EDITOR_METADATA_PATH,
  type EditorManifest,
} from "@/lib/audio-pack";
import {
  DEFAULT_PROJECT_VERSION,
  DEFAULT_RELEASE_CHANNEL,
  DEFAULT_VERSION_INCREMENT_LIMIT,
  getLatestProjectVersion,
  formatProjectVersionTag,
  incrementProjectVersion,
  normalizeVersionIncrementLimit,
  type ReleaseChannel,
} from "@/lib/project-version";
import { createProjectContentFingerprint } from "@/lib/project-content";
import mcVersions from "@/lib/mcver";
import { vanillaSoundBedrock, vanillaSoundJava } from "@/lib/sounds";
import {
  DEFAULT_AUDIO_EVENT_WEIGHT,
  normalizeAudioEventWeight,
  type AudioEventWeights,
} from "@/lib/audio-event-weight";

type ThemePreference = "day" | "night" | "system";
type Language = "zh" | "en";
type View = "home" | "workspace";
type EventEditorMode = "novice" | "basic" | "advanced";
type ProbeResult = { available: boolean; latency: number | null };
type AudioAnalysisStatus = "analyzing" | "ready" | "error";
type AudioConversionStatus = "idle" | "queued" | "converting" | "converted" | "skipped" | "error";

const VANILLA_JAVA_SOUND_EVENTS = new Set(Object.keys(vanillaSoundJava));
const VANILLA_BEDROCK_SOUND_EVENTS = new Set([
  ...Object.keys(vanillaSoundJava),
  ...Object.keys(vanillaSoundBedrock.individual_event_sounds.events),
  ...Object.keys(vanillaSoundBedrock.individual_named_sounds.sounds),
]);
type WorkspaceAudioFile = {
  id: string;
  file: File;
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
  analysisStatus: AudioAnalysisStatus;
  conversionStatus: AudioConversionStatus;
};
type Project = {
  id: string;
  name: string;
  updatedAt: number;
  soundCount: number;
  key?: string;
  description?: string;
  platform?: PackPlatform;
  javaPackFormat?: string;
  gameVersion?: string;
  iconDataUrl?: string | null;
  version?: string;
  releaseChannel?: ReleaseChannel;
  versionBaseline?: string;
  latestVersion?: string;
};

const AdvancedEventFlow = dynamic(
  () => import("@/app/ui/advanced-event-flow").then((module) => module.AdvancedEventFlow),
  {
    loading: () => <div className="workspace-empty" aria-busy="true" />,
  },
);

const MOBILE_WORKSPACE_QUERY = "(max-width: 767px)";

function subscribeMobileWorkspace(onChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_WORKSPACE_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getMobileWorkspaceSnapshot() {
  return window.matchMedia(MOBILE_WORKSPACE_QUERY).matches;
}

function getMobileWorkspaceServerSnapshot() {
  return false;
}

function getProjectVersionMetadata(project: Project): PersistedProjectVersionMetadata {
  return {
    name: project.name,
    key: project.key ?? "mcsd",
    description: project.description ?? "",
    platform: project.platform ?? "java",
    javaPackFormat: project.javaPackFormat ?? "",
    gameVersion: project.gameVersion ?? "",
    iconDataUrl: project.iconDataUrl ?? null,
    version: project.version ?? DEFAULT_PROJECT_VERSION,
    releaseChannel: project.releaseChannel ?? DEFAULT_RELEASE_CHANNEL,
  };
}

function createEmptyProjectWorkspace(projectId: string): PersistedProjectWorkspace {
  return {
    projectId,
    schemaVersion: 1,
    updatedAt: Date.now(),
    activeStep: 0,
    eventEditorMode: "novice",
    audioFiles: [],
    customEventSuffixes: {},
    customEventNames: [],
    audioEventBindings: {},
    audioEventWeights: {},
    audioSubtitles: {},
  };
}

function createVersionBaseline(project: Project, workspace: PersistedProjectWorkspace) {
  return createProjectContentFingerprint(getProjectVersionMetadata(project), workspace);
}

function persistWorkspaceAudio(item: WorkspaceAudioFile): PersistedWorkspaceAudio {
  return {
    id: item.id,
    blob: item.file,
    fileName: item.file.name,
    fileType: item.file.type,
    lastModified: item.file.lastModified,
    originalName: item.originalName,
    name: item.name,
    key: item.key,
    size: item.size,
    format: item.format,
    codec: item.codec,
    codecLongName: item.codecLongName,
    bitRate: item.bitRate,
    sampleRate: item.sampleRate ?? null,
    channels: item.channels ?? null,
    duration: item.duration,
    analysisStatus: item.analysisStatus,
    conversionStatus: item.conversionStatus,
  };
}

function restoreWorkspaceAudio(item: PersistedWorkspaceAudio): WorkspaceAudioFile {
  const file = new File([item.blob], item.fileName, {
    type: item.fileType || item.blob.type,
    lastModified: item.lastModified,
  });
  return {
    id: item.id,
    file,
    originalName: item.originalName || item.fileName || item.name,
    name: item.name,
    key: item.key,
    size: file.size,
    format: item.format,
    codec: item.codec,
    codecLongName: item.codecLongName,
    bitRate: item.bitRate,
    sampleRate: item.sampleRate,
    channels: item.channels,
    duration: item.duration,
    analysisStatus:
      item.codec && item.sampleRate && item.channels ? "ready" : "analyzing",
    conversionStatus:
      item.conversionStatus === "queued" || item.conversionStatus === "converting"
        ? "idle"
        : item.conversionStatus,
  };
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read pack icon."));
    reader.readAsDataURL(blob);
  });
}

async function readZipJson(zip: JSZip, path: string) {
  const entry = zip.file(path);
  if (!entry) return null;
  try {
    return JSON.parse(await entry.async("text")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getLegacyVersion(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => Number.isFinite(Number(item))).join(".");
  if (typeof value === "string") {
    const match = value.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:-(Beta|Preview))?/i);
    return match?.[1] ?? "";
  }
  return "";
}

function getDetectedGameVersion(platform: PackPlatform, javaPackFormat: string | undefined) {
  if (platform !== "java" || !javaPackFormat) return undefined;
  return mcVersions.find((item) => item.pack_format === javaPackFormat)?.version;
}

function convertImportedWorkspaceToMcsd(
  workspace: PersistedProjectWorkspace,
  platform: PackPlatform,
) {
  const vanillaEvents = platform === "java"
    ? VANILLA_JAVA_SOUND_EVENTS
    : VANILLA_BEDROCK_SOUND_EVENTS;
  const converted = convertLegacySoundMappingsToMcsd(
    {
      customEventSuffixes: workspace.customEventSuffixes,
      eventBindings: workspace.audioEventBindings,
      eventWeights: workspace.audioEventWeights ?? {},
      audioSubtitles: workspace.audioSubtitles ?? {},
    },
    (eventName) => vanillaEvents.has(eventName),
  );

  return {
    ...workspace,
    customEventSuffixes: converted.customEventSuffixes,
    customEventNames: deriveCustomEventNames(
      converted.customEventSuffixes,
      converted.eventBindings,
    ),
    audioEventBindings: converted.eventBindings,
    audioEventWeights: converted.eventWeights,
    audioSubtitles: converted.audioSubtitles,
  };
}

function normalizeLegacySoundReference(value: string) {
  return value
    .trim()
    .replace(/^minecraft:/, "")
    .replace(/^sounds\//, "")
    .replace(/\.ogg$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

function toLegacySoundPath(path: string, platform: PackPlatform) {
  const prefix = platform === "java" ? "assets/minecraft/sounds/" : "sounds/";
  if (!path.startsWith(prefix)) return null;
  const relative = path.slice(prefix.length).replace(/\.[^.]+$/i, "");
  if (!relative) return null;
  const separator = relative.indexOf("/");
  if (separator < 1) {
    return {
      packKey: null,
      soundPath: relative,
      reference: normalizeLegacySoundReference(relative),
      key: relative.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "sound",
    };
  }
  const packKey = relative.slice(0, separator);
  const soundPath = relative.slice(separator + 1);
  return {
    packKey,
    soundPath,
    reference: normalizeLegacySoundReference(`${packKey}/${soundPath}`),
    key: soundPath.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "sound",
  };
}

async function readAudioPackArchive(
  file: File,
  onProgress?: (progress: ImportPackProgress) => void,
) {
  onProgress?.({ phase: "reading", percent: 2 });
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  onProgress?.({ phase: "detecting", percent: 10 });
  const zipPaths = Object.keys(zip.files);
  const metadataPath = zip.file(EDITOR_METADATA_PATH)
    ? EDITOR_METADATA_PATH
    : zipPaths.find((path) => path.endsWith(`/${EDITOR_METADATA_PATH}`)) ?? null;
  const javaRootEntry = zip.file("pack.mcmeta")
    ? "pack.mcmeta"
    : zipPaths.find((path) => path.endsWith("/pack.mcmeta")) ?? null;
  const bedrockRootEntry = zip.file("manifest.json")
    ? "manifest.json"
    : zipPaths.find((path) => path.endsWith("/manifest.json")) ?? null;
  const archiveRoot = metadataPath
    ? metadataPath.slice(0, -EDITOR_METADATA_PATH.length)
    : javaRootEntry
      ? javaRootEntry.slice(0, -"pack.mcmeta".length)
      : bedrockRootEntry
        ? bedrockRootEntry.slice(0, -"manifest.json".length)
        : "";
  let manifest: EditorManifest | null = null;
  const metadataEntry = metadataPath ? zip.file(metadataPath) : null;
  if (metadataEntry) {
    try {
      const parsed = JSON.parse(await metadataEntry.async("text")) as EditorManifest;
      if (parsed?.app === "mcsd" && parsed.schemaVersion === 1 && parsed.project) manifest = parsed;
    } catch {
      throw new Error(".editor/mcsd.json 格式无效。");
    }
  }

  const platform = manifest?.project.platform ?? (bedrockRootEntry ? "bedrock" : "java");
  const legacyPackMeta = manifest ? null : await readZipJson(zip, `${archiveRoot}pack.mcmeta`);
  const legacyBedrockManifest = manifest ? null : await readZipJson(zip, `${archiveRoot}manifest.json`);
  const legacySounds = manifest
    ? null
    : platform === "java"
      ? await readZipJson(zip, `${archiveRoot}assets/minecraft/sounds.json`)
      : await readZipJson(zip, `${archiveRoot}sounds/sound_definitions.json`);
  const usedLegacyKeys = new Set<string>();
  const legacyAudioPrefix = `${archiveRoot}${platform === "java" ? "assets/minecraft/sounds/" : "sounds/"}`;
  const discoveredEntries = Object.keys(zip.files)
    .filter((path) =>
      path.startsWith(legacyAudioPrefix)
      && !zip.files[path]?.dir
      && /\.(ogg|wav|mp3|flac|m4a)$/i.test(path)
    )
    .map((archivePath, index) => {
      const fileName = archivePath.split("/").pop() ?? `sound-${index}.ogg`;
      const relativeArchivePath = archivePath.startsWith(archiveRoot)
        ? archivePath.slice(archiveRoot.length)
        : archivePath;
      const legacyPath = toLegacySoundPath(relativeArchivePath, platform);
      const key = createUniqueAudioKey(legacyPath?.key ?? fileName, usedLegacyKeys);
      return {
        id: `audio-import-${index}`,
        key,
        name: fileName,
        originalName: fileName,
        fileName,
        archivePath,
        format: "OGG",
        codec: "vorbis",
        codecLongName: "Vorbis",
        bitRate: null,
        sampleRate: 44100,
        channels: 2,
        duration: null,
        packKey: legacyPath?.packKey ?? null,
        reference: legacyPath?.reference ?? normalizeLegacySoundReference(key),
      };
    });
  const audioEntries = manifest?.audioFiles ?? discoveredEntries;
  if (audioEntries.length === 0) throw new Error("压缩包中没有找到音频文件。");
  const detectedMainKeys = new Set(
    discoveredEntries
      .map((entry) => entry.packKey)
      .filter((key): key is string => Boolean(key)),
  );
  const hasMainKey = discoveredEntries.length > 0
    ? discoveredEntries.every((entry) => entry.packKey !== null) && detectedMainKeys.size === 1
    : Boolean(manifest?.project.key.trim());
  const detectedMainKey = hasMainKey
    ? detectedMainKeys.values().next().value ?? manifest?.project.key.trim()
    : undefined;

  const legacyJavaPack = legacyPackMeta?.pack as Record<string, unknown> | undefined;
  const legacyBedrockHeader = legacyBedrockManifest?.header as Record<string, unknown> | undefined;
  const javaPackFormat = typeof legacyJavaPack?.pack_format === "number"
    ? String(legacyJavaPack.pack_format)
    : "";
  const archiveBaseName = file.name
    .replace(/\.(zip|mcpack)$/i, "")
    .replace(/-v\d+\.\d+\.\d+(?:-(?:Beta|Preview))?$/i, "")
    .trim();
  const rawDescription = typeof legacyBedrockHeader?.description === "string"
    ? legacyBedrockHeader.description
    : typeof legacyJavaPack?.description === "string"
      ? legacyJavaPack.description
      : "";
  const projectDescription = rawDescription
    .replace(/\s+By mcsd\s+v?\d+\.\d+\.\d+(?:-(?:Beta|Preview))?$/i, "")
    .trim();

  const fallbackProject: EditorManifest["project"] | null = manifest
    ? {
        ...manifest.project,
        key: hasMainKey ? detectedMainKey ?? manifest.project.key : "",
      }
    : {
        name: typeof legacyBedrockHeader?.name === "string"
          ? legacyBedrockHeader.name
          : archiveBaseName,
        key: detectedMainKey ?? "",
        description: projectDescription,
        platform,
        javaPackFormat,
        gameVersion: getDetectedGameVersion(platform, javaPackFormat) ?? "",
        version: getLegacyVersion(
          legacyBedrockHeader?.version ?? legacyJavaPack?.description,
        ) || "0.0.1",
        releaseChannel: /\bpreview\b/i.test(JSON.stringify(legacyBedrockManifest ?? legacyPackMeta))
          ? "preview"
          : /\bbeta\b/i.test(JSON.stringify(legacyBedrockManifest ?? legacyPackMeta))
            ? "beta"
            : "stable",
        iconPath: platform === "java" ? "pack.png" : "pack_icon.png",
      };

  if (fallbackProject) {
    onProgress?.({
      phase: "detecting",
      percent: 28,
      detected: {
        platform,
        version: fallbackProject.version,
        releaseChannel: fallbackProject.releaseChannel,
        isMcsdPack: Boolean(manifest),
        hasMainKey,
        mainKey: detectedMainKey,
        javaPackFormat: fallbackProject.javaPackFormat || undefined,
        gameVersion: getDetectedGameVersion(platform, fallbackProject.javaPackFormat),
      },
    });
  }

  const legacyMappings = buildLegacySoundMappings(platform, discoveredEntries, legacySounds);

  const audioFiles: PersistedWorkspaceAudio[] = [];
  for (let audioIndex = 0; audioIndex < audioEntries.length; audioIndex += 1) {
    const entry = audioEntries[audioIndex];
    const archiveFile = zip.file(entry.archivePath)
      ?? zip.file(`${archiveRoot}${entry.archivePath}`);
    if (!archiveFile) continue;
    const blob = await archiveFile.async("blob");
    audioFiles.push({
      id: entry.id,
      blob,
      fileName: entry.fileName || `${entry.key}.ogg`,
      fileType: "audio/ogg",
      lastModified: Date.now(),
      originalName: entry.originalName || entry.name || entry.fileName,
      name: entry.name || entry.fileName,
      key: entry.key,
      size: blob.size,
      format: entry.format || "OGG",
      codec: entry.codec ?? "vorbis",
      codecLongName: entry.codecLongName ?? "Vorbis",
      bitRate: entry.bitRate ?? null,
      sampleRate: entry.sampleRate ?? 44100,
      channels: entry.channels ?? 2,
      duration: entry.duration ?? null,
      analysisStatus: "ready",
      conversionStatus: "skipped",
    });
    onProgress?.({
      phase: "extracting",
      percent: 30 + Math.round(((audioIndex + 1) / audioEntries.length) * 60),
    });
  }
  if (audioFiles.length === 0) throw new Error("压缩包中的音频文件无法读取。");

  let iconDataUrl: string | null = null;
  const iconPath = manifest?.project.iconPath
    ?? (platform === "java" ? "pack.png" : "pack_icon.png");
  const iconFile = iconPath
    ? zip.file(iconPath) ?? zip.file(`${archiveRoot}${iconPath}`)
    : null;
  if (iconFile) iconDataUrl = await blobToDataUrl(await iconFile.async("blob"));
  onProgress?.({ phase: "finalizing", percent: 96 });

  const importedEventBindings = manifest?.eventBindings ?? legacyMappings.eventBindings;

  const workspace: PersistedProjectWorkspace = {
    projectId: "pending",
    schemaVersion: 1,
    updatedAt: Date.now(),
    activeStep: 0,
    eventEditorMode: "novice",
    audioFiles,
    customEventSuffixes: manifest?.customEventSuffixes ?? legacyMappings.customEventSuffixes,
    customEventNames: manifest?.customEventNames
      ?? deriveCustomEventNames(
        manifest?.customEventSuffixes ?? legacyMappings.customEventSuffixes,
        importedEventBindings,
      ),
    audioEventBindings: importedEventBindings,
    audioEventWeights: manifest?.eventWeights ?? legacyMappings.eventWeights,
    audioSubtitles: manifest?.audioSubtitles ?? legacyMappings.audioSubtitles,
  };
  onProgress?.({ phase: "finalizing", percent: 100 });
  return { manifest, project: fallbackProject, workspace, iconDataUrl, hasMainKey, mainKey: detectedMainKey };
}

const FFMPEG_SOURCES = FFMPEG_CDN_BASES;
const DEFAULT_SOURCE = FFMPEG_SOURCES[1];
const WAVEFORM = [26, 52, 78, 36, 66, 44, 86, 58, 32, 72, 48, 92, 62, 38, 76, 54];
const MAX_AUDIO_KEY_LENGTH = 8;

const COPY = {
  zh: {
    product: "Minecraft 音频包工坊",
    ffmpegLoaded: "已加载",
    ffmpegFailed: "加载失败",
    ffmpegUnloaded: "未加载",
    ffmpegError: "加载错误",
    ffmpegLoading: "正在加载",
    ffmpegStatusTitle: "FFmpeg 状态",
    ffmpegVersion: "FFmpeg 版本号",
    ffmpegCoreVersion: "FFmpeg Core 版本",
    ffmpegSource: "下载源",
    ffmpegAttempt: "下载源尝试",
    ffmpegReadyDescription: "FFmpeg 核心已加载，可以在当前浏览器中处理音频。",
    ffmpegFailedDescription: "所有 FFmpeg 下载源均加载失败，请检查当前网络连接。",
    ffmpegErrorDescription: "FFmpeg 初始化时发生错误，请重新尝试或检查浏览器环境。",
    ffmpegUnloadedDescription: "FFmpeg 核心尚未完成加载。",
    retry: "重新尝试",
    help: "帮助",
    about: "关于",
    settings: "设置",
    projects: "音频包工程",
    projectsDescription: "继续最近工程，或从一份新的声音资源包开始。",
    empty: "还没有历史工程",
    emptyDescription: "创建工程后，它会保存在此浏览器中。",
    create: "创建新音频包",
    createDescription: "从导入声音素材开始",
    updated: "更新于",
    sounds: "个声音",
    moreActions: "更多操作",
    editInfo: "修改信息",
    delete: "删除",
    page: "页",
    back: "返回工程",
    untitled: "未命名音频包",
    stepImport: "导入音频",
    stepMap: "设置事件",
    stepExport: "打包导出",
    chooseFile: "选择音频文件",
    replaceFile: "更换音频",
    dropFile: "将音频拖到此处，或选择文件",
    formats: "支持 MP3、WAV、FLAC、M4A 与 OGG",
    addAudio: "添加音频",
    addAudioDescription: "点击选择或把音频拖到这里",
    playPreview: "播放音频预览",
    pausePreview: "暂停音频预览",
    retryPreview: "预览失败，点击重试",
    removeAudio: "删除音频",
    audioKey: "KEY",
    detectingAudio: "检测中",
    unknownAudio: "未知",
    bitrate: "码率",
    sampleRate: "采样率",
    channels: "声道",
    mono: "单声道",
    stereo: "双声道",
    convertingAudio: "正在转换",
    convertedAudio: "转换完成",
    queuedAudio: "等待处理",
    skippedAudio: "符合规格，无需转换",
    conversionFailed: "音频转换失败，请重试。",
    previousStep: "上一步",
    backToFirstStep: "回到第一步",
    iterateVersion: "迭代新版本",
    nextSetEvents: "下一步：设置事件",
    nextExport: "下一步：打包导出",
    audioSpec: "Minecraft 音频规格",
    minecraftAudioSpec: "OGG Vorbis · 44.1 kHz · 双声道",
    localOnly: "素材只在本机处理",
    localOnlyDescription: "FFmpeg WASM 在浏览器内转换音频，不会上传源文件。",
    mappingEmpty: "等待音频素材",
    mappingEmptyDescription: "导入音频后，这里会出现声音事件映射行。",
    event: "Minecraft 声音事件",
    subtitle: "Minecraft 声音字幕",
    subtitlePlaceholder: "留空则不添加字幕",
    novice: "小白",
    basic: "基础",
    advanced: "高级",
    eventEditorMode: "事件设置方式",
    exportReady: "工程摘要",
    exportDescription: "确认内容后生成声音资源包。",
    generate: "生成音频包",
    helpTitle: "MCSD2 帮助",
    settingsTitle: "MCSD2 设置",
    interface: "界面设置",
    complianceInfo: "备案信息",
    complianceInfoDescription: "在工程主页底部显示 ICP 备案号与公安备案号。",
    versionManagement: "版本管理",
    versionIncrementRule: "版本递增规则",
    versionIncrementDescription: "除主版本外，次版本与修订版本按该数值进位，范围 1–100。",
    autoSaveHistory: "自动保存历史版本",
    autoSaveHistoryDescription: "迭代或切换版本前保存完整工程快照，会占用更多本地空间。",
    historyVersions: "历史版本",
    noHistoryVersions: "还没有历史版本，完成一次迭代后会显示在这里。",
    currentVersion: "当前版本",
    versionHistoryUnavailable: "无法读取该工程的历史版本。",
    versionActionFailed: "版本操作失败，请重试。",
    restoreVersion: "切换",
    deleteVersion: "删除",
    confirmDeleteVersion: "确认删除",
    storageManagement: "容量管理",
    projectStorage: "工程数据占用",
    browserStorage: "浏览器存储",
    browserStorageInfo: "浏览器存储根据当前设备和浏览器而定，不是云存储。更换设备或浏览器后，数据不会自动同步。",
    currentData: "当前",
    historyData: "历史",
    historyCount: "个版本",
    clearHistory: "清理历史",
    confirmClear: "确认清理",
    keepData: "保留",
    noProjectStorage: "当前没有可统计的工程数据。",
    storageUnavailable: "无法读取浏览器容量信息。",
    ffmpeg: "FFmpeg 设置",
    theme: "主题",
    day: "白日",
    night: "夜晚",
    system: "跟随系统",
    language: "语言",
    chinese: "中",
    english: "En",
    motion: "动效",
    on: "开",
    off: "关",
    downloadSource: "下载源",
    change: "更改",
    sourceTitle: "选择 FFmpeg 下载源",
    sourceDescription: "检测结果来自当前浏览器到各下载源的实时请求。",
    address: "下载源地址",
    latency: "真实延迟",
    availability: "状态",
    checking: "检测中",
    waiting: "等待检测",
    available: "可用",
    unavailable: "不可用",
    autoSelect: "自动选择",
    confirmChange: "确认更改",
    cancel: "取消",
  },
  en: {
    product: "Minecraft Audio Pack Workshop",
    ffmpegLoaded: "Loaded",
    ffmpegFailed: "Load failed",
    ffmpegUnloaded: "Not loaded",
    ffmpegError: "Load error",
    ffmpegLoading: "Loading",
    ffmpegStatusTitle: "FFmpeg status",
    ffmpegVersion: "FFmpeg version",
    ffmpegCoreVersion: "FFmpeg Core version",
    ffmpegSource: "Download source",
    ffmpegAttempt: "Source attempts",
    ffmpegReadyDescription: "FFmpeg Core is loaded and ready to process audio in this browser.",
    ffmpegFailedDescription: "Every FFmpeg download source failed. Check the current network connection.",
    ffmpegErrorDescription: "FFmpeg encountered an initialization error. Retry or check the browser environment.",
    ffmpegUnloadedDescription: "FFmpeg Core has not finished loading.",
    retry: "Retry",
    help: "Help",
    about: "About",
    settings: "Settings",
    projects: "Audio pack projects",
    projectsDescription: "Continue a recent project or start a new sound resource pack.",
    empty: "No projects yet",
    emptyDescription: "New projects are stored in this browser.",
    create: "Create audio pack",
    createDescription: "Start by importing sound files",
    updated: "Updated",
    sounds: "sounds",
    moreActions: "More actions",
    editInfo: "Edit information",
    delete: "Delete",
    page: "Page",
    back: "Back to projects",
    untitled: "Untitled audio pack",
    stepImport: "Import audio",
    stepMap: "Set events",
    stepExport: "Build & export",
    chooseFile: "Choose audio file",
    replaceFile: "Replace audio",
    dropFile: "Drop audio here or choose a file",
    formats: "MP3, WAV, FLAC, M4A and OGG",
    addAudio: "Add audio",
    addAudioDescription: "Choose files or drop audio here",
    playPreview: "Play audio preview",
    pausePreview: "Pause audio preview",
    retryPreview: "Preview failed, retry",
    removeAudio: "Remove audio",
    audioKey: "KEY",
    detectingAudio: "Detecting",
    unknownAudio: "Unknown",
    bitrate: "Bitrate",
    sampleRate: "Sample rate",
    channels: "Channels",
    mono: "Mono",
    stereo: "Stereo",
    convertingAudio: "Converting",
    convertedAudio: "Converted",
    queuedAudio: "Waiting",
    skippedAudio: "Already compliant",
    conversionFailed: "Audio conversion failed. Please retry.",
    previousStep: "Previous",
    backToFirstStep: "Back to first step",
    iterateVersion: "Iterate new version",
    nextSetEvents: "Next: Set events",
    nextExport: "Next: Build & export",
    audioSpec: "Minecraft audio specification",
    minecraftAudioSpec: "OGG Vorbis · 44.1 kHz · Stereo",
    localOnly: "Files stay on this device",
    localOnlyDescription: "FFmpeg WASM converts audio in your browser without uploading source files.",
    mappingEmpty: "Waiting for audio",
    mappingEmptyDescription: "Sound-event mapping rows appear here after an audio file is imported.",
    event: "Minecraft sound event",
    subtitle: "Minecraft subtitle",
    subtitlePlaceholder: "Leave empty to omit the subtitle",
    novice: "Easy",
    basic: "Basic",
    advanced: "Advanced",
    eventEditorMode: "Event editor mode",
    exportReady: "Project summary",
    exportDescription: "Review the project before building the sound resource pack.",
    generate: "Build audio pack",
    helpTitle: "MCSD2 Help",
    settingsTitle: "MCSD2 Settings",
    interface: "Interface",
    complianceInfo: "Registration information",
    complianceInfoDescription: "Show ICP and public security registration links on the project home page.",
    versionManagement: "Version management",
    versionIncrementRule: "Version increment rule",
    versionIncrementDescription: "Minor and patch versions carry at this value, from 1 to 100.",
    autoSaveHistory: "Save version history automatically",
    autoSaveHistoryDescription: "Save a complete project snapshot before iterating or switching versions. Uses more local storage.",
    historyVersions: "Version history",
    noHistoryVersions: "No saved versions yet. The first iteration will create one.",
    currentVersion: "Current version",
    versionHistoryUnavailable: "Unable to load this project's version history.",
    versionActionFailed: "The version action failed. Try again.",
    restoreVersion: "Switch",
    deleteVersion: "Delete",
    confirmDeleteVersion: "Confirm delete",
    storageManagement: "Storage management",
    projectStorage: "Project storage",
    browserStorage: "Browser storage",
    browserStorageInfo: "Browser storage is tied to this device and browser, not cloud storage. Data is not automatically synced when you switch devices or browsers.",
    currentData: "Current",
    historyData: "History",
    historyCount: "versions",
    clearHistory: "Clear history",
    confirmClear: "Confirm clear",
    keepData: "Keep",
    noProjectStorage: "No project storage to report yet.",
    storageUnavailable: "Browser storage information is unavailable.",
    ffmpeg: "FFmpeg",
    theme: "Theme",
    day: "Day",
    night: "Night",
    system: "System",
    language: "Language",
    chinese: "中",
    english: "En",
    motion: "Motion",
    on: "On",
    off: "Off",
    downloadSource: "Download source",
    change: "Change",
    sourceTitle: "Choose FFmpeg source",
    sourceDescription: "Results use live requests from this browser to each source.",
    address: "Source URL",
    latency: "Latency",
    availability: "Status",
    checking: "Checking",
    waiting: "Not checked",
    available: "Available",
    unavailable: "Unavailable",
    autoSelect: "Auto select",
    confirmChange: "Confirm change",
    cancel: "Cancel",
  },
} as const;

const FAQ = {
  zh: [
    ["MCSD2 可以制作什么？", "MCSD2 将音频转换为 Minecraft Java 版与基岩版可用的声音资源包，并生成对应的事件映射。"],
    ["音频会上传到服务器吗？", "不会。音频转换由浏览器中的 FFmpeg WASM 完成，源文件不会离开当前设备。"],
    ["支持哪些音频格式？", "当前导入界面接受 MP3、WAV、FLAC、M4A 与 OGG 文件。"],
    ["为什么 FFmpeg 无法加载？", "可以在设置中更换下载源。下载源列表会显示当前网络下的可用状态和真实延迟。"],
  ],
  en: [
    ["What can MCSD2 build?", "MCSD2 converts audio into a sound resource pack for Minecraft Java and Bedrock Edition, and prepares event mappings."],
    ["Are audio files uploaded?", "No. FFmpeg WASM runs in the browser, so source files remain on this device."],
    ["Which formats are supported?", "The current importer accepts MP3, WAV, FLAC, M4A and OGG files."],
    ["Why did FFmpeg fail to load?", "Change the download source in Settings. The source list shows live availability and latency for this network."],
  ],
} as const;

function formatProjectDate(timestamp: number, language: Language) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatAudioFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getAudioFormat(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toUpperCase();
  return extension || "AUDIO";
}

function getAudioBaseName(fileName: string) {
  const trimmed = fileName.trim();
  const extensionIndex = trimmed.lastIndexOf(".");
  return extensionIndex > 0 ? trimmed.slice(0, extensionIndex) : trimmed;
}

function createAudioKey(fileName: string) {
  const baseName = getAudioBaseName(fileName);
  const initials = pinyin(baseName, {
    pattern: "first",
    toneType: "none",
    type: "array",
  }) as string[];
  const normalized = initials.join("").toLowerCase().replace(/[^a-z0-9_]/g, "");
  return (normalized || "sound").slice(0, MAX_AUDIO_KEY_LENGTH);
}

function createUniqueAudioKey(fileName: string, usedKeys: Set<string>) {
  const baseKey = createAudioKey(fileName);
  let candidate = baseKey;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = suffixText.length >= MAX_AUDIO_KEY_LENGTH
      ? suffixText.slice(-MAX_AUDIO_KEY_LENGTH)
      : `${baseKey.slice(0, MAX_AUDIO_KEY_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedKeys.add(candidate);
  return candidate;
}

function formatAudioBitRate(bitRate: number | null) {
  if (!bitRate || !Number.isFinite(bitRate)) return null;
  return `${Math.round(bitRate / 1000)} kbps`;
}

function formatAudioSampleRate(sampleRate: number | null) {
  if (!sampleRate || !Number.isFinite(sampleRate)) return null;
  const kiloHertz = sampleRate / 1000;
  return `${Number.isInteger(kiloHertz) ? kiloHertz : kiloHertz.toFixed(1)} kHz`;
}

function formatAudioChannels(
  channels: number | null,
  labels: { mono: string; stereo: string },
) {
  if (!channels || !Number.isFinite(channels)) return null;
  if (channels === 1) return labels.mono;
  if (channels === 2) return labels.stereo;
  return `${channels} ch`;
}

async function decodeAudioMetadata(file: File) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    return {
      sampleRate: buffer.sampleRate || null,
      channels: buffer.numberOfChannels || null,
      duration: Number.isFinite(buffer.duration) && buffer.duration > 0 ? buffer.duration : null,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function getCodecLabel(codec: string | null, codecLongName: string | null) {
  if (!codec || codec.toLowerCase() === "unknown") return null;
  if (codec === "vorbis") return "Vorbis";
  if (codec === "mp3") return "MP3";
  if (codec === "flac") return "FLAC";
  if (codec === "aac") return "AAC";
  if (codec.startsWith("pcm_")) return codec.toUpperCase();
  return codecLongName && codecLongName.toLowerCase() !== "unknown"
    ? codecLongName
    : codec.toUpperCase();
}

function isMinecraftAudioCompliant(format: string, metadata: AudioProbeResult) {
  return (
    format.toUpperCase() === "OGG" &&
    metadata.codec.toLowerCase() === "vorbis" &&
    metadata.sampleRate === MINECRAFT_AUDIO_SAMPLE_RATE &&
    metadata.channels === MINECRAFT_AUDIO_CHANNELS
  );
}

function SegmentControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  return (
    <div aria-label={label} className="pixel-segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className="pixel-segmented__option"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GlobalTools({
  language,
  setLanguage,
  theme,
  setTheme,
  motionEnabled,
  setMotionEnabled,
  showComplianceInfo,
  setShowComplianceInfo,
  selectedSource,
  setSelectedSource,
  projects,
  versionIncrementLimit,
  setVersionIncrementLimit,
  autoSaveVersionHistory,
  setAutoSaveVersionHistory,
  onPrepareStorageData,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  motionEnabled: boolean;
  setMotionEnabled: (enabled: boolean) => void;
  showComplianceInfo: boolean;
  setShowComplianceInfo: (enabled: boolean) => void;
  selectedSource: string;
  setSelectedSource: (source: string) => void;
  projects: Project[];
  versionIncrementLimit: number;
  setVersionIncrementLimit: (limit: number) => void;
  autoSaveVersionHistory: boolean;
  setAutoSaveVersionHistory: (enabled: boolean) => void;
  onPrepareStorageData: () => Promise<void>;
}) {
  const c = COPY[language];
  const [candidateSource, setCandidateSource] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [probeResults, setProbeResults] = useState<Record<string, ProbeResult>>({});
  const [isProbing, setIsProbing] = useState(false);
  const [versionLimitDraft, setVersionLimitDraft] = useState(String(versionIncrementLimit));
  const [storageUsage, setStorageUsage] = useState<ProjectStorageUsage[]>([]);
  const [browserStorage, setBrowserStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [isLoadingManagement, setIsLoadingManagement] = useState(false);
  const [managementError, setManagementError] = useState(false);
  const [pendingCleanupProjectId, setPendingCleanupProjectId] = useState<string | null>(null);
  const ffmpegSnapshot = useSyncExternalStore(
    ffmpeg.subscribe,
    ffmpeg.getSnapshot,
    ffmpeg.getServerSnapshot,
  );

  const allSourcesFailed =
    ffmpegSnapshot.status === "error" &&
    ffmpegSnapshot.attempt >= ffmpegSnapshot.totalSources;
  const ffmpegState = ffmpegSnapshot.loaded
    ? "loaded"
    : allSourcesFailed
      ? "failed"
      : ffmpegSnapshot.status === "error"
        ? "error"
        : "unloaded";
  const ffmpegStateLabel =
    ffmpegState === "loaded"
      ? c.ffmpegLoaded
      : ffmpegState === "failed"
        ? c.ffmpegFailed
        : ffmpegState === "error"
          ? c.ffmpegError
          : c.ffmpegUnloaded;

  const fastestSource = useMemo(() => {
    return Object.entries(probeResults)
      .filter((entry): entry is [string, { available: true; latency: number }] =>
        entry[1].available && entry[1].latency !== null,
      )
      .sort((a, b) => a[1].latency - b[1].latency)[0]?.[0];
  }, [probeResults]);
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const trackedStorageBytes = storageUsage.reduce((total, item) => total + item.totalBytes, 0);

  async function refreshManagementData() {
    setIsLoadingManagement(true);
    setManagementError(false);
    try {
      const [usage, estimate] = await Promise.all([
        getProjectStorageUsage(),
        navigator.storage?.estimate?.() ?? Promise.resolve(undefined),
      ]);
      const usageByProject = new Map(usage.map((item) => [item.projectId, item]));
      for (const project of projects) {
        const metadataBytes = new Blob([JSON.stringify(project)]).size;
        const entry = usageByProject.get(project.id) ?? {
          projectId: project.id,
          currentBytes: 0,
          historyBytes: 0,
          historyCount: 0,
          totalBytes: 0,
        };
        entry.currentBytes += metadataBytes;
        entry.totalBytes += metadataBytes;
        usageByProject.set(project.id, entry);
      }
      setStorageUsage(
        [...usageByProject.values()].sort((a, b) => b.totalBytes - a.totalBytes),
      );
      setBrowserStorage(
        estimate?.usage !== undefined && estimate.quota !== undefined
          ? { usage: estimate.usage, quota: estimate.quota }
          : null,
      );
    } catch {
      setManagementError(true);
    } finally {
      setIsLoadingManagement(false);
    }
  }

  async function openSettings() {
    setVersionLimitDraft(String(versionIncrementLimit));
    setSettingsOpen(true);
    try {
      await onPrepareStorageData();
    } catch {
      setManagementError(true);
    }
    await refreshManagementData();
  }

  function commitVersionLimit() {
    const normalized = normalizeVersionIncrementLimit(
      versionLimitDraft.trim() ? Number(versionLimitDraft) : DEFAULT_VERSION_INCREMENT_LIMIT,
    );
    setVersionLimitDraft(String(normalized));
    setVersionIncrementLimit(normalized);
  }

  async function clearProjectHistory(projectId: string) {
    try {
      await deleteProjectVersionSnapshots(projectId);
      setPendingCleanupProjectId(null);
      await refreshManagementData();
    } catch {
      setManagementError(true);
    }
  }

  async function probeSources() {
    setCandidateSource(null);
    setIsProbing(true);
    setProbeResults({});

    await Promise.all(
      FFMPEG_SOURCES.map(async (source) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 6000);
        const startedAt = performance.now();

        try {
          const response = await fetch(`${source}/ffmpeg-core.js`, {
            cache: "no-store",
            method: "HEAD",
            signal: controller.signal,
          });
          const latency = Math.max(1, Math.round(performance.now() - startedAt));
          setProbeResults((current) => ({
            ...current,
            [source]: { available: response.ok, latency: response.ok ? latency : null },
          }));
        } catch {
          setProbeResults((current) => ({
            ...current,
            [source]: { available: false, latency: null },
          }));
        } finally {
          window.clearTimeout(timeout);
        }
      }),
    );

    setIsProbing(false);
  }

  function confirmSource() {
    const source = candidateSource ?? fastestSource;
    if (source) {
      ffmpeg.setPreferredCdn(source);
      setSelectedSource(source);
    }
  }

  function retryFFmpegLoad() {
    void ffmpeg.load().catch(() => undefined);
  }

  return (
    <div className="global-tools" aria-label={`${c.help} / ${c.about} / ${c.settings}`}>
      <Modal>
        <Button
          aria-label={`FFmpeg ${ffmpegStateLabel}`}
          className={`global-tools__button global-tools__button--status is-${ffmpegState}`}
          variant="ghost"
        >
          <span className="ffmpeg-status-dot" aria-hidden="true" />
          <span>FFmpeg {ffmpegStateLabel}</span>
        </Button>
        <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
          <Modal.Container size="md">
            <Modal.Dialog
              className={`wiki-modal ffmpeg-status-modal sm:max-w-[650px] ${
                ffmpegState === "failed" || ffmpegState === "error" ? "is-failed" : ""
              }`}
            >
              <Modal.CloseTrigger className="wiki-modal__close" />
              <Modal.Header className="wiki-modal__header ffmpeg-status-modal__header">
                <Modal.Icon
                  className={`wiki-modal__icon ffmpeg-status-modal__icon is-${ffmpegState}`}
                >
                  {ffmpegState === "loaded" ? (
                    <CircleCheck aria-hidden="true" size={20} />
                  ) : ffmpegState === "failed" ? (
                    <CircleX aria-hidden="true" size={20} />
                  ) : ffmpegState === "error" ? (
                    <TriangleAlert aria-hidden="true" size={20} />
                  ) : (
                    <CircleOff aria-hidden="true" size={20} />
                  )}
                </Modal.Icon>
                <div>
                  <Modal.Heading className="wiki-modal__heading">{c.ffmpegStatusTitle}</Modal.Heading>
                  <p className="wiki-modal__description">
                    {ffmpegState === "loaded"
                      ? c.ffmpegReadyDescription
                      : ffmpegState === "failed"
                        ? c.ffmpegFailedDescription
                        : ffmpegState === "error"
                          ? c.ffmpegErrorDescription
                          : ffmpegSnapshot.status === "loading"
                            ? c.ffmpegLoading
                            : c.ffmpegUnloadedDescription}
                  </p>
                </div>
              </Modal.Header>
              <Modal.Body className="wiki-modal__body ffmpeg-status-modal__body">
                {ffmpegState === "loaded" ? (
                  <dl className="ffmpeg-status-details">
                    <div>
                      <dt>{c.ffmpegVersion}</dt>
                      <dd>{FFMPEG_VERSION}</dd>
                    </div>
                    <div>
                      <dt>{c.ffmpegCoreVersion}</dt>
                      <dd>{FFMPEG_CORE_VERSION}</dd>
                    </div>
                    <div>
                      <dt>{c.ffmpegSource}</dt>
                      <dd>{ffmpegSnapshot.source ?? selectedSource}</dd>
                    </div>
                    <div>
                      <dt>{c.ffmpegStatusTitle}</dt>
                      <dd className="is-ready">
                        <CircleCheck aria-hidden="true" size={15} />
                        {c.ffmpegLoaded}
                      </dd>
                    </div>
                  </dl>
                ) : ffmpegState === "failed" || ffmpegState === "error" ? (
                  <div className="ffmpeg-status-failure" role="alert">
                    <CircleX aria-hidden="true" size={42} />
                    <strong>
                      FFmpeg {ffmpegState === "failed" ? c.ffmpegFailed : c.ffmpegError}
                    </strong>
                    <p>
                      {ffmpegState === "failed"
                        ? c.ffmpegFailedDescription
                        : c.ffmpegErrorDescription}
                    </p>
                    <dl>
                      <div>
                        <dt>{c.ffmpegAttempt}</dt>
                        <dd>{ffmpegSnapshot.attempt} / {ffmpegSnapshot.totalSources}</dd>
                      </div>
                      <div>
                        <dt>{c.ffmpegSource}</dt>
                        <dd>{ffmpegSnapshot.source ?? "-"}</dd>
                      </div>
                    </dl>
                    {ffmpegSnapshot.error ? <code>{ffmpegSnapshot.error}</code> : null}
                    <Button className="wiki-button ffmpeg-status-failure__retry" onPress={retryFFmpegLoad}>
                      <Cpu aria-hidden="true" size={17} />
                      {c.retry}
                    </Button>
                  </div>
                ) : (
                  <div className="ffmpeg-status-unloaded">
                    <CircleOff aria-hidden="true" size={32} />
                    <strong>FFmpeg {c.ffmpegUnloaded}</strong>
                    <p>
                      {ffmpegSnapshot.status === "loading"
                        ? `${c.ffmpegLoading} · ${ffmpegSnapshot.progress}%`
                        : c.ffmpegUnloadedDescription}
                    </p>
                  </div>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <span className="global-tools__separator" />

      <Modal>
        <Button
          className="global-tools__button global-tools__button--help"
          variant="ghost"
        >
          <CircleHelp aria-hidden="true" size={17} />
          {c.help}
        </Button>
        <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
          <Modal.Container size="md">
            <Modal.Dialog className="wiki-modal sm:max-w-[650px]">
              <Modal.CloseTrigger className="wiki-modal__close" />
              <Modal.Header className="wiki-modal__header">
                <Modal.Icon className="wiki-modal__icon">
                  <CircleHelp aria-hidden="true" size={20} />
                </Modal.Icon>
                <Modal.Heading className="wiki-modal__heading">{c.helpTitle}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="wiki-modal__body">
                <Accordion className="wiki-accordion" variant="surface">
                  {FAQ[language].map(([question, answer], index) => (
                    <Accordion.Item key={question} id={`faq-${index}`}>
                      <Accordion.Heading>
                        <Accordion.Trigger className="wiki-accordion__trigger">
                          <span>{question}</span>
                          <Accordion.Indicator className="wiki-accordion__indicator">
                            <ChevronDown aria-hidden="true" size={17} />
                          </Accordion.Indicator>
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel>
                        <Accordion.Body className="wiki-accordion__body">{answer}</Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <span className="global-tools__separator" />

      <AboutModal language={language} />

      <span className="global-tools__separator" />

      <>
        <button
          className="global-tools__button global-tools__button--settings"
          type="button"
          onClick={() => void openSettings()}
        >
          <Settings2 aria-hidden="true" size={17} />
          {c.settings}
        </button>
        <Modal.Backdrop
          isOpen={settingsOpen}
          onOpenChange={setSettingsOpen}
          className="wiki-modal-backdrop"
          variant="opaque"
        >
          <Modal.Container size="lg" scroll="inside">
            <Modal.Dialog className="wiki-modal sm:max-w-[760px]">
              <Modal.CloseTrigger className="wiki-modal__close" />
              <Modal.Header className="wiki-modal__header">
                <Modal.Icon className="wiki-modal__icon">
                  <Settings2 aria-hidden="true" size={20} />
                </Modal.Icon>
                <Modal.Heading className="wiki-modal__heading">{c.settingsTitle}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="wiki-modal__body settings-body">
                <section className="settings-section">
                  <div className="settings-section__heading">
                    <SlidersHorizontal aria-hidden="true" size={18} />
                    <h3>{c.interface}</h3>
                  </div>

                  <div className="setting-row">
                    <div>
                      <p className="setting-row__label">{c.theme}</p>
                    </div>
                    <SegmentControl
                      label={c.theme}
                      value={theme}
                      onChange={setTheme}
                      options={[
                        { value: "day", label: c.day },
                        { value: "night", label: c.night },
                        { value: "system", label: c.system },
                      ]}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <p className="setting-row__label">{c.language}</p>
                    </div>
                    <SegmentControl
                      label={c.language}
                      value={language}
                      onChange={setLanguage}
                      options={[
                        { value: "zh", label: c.chinese },
                        { value: "en", label: c.english },
                      ]}
                    />
                  </div>

                  <div className="setting-row">
                    <div>
                      <p className="setting-row__label">{c.motion}</p>
                    </div>
                    <Switch
                      aria-label={c.motion}
                      className="wiki-switch"
                      isSelected={motionEnabled}
                      onChange={setMotionEnabled}
                    >
                      <Switch.Content>
                        <span className="wiki-switch__state">{motionEnabled ? c.on : c.off}</span>
                        <Switch.Control className="wiki-switch__control">
                          <Switch.Thumb className="wiki-switch__thumb">
                            <Switch.Icon>{motionEnabled ? <Check size={12} /> : null}</Switch.Icon>
                          </Switch.Thumb>
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>

                  <div className="setting-row">
                    <div>
                      <p className="setting-row__label">{c.complianceInfo}</p>
                      <p className="setting-row__value">{c.complianceInfoDescription}</p>
                    </div>
                    <Switch
                      aria-label={c.complianceInfo}
                      className="wiki-switch"
                      isSelected={showComplianceInfo}
                      onChange={setShowComplianceInfo}
                    >
                      <Switch.Content>
                        <span className="wiki-switch__state">{showComplianceInfo ? c.on : c.off}</span>
                        <Switch.Control className="wiki-switch__control">
                          <Switch.Thumb className="wiki-switch__thumb">
                            <Switch.Icon>{showComplianceInfo ? <Check size={12} /> : null}</Switch.Icon>
                          </Switch.Thumb>
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                </section>

                <section className="settings-section">
                  <div className="settings-section__heading">
                    <History aria-hidden="true" size={18} />
                    <h3>{c.versionManagement}</h3>
                  </div>

                  <div className="setting-row setting-row--stacked">
                    <div>
                      <p className="setting-row__label">{c.versionIncrementRule}</p>
                      <p className="setting-row__value">{c.versionIncrementDescription}</p>
                    </div>
                    <div className="version-limit-control">
                      <div className="pixel-segmented" role="group" aria-label={c.versionIncrementRule}>
                        {[10, 20, 30].map((limit) => (
                          <button
                            key={limit}
                            type="button"
                            className="pixel-segmented__option"
                            aria-pressed={versionIncrementLimit === limit}
                            onClick={() => {
                              setVersionLimitDraft(String(limit));
                              setVersionIncrementLimit(limit);
                            }}
                          >
                            {limit}
                          </button>
                        ))}
                      </div>
                      <input
                        aria-label={c.versionIncrementRule}
                        inputMode="numeric"
                        min={1}
                        max={100}
                        type="number"
                        value={versionLimitDraft}
                        onBlur={commitVersionLimit}
                        onChange={(event) => setVersionLimitDraft(event.target.value.slice(0, 3))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    </div>
                  </div>

                  <div className="setting-row">
                    <div>
                      <p className="setting-row__label">{c.autoSaveHistory}</p>
                      <p className="setting-row__value">{c.autoSaveHistoryDescription}</p>
                    </div>
                    <Switch
                      aria-label={c.autoSaveHistory}
                      className="wiki-switch"
                      isSelected={autoSaveVersionHistory}
                      onChange={setAutoSaveVersionHistory}
                    >
                      <Switch.Content>
                        <span className="wiki-switch__state">
                          {autoSaveVersionHistory ? c.on : c.off}
                        </span>
                        <Switch.Control className="wiki-switch__control">
                          <Switch.Thumb className="wiki-switch__thumb">
                            <Switch.Icon>{autoSaveVersionHistory ? <Check size={12} /> : null}</Switch.Icon>
                          </Switch.Thumb>
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>

                </section>

                <section className="settings-section">
                  <div className="settings-section__heading">
                    <HardDrive aria-hidden="true" size={18} />
                    <h3>{c.storageManagement}</h3>
                  </div>

                  <div className="storage-overview">
                    <div className="storage-overview__summary">
                      <div>
                        <span>{c.projectStorage}</span>
                        <strong>{formatAudioFileSize(trackedStorageBytes)}</strong>
                      </div>
                      <div>
                        <div className="storage-overview__label">
                          <span>{c.browserStorage}</span>
                          <Popover>
                            <Popover.Trigger>
                              <button type="button" className="storage-overview__info" aria-label={c.browserStorage}>
                                <Info aria-hidden="true" size={12} />
                              </button>
                            </Popover.Trigger>
                            <Popover.Content placement="top" className="storage-overview__info-popover">
                              <p>{c.browserStorageInfo}</p>
                            </Popover.Content>
                          </Popover>
                        </div>
                        <strong>
                          {browserStorage
                            ? `${formatAudioFileSize(browserStorage.usage)} / ${formatAudioFileSize(browserStorage.quota)}`
                            : c.storageUnavailable}
                        </strong>
                      </div>
                    </div>
                    {browserStorage ? (
                      <div className="storage-meter" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.min(100, (browserStorage.usage / browserStorage.quota) * 100)}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  {managementError ? (
                    <p className="management-empty">{c.storageUnavailable}</p>
                  ) : storageUsage.length === 0 && !isLoadingManagement ? (
                    <p className="management-empty">{c.noProjectStorage}</p>
                  ) : (
                    <div className="project-storage-list">
                      {storageUsage.map((usage) => (
                        <article key={usage.projectId} className="project-storage-item">
                          <div className="project-storage-item__main">
                            <strong>{projectNames.get(usage.projectId) ?? c.untitled}</strong>
                            <span>{formatAudioFileSize(usage.totalBytes)}</span>
                          </div>
                          <div className="project-storage-item__detail">
                            <span>{c.currentData} {formatAudioFileSize(usage.currentBytes)}</span>
                            <span>
                              {c.historyData} {formatAudioFileSize(usage.historyBytes)} · {usage.historyCount} {c.historyCount}
                            </span>
                          </div>
                          {usage.historyCount > 0 ? (
                            pendingCleanupProjectId === usage.projectId ? (
                              <div className="project-storage-item__actions">
                                <Button
                                  className="wiki-button wiki-button--neutral"
                                  onPress={() => setPendingCleanupProjectId(null)}
                                >
                                  {c.keepData}
                                </Button>
                                <Button
                                  className="wiki-button management-danger-button"
                                  onPress={() => void clearProjectHistory(usage.projectId)}
                                >
                                  {c.confirmClear}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                className="wiki-button wiki-button--neutral project-storage-item__cleanup"
                                onPress={() => setPendingCleanupProjectId(usage.projectId)}
                              >
                                <Trash2 aria-hidden="true" size={14} />
                                {c.clearHistory}
                              </Button>
                            )
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="settings-section">
                  <div className="settings-section__heading">
                    <Gauge aria-hidden="true" size={18} />
                    <h3>{c.ffmpeg}</h3>
                  </div>
                  <div className="setting-row setting-row--source">
                    <div className="min-w-0">
                      <p className="setting-row__label">{c.downloadSource}</p>
                      <p className="setting-row__value">{selectedSource}</p>
                    </div>

                    <Modal>
                      <Button className="wiki-button wiki-button--neutral" onPress={probeSources}>
                        {c.change}
                      </Button>
                      <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
                        <Modal.Container size="lg" scroll="inside">
                          <Modal.Dialog className="wiki-modal source-modal sm:max-w-[920px]">
                            <Modal.CloseTrigger className="wiki-modal__close" />
                            <Modal.Header className="wiki-modal__header">
                              <Modal.Icon className="wiki-modal__icon">
                                <Download aria-hidden="true" size={20} />
                              </Modal.Icon>
                              <div>
                                <Modal.Heading className="wiki-modal__heading">{c.sourceTitle}</Modal.Heading>
                                <p className="wiki-modal__description">{c.sourceDescription}</p>
                              </div>
                            </Modal.Header>
                            <Modal.Body className="wiki-modal__body">
                              <div className="source-list__header" aria-hidden="true">
                                <span>{c.address}</span>
                                <span>{c.latency}</span>
                                <span>{c.availability}</span>
                              </div>
                              <div className="source-list" role="radiogroup" aria-label={c.downloadSource}>
                                {FFMPEG_SOURCES.map((source) => {
                                  const result = probeResults[source];
                                  const isSelected = candidateSource === source;
                                  return (
                                    <button
                                      key={source}
                                      type="button"
                                      role="radio"
                                      aria-checked={isSelected}
                                      className="source-option"
                                      disabled={result?.available === false}
                                      onClick={() => setCandidateSource(source)}
                                    >
                                      <span className="source-option__radio">
                                        {isSelected ? <span /> : null}
                                      </span>
                                      <span className="source-option__url">{source}</span>
                                      <span className="source-option__latency">
                                        {result?.latency !== null && result?.latency !== undefined
                                          ? `${result.latency} ms`
                                          : isProbing && !result
                                            ? c.checking
                                            : c.waiting}
                                      </span>
                                      <span
                                        className={`source-option__status ${
                                          result?.available === true
                                            ? "is-available"
                                            : result?.available === false
                                              ? "is-unavailable"
                                              : ""
                                        }`}
                                      >
                                        {result?.available === true
                                          ? c.available
                                          : result?.available === false
                                            ? c.unavailable
                                            : c.checking}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </Modal.Body>
                            <Modal.Footer className="wiki-modal__footer">
                              <Button slot="close" className="wiki-button wiki-button--neutral">
                                {c.cancel}
                              </Button>
                              <Button
                                slot="close"
                                className="wiki-button wiki-button--primary"
                                isDisabled={!candidateSource && !fastestSource}
                                onPress={confirmSource}
                              >
                                {candidateSource ? c.confirmChange : c.autoSelect}
                              </Button>
                            </Modal.Footer>
                          </Modal.Dialog>
                        </Modal.Container>
                      </Modal.Backdrop>
                    </Modal>
                  </div>
                </section>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </>
    </div>
  );
}

function ProjectVersionHistoryModal({
  project,
  language,
  onClose,
  onRestore,
}: {
  project: Project;
  language: Language;
  onClose: () => void;
  onRestore: (snapshot: PersistedProjectVersion) => Promise<void>;
}) {
  const c = COPY[language];
  const [snapshots, setSnapshots] = useState<PersistedProjectVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(null);
  const [pendingDeleteSnapshotId, setPendingDeleteSnapshotId] = useState<string | null>(null);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);
  const isBusy = restoringSnapshotId !== null || deletingSnapshotId !== null;

  useEffect(() => {
    let ignore = false;
    void listProjectVersionSnapshots(project.id)
      .then((items) => {
        if (!ignore) setSnapshots(items);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [project.id]);

  async function restoreVersion(snapshot: PersistedProjectVersion) {
    setRestoringSnapshotId(snapshot.snapshotId);
    setActionError(false);
    try {
      await onRestore(snapshot);
      onClose();
    } catch {
      setActionError(true);
      setRestoringSnapshotId(null);
    }
  }

  async function deleteVersion(snapshotId: string) {
    setDeletingSnapshotId(snapshotId);
    setActionError(false);
    try {
      await deleteProjectVersionSnapshot(snapshotId);
      setSnapshots((current) => current.filter((snapshot) => snapshot.snapshotId !== snapshotId));
      setPendingDeleteSnapshotId(null);
    } catch {
      setActionError(true);
    } finally {
      setDeletingSnapshotId(null);
    }
  }

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !isBusy) onClose();
      }}
      className="wiki-modal-backdrop"
      variant="opaque"
    >
      <Modal.Container size="md" scroll="inside">
        <Modal.Dialog className="wiki-modal version-history-modal sm:max-w-[680px]">
          <Modal.CloseTrigger
            className="wiki-modal__close"
            isDisabled={isBusy}
          />
          <Modal.Header className="wiki-modal__header">
            <Modal.Icon className="wiki-modal__icon">
              <History aria-hidden="true" size={20} />
            </Modal.Icon>
            <div className="min-w-0">
              <Modal.Heading className="wiki-modal__heading">{c.versionManagement}</Modal.Heading>
              <p className="wiki-modal__description">{project.name}</p>
            </div>
          </Modal.Header>
          <Modal.Body className="wiki-modal__body version-history-modal__body">
            <article className="version-history-item version-history-item--current">
              <div>
                <strong>{formatProjectVersionTag(project.version, project.releaseChannel)}</strong>
                <span>{c.currentVersion}</span>
                <small>
                  {formatProjectDate(project.updatedAt, language)} · {project.soundCount} {c.sounds}
                </small>
              </div>
              <Check aria-hidden="true" size={17} />
            </article>

            <div className="version-history-block">
              <div className="version-history-block__header">
                <strong>{c.historyVersions}</strong>
                <span>{snapshots.length}</span>
              </div>
              {actionError ? (
                <p className="version-history-error" role="alert">{c.versionActionFailed}</p>
              ) : null}
              {isLoading ? (
                <div className="management-empty">
                  <LoaderCircle aria-hidden="true" className="export-spinner" size={18} />
                </div>
              ) : loadError ? (
                <p className="management-empty" role="alert">{c.versionHistoryUnavailable}</p>
              ) : snapshots.length === 0 ? (
                <p className="management-empty">{c.noHistoryVersions}</p>
              ) : (
                <div className="version-history-list">
                  {snapshots.map((snapshot) => (
                    <article key={snapshot.snapshotId} className="version-history-item">
                      <div>
                        <strong>{snapshot.versionTag}</strong>
                        <span>{snapshot.project.name}</span>
                        <small>
                          {formatProjectDate(snapshot.createdAt, language)} · {formatAudioFileSize(
                            snapshot.workspace.audioFiles.reduce(
                              (total, audio) => total + audio.blob.size,
                              0,
                            ),
                          )}
                        </small>
                      </div>
                      <div className="version-history-item__actions">
                        {pendingDeleteSnapshotId === snapshot.snapshotId ? (
                          <>
                            <Button
                              className="wiki-button wiki-button--neutral"
                              isDisabled={isBusy}
                              onPress={() => setPendingDeleteSnapshotId(null)}
                            >
                              {c.cancel}
                            </Button>
                            <Button
                              className="wiki-button management-danger-button"
                              isDisabled={isBusy}
                              onPress={() => void deleteVersion(snapshot.snapshotId)}
                            >
                              {deletingSnapshotId === snapshot.snapshotId ? (
                                <LoaderCircle aria-hidden="true" className="export-spinner" size={14} />
                              ) : (
                                <Trash2 aria-hidden="true" size={14} />
                              )}
                              {c.confirmDeleteVersion}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              className="wiki-button wiki-button--neutral"
                              isDisabled={isBusy}
                              onPress={() => void restoreVersion(snapshot)}
                            >
                              {restoringSnapshotId === snapshot.snapshotId ? (
                                <LoaderCircle aria-hidden="true" className="export-spinner" size={14} />
                              ) : (
                                <RefreshCcw aria-hidden="true" size={14} />
                              )}
                              {c.restoreVersion}
                            </Button>
                            <Button
                              className="wiki-button management-danger-button"
                              isDisabled={isBusy}
                              onPress={() => {
                                setActionError(false);
                                setPendingDeleteSnapshotId(snapshot.snapshotId);
                              }}
                            >
                              <Trash2 aria-hidden="true" size={14} />
                              {c.deleteVersion}
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function Brand() {
  return (
    <div className="mcsd-brand" aria-label="MCSD2">
      <span className="mcsd-brand__mark">
        <WaveformIcon aria-hidden="true" size={25} weight="bold" />
      </span>
      <span className="mcsd-brand__wordmark">MCSD2</span>
    </div>
  );
}

function ProjectCover({ iconDataUrl, name }: { iconDataUrl?: string | null; name: string }) {
  return (
    <div className="project-cover" aria-hidden="true">
      {iconDataUrl ? (
        <Image
          className="project-cover__image"
          src={iconDataUrl}
          alt=""
          width={128}
          height={128}
          unoptimized
        />
      ) : (
        <div className="project-cover__disc" title={name} />
      )}
      <div className="project-cover__wave">
        {WAVEFORM.slice(0, 11).map((height, index) => (
          <span key={`${height}-${index}`} style={{ height: `${Math.max(18, height - 10)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function DesktopWorkspace() {
  const isMobileWorkspace = useSyncExternalStore(
    subscribeMobileWorkspace,
    getMobileWorkspaceSnapshot,
    getMobileWorkspaceServerSnapshot,
  );
  const [view, setView] = useState<View>("home");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"day" | "night">("day");
  const [language, setLanguage] = useState<Language>("zh");
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [showComplianceInfo, setShowComplianceInfo] = useState(true);
  const [versionIncrementLimit, setVersionIncrementLimit] = useState(
    DEFAULT_VERSION_INCREMENT_LIMIT,
  );
  const [autoSaveVersionHistory, setAutoSaveVersionHistory] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string>(DEFAULT_SOURCE);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [eventEditorMode, setEventEditorMode] = useState<EventEditorMode>("novice");
  const [hasOpenedAdvancedEditor, setHasOpenedAdvancedEditor] = useState(false);
  const [audioFiles, setAudioFiles] = useState<WorkspaceAudioFile[]>([]);
  const [customEventSuffixes, setCustomEventSuffixes] = useState<Record<string, string>>({});
  const [customEventNames, setCustomEventNames] = useState<string[]>([]);
  const [audioEventBindings, setAudioEventBindings] = useState<Record<string, string[]>>({});
  const [audioEventWeights, setAudioEventWeights] = useState<AudioEventWeights>({});
  const [audioSubtitles, setAudioSubtitles] = useState<Record<string, string>>({});
  const [audioPage, setAudioPage] = useState(1);
  const [isAudioDragging, setIsAudioDragging] = useState(false);
  const [previewingAudioId, setPreviewingAudioId] = useState<string | null>(null);
  const [previewLoadingAudioId, setPreviewLoadingAudioId] = useState<string | null>(null);
  const [previewErrorAudioId, setPreviewErrorAudioId] = useState<string | null>(null);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [preparingAudioId, setPreparingAudioId] = useState<string | null>(null);
  const [preparingAudioIndex, setPreparingAudioIndex] = useState(0);
  const [audioConversionProgress, setAudioConversionProgress] = useState(0);
  const [audioPreparationError, setAudioPreparationError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [workspaceStorageReady, setWorkspaceStorageReady] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [managingVersionsProjectId, setManagingVersionsProjectId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<{ id: string; audio: HTMLAudioElement; url: string } | null>(null);
  const workspaceLoadRequestRef = useRef(0);
  const detectedImportRef = useRef<{
    file: File;
    imported: Awaited<ReturnType<typeof readAudioPackArchive>>;
  } | null>(null);
  const importInFlightRef = useRef(false);
  const c = COPY[language];
  const visibleEventEditorMode = isMobileWorkspace ? "novice" : eventEditorMode;

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      try {
        const rawSettings = window.localStorage.getItem("mcsd.settings.v0");
        const rawProjects = window.localStorage.getItem("mcsd.projects.v0");
        if (rawSettings) {
          const settings = JSON.parse(rawSettings) as {
            theme?: ThemePreference;
            language?: Language;
            motionEnabled?: boolean;
            selectedSource?: string;
            versionIncrementLimit?: number;
            autoSaveVersionHistory?: boolean;
            showComplianceInfo?: boolean;
          };
          if (settings.theme) setTheme(settings.theme);
          if (settings.language) setLanguage(settings.language);
          if (typeof settings.motionEnabled === "boolean") setMotionEnabled(settings.motionEnabled);
          if (typeof settings.showComplianceInfo === "boolean") {
            setShowComplianceInfo(settings.showComplianceInfo);
          }
          if (settings.selectedSource) setSelectedSource(settings.selectedSource);
          if (settings.versionIncrementLimit !== undefined) {
            setVersionIncrementLimit(
              normalizeVersionIncrementLimit(settings.versionIncrementLimit),
            );
          }
          if (typeof settings.autoSaveVersionHistory === "boolean") {
            setAutoSaveVersionHistory(settings.autoSaveVersionHistory);
          }
        }
        if (rawProjects) setProjects(JSON.parse(rawProjects) as Project[]);
      } catch {
        window.localStorage.removeItem("mcsd.settings.v0");
        window.localStorage.removeItem("mcsd.projects.v0");
      } finally {
        setHasHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem(
      "mcsd.settings.v0",
      JSON.stringify({
        theme,
        language,
        motionEnabled,
        showComplianceInfo,
        selectedSource,
        versionIncrementLimit,
        autoSaveVersionHistory,
      }),
    );
  }, [
    autoSaveVersionHistory,
    hasHydrated,
    language,
    motionEnabled,
    selectedSource,
    showComplianceInfo,
    theme,
    versionIncrementLimit,
  ]);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem("mcsd.projects.v0", JSON.stringify(projects));
  }, [hasHydrated, projects]);

  useEffect(() => {
    if (!hasHydrated || !workspaceStorageReady || !selectedProjectId) return;
    const saveTask = window.setTimeout(() => {
      void saveProjectWorkspace({
        projectId: selectedProjectId,
        schemaVersion: 1,
        updatedAt: Date.now(),
        activeStep,
        eventEditorMode,
        audioFiles: audioFiles.map(persistWorkspaceAudio),
        customEventSuffixes,
        customEventNames,
        audioEventBindings,
        audioEventWeights,
        audioSubtitles,
      }).catch(() => undefined);
    }, 300);

    return () => window.clearTimeout(saveTask);
  }, [
    activeStep,
    audioEventBindings,
    audioEventWeights,
    audioSubtitles,
    audioFiles,
    customEventSuffixes,
    customEventNames,
    eventEditorMode,
    hasHydrated,
    selectedProjectId,
    workspaceStorageReady,
  ]);

  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => setResolvedTheme(theme === "system" ? (colorScheme.matches ? "night" : "day") : theme);
    updateTheme();
    colorScheme.addEventListener("change", updateTheme);
    return () => colorScheme.removeEventListener("change", updateTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.mcsdColorMode = resolvedTheme;
    return () => {
      delete document.documentElement.dataset.mcsdColorMode;
    };
  }, [resolvedTheme]);

  useEffect(() => {
    const largeScreen = window.matchMedia("(min-width: 1440px)");
    const updatePageSize = () => setPageSize(largeScreen.matches ? 50 : 10);
    updatePageSize();
    largeScreen.addEventListener("change", updatePageSize);
    return () => largeScreen.removeEventListener("change", updatePageSize);
  }, []);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const currentProjectContentFingerprint = useMemo(() => {
    if (!selectedProject || !selectedProjectId) return null;
    return createVersionBaseline(selectedProject, {
      projectId: selectedProjectId,
      schemaVersion: 1,
      updatedAt: 0,
      activeStep: 0,
      eventEditorMode: "novice",
      audioFiles: audioFiles.map(persistWorkspaceAudio),
      customEventSuffixes,
      customEventNames,
      audioEventBindings,
      audioEventWeights,
      audioSubtitles,
    });
  }, [
    audioEventBindings,
    audioEventWeights,
    audioFiles,
    audioSubtitles,
    customEventSuffixes,
    customEventNames,
    selectedProject,
    selectedProjectId,
  ]);
  const hasCurrentProjectChanges = Boolean(
    selectedProject?.versionBaseline
      && currentProjectContentFingerprint
      && selectedProject.versionBaseline !== currentProjectContentFingerprint,
  );
  const editingProject = projects.find((project) => project.id === editingProjectId);
  const managingVersionsProject = projects.find(
    (project) => project.id === managingVersionsProjectId,
  );
  const totalPages = Math.max(1, Math.ceil(projects.length / pageSize));
  const visibleProjects = projects.slice((page - 1) * pageSize, page * pageSize);
  const audioTotalPages = Math.max(1, Math.ceil(audioFiles.length / 10));
  const visibleAudioFiles = audioFiles.slice((audioPage - 1) * 10, audioPage * 10);

  const releaseAudioPreview = useCallback(() => {
    const current = audioPreviewRef.current;
    if (!current) return;
    audioPreviewRef.current = null;
    current.audio.onplaying = null;
    current.audio.onwaiting = null;
    current.audio.onended = null;
    current.audio.onerror = null;
    current.audio.pause();
    current.audio.removeAttribute("src");
    current.audio.load();
    URL.revokeObjectURL(current.url);
  }, []);

  const stopAudioPreview = useCallback(() => {
    releaseAudioPreview();
    setPreviewingAudioId(null);
    setPreviewLoadingAudioId(null);
  }, [releaseAudioPreview]);

  useEffect(() => {
    return () => releaseAudioPreview();
  }, [releaseAudioPreview]);

  const toggleAudioPreview = useCallback(async (item: WorkspaceAudioFile) => {
    const current = audioPreviewRef.current;
    setPreviewErrorAudioId(null);

    if (current?.id === item.id) {
      if (!current.audio.paused) {
        current.audio.pause();
        setPreviewingAudioId(null);
        setPreviewLoadingAudioId(null);
        return;
      }
      setPreviewLoadingAudioId(item.id);
      try {
        await current.audio.play();
        setPreviewingAudioId(item.id);
        setPreviewLoadingAudioId(null);
      } catch {
        stopAudioPreview();
        setPreviewErrorAudioId(item.id);
      }
      return;
    }

    stopAudioPreview();
    const url = URL.createObjectURL(item.file);
    const audio = new Audio(url);
    audio.preload = "auto";
    audioPreviewRef.current = { id: item.id, audio, url };
    setPreviewLoadingAudioId(item.id);

    audio.onplaying = () => {
      if (audioPreviewRef.current?.audio !== audio) return;
      setPreviewingAudioId(item.id);
      setPreviewLoadingAudioId(null);
    };
    audio.onwaiting = () => {
      if (audioPreviewRef.current?.audio === audio) setPreviewLoadingAudioId(item.id);
    };
    audio.onended = () => {
      if (audioPreviewRef.current?.audio === audio) stopAudioPreview();
    };
    audio.onerror = () => {
      if (audioPreviewRef.current?.audio !== audio) return;
      stopAudioPreview();
      setPreviewErrorAudioId(item.id);
    };

    try {
      await audio.play();
    } catch {
      if (audioPreviewRef.current?.audio === audio) {
        stopAudioPreview();
        setPreviewErrorAudioId(item.id);
      }
    }
  }, [stopAudioPreview]);

  const previewAudioById = useCallback(
    (audioId: string) => {
      const audio = audioFiles.find((item) => item.id === audioId);
      if (audio) void toggleAudioPreview(audio);
    },
    [audioFiles, toggleAudioPreview],
  );

  const persistCurrentWorkspace = useCallback(() => {
    if (!hasHydrated || !workspaceStorageReady || !selectedProjectId) return;
    void saveProjectWorkspace({
      projectId: selectedProjectId,
      schemaVersion: 1,
      updatedAt: Date.now(),
      activeStep,
      eventEditorMode,
      audioFiles: audioFiles.map(persistWorkspaceAudio),
      customEventSuffixes,
      customEventNames,
      audioEventBindings,
      audioEventWeights,
      audioSubtitles,
    }).catch(() => undefined);
  }, [
    activeStep,
    audioEventBindings,
    audioEventWeights,
    audioSubtitles,
    audioFiles,
    customEventSuffixes,
    customEventNames,
    eventEditorMode,
    hasHydrated,
    selectedProjectId,
    workspaceStorageReady,
  ]);

  useEffect(() => {
    window.addEventListener("pagehide", persistCurrentWorkspace);
    return () => window.removeEventListener("pagehide", persistCurrentWorkspace);
  }, [persistCurrentWorkspace]);

  function buildCurrentWorkspace(projectId: string): PersistedProjectWorkspace {
    return {
      projectId,
      schemaVersion: 1,
      updatedAt: Date.now(),
      activeStep,
      eventEditorMode,
      audioFiles: audioFiles.map(persistWorkspaceAudio),
      customEventSuffixes,
      customEventNames,
      audioEventBindings,
      audioEventWeights,
      audioSubtitles,
    };
  }

  async function saveProjectHistory(project: Project) {
    const storedWorkspace = project.id === selectedProjectId && workspaceStorageReady
      ? buildCurrentWorkspace(project.id)
      : await loadProjectWorkspace(project.id);
    const workspace = storedWorkspace ?? createEmptyProjectWorkspace(project.id);

    const version = project.version ?? DEFAULT_PROJECT_VERSION;
    const releaseChannel = project.releaseChannel ?? DEFAULT_RELEASE_CHANNEL;
    const versionTag = formatProjectVersionTag(version, releaseChannel);
    await saveProjectVersionSnapshot({
      snapshotId: `${project.id}:${versionTag}`,
      projectId: project.id,
      versionTag,
      createdAt: Date.now(),
      project: getProjectVersionMetadata(project),
      workspace,
    });
  }

  async function restoreProjectVersion(snapshot: PersistedProjectVersion) {
    const currentProject = projects.find((project) => project.id === snapshot.projectId);
    if (!currentProject) return;

    persistCurrentWorkspace();
    if (autoSaveVersionHistory) await saveProjectHistory(currentProject);
    const projectSnapshots = await listProjectVersionSnapshots(snapshot.projectId);
    const latestVersion = getLatestProjectVersion([
      currentProject.latestVersion,
      currentProject.version,
      ...projectSnapshots.map((item) => item.project.version),
    ]);

    const restoredWorkspace: PersistedProjectWorkspace = {
      ...snapshot.workspace,
      projectId: snapshot.projectId,
      updatedAt: Date.now(),
    };
    await saveProjectWorkspace(restoredWorkspace);

    const restoredAudio = restoredWorkspace.audioFiles.map(restoreWorkspaceAudio);
    const restoredProject: Project = {
      ...currentProject,
      ...snapshot.project,
      version: snapshot.project.version,
      releaseChannel: snapshot.project.releaseChannel,
      latestVersion,
      soundCount: restoredAudio.length,
      updatedAt: Date.now(),
    };
    restoredProject.versionBaseline = createVersionBaseline(restoredProject, restoredWorkspace);
    workspaceLoadRequestRef.current += 1;
    setWorkspaceStorageReady(false);
    stopAudioPreview();
    setProjects((current) =>
      current.map((project) =>
        project.id === snapshot.projectId
          ? restoredProject
          : project,
      ),
    );
    setSelectedProjectId(snapshot.projectId);
    setAudioFiles(restoredAudio);
    setCustomEventSuffixes(restoredWorkspace.customEventSuffixes);
    setCustomEventNames(restoredWorkspace.customEventNames ?? deriveCustomEventNames(restoredWorkspace.customEventSuffixes, restoredWorkspace.audioEventBindings));
    setAudioEventBindings(restoredWorkspace.audioEventBindings);
    setAudioEventWeights(restoredWorkspace.audioEventWeights ?? {});
    setAudioSubtitles(restoredWorkspace.audioSubtitles ?? {});
    setActiveStep(Math.max(0, Math.min(2, restoredWorkspace.activeStep)));
    setEventEditorMode(restoredWorkspace.eventEditorMode);
    setHasOpenedAdvancedEditor(restoredWorkspace.eventEditorMode === "advanced");
    setAudioPreparationError(null);
    setIsPreparingAudio(false);
    setAudioPage(1);
    setView("workspace");
    setWorkspaceStorageReady(true);
  }

  function createProject(data: NewProjectData) {
    persistCurrentWorkspace();
    const timestamp = Date.now();
    const project: Project = {
      id: `project-${timestamp}`,
      name: data.name,
      soundCount: 0,
      updatedAt: timestamp,
      key: data.key,
      description: data.description,
      platform: data.platform,
      javaPackFormat: data.javaPackFormat,
      gameVersion: data.gameVersion,
      iconDataUrl: data.iconDataUrl,
      version: data.version,
      releaseChannel: data.releaseChannel,
      latestVersion: data.version,
    };
    project.versionBaseline = createVersionBaseline(
      project,
      createEmptyProjectWorkspace(project.id),
    );
    setProjects((current) => [project, ...current]);
    workspaceLoadRequestRef.current += 1;
    setWorkspaceStorageReady(false);
    setSelectedProjectId(project.id);
    stopAudioPreview();
    setAudioFiles([]);
    setCustomEventSuffixes({});
    setCustomEventNames([]);
    setAudioEventBindings({});
    setAudioEventWeights({});
    setAudioSubtitles({});
    setAudioPreparationError(null);
    setIsPreparingAudio(false);
    setAudioPage(1);
    setActiveStep(0);
    setEventEditorMode("novice");
    setHasOpenedAdvancedEditor(false);
    setView("workspace");
    setWorkspaceStorageReady(true);
  }

  const detectProject: OnDetectAudioPack = async (file, onProgress) => {
    detectedImportRef.current = null;
    try {
      const imported = await readAudioPackArchive(file, onProgress);
      detectedImportRef.current = { file, imported };
      const project = imported.project;
      if (!project) return false;
      return {
        platform: project.platform,
        version: project.version,
        releaseChannel: project.releaseChannel,
        isMcsdPack: Boolean(imported.manifest),
        hasMainKey: imported.hasMainKey,
        mainKey: imported.mainKey,
        javaPackFormat: project.javaPackFormat || undefined,
        gameVersion: getDetectedGameVersion(project.platform, project.javaPackFormat),
      } satisfies ImportDetectedPack;
    } catch (error) {
      setAudioPreparationError(error instanceof Error ? error.message : "无法读取音频包。");
      return false;
    }
  };

  async function importProject(
    file: File,
    onProgress?: (progress: ImportPackProgress) => void,
    options?: ImportPackOptions,
  ) {
    if (importInFlightRef.current) return false;
    importInFlightRef.current = true;
    let imported: Awaited<ReturnType<typeof readAudioPackArchive>>;
    try {
      const detectedImport = detectedImportRef.current;
      if (detectedImport?.file === file) {
        imported = detectedImport.imported;
        onProgress?.({ phase: "finalizing", percent: 92, detected: {
          platform: imported.project?.platform ?? "java",
          version: imported.project?.version ?? DEFAULT_PROJECT_VERSION,
          releaseChannel: imported.project?.releaseChannel ?? DEFAULT_RELEASE_CHANNEL,
          isMcsdPack: Boolean(imported.manifest),
          hasMainKey: imported.hasMainKey,
          mainKey: imported.mainKey,
          javaPackFormat: imported.project?.javaPackFormat || undefined,
          gameVersion: getDetectedGameVersion(
            imported.project?.platform ?? "java",
            imported.project?.javaPackFormat,
          ),
        } });
      } else {
        imported = await readAudioPackArchive(file, onProgress);
      }
    } catch (error) {
      setAudioPreparationError(error instanceof Error ? error.message : "无法读取音频包。");
      importInFlightRef.current = false;
      return false;
    }

    if (options?.convertToMcsd && !imported.manifest) {
      imported = {
        ...imported,
        workspace: convertImportedWorkspaceToMcsd(
          imported.workspace,
          imported.project?.platform ?? "java",
        ),
      };
    }

    persistCurrentWorkspace();
    const timestamp = Date.now();
    const extensionIndex = file.name.lastIndexOf(".");
    const fileBaseName = extensionIndex > 0 ? file.name.slice(0, extensionIndex) : file.name;
    const importedMainKey = options?.mainKey === null
      ? ""
      : options?.mainKey?.trim() || imported.project?.key || "";
    const project: Project = {
      id: `project-${timestamp}`,
      name: imported.project?.name?.trim() || fileBaseName.trim().slice(0, 10) || c.untitled,
      soundCount: 0,
      updatedAt: timestamp,
      key: importedMainKey,
      description: imported.project?.description || "",
      platform: imported.project?.platform || "java",
      javaPackFormat: imported.project?.javaPackFormat || "",
      gameVersion: getDetectedGameVersion(
        imported.project?.platform ?? "java",
        imported.project?.javaPackFormat,
      ) ?? "",
      iconDataUrl: imported.iconDataUrl,
      version: imported.project?.version || DEFAULT_PROJECT_VERSION,
      releaseChannel: imported.project?.releaseChannel || DEFAULT_RELEASE_CHANNEL,
      latestVersion: imported.project?.version || DEFAULT_PROJECT_VERSION,
    };
    imported.workspace = {
      ...imported.workspace,
      projectId: project.id,
      updatedAt: timestamp,
    };
    project.versionBaseline = createVersionBaseline(project, imported.workspace);
    try {
      onProgress?.({ phase: "finalizing", percent: 96 });
      await saveProjectWorkspace(imported.workspace);
      project.soundCount = imported.workspace.audioFiles.length;
      setProjects((current) => [project, ...current]);
      workspaceLoadRequestRef.current += 1;
      setWorkspaceStorageReady(false);
      setSelectedProjectId(project.id);
      stopAudioPreview();
      setAudioFiles(imported.workspace.audioFiles.map(restoreWorkspaceAudio));
      setCustomEventSuffixes(imported.workspace.customEventSuffixes);
      setCustomEventNames(imported.workspace.customEventNames ?? deriveCustomEventNames(imported.workspace.customEventSuffixes, imported.workspace.audioEventBindings));
      setAudioEventBindings(imported.workspace.audioEventBindings);
      setAudioEventWeights(imported.workspace.audioEventWeights ?? {});
      setAudioSubtitles(imported.workspace.audioSubtitles ?? {});
      setAudioPreparationError(null);
      setIsPreparingAudio(false);
      setAudioPage(1);
      setActiveStep(Math.max(0, Math.min(2, imported.workspace.activeStep)));
      setEventEditorMode("novice");
      setHasOpenedAdvancedEditor(false);
      setWorkspaceStorageReady(true);
      onProgress?.({ phase: "finalizing", percent: 100 });
      detectedImportRef.current = null;
      return true;
    } catch (error) {
      setAudioPreparationError(error instanceof Error ? error.message : "无法保存音频包。");
      return false;
    } finally {
      importInFlightRef.current = false;
    }
  }

  function openProject(project: Project) {
    persistCurrentWorkspace();
    const loadRequest = workspaceLoadRequestRef.current + 1;
    workspaceLoadRequestRef.current = loadRequest;
    setWorkspaceStorageReady(false);
    setSelectedProjectId(project.id);
    stopAudioPreview();
    setAudioFiles([]);
    setCustomEventSuffixes({});
    setCustomEventNames([]);
    setAudioEventBindings({});
    setAudioEventWeights({});
    setAudioSubtitles({});
    setAudioPreparationError(null);
    setIsPreparingAudio(false);
    setAudioPage(1);
    setActiveStep(0);
    setEventEditorMode("novice");
    setHasOpenedAdvancedEditor(false);
    setView("workspace");

    void loadProjectWorkspace(project.id)
      .then((workspace) => {
        if (workspaceLoadRequestRef.current !== loadRequest) return;
        const baselineWorkspace = workspace ?? createEmptyProjectWorkspace(project.id);
        const versionBaseline = project.versionBaseline
          ?? createVersionBaseline(project, baselineWorkspace);
        const latestVersion = project.latestVersion
          ?? getLatestProjectVersion([project.version]);
        if (!workspace) {
          setProjects((current) =>
            current.map((item) =>
              item.id === project.id && (!item.versionBaseline || !item.latestVersion)
                ? {
                    ...item,
                    versionBaseline: item.versionBaseline ?? versionBaseline,
                    latestVersion: item.latestVersion ?? latestVersion,
                  }
                : item,
            ),
          );
          return;
        }
        const restoredAudio = workspace.audioFiles.map(restoreWorkspaceAudio);
        setAudioFiles(restoredAudio);
        setCustomEventSuffixes(workspace.customEventSuffixes);
        setCustomEventNames(workspace.customEventNames ?? deriveCustomEventNames(workspace.customEventSuffixes, workspace.audioEventBindings));
        setAudioEventBindings(workspace.audioEventBindings);
        setAudioEventWeights(workspace.audioEventWeights ?? {});
        setAudioSubtitles(workspace.audioSubtitles ?? {});
        setActiveStep(Math.max(0, Math.min(2, workspace.activeStep)));
        setEventEditorMode(workspace.eventEditorMode);
        setHasOpenedAdvancedEditor(workspace.eventEditorMode === "advanced");
        setAudioPage(1);
        setProjects((current) =>
          current.map((item) =>
            item.id === project.id
              ? {
                  ...item,
                  soundCount: restoredAudio.length,
                  updatedAt: Math.max(item.updatedAt, workspace.updatedAt),
                  versionBaseline: item.versionBaseline ?? versionBaseline,
                  latestVersion: item.latestVersion ?? latestVersion,
                }
              : item,
          ),
        );
        const filesNeedingAnalysis = restoredAudio.filter(
          (item) =>
            item.analysisStatus === "analyzing" ||
            !item.codec ||
            !item.sampleRate ||
            !item.channels,
        );
        if (filesNeedingAnalysis.length > 0) void analyzeAudioFiles(filesNeedingAnalysis);
      })
      .catch(() => {
        if (
          workspaceLoadRequestRef.current !== loadRequest
          || (project.versionBaseline && project.latestVersion)
        ) return;
        const versionBaseline = createVersionBaseline(
          project,
          createEmptyProjectWorkspace(project.id),
        );
        const latestVersion = getLatestProjectVersion([
          project.latestVersion,
          project.version,
        ]);
        setProjects((current) =>
          current.map((item) =>
            item.id === project.id && (!item.versionBaseline || !item.latestVersion)
              ? {
                  ...item,
                  versionBaseline: item.versionBaseline ?? versionBaseline,
                  latestVersion: item.latestVersion ?? latestVersion,
                }
              : item,
          ),
        );
      })
      .finally(() => {
        if (workspaceLoadRequestRef.current === loadRequest) setWorkspaceStorageReady(true);
      });
  }

  function handleFiles(files: FileList | File[]) {
    if (!selectedProjectId || !workspaceStorageReady || isPreparingAudio) return;
    const acceptedFiles = Array.from(files).filter((file) =>
      file.type.startsWith("audio/") || /\.(ogg|wav|mp3|flac|m4a)$/i.test(file.name),
    );
    if (acceptedFiles.length === 0) return;
    const timestamp = Date.now();
    const usedKeys = new Set(audioFiles.map((item) => item.key));
    const nextItems: WorkspaceAudioFile[] = acceptedFiles.map((file, index) => ({
      id: `audio-${timestamp}-${index}`,
      file,
      originalName: file.name,
      name: file.name,
      key: createUniqueAudioKey(file.name, usedKeys),
      size: file.size,
      format: getAudioFormat(file.name),
      codec: null,
      codecLongName: null,
      bitRate: null,
      sampleRate: null,
      channels: null,
      duration: null,
      analysisStatus: "analyzing",
      conversionStatus: "idle",
    }));
    const nextCount = audioFiles.length + nextItems.length;
    setAudioPreparationError(null);
    setAudioFiles((current) => [...current, ...nextItems]);
    setCustomEventSuffixes((current) => {
      const next = { ...current };
      for (const item of nextItems) next[item.id] = item.key;
      return next;
    });
    setCustomEventNames((current) => Array.from(new Set([
      ...current,
      ...nextItems.map((item) => `mcsd.${item.key}`),
    ])));
    setAudioEventBindings((current) => {
      const next = { ...current };
      for (const item of nextItems) next[item.id] = [`mcsd.${item.key}`];
      return next;
    });
    setAudioSubtitles((current) => {
      const next = { ...current };
      for (const item of nextItems) next[item.id] = "";
      return next;
    });
    setAudioPage(Math.max(1, Math.ceil(nextCount / 10)));
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId
          ? { ...project, soundCount: nextCount, updatedAt: Date.now() }
          : project,
        ),
    );
    void analyzeAudioFiles(nextItems);
  }

  async function analyzeAudioFiles(items: WorkspaceAudioFile[]) {
    for (const item of items) {
      try {
        const probedMetadata = await ffmpeg.probeAudio(item.file);
        let decodedMetadata: Awaited<ReturnType<typeof decodeAudioMetadata>> | null = null;
        if (!probedMetadata.sampleRate || !probedMetadata.channels) {
          try {
            decodedMetadata = await decodeAudioMetadata(item.file);
          } catch {
            decodedMetadata = null;
          }
        }
        const metadata: AudioProbeResult = {
          ...probedMetadata,
          sampleRate: probedMetadata.sampleRate ?? decodedMetadata?.sampleRate ?? null,
          channels: probedMetadata.channels ?? decodedMetadata?.channels ?? null,
          duration: probedMetadata.duration ?? decodedMetadata?.duration ?? null,
        };
        setAudioFiles((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? {
                  ...currentItem,
                  codec: metadata.codec,
                  codecLongName: metadata.codecLongName,
                  bitRate: metadata.bitRate,
                  sampleRate: metadata.sampleRate,
                  channels: metadata.channels,
                  duration: metadata.duration,
                  analysisStatus: "ready",
                }
              : currentItem,
          ),
        );
      } catch {
        setAudioFiles((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, analysisStatus: "error" }
              : currentItem,
          ),
        );
      }
    }
  }

  async function prepareAudioFilesAndContinue() {
    if (audioFiles.length === 0 || isPreparingAudio) return;
    stopAudioPreview();
    setIsPreparingAudio(true);
    setAudioPreparationError(null);
    setPreparingAudioIndex(0);
    setAudioConversionProgress(0);
    setAudioFiles((current) =>
      current.map((item) =>
        item.conversionStatus === "converted" || item.conversionStatus === "skipped"
          ? item
          : { ...item, name: item.key, conversionStatus: "queued" },
      ),
    );
    const unsubscribeProgress = ffmpeg.onProgress(setAudioConversionProgress);
    let failedAudioId: string | null = null;

    try {
      for (let index = 0; index < audioFiles.length; index += 1) {
        const item = audioFiles[index];
        if (
          !item ||
          item.conversionStatus === "converted" ||
          item.conversionStatus === "skipped"
        ) continue;
        failedAudioId = item.id;
        setPreparingAudioId(item.id);
        setPreparingAudioIndex(index + 1);
        setAudioPage(Math.floor(index / 10) + 1);
        setAudioConversionProgress(0);
        setAudioFiles((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, conversionStatus: "converting" }
              : currentItem,
          ),
        );

        let sourceMetadata: AudioProbeResult | null = item.analysisStatus === "ready" && item.codec
          ? {
              codec: item.codec,
              codecLongName: item.codecLongName ?? item.codec,
              bitRate: item.bitRate,
              sampleRate: item.sampleRate,
              channels: item.channels,
              duration: item.duration,
            }
          : null;
        if (!sourceMetadata) {
          try {
            sourceMetadata = await ffmpeg.probeAudio(item.file);
          } catch {
            sourceMetadata = null;
          }
        }
        const convertedName = `${item.key}.ogg`;

        if (sourceMetadata && isMinecraftAudioCompliant(item.format, sourceMetadata)) {
          const renamedFile = new File([item.file], convertedName, {
            type: "audio/ogg",
            lastModified: Date.now(),
          });
          setAudioConversionProgress(100);
          setAudioFiles((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    file: renamedFile,
                    name: convertedName,
                    size: renamedFile.size,
                    format: "OGG",
                    codec: sourceMetadata.codec,
                    codecLongName: sourceMetadata.codecLongName,
                    bitRate: sourceMetadata.bitRate,
                    sampleRate: sourceMetadata.sampleRate,
                    channels: sourceMetadata.channels,
                    duration: sourceMetadata.duration,
                    analysisStatus: "ready",
                    conversionStatus: "skipped",
                  }
                : currentItem,
            ),
          );
          failedAudioId = null;
          continue;
        }

        const converted = await ffmpeg.toOGG(item.file);
        URL.revokeObjectURL(converted.url);
        const convertedFile = new File([converted.blob], convertedName, {
          type: "audio/ogg",
          lastModified: Date.now(),
        });

        let metadata: AudioProbeResult | null = null;
        try {
          metadata = await ffmpeg.probeAudio(convertedFile);
        } catch {
          metadata = null;
        }
        const duration = metadata?.duration ?? item.duration;
        const estimatedBitRate = duration && duration > 0
          ? Math.round((convertedFile.size * 8) / duration)
          : null;

        setAudioFiles((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? {
                  ...currentItem,
                  file: convertedFile,
                  name: convertedName,
                  size: convertedFile.size,
                  format: "OGG",
                  codec: metadata?.codec ?? "vorbis",
                  codecLongName: metadata?.codecLongName ?? "Vorbis",
                  bitRate: metadata?.bitRate ?? estimatedBitRate,
                  sampleRate: metadata?.sampleRate ?? MINECRAFT_AUDIO_SAMPLE_RATE,
                  channels: metadata?.channels ?? MINECRAFT_AUDIO_CHANNELS,
                  duration,
                  analysisStatus: "ready",
                  conversionStatus: "converted",
                }
              : currentItem,
          ),
        );
        failedAudioId = null;
      }

      goToStep(1);
    } catch (error) {
      if (failedAudioId) {
        setAudioFiles((current) =>
          current.map((item) =>
            item.id === failedAudioId ? { ...item, conversionStatus: "error" } : item,
          ),
        );
      }
      const detail = error instanceof Error ? error.message : String(error);
      setAudioPreparationError(detail ? `${c.conversionFailed} ${detail}` : c.conversionFailed);
    } finally {
      unsubscribeProgress();
      setIsPreparingAudio(false);
      setPreparingAudioId(null);
      setAudioConversionProgress(0);
    }
  }

  function removeAudioFile(audioId: string) {
    if (isPreparingAudio) return;
    if (audioPreviewRef.current?.id === audioId) stopAudioPreview();
    if (previewErrorAudioId === audioId) setPreviewErrorAudioId(null);
    const nextAudioFiles = audioFiles.filter((item) => item.id !== audioId);
    setAudioPreparationError(null);
    setAudioFiles(nextAudioFiles);
    setCustomEventSuffixes((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
    setAudioEventBindings((current) => {
      const next: Record<string, string[]> = {};
      for (const [itemId, events] of Object.entries(current)) {
        if (itemId === audioId) continue;
        next[itemId] = events;
      }
      return next;
    });
    setAudioEventWeights((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
    setAudioSubtitles((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
    setAudioPage((current) => Math.min(current, Math.max(1, Math.ceil(nextAudioFiles.length / 10))));
    if (!selectedProjectId) return;
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId
          ? { ...project, soundCount: nextAudioFiles.length, updatedAt: Date.now() }
          : project,
      ),
    );
  }

  // 修改单个音频的 key。返回 null 表示成功，否则返回错误码（供 UI 展示提示）。
  function renameAudioKey(audioId: string, rawKey: string): string | null {
    if (isPreparingAudio) return null;
    const audio = audioFiles.find((item) => item.id === audioId);
    if (!audio) return null;

    const normalized = rawKey
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, MAX_AUDIO_KEY_LENGTH);

    if (!normalized) return "empty";
    if (normalized === audio.key) return null;

    const duplicate = audioFiles.some(
      (item) => item.id !== audioId && item.key === normalized,
    );
    if (duplicate) return "duplicate";

    const previousKey = audio.key;
    const previousSuffix = customEventSuffixes[audioId];

    setAudioFiles((current) =>
      current.map((item) =>
        item.id === audioId ? { ...item, key: normalized } : item,
      ),
    );

    // 默认事件名基于 key（mcsd.<key>）。若事件后缀仍等于旧 key（尚未被自定义），
    // 则让它跟随新 key，并联动更新事件名、绑定与权重。
    if (previousSuffix === previousKey) {
      const previousEventName = `mcsd.${previousKey}`;
      const nextEventName = `mcsd.${normalized}`;
      setCustomEventSuffixes((current) => ({ ...current, [audioId]: normalized }));
      setCustomEventNames((current) =>
        Array.from(new Set(current.map((eventName) =>
          eventName === previousEventName ? nextEventName : eventName,
        ))),
      );
      setAudioEventBindings((current) =>
        Object.fromEntries(
          Object.entries(current).map(([itemId, events]) => [
            itemId,
            Array.from(new Set(events.map((eventName) =>
              eventName === previousEventName ? nextEventName : eventName,
            ))),
          ]),
        ),
      );
      setAudioEventWeights((current) =>
        Object.fromEntries(
          Object.entries(current).map(([itemId, weights]) => {
            if (!(previousEventName in weights)) return [itemId, weights];
            const next = { ...weights, [nextEventName]: weights[previousEventName] };
            delete next[previousEventName];
            return [itemId, next];
          }),
        ),
      );
    }

    return null;
  }

  function goToStep(step: number) {
    stopAudioPreview();
    setActiveStep(step);
  }

  async function returnToFirstStep() {
    if (!selectedProjectId) return;
    const projectToIterate = projects.find((project) => project.id === selectedProjectId);
    if (!projectToIterate) return;
    const currentWorkspace = buildCurrentWorkspace(selectedProjectId);
    const currentBaseline = createVersionBaseline(projectToIterate, currentWorkspace);
    const hasContentChanges = hasCurrentProjectChanges;

    if (hasContentChanges) {
      if (autoSaveVersionHistory) await saveProjectHistory(projectToIterate);
      const projectSnapshots = await listProjectVersionSnapshots(selectedProjectId);
      const latestVersion = getLatestProjectVersion([
        projectToIterate.latestVersion,
        projectToIterate.version,
        ...projectSnapshots.map((snapshot) => snapshot.project.version),
      ]);
      const nextVersion = incrementProjectVersion(latestVersion, versionIncrementLimit);
      const nextProject: Project = {
        ...projectToIterate,
        version: nextVersion,
        latestVersion: nextVersion,
        updatedAt: Date.now(),
      };
      nextProject.versionBaseline = createVersionBaseline(nextProject, currentWorkspace);
      setProjects((current) =>
        current.map((project) => project.id === selectedProjectId ? nextProject : project),
      );
    } else if (!projectToIterate.versionBaseline || !projectToIterate.latestVersion) {
      setProjects((current) =>
        current.map((project) =>
          project.id === selectedProjectId
            ? {
                ...project,
                versionBaseline: project.versionBaseline ?? currentBaseline,
                latestVersion: project.latestVersion
                  ?? getLatestProjectVersion([project.version]),
              }
            : project,
        ),
      );
    }
    setAudioPreparationError(null);
    setAudioPage(1);
    goToStep(0);
  }

  const changeCustomEventSuffix = useCallback(
    (audioId: string, value: string) => {
      const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, MAX_AUDIO_KEY_LENGTH);
      const audio = audioFiles.find((item) => item.id === audioId);
      if (!audio) return;
      const isDuplicate = audioFiles.some(
        (item) =>
          item.id !== audioId &&
          (customEventSuffixes[item.id] ?? item.key) === normalized,
      );
      if (isDuplicate) return;
      const previousEventName = `mcsd.${customEventSuffixes[audioId] ?? audio.key}`;
      const nextEventName = `mcsd.${normalized}`;
      setCustomEventSuffixes((current) => ({ ...current, [audioId]: normalized }));
      setCustomEventNames((current) => Array.from(new Set(current.map((eventName) =>
        eventName === previousEventName ? nextEventName : eventName,
      ))));
      setAudioEventBindings((current) =>
        Object.fromEntries(
          Object.entries(current).map(([itemId, events]) => [
            itemId,
            events.map((eventName) =>
              eventName === previousEventName ? nextEventName : eventName,
            ),
          ]),
        ),
      );
    },
    [audioFiles, customEventSuffixes],
  );

  const changeAudioEventBindings = useCallback((audioId: string, events: string[]) => {
    const normalizedTargetEvents = Array.from(new Set(events.filter(Boolean)));

    setAudioEventWeights((current) => {
      const currentAudioWeights = current[audioId];
      if (!currentAudioWeights) return current;
      const retainedWeights = Object.fromEntries(
        Object.entries(currentAudioWeights).filter(([eventName]) =>
          normalizedTargetEvents.includes(eventName),
        ),
      );
      if (Object.keys(retainedWeights).length === Object.keys(currentAudioWeights).length) {
        return current;
      }
      const next = { ...current };
      if (Object.keys(retainedWeights).length > 0) next[audioId] = retainedWeights;
      else delete next[audioId];
      return next;
    });
    setAudioEventBindings((current) => ({ ...current, [audioId]: normalizedTargetEvents }));
  }, []);

  const createCustomEvent = useCallback((eventName: string) => {
    setCustomEventNames((current) => current.includes(eventName) ? current : [...current, eventName]);
  }, []);

  const renameCustomEvent = useCallback((eventName: string, nextEventName: string) => {
    setCustomEventNames((current) => Array.from(new Set(current.map((item) => item === eventName ? nextEventName : item))));
    setCustomEventSuffixes((current) => Object.fromEntries(Object.entries(current).map(([audioId, suffix]) => [
      audioId,
      `mcsd.${suffix}` === eventName ? nextEventName.slice("mcsd.".length) : suffix,
    ])));
    setAudioEventBindings((current) => Object.fromEntries(Object.entries(current).map(([audioId, events]) => [
      audioId,
      Array.from(new Set(events.map((item) => item === eventName ? nextEventName : item))),
    ])));
    setAudioEventWeights((current) => Object.fromEntries(Object.entries(current).map(([audioId, weights]) => {
      if (!(eventName in weights)) return [audioId, weights];
      const next = { ...weights, [nextEventName]: weights[eventName] };
      delete next[eventName];
      return [audioId, next];
    })));
  }, []);

  const deleteEvent = useCallback((eventName: string) => {
    setCustomEventNames((current) => current.filter((item) => item !== eventName));
    setAudioEventBindings((current) => Object.fromEntries(Object.entries(current).map(([audioId, events]) => [
      audioId,
      events.filter((item) => item !== eventName),
    ])));
    setAudioEventWeights((current) => Object.fromEntries(Object.entries(current).flatMap(([audioId, weights]) => {
      if (!(eventName in weights)) return [[audioId, weights]];
      const next = { ...weights };
      delete next[eventName];
      return Object.keys(next).length > 0 ? [[audioId, next]] : [];
    })));
  }, []);

  const replaceEvent = useCallback((eventName: string, nextEventName: string) => {
    setCustomEventNames((current) => Array.from(new Set(current.map((item) =>
      item === eventName ? nextEventName : item,
    ))));
    setAudioEventBindings((current) => Object.fromEntries(Object.entries(current).map(([audioId, events]) => [
      audioId,
      Array.from(new Set(events.map((item) => item === eventName ? nextEventName : item))),
    ])));
    setAudioEventWeights((current) => Object.fromEntries(Object.entries(current).map(([audioId, weights]) => {
      if (!(eventName in weights)) return [audioId, weights];
      const next = { ...weights, [nextEventName]: weights[eventName] };
      delete next[eventName];
      return [audioId, next];
    })));
  }, []);

  const changeAudioEventWeight = useCallback(
    (audioId: string, eventName: string, value: number) => {
      const weight = normalizeAudioEventWeight(value);
      setAudioEventWeights((current) => {
        const currentAudioWeights = current[audioId] ?? {};
        const currentWeight = currentAudioWeights[eventName] ?? DEFAULT_AUDIO_EVENT_WEIGHT;
        if (currentWeight === weight) return current;
        const nextAudioWeights = { ...currentAudioWeights };
        if (weight === DEFAULT_AUDIO_EVENT_WEIGHT) delete nextAudioWeights[eventName];
        else nextAudioWeights[eventName] = weight;
        const next = { ...current };
        if (Object.keys(nextAudioWeights).length > 0) next[audioId] = nextAudioWeights;
        else delete next[audioId];
        return next;
      });
    },
    [],
  );

  const changeAudioSubtitle = useCallback((audioId: string, subtitle: string) => {
    setAudioSubtitles((current) =>
      current[audioId] === subtitle
        ? current
        : { ...current, [audioId]: subtitle },
    );
  }, []);

  function changeEventEditorMode(mode: EventEditorMode) {
    setEventEditorMode(mode);
    if (mode === "advanced") setHasOpenedAdvancedEditor(true);
  }

  async function updateProjectInfo(project: Project, data: NewProjectData) {
    const previousTag = formatProjectVersionTag(project.version, project.releaseChannel);
    const nextTag = formatProjectVersionTag(data.version, data.releaseChannel);
    if (autoSaveVersionHistory && previousTag !== nextTag) await saveProjectHistory(project);
    const nextProject: Project = {
      ...project,
      ...data,
      latestVersion: getLatestProjectVersion([
        project.latestVersion,
        project.version,
        data.version,
      ]),
      updatedAt: Date.now(),
    };
    if (previousTag !== nextTag) {
      const storedWorkspace = project.id === selectedProjectId && workspaceStorageReady
        ? buildCurrentWorkspace(project.id)
        : await loadProjectWorkspace(project.id);
      nextProject.versionBaseline = createVersionBaseline(
        nextProject,
        storedWorkspace ?? createEmptyProjectWorkspace(project.id),
      );
    }
    setProjects((current) =>
      current.map((item) =>
        item.id === project.id ? nextProject : item,
      ),
    );
    setEditingProjectId(null);
  }

  async function prepareStorageData() {
    if (!selectedProjectId || !workspaceStorageReady) return;
    await saveProjectWorkspace(buildCurrentWorkspace(selectedProjectId));
  }

  function deleteProject(projectId: string) {
    const remainingProjects = projects.filter((project) => project.id !== projectId);
    const remainingPages = Math.max(1, Math.ceil(remainingProjects.length / pageSize));
    setProjects(remainingProjects);
    void deleteProjectWorkspace(projectId).catch(() => undefined);
    setPage((current) => Math.min(current, remainingPages));
    if (editingProjectId === projectId) setEditingProjectId(null);
    if (managingVersionsProjectId === projectId) setManagingVersionsProjectId(null);
    if (selectedProjectId === projectId) {
      workspaceLoadRequestRef.current += 1;
      setWorkspaceStorageReady(false);
      stopAudioPreview();
      setSelectedProjectId(null);
      setAudioFiles([]);
      setCustomEventSuffixes({});
      setAudioEventBindings({});
      setAudioEventWeights({});
      setAudioSubtitles({});
    }
  }

  const globalTools = (
    <GlobalTools
      language={language}
      setLanguage={setLanguage}
      theme={theme}
      setTheme={setTheme}
      motionEnabled={motionEnabled}
      setMotionEnabled={setMotionEnabled}
      showComplianceInfo={showComplianceInfo}
      setShowComplianceInfo={setShowComplianceInfo}
      selectedSource={selectedSource}
      setSelectedSource={setSelectedSource}
      projects={projects}
      versionIncrementLimit={versionIncrementLimit}
      setVersionIncrementLimit={setVersionIncrementLimit}
      autoSaveVersionHistory={autoSaveVersionHistory}
      setAutoSaveVersionHistory={setAutoSaveVersionHistory}
      onPrepareStorageData={prepareStorageData}
    />
  );

  if (isMobileWorkspace) {
    return (
      <>
        <MobileWorkspace
          language={language}
          colorMode={resolvedTheme}
          motionEnabled={motionEnabled}
          showComplianceInfo={showComplianceInfo}
          view={view}
          activeStep={activeStep}
          projects={projects}
          selectedProject={selectedProject}
          audioFiles={audioFiles}
          globalTools={globalTools}
          versionIncrementLimit={versionIncrementLimit}
          inputRef={inputRef}
          isPreparingAudio={isPreparingAudio}
          preparingAudioIndex={preparingAudioIndex}
          audioConversionProgress={audioConversionProgress}
          audioPreparationError={audioPreparationError}
          previewingAudioId={previewingAudioId}
          previewLoadingAudioId={previewLoadingAudioId}
          previewErrorAudioId={previewErrorAudioId}
          customEventSuffixes={customEventSuffixes}
          customEventNames={customEventNames}
          audioEventBindings={audioEventBindings}
          audioEventWeights={audioEventWeights}
          audioSubtitles={audioSubtitles}
          onCreateProject={createProject}
          onDetectProject={detectProject}
          onImportProject={importProject}
          onImportProjectComplete={() => setView("workspace")}
          onOpenProject={openProject}
          onEditProject={setEditingProjectId}
          onManageVersions={setManagingVersionsProjectId}
          onDeleteProject={deleteProject}
          onShowProjects={() => setView("home")}
          onStepChange={(step) => {
            if (!selectedProjectId) return;
            setView("workspace");
            goToStep(step);
          }}
          onFiles={handleFiles}
          onPreviewAudio={(audio) => void toggleAudioPreview(audio)}
          onRemoveAudio={removeAudioFile}
          onRenameAudioKey={renameAudioKey}
          onPrepareAudio={() => void prepareAudioFilesAndContinue()}
          onCreateCustomEvent={createCustomEvent}
          onRenameCustomEvent={renameCustomEvent}
          onDeleteEvent={deleteEvent}
          onReplaceEvent={replaceEvent}
          onEventBindingsChange={changeAudioEventBindings}
          onEventWeightChange={changeAudioEventWeight}
          onSubtitleChange={changeAudioSubtitle}
          onReturnToAudio={() => void returnToFirstStep()}
        />

        {editingProject ? (
          <ProjectInfoModal
            key={editingProject.id}
            language={language}
            mode="edit"
            versionIncrementLimit={versionIncrementLimit}
            isOpen
            initialData={{
              name: editingProject.name,
              key: editingProject.key ?? "mcsd",
              description: editingProject.description ?? "",
              platform: editingProject.platform ?? "java",
              javaPackFormat: editingProject.javaPackFormat ?? "",
              gameVersion: editingProject.gameVersion ?? "",
              iconDataUrl: editingProject.iconDataUrl ?? null,
              version: editingProject.version ?? DEFAULT_PROJECT_VERSION,
              releaseChannel: editingProject.releaseChannel ?? DEFAULT_RELEASE_CHANNEL,
            }}
            onOpenChange={(isOpen) => {
              if (!isOpen) setEditingProjectId(null);
            }}
            onSubmit={(data) => void updateProjectInfo(editingProject, data)}
          />
        ) : null}

        {managingVersionsProject ? (
          <ProjectVersionHistoryModal
            key={managingVersionsProject.id}
            project={managingVersionsProject}
            language={language}
            onClose={() => setManagingVersionsProjectId(null)}
            onRestore={restoreProjectVersion}
          />
        ) : null}
      </>
    );
  }

  return (
    <div
      className="mcsd-desktop"
      data-color-mode={resolvedTheme}
      data-motion={motionEnabled ? "on" : "off"}
    >
      <header className="mcsd-topbar">
        <div className="mcsd-topbar__grass" aria-hidden="true" />
        <div className="mcsd-topbar__inner">
          <div className="flex min-w-0 items-center gap-5">
            <Brand />
            <span className="mcsd-topbar__divider" />
            <p className="mcsd-topbar__product">{c.product}</p>
          </div>
          {globalTools}
        </div>
      </header>

      {view === "home" ? (
        <main className="home-shell">
          <div className="page-heading">
            <div>
              <p className="page-heading__eyebrow">MCSD2 / PROJECT INDEX</p>
              <h1>{c.projects}</h1>
              <p>{c.projectsDescription}</p>
            </div>
            {projects.length > 0 ? (
              <span className="project-count">{projects.length.toString().padStart(2, "0")}</span>
            ) : null}
          </div>

          <section className="project-grid" aria-label={c.projects}>
            <CreateOrImportModal
              language={language}
              versionIncrementLimit={versionIncrementLimit}
              onCreate={createProject}
              onDetect={detectProject}
              onImport={importProject}
              onImportComplete={() => setView("workspace")}
            />

            {visibleProjects.map((project) => (
              <article key={project.id} className="project-card">
                <button
                  type="button"
                  className="project-card__cover-button"
                  aria-label={`${project.name} · ${c.projects}`}
                  onClick={() => openProject(project)}
                >
                  <ProjectCover iconDataUrl={project.iconDataUrl} name={project.name} />
                </button>

                <div className="project-card__menu">
                  <Dropdown>
                    <Button
                      isIconOnly
                      aria-label={c.moreActions}
                      className="project-card__more"
                      variant="ghost"
                    >
                      <Ellipsis aria-hidden="true" size={18} />
                    </Button>
                    <Dropdown.Popover
                      className="project-menu-popover"
                      placement="bottom end"
                    >
                      <Dropdown.Menu
                        aria-label={c.moreActions}
                        onAction={(key) => {
                          if (key === "edit") setEditingProjectId(project.id);
                          if (key === "versions") setManagingVersionsProjectId(project.id);
                          if (key === "delete") deleteProject(project.id);
                        }}
                      >
                        <Dropdown.Item id="edit" textValue={c.editInfo}>
                          <PencilLine aria-hidden="true" size={16} />
                          <Label>{c.editInfo}</Label>
                        </Dropdown.Item>
                        <Dropdown.Item id="versions" textValue={c.versionManagement}>
                          <History aria-hidden="true" size={16} />
                          <Label>{c.versionManagement}</Label>
                        </Dropdown.Item>
                        <Dropdown.Item id="delete" textValue={c.delete} variant="danger">
                          <Trash2 aria-hidden="true" size={16} />
                          <Label>{c.delete}</Label>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>

                <div className="project-card__body">
                  <button
                    type="button"
                    className="project-card__title"
                    onClick={() => openProject(project)}
                  >
                    {project.name}
                  </button>
                  <span>{project.soundCount} {c.sounds}</span>
                  <small>
                    <Clock3 aria-hidden="true" size={12} />
                    {c.updated} {formatProjectDate(project.updatedAt, language)}
                  </small>
                </div>
              </article>
            ))}
          </section>

          {editingProject ? (
            <ProjectInfoModal
              key={editingProject.id}
              language={language}
              mode="edit"
              versionIncrementLimit={versionIncrementLimit}
              isOpen
              initialData={{
                name: editingProject.name,
                key: editingProject.key ?? "mcsd",
                description: editingProject.description ?? "",
                platform: editingProject.platform ?? "java",
                javaPackFormat: editingProject.javaPackFormat ?? "",
                gameVersion: editingProject.gameVersion ?? "",
                iconDataUrl: editingProject.iconDataUrl ?? null,
                version: editingProject.version ?? DEFAULT_PROJECT_VERSION,
                releaseChannel: editingProject.releaseChannel ?? DEFAULT_RELEASE_CHANNEL,
              }}
              onOpenChange={(isOpen) => {
                if (!isOpen) setEditingProjectId(null);
              }}
              onSubmit={(data) => void updateProjectInfo(editingProject, data)}
            />
          ) : null}

          {managingVersionsProject ? (
            <ProjectVersionHistoryModal
              key={managingVersionsProject.id}
              project={managingVersionsProject}
              language={language}
              onClose={() => setManagingVersionsProjectId(null)}
              onRestore={restoreProjectVersion}
            />
          ) : null}

          {projects.length === 0 ? (
            <div className="project-empty">
              <FolderOpen aria-hidden="true" size={20} />
              <div>
                <strong>{c.empty}</strong>
                <p>{c.emptyDescription}</p>
              </div>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <nav className="project-pagination" aria-label={c.page}>
              {Array.from({ length: totalPages }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-current={page === index + 1 ? "page" : undefined}
                  onClick={() => setPage(index + 1)}
                >
                  {index + 1}
                </button>
              ))}
            </nav>
          ) : null}

          <ComplianceFooter visible={showComplianceInfo} />
        </main>
      ) : (
        <main className="workspace-shell">
          <div className="workspace-heading">
            <Button className="wiki-button wiki-button--neutral" onPress={() => setView("home")}>
              <ArrowLeft aria-hidden="true" size={17} />
              {c.back}
            </Button>
            <div className="workspace-heading__title">
              <span>PROJECT / {selectedProjectId?.slice(-6)}</span>
              <h1>{selectedProject?.name ?? c.untitled}</h1>
            </div>
          </div>

          <nav className="step-bar" aria-label="Workflow steps">
            {[c.stepImport, c.stepMap, c.stepExport].map((label, index) => (
              <button
                key={label}
                type="button"
                disabled
                className={activeStep === index ? "is-active" : activeStep > index ? "is-complete" : ""}
                aria-current={activeStep === index ? "step" : undefined}
              >
                <span>{activeStep > index ? <Check aria-hidden="true" size={15} /> : `0${index + 1}`}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </nav>

          <section className="workspace-content">
            {activeStep === 0 ? (
              <div className="import-layout">
                <section className="workspace-panel workspace-panel--main">
                  <div className="workspace-panel__header">
                    <div>
                      <span>STEP 01 / 03</span>
                      <h2>{c.stepImport}</h2>
                    </div>
                    <FileAudio aria-hidden="true" size={22} />
                  </div>
                  <div className="workspace-panel__body">
                    <input
                      ref={inputRef}
                      className="sr-only"
                      type="file"
                      multiple
                      disabled={isPreparingAudio}
                      accept="audio/*,.ogg,.wav,.mp3,.flac,.m4a"
                      onChange={(event) => {
                        if (event.target.files) handleFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <div className="audio-card-grid">
                      <button
                        type="button"
                        disabled={isPreparingAudio}
                        className={`audio-add-card${isAudioDragging ? " is-dragging" : ""}`}
                        onClick={() => inputRef.current?.click()}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setIsAudioDragging(true);
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                          setIsAudioDragging(false);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setIsAudioDragging(false);
                          handleFiles(event.dataTransfer.files);
                        }}
                      >
                        <span className="audio-add-card__icon">
                          <Plus aria-hidden="true" size={28} />
                        </span>
                        <span>
                          <strong>{c.addAudio}</strong>
                          <small>{c.addAudioDescription}</small>
                          <small>{c.formats}</small>
                        </span>
                      </button>

                      {visibleAudioFiles.map((item, cardIndex) => {
                        const isPlaying = previewingAudioId === item.id;
                        const isLoading = previewLoadingAudioId === item.id;
                        const hasPreviewError = previewErrorAudioId === item.id;
                        const isCurrentConversion = preparingAudioId === item.id;
                        const processingClass = item.conversionStatus === "queued"
                          ? " is-queued"
                          : item.conversionStatus === "converting"
                            ? " is-processing"
                            : item.conversionStatus === "converted" || item.conversionStatus === "skipped"
                              ? " is-processed"
                              : item.conversionStatus === "error"
                                ? " is-processing-error"
                                : "";
                        const codecLabel = item.analysisStatus === "analyzing"
                          ? null
                          : getCodecLabel(item.codec, item.codecLongName);
                        const bitRateLabel = formatAudioBitRate(item.bitRate);
                        const sampleRateLabel = formatAudioSampleRate(item.sampleRate);
                        const channelsLabel = formatAudioChannels(item.channels, {
                          mono: c.mono,
                          stereo: c.stereo,
                        });
                        const previewLabel = hasPreviewError
                          ? c.retryPreview
                          : isPlaying
                            ? c.pausePreview
                            : c.playPreview;

                        return (
                          <article
                            key={item.id}
                            className={`audio-card${processingClass}`}
                            style={
                              isCurrentConversion
                                ? ({
                                    "--conversion-progress": `${Math.max(0, Math.min(100, audioConversionProgress))}%`,
                                  } as CSSProperties)
                                : undefined
                            }
                          >
                            {isCurrentConversion && audioConversionProgress < 100 ? (
                              <span className="audio-card__conversion-scan" aria-hidden="true" />
                            ) : null}
                            <div className={`audio-card__preview${isPlaying ? " is-playing" : ""}`}>
                              {item.analysisStatus === "analyzing" || item.conversionStatus !== "idle" ? (
                                <span
                                  className={`audio-card__status is-${item.conversionStatus === "idle" ? "analyzing" : item.conversionStatus}`}
                                >
                                  {item.analysisStatus === "analyzing" && item.conversionStatus === "idle"
                                    ? c.detectingAudio
                                    : item.conversionStatus === "converted"
                                      ? c.convertedAudio
                                      : item.conversionStatus === "skipped"
                                        ? c.skippedAudio
                                        : item.conversionStatus === "queued"
                                          ? c.queuedAudio
                                      : item.conversionStatus === "error"
                                        ? c.conversionFailed
                                        : `${c.convertingAudio} ${isCurrentConversion ? `${audioConversionProgress}%` : ""}`}
                                </span>
                              ) : null}
                              <div className="audio-card__waveform" aria-hidden="true">
                                {WAVEFORM.map((height, barIndex) => (
                                  <span
                                    key={`${item.id}-${barIndex}`}
                                    style={{ height: `${WAVEFORM[(barIndex + cardIndex) % WAVEFORM.length] ?? height}%` }}
                                  />
                                ))}
                              </div>
                              <Button
                                isIconOnly
                                aria-label={previewLabel}
                                aria-pressed={isPlaying}
                                className={`audio-card__play${hasPreviewError ? " is-error" : ""}`}
                                isDisabled={isLoading || isPreparingAudio}
                                onPress={() => void toggleAudioPreview(item)}
                              >
                                {isLoading ? (
                                  <LoaderCircle aria-hidden="true" className="audio-card__spinner" size={20} />
                                ) : hasPreviewError ? (
                                  <TriangleAlert aria-hidden="true" size={19} />
                                ) : isPlaying ? (
                                  <Pause aria-hidden="true" size={19} />
                                ) : (
                                  <Play aria-hidden="true" size={19} />
                                )}
                              </Button>
                            </div>
                            <div className="audio-card__body">
                              <div className="audio-card__title-row">
                                <div className="audio-card__name">
                                  <strong title={item.name}>{item.name}</strong>
                                  <p className="audio-card__key" title={item.key}>
                                    <span>{c.audioKey}</span>
                                    <code>{item.key}</code>
                                  </p>
                                </div>
                                <Button
                                  isIconOnly
                                  aria-label={c.removeAudio}
                                  className="audio-card__delete"
                                  isDisabled={isPreparingAudio}
                                  variant="ghost"
                                  onPress={() => removeAudioFile(item.id)}
                                >
                                  <Trash2 aria-hidden="true" size={15} />
                                </Button>
                              </div>
                              <div className="audio-card__meta">
                                <div className="audio-card__technical">
                                  {item.format && item.format !== "AUDIO" ? <span>{item.format}</span> : null}
                                  {codecLabel ? (
                                    <span title={item.codecLongName ?? codecLabel}>{codecLabel}</span>
                                  ) : null}
                                  {bitRateLabel ? <span>{bitRateLabel}</span> : null}
                                  {sampleRateLabel ? <span title={c.sampleRate}>{sampleRateLabel}</span> : null}
                                  {channelsLabel ? <span title={c.channels}>{channelsLabel}</span> : null}
                                </div>
                                <span>{formatAudioFileSize(item.size)}</span>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {audioTotalPages > 1 ? (
                      <nav className="project-pagination audio-pagination" aria-label={c.page}>
                        {Array.from({ length: audioTotalPages }).map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            aria-current={audioPage === index + 1 ? "page" : undefined}
                            onClick={() => setAudioPage(index + 1)}
                          >
                            {index + 1}
                          </button>
                        ))}
                      </nav>
                    ) : null}

                    <div className="import-actions">
                      {audioPreparationError ? (
                        <p className="audio-preparation-error" role="alert">
                          <TriangleAlert aria-hidden="true" size={16} />
                          {audioPreparationError}
                        </p>
                      ) : null}
                      <Button
                        className="wiki-button wiki-button--primary"
                        isDisabled={audioFiles.length === 0 || isPreparingAudio}
                        onPress={() => void prepareAudioFilesAndContinue()}
                      >
                        {isPreparingAudio ? (
                          <>
                            <LoaderCircle aria-hidden="true" className="audio-card__spinner" size={17} />
                            {c.convertingAudio} {preparingAudioIndex}/{audioFiles.length} · {audioConversionProgress}%
                          </>
                        ) : (
                          <>
                            {c.nextSetEvents}
                            <ChevronDown aria-hidden="true" className="workflow-next-icon" size={17} />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </section>

                <aside className="workspace-panel local-panel">
                  <PackageOpen aria-hidden="true" size={24} />
                  <div>
                    <h3>{c.localOnly}</h3>
                    <p>{c.localOnlyDescription}</p>
                  </div>
                </aside>
              </div>
            ) : null}

            {activeStep === 1 ? (
              <section className="workspace-panel workspace-panel--wide">
                <div className="workspace-panel__header">
                  <div>
                    <span>STEP 02 / 03</span>
                    <h2>{c.stepMap}</h2>
                  </div>
                  {isMobileWorkspace ? (
                    <span className="mobile-basic-mode">{c.novice}</span>
                  ) : (
                    <SegmentControl
                      label={c.eventEditorMode}
                      value={eventEditorMode}
                      onChange={changeEventEditorMode}
                      options={[
                        { value: "novice", label: c.novice },
                        { value: "basic", label: c.basic },
                        { value: "advanced", label: c.advanced },
                      ]}
                    />
                  )}
                </div>
                <div className="workspace-panel__body">
                  {visibleEventEditorMode === "novice" ? (
                    <NoviceEventManager
                      audioFiles={audioFiles}
                      customEventSuffixes={customEventSuffixes}
                      customEventNames={customEventNames}
                      eventBindings={audioEventBindings}
                      eventWeights={audioEventWeights}
                      audioSubtitles={audioSubtitles}
                      language={language}
                      previewingAudioId={previewingAudioId}
                      previewLoadingAudioId={previewLoadingAudioId}
                      previewErrorAudioId={previewErrorAudioId}
                      playPreviewLabel={c.playPreview}
                      pausePreviewLabel={c.pausePreview}
                      retryPreviewLabel={c.retryPreview}
                      onPreviewAudio={previewAudioById}
                      onEventBindingsChange={changeAudioEventBindings}
                      onEventWeightChange={changeAudioEventWeight}
                      onSubtitleChange={changeAudioSubtitle}
                      onCreateCustomEvent={createCustomEvent}
                      onRenameCustomEvent={renameCustomEvent}
                      onDeleteEvent={deleteEvent}
                      onReplaceEvent={replaceEvent}
                    />
                  ) : null}
                  {visibleEventEditorMode === "basic" && audioFiles.length > 0 ? (
                    <div className="mapping-list">
                      {audioFiles.map((item) => {
                        const isPlaying = previewingAudioId === item.id;
                        const isLoading = previewLoadingAudioId === item.id;
                        const hasPreviewError = previewErrorAudioId === item.id;
                        const previewLabel = hasPreviewError
                          ? c.retryPreview
                          : isPlaying
                            ? c.pausePreview
                            : c.playPreview;
                        return (
                        <div key={item.id} className="mapping-row">
                          <Button
                            isIconOnly
                            aria-label={previewLabel}
                            aria-pressed={isPlaying}
                            className={`mapping-row__preview${hasPreviewError ? " is-error" : ""}`}
                            onPress={() => void toggleAudioPreview(item)}
                          >
                            {isLoading ? (
                              <LoaderCircle aria-hidden="true" className="audio-card__spinner" size={16} />
                            ) : hasPreviewError ? (
                              <TriangleAlert aria-hidden="true" size={15} />
                            ) : isPlaying ? (
                              <Pause aria-hidden="true" size={15} />
                            ) : (
                              <Play aria-hidden="true" size={15} />
                            )}
                          </Button>
                          <div className="mapping-row__audio-name">
                            <strong title={item.name}>{item.name}</strong>
                            {item.originalName !== item.name ? (
                              <small title={item.originalName}>{item.originalName}</small>
                            ) : null}
                          </div>
                          <div className="mapping-row__binding">
                            <span>{c.event}</span>
                            <BasicEventBindingModal
                              audio={item}
                              allAudio={audioFiles}
                              customEventSuffixes={customEventSuffixes}
                              boundEvents={audioEventBindings[item.id] ?? []}
                              eventBindings={audioEventBindings}
                              eventWeights={audioEventWeights}
                              language={language}
                              onCustomEventChange={changeCustomEventSuffix}
                              onChange={(events) => changeAudioEventBindings(item.id, events)}
                              onWeightChange={changeAudioEventWeight}
                            />
                          </div>
                          <label className="mapping-row__subtitle">
                            <span>{c.subtitle}</span>
                            <input
                              value={audioSubtitles[item.id] ?? ""}
                              placeholder={c.subtitlePlaceholder}
                              onChange={(event) =>
                                changeAudioSubtitle(item.id, event.target.value)
                              }
                            />
                          </label>
                        </div>
                        );
                      })}
                    </div>
                  ) : visibleEventEditorMode === "basic" ? (
                    <div className="workspace-empty">
                      <FileAudio aria-hidden="true" size={26} />
                      <strong>{c.mappingEmpty}</strong>
                      <p>{c.mappingEmptyDescription}</p>
                    </div>
                  ) : null}
                  {!isMobileWorkspace && hasOpenedAdvancedEditor ? (
                    <div hidden={visibleEventEditorMode !== "advanced"}>
                      <AdvancedEventFlow
                        key={selectedProjectId}
                        audioFiles={audioFiles}
                        customEventSuffixes={customEventSuffixes}
                        onCustomEventChange={changeCustomEventSuffix}
                        audioSubtitles={audioSubtitles}
                        onAudioSubtitleChange={changeAudioSubtitle}
                        eventBindings={audioEventBindings}
                        onEventBindingsChange={changeAudioEventBindings}
                        eventWeights={audioEventWeights}
                        onEventWeightChange={changeAudioEventWeight}
                        previewingAudioId={previewingAudioId}
                        previewLoadingAudioId={previewLoadingAudioId}
                        previewErrorAudioId={previewErrorAudioId}
                        onPreviewAudio={previewAudioById}
                        playPreviewLabel={c.playPreview}
                        pausePreviewLabel={c.pausePreview}
                        retryPreviewLabel={c.retryPreview}
                        language={language}
                        motionEnabled={motionEnabled}
                      />
                    </div>
                  ) : null}
                  <div className="workflow-actions">
                    <Button className="wiki-button wiki-button--neutral" onPress={() => goToStep(0)}>
                      <ArrowLeft aria-hidden="true" size={17} />
                      {c.previousStep}
                    </Button>
                    <Button
                      className="wiki-button wiki-button--primary"
                      isDisabled={audioFiles.length === 0}
                      onPress={() => goToStep(2)}
                    >
                      {c.nextExport}
                      <ChevronDown aria-hidden="true" className="workflow-next-icon" size={17} />
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === 2 ? (
              <section className="workspace-panel workspace-panel--wide">
                <div className="workspace-panel__header">
                  <div>
                    <span>STEP 03 / 03</span>
                    <h2>{c.stepExport}</h2>
                  </div>
                  <PackageOpen aria-hidden="true" size={22} />
                </div>
                <div className="workspace-panel__body">
                  <ExportWorkspace
                    project={selectedProject}
                    audioFiles={audioFiles}
                    eventBindings={audioEventBindings}
                    eventWeights={audioEventWeights}
                    audioSubtitles={audioSubtitles}
                    customEventSuffixes={customEventSuffixes}
                    customEventNames={customEventNames}
                    language={language}
                  />
                </div>
                <div className="workflow-actions workflow-actions--export">
                  <Button className="wiki-button wiki-button--neutral" onPress={() => goToStep(1)}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    {c.previousStep}
                  </Button>
                  <Button
                    className="wiki-button wiki-button--primary"
                    onPress={() => void returnToFirstStep()}
                  >
                    <RefreshCcw aria-hidden="true" size={17} />
                    {hasCurrentProjectChanges ? c.iterateVersion : c.backToFirstStep}
                  </Button>
                </div>
              </section>
            ) : null}
          </section>
        </main>
      )}
    </div>
  );
}
