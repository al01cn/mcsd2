import type { PackPlatform } from "@/app/ui/create-project-modal";
import {
  getAudioEventWeight,
  type AudioEventWeights,
} from "@/lib/audio-event-weight";
import {
  formatProjectVersionTag,
  parseProjectVersion,
  type ReleaseChannel,
} from "@/lib/project-version";

export type PackAudioFile = {
  id: string;
  key: string;
  file: Blob;
  name?: string;
  originalName?: string;
  format?: string;
  codec?: string | null;
  codecLongName?: string | null;
  bitRate?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
  duration?: number | null;
};

export type AudioPackBuildInput = {
  name: string;
  key: string;
  description?: string;
  platform: PackPlatform;
  javaPackFormat?: string;
  iconDataUrl?: string | null;
  version?: string;
  releaseChannel?: ReleaseChannel;
  gameVersion?: string;
  customEventSuffixes?: Record<string, string>;
  customEventNames?: string[];
  audioFiles: PackAudioFile[];
  eventBindings: Record<string, string[]>;
  eventWeights?: AudioEventWeights;
  audioSubtitles?: Record<string, string>;
};

export type CommandGroup = {
  id: "legacy-play" | "play" | "stop";
  titleZh: string;
  titleEn: string;
  lines: string[];
};

type SoundEntry = { name: string; stream?: boolean; weight?: number };
type JavaSoundDefinition = { replace?: boolean; subtitle?: string; sounds: SoundEntry[] };
type BedrockSoundEntry = string | { name: string; weight: number };
type BedrockSoundDefinition = {
  category: "record";
  subtitle?: string;
  sounds: BedrockSoundEntry[];
};

export type EditorAudioMetadata = {
  id: string;
  key: string;
  name: string;
  originalName: string;
  fileName: string;
  archivePath: string;
  format: string;
  codec: string | null;
  codecLongName: string | null;
  bitRate: number | null;
  sampleRate: number | null;
  channels: number | null;
  duration: number | null;
};

export type EditorProjectMetadata = {
  name: string;
  key: string;
  description: string;
  platform: PackPlatform;
  javaPackFormat: string;
  gameVersion: string;
  version: string;
  releaseChannel: ReleaseChannel;
  iconPath: string | null;
};

export type EditorManifest = {
  schemaVersion: 1;
  app: "mcsd";
  project: EditorProjectMetadata;
  audioFiles: EditorAudioMetadata[];
  customEventSuffixes: Record<string, string>;
  customEventNames?: string[];
  eventBindings: Record<string, string[]>;
  eventWeights: AudioEventWeights;
  audioSubtitles: Record<string, string>;
  soundsJson: Record<string, unknown>;
};

export const EDITOR_METADATA_PATH = ".editor/mcsd.json";

export type LegacyImportAudioReference = {
  id: string;
  key: string;
  reference: string;
};

export type LegacySoundMappings = {
  customEventSuffixes: Record<string, string>;
  eventBindings: Record<string, string[]>;
  eventWeights: AudioEventWeights;
  audioSubtitles: Record<string, string>;
};

const CUSTOM_EVENT_PREFIX = "mcsd.";
const DEFAULT_PACK_KEY = "mcsd";
const DEFAULT_JAVA_PACK_FORMAT = "15";

export function deriveCustomEventNames(
  customEventSuffixes: Record<string, string> | undefined,
  eventBindings: Record<string, string[]>,
) {
  const names = new Set<string>();
  for (const suffix of Object.values(customEventSuffixes ?? {})) {
    const normalized = suffix.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (normalized) names.add(`${CUSTOM_EVENT_PREFIX}${normalized}`);
  }
  for (const events of Object.values(eventBindings)) {
    for (const eventName of events) {
      if (eventName.startsWith(CUSTOM_EVENT_PREFIX)) names.add(eventName);
    }
  }
  return Array.from(names);
}

function uniqueEventNames(input: AudioPackBuildInput) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const audio of input.audioFiles) {
    for (const rawEventName of input.eventBindings[audio.id] ?? []) {
      const eventName = rawEventName.trim();
      if (!eventName || seen.has(eventName)) continue;
      seen.add(eventName);
      names.push(eventName);
    }
  }

  return names;
}

function normalizePackKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) || DEFAULT_PACK_KEY;
}

function normalizeAudioKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 64) || "sound";
}

function normalizeImportedSoundReference(value: string) {
  return value
    .trim()
    .replace(/^minecraft:/, "")
    .replace(/^sounds\//, "")
    .replace(/\.ogg$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

export function buildLegacySoundMappings(
  platform: PackPlatform,
  audioFiles: LegacyImportAudioReference[],
  soundsJson: Record<string, unknown> | null,
): LegacySoundMappings {
  const audioByReference = new Map(
    audioFiles.map((audio) => [normalizeImportedSoundReference(audio.reference), audio]),
  );
  const eventBindings: Record<string, string[]> = {};
  const eventWeights: AudioEventWeights = {};
  const audioSubtitles: Record<string, string> = {};
  const definitions = soundsJson
    ? platform === "java"
      ? soundsJson
      : ((soundsJson.sound_definitions as Record<string, unknown> | undefined) ?? {})
    : null;

  if (definitions) {
    for (const [eventName, rawDefinition] of Object.entries(definitions)) {
      if (!rawDefinition || typeof rawDefinition !== "object") continue;
      const definition = rawDefinition as Record<string, unknown>;
      const sounds = Array.isArray(definition.sounds) ? definition.sounds : [];
      for (const rawSound of sounds) {
        const sound = typeof rawSound === "string" ? { name: rawSound } : rawSound;
        if (!sound || typeof sound !== "object" || typeof sound.name !== "string") continue;
        const audio = audioByReference.get(normalizeImportedSoundReference(sound.name));
        if (!audio) continue;
        const events = eventBindings[audio.id] ?? [];
        if (!events.includes(eventName)) events.push(eventName);
        eventBindings[audio.id] = events;
        if (typeof definition.subtitle === "string" && !audioSubtitles[audio.id]) {
          audioSubtitles[audio.id] = definition.subtitle;
        }
        if (typeof sound.weight === "number" && sound.weight !== 1) {
          eventWeights[audio.id] = {
            ...(eventWeights[audio.id] ?? {}),
            [eventName]: sound.weight,
          };
        }
      }
    }
  }

  const normalizedBindings = Object.fromEntries(audioFiles.map((audio) => [
    audio.id,
    eventBindings[audio.id]?.length
      ? eventBindings[audio.id]
      : definitions
        ? []
        : [`mcsd.${audio.key}`],
  ]));
  const customEventSuffixes = Object.fromEntries(audioFiles.map((audio) => {
    const customEvent = normalizedBindings[audio.id]?.find((eventName) =>
      eventName.startsWith(CUSTOM_EVENT_PREFIX)
    );
    return [audio.id, customEvent?.slice(CUSTOM_EVENT_PREFIX.length) || audio.key];
  }));

  return {
    customEventSuffixes,
    eventBindings: normalizedBindings,
    eventWeights,
    audioSubtitles,
  };
}

function buildPackDescription(
  description?: string,
  version?: string,
  releaseChannel?: ReleaseChannel,
) {
  const value = description?.trim();
  const versionTag = formatProjectVersionTag(version, releaseChannel);
  return value ? `${value} By mcsd ${versionTag}` : `By mcsd ${versionTag}`;
}

function parsePackFormat(value?: string) {
  const raw = value?.trim() || DEFAULT_JAVA_PACK_FORMAT;
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const major = Number(raw.split(".", 1)[0]);
  return Number.isFinite(major) && major > 0 ? { raw, major } : null;
}

export function buildJavaPackMeta(
  packFormat: string | undefined,
  description?: string,
  version?: string,
  releaseChannel?: ReleaseChannel,
) {
  const parsed = parsePackFormat(packFormat) ?? {
    raw: DEFAULT_JAVA_PACK_FORMAT,
    major: Number(DEFAULT_JAVA_PACK_FORMAT),
  };
  const pack: Record<string, unknown> = {
    pack_format: Number(parsed.raw),
    description: buildPackDescription(description, version, releaseChannel),
  };

  if (parsed.major >= 65) {
    pack.min_format = [Number(parsed.raw), 0];
    pack.max_format = [Number(parsed.raw), 0];
  } else if (parsed.major >= 16) {
    pack.supported_formats = [parsed.major, parsed.major];
  }

  return { pack };
}

export function buildJavaSoundsJson(input: AudioPackBuildInput) {
  const packKey = normalizePackKey(input.key);
  const definitions: Record<string, JavaSoundDefinition> = {};

  for (const audio of input.audioFiles) {
    const soundName = `${packKey}/${normalizeAudioKey(audio.key)}`;
    const subtitle = input.audioSubtitles?.[audio.id]?.trim();
    const seenForAudio = new Set<string>();

    for (const rawEventName of input.eventBindings[audio.id] ?? []) {
      const eventName = rawEventName.trim();
      if (!eventName || seenForAudio.has(eventName)) continue;
      seenForAudio.add(eventName);

      const definition = definitions[eventName] ?? {
        ...(eventName.startsWith(CUSTOM_EVENT_PREFIX) ? {} : { replace: true }),
        sounds: [],
      };
      if (!definition.subtitle && subtitle) definition.subtitle = subtitle;
      if (!definition.sounds.some((sound) => sound.name === soundName)) {
        const weight = getAudioEventWeight(input.eventWeights, audio.id, eventName);
        definition.sounds.push({
          name: soundName,
          stream: true,
          ...(weight === 1 ? {} : { weight }),
        });
      }
      definitions[eventName] = definition;
    }
  }

  return definitions;
}

export function buildBedrockSoundDefinitions(input: AudioPackBuildInput) {
  const packKey = normalizePackKey(input.key);
  const definitions: Record<string, BedrockSoundDefinition> = {};

  for (const audio of input.audioFiles) {
    const soundName = `sounds/${packKey}/${normalizeAudioKey(audio.key)}`;
    const subtitle = input.audioSubtitles?.[audio.id]?.trim();
    const seenForAudio = new Set<string>();

    for (const rawEventName of input.eventBindings[audio.id] ?? []) {
      const eventName = rawEventName.trim();
      if (!eventName || seenForAudio.has(eventName)) continue;
      seenForAudio.add(eventName);

      const definition = definitions[eventName] ?? { category: "record", sounds: [] };
      if (!definition.subtitle && subtitle) definition.subtitle = subtitle;
      const hasSound = definition.sounds.some((sound) =>
        typeof sound === "string" ? sound === soundName : sound.name === soundName,
      );
      if (!hasSound) {
        const weight = getAudioEventWeight(input.eventWeights, audio.id, eventName);
        definition.sounds.push(weight === 1 ? soundName : { name: soundName, weight });
      }
      definitions[eventName] = definition;
    }
  }

  return {
    format_version: "1.14.0",
    sound_definitions: definitions,
  };
}

function createUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function buildBedrockManifest(input: AudioPackBuildInput) {
  const version = parseProjectVersion(input.version);
  return {
    format_version: 2,
    header: {
      name: input.name.trim() || "MCSD2 Audio Pack",
      description: buildPackDescription(input.description, input.version, input.releaseChannel),
      uuid: createUuid(),
      version,
      min_engine_version: [1, 16, 0],
    },
    modules: [
      {
        type: "resources",
        uuid: createUuid(),
        version,
      },
    ],
  };
}

export function buildEditorManifest(input: AudioPackBuildInput): EditorManifest {
  const packKey = normalizePackKey(input.key);
  const iconPath = input.iconDataUrl
    ? input.platform === "java" ? "pack.png" : "pack_icon.png"
    : null;
  const audioFiles = input.audioFiles.map((audio) => {
    const key = normalizeAudioKey(audio.key);
    const sourceName = typeof File !== "undefined" && audio.file instanceof File
      ? audio.file.name
      : `${key}.ogg`;
    const archivePath = input.platform === "java"
      ? `assets/minecraft/sounds/${packKey}/${key}.ogg`
      : `sounds/${packKey}/${key}.ogg`;
    return {
      id: audio.id,
      key: audio.key,
      name: audio.name ?? sourceName,
      originalName: audio.originalName ?? sourceName,
      fileName: `${key}.ogg`,
      archivePath,
      format: audio.format ?? "OGG",
      codec: audio.codec ?? "vorbis",
      codecLongName: audio.codecLongName ?? "Vorbis",
      bitRate: audio.bitRate ?? null,
      sampleRate: audio.sampleRate ?? 44100,
      channels: audio.channels ?? 2,
      duration: audio.duration ?? null,
    };
  });

  return {
    schemaVersion: 1,
    app: "mcsd",
    project: {
      name: input.name.trim() || "MCSD2 Audio Pack",
      key: input.key,
      description: input.description?.trim() ?? "",
      platform: input.platform,
      javaPackFormat: input.javaPackFormat ?? "",
      gameVersion: input.gameVersion ?? "",
      version: input.version ?? "0.0.1",
      releaseChannel: input.releaseChannel ?? "stable",
      iconPath,
    },
    audioFiles,
    customEventSuffixes: input.customEventSuffixes ?? {},
    ...(input.customEventNames ? { customEventNames: input.customEventNames } : {}),
    eventBindings: input.eventBindings,
    eventWeights: input.eventWeights ?? {},
    audioSubtitles: input.audioSubtitles ?? {},
    soundsJson: input.platform === "java"
      ? buildJavaSoundsJson(input) as Record<string, unknown>
      : buildBedrockSoundDefinitions(input) as unknown as Record<string, unknown>,
  };
}

export function buildCommandGroups(input: AudioPackBuildInput): CommandGroup[] {
  const soundNames = uniqueEventNames(input);

  if (input.platform === "bedrock") {
    return [
      {
        id: "play",
        titleZh: "播放声音",
        titleEn: "Play sounds",
        lines: soundNames.map((soundName) => `/playsound ${soundName} @a ~ ~ ~ 10000`),
      },
      {
        id: "stop",
        titleZh: "停止声音",
        titleEn: "Stop sounds",
        lines: soundNames.map((soundName) => `/stopsound @a ${soundName}`),
      },
    ];
  }

  return [
    {
      id: "legacy-play",
      titleZh: "播放声音（Java 1.7.10 及以下）",
      titleEn: "Play sounds (Java 1.7.10 and earlier)",
      lines: soundNames.map((soundName) => `/playsound ${soundName} @a ~ ~ ~ 10000`),
    },
    {
      id: "play",
      titleZh: "播放声音（Java 1.8 及以上）",
      titleEn: "Play sounds (Java 1.8+)",
      lines: soundNames.map((soundName) => `/playsound ${soundName} record @a ~ ~ ~ 10000`),
    },
    {
      id: "stop",
      titleZh: "停止声音（Java 1.9.3 及以上）",
      titleEn: "Stop sounds (Java 1.9.3+)",
      lines: soundNames.map((soundName) => `/stopsound @a record ${soundName}`),
    },
  ];
}

export function buildCommandsText(input: AudioPackBuildInput, language: "zh" | "en") {
  const packKey = normalizePackKey(input.key);
  const groups = buildCommandGroups(input);
  const empty = language === "zh" ? "暂无可用命令" : "No commands available";
  const keyLabel = language === "zh" ? "主 Key" : "Pack key";

  return [
    `${keyLabel}: ${packKey}`,
    "",
    ...groups.flatMap((group) => [
      language === "zh" ? group.titleZh : group.titleEn,
      ...(group.lines.length > 0 ? group.lines : [empty]),
      "",
    ]),
  ].join("\n");
}

export function safeDownloadName(name: string) {
  const normalized = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return normalized || "MCSD2-Audio-Pack";
}

async function addIconToArchive(
  zip: { file: (path: string, data: Blob | ArrayBuffer) => unknown },
  iconDataUrl: string | null | undefined,
  path: string,
) {
  if (!iconDataUrl) return;
  const response = await fetch(iconDataUrl);
  if (!response.ok) throw new Error("Unable to read the pack icon.");
  zip.file(path, await response.arrayBuffer());
}

export async function buildAudioPackArchive(
  input: AudioPackBuildInput,
  onProgress?: (percent: number) => void,
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const packKey = normalizePackKey(input.key);
  const audioBuffers = await Promise.all(
    input.audioFiles.map(async (audio) => ({
      audio,
      buffer: await audio.file.arrayBuffer(),
    })),
  );

  onProgress?.(8);
  const editorManifest = buildEditorManifest(input);
  zip.file(EDITOR_METADATA_PATH, JSON.stringify(editorManifest, null, 2));
  if (input.platform === "java") {
    zip.file(
      "pack.mcmeta",
      JSON.stringify(
        buildJavaPackMeta(
          input.javaPackFormat,
          input.description,
          input.version,
          input.releaseChannel,
        ),
        null,
        2,
      ),
    );
    await addIconToArchive(zip, input.iconDataUrl, "pack.png");
    zip.file(
      "assets/minecraft/sounds.json",
      JSON.stringify(buildJavaSoundsJson(input), null, 2),
    );
    for (const { audio, buffer } of audioBuffers) {
      zip.file(`assets/minecraft/sounds/${packKey}/${normalizeAudioKey(audio.key)}.ogg`, buffer);
    }
  } else {
    zip.file("manifest.json", JSON.stringify(buildBedrockManifest(input), null, 2));
    await addIconToArchive(zip, input.iconDataUrl, "pack_icon.png");
    zip.file(
      "sounds/sound_definitions.json",
      JSON.stringify(buildBedrockSoundDefinitions(input), null, 2),
    );
    for (const { audio, buffer } of audioBuffers) {
      zip.file(`sounds/${packKey}/${normalizeAudioKey(audio.key)}.ogg`, buffer);
    }
  }

  onProgress?.(20);
  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      mimeType: input.platform === "bedrock" ? "application/vnd.minecraft.resource-pack" : "application/zip",
    },
    ({ percent }) => onProgress?.(20 + Math.round(percent * 0.8)),
  );
  const extension = input.platform === "bedrock" ? "mcpack" : "zip";
  const versionTag = formatProjectVersionTag(input.version, input.releaseChannel);

  return {
    blob,
    fileName: `${safeDownloadName(input.name)}-${versionTag}.${extension}`,
  };
}
