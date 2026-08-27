import assert from "node:assert/strict";
import { describe, test } from "node:test";
import JSZip from "jszip";
import {
  buildAudioPackArchive,
  buildBedrockSoundDefinitions,
  buildBedrockManifest,
  buildCommandGroups,
  buildJavaSoundsJson,
  buildEditorManifest,
  convertLegacySoundMappingsToMcsd,
  deriveCustomEventNames,
  buildLegacySoundMappings,
  type AudioPackBuildInput,
} from "@/lib/audio-pack";
import {
  getLatestProjectVersion,
  formatProjectVersionTag,
  incrementProjectVersion,
  normalizeVersionIncrementLimit,
} from "@/lib/project-version";
import { calculateCenteredSquareCrop } from "@/lib/audio-pack-icon";
import {
  calculateAudioEventProbability,
  getAudioEventWeight,
  normalizeAudioEventWeight,
} from "@/lib/audio-event-weight";
import { createProjectContentFingerprint } from "@/lib/project-content";

function createInput(platform: "java" | "bedrock" = "java"): AudioPackBuildInput {
  return {
    name: "Test Pack",
    key: "demo",
    description: "Test sounds",
    platform,
    javaPackFormat: "64",
    version: "1.2.9",
    releaseChannel: "stable",
    audioFiles: [
      { id: "one", key: "bell", file: new Blob(["bell"]) },
      { id: "two", key: "wind", file: new Blob(["wind"]) },
    ],
    eventBindings: {
      one: ["mcsd.bell", "block.note_block.bell"],
      two: ["mcsd.wind", "block.note_block.bell"],
    },
    audioSubtitles: {
      one: "Bells ring",
      two: "Wind blows",
    },
  };
}

describe("audio pack definitions", () => {
  test("groups Java sounds by their bound events", () => {
    const definitions = buildJavaSoundsJson(createInput());

    assert.deepEqual(definitions["mcsd.bell"], {
      subtitle: "Bells ring",
      sounds: [{ name: "demo/bell", stream: true }],
    });
    assert.deepEqual(definitions["block.note_block.bell"], {
      replace: true,
      subtitle: "Bells ring",
      sounds: [
        { name: "demo/bell", stream: true },
        { name: "demo/wind", stream: true },
      ],
    });
  });

  test("creates Bedrock sound definitions with pack-relative paths", () => {
    const definitions = buildBedrockSoundDefinitions(createInput("bedrock"));

    assert.deepEqual(definitions.sound_definitions["mcsd.wind"], {
      category: "record",
      subtitle: "Wind blows",
      sounds: ["sounds/demo/wind"],
    });
  });

  test("keeps root-level sound paths when the project has no main key", () => {
    const noKeyInput = {
      ...createInput(),
      key: "",
      eventBindings: {
        one: ["mcsd.weather"],
        two: ["mcsd.weather"],
      },
      eventWeights: { two: { "mcsd.weather": 3 } },
    };
    assert.deepEqual(buildJavaSoundsJson(noKeyInput)["mcsd.weather"], {
      subtitle: "Bells ring",
      sounds: [
        { name: "bell", stream: true },
        { name: "wind", stream: true, weight: 3 },
      ],
    });
    assert.deepEqual(
      buildBedrockSoundDefinitions({ ...noKeyInput, platform: "bedrock" }).sound_definitions["mcsd.weather"]?.sounds,
      ["sounds/bell", { name: "sounds/wind", weight: 3 }],
    );
  });

  test("writes non-default random playback weights for both editions", () => {
    const input = {
      ...createInput(),
      eventWeights: {
        one: { "block.note_block.bell": 3 },
      },
    };
    const javaDefinitions = buildJavaSoundsJson(input);
    const bedrockDefinitions = buildBedrockSoundDefinitions({ ...input, platform: "bedrock" });

    assert.deepEqual(javaDefinitions["block.note_block.bell"]?.sounds, [
      { name: "demo/bell", stream: true, weight: 3 },
      { name: "demo/wind", stream: true },
    ]);
    assert.deepEqual(bedrockDefinitions.sound_definitions["block.note_block.bell"]?.sounds, [
      { name: "sounds/demo/bell", weight: 3 },
      "sounds/demo/wind",
    ]);
  });

  test("groups multiple audio files in one custom event", () => {
    const input = {
      ...createInput(),
      eventBindings: {
        one: ["mcsd.weather"],
        two: ["mcsd.weather"],
      },
      eventWeights: { two: { "mcsd.weather": 3 } },
    };

    assert.deepEqual(buildJavaSoundsJson(input)["mcsd.weather"], {
      subtitle: "Bells ring",
      sounds: [
        { name: "demo/bell", stream: true },
        { name: "demo/wind", stream: true, weight: 3 },
      ],
    });
    assert.deepEqual(
      buildBedrockSoundDefinitions({ ...input, platform: "bedrock" }).sound_definitions["mcsd.weather"]?.sounds,
      ["sounds/demo/bell", { name: "sounds/demo/wind", weight: 3 }],
    );
  });

  test("persists empty custom and vanilla event folders in editor metadata", () => {
    const manifest = buildEditorManifest({
      ...createInput(),
      customEventNames: ["mcsd.empty", "mcsd.bell", "entity.player.levelup"],
    });
    assert.deepEqual(manifest.customEventNames, [
      "mcsd.empty",
      "mcsd.bell",
      "entity.player.levelup",
    ]);
  });

  test("derives custom folders from legacy bindings and suffixes", () => {
    assert.deepEqual(
      deriveCustomEventNames({ one: "bell" }, { one: ["mcsd.weather"], two: [] }).sort(),
      ["mcsd.bell", "mcsd.weather"],
    );
  });

  test("generates platform-specific play and stop commands", () => {
    const javaGroups = buildCommandGroups(createInput());
    const bedrockGroups = buildCommandGroups(createInput("bedrock"));

    assert.equal(javaGroups[1]?.lines[0],
      "/playsound mcsd.bell record @a ~ ~ ~ 10000",
    );
    assert.equal(javaGroups[2]?.lines[0],
      "/stopsound @a record mcsd.bell",
    );
    assert.equal(bedrockGroups[0]?.lines[0],
      "/playsound mcsd.bell @a ~ ~ ~ 10000",
    );
  });
});

describe("audio pack archives", () => {
  test("builds an installable Java resource pack layout", async () => {
    const archive = await buildAudioPackArchive(createInput());
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());

    assert.equal(archive.fileName, "Test Pack-v1.2.9.zip");
    assert.ok(zip.file("pack.mcmeta"));
    assert.ok(zip.file("assets/minecraft/sounds.json"));
    assert.ok(zip.file("assets/minecraft/sounds/demo/bell.ogg"));
    assert.ok(zip.file("assets/minecraft/sounds/demo/wind.ogg"));
    assert.ok(zip.file(".editor/mcsd.json"));
    const editor = JSON.parse(await zip.file(".editor/mcsd.json")!.async("text"));
    assert.equal(editor.schemaVersion, 1);
    assert.equal(editor.project.name, "Test Pack");
    assert.equal(editor.audioFiles[0].archivePath, "assets/minecraft/sounds/demo/bell.ogg");
    assert.deepEqual(editor.soundsJson["mcsd.bell"], buildJavaSoundsJson(createInput())["mcsd.bell"]);
    const packMeta = JSON.parse(await zip.file("pack.mcmeta")!.async("text"));
    assert.equal(packMeta.pack.description, "Test sounds By mcsd v1.2.9");
  });

  test("builds root-level audio files when importing a pack without a main key", async () => {
    const archive = await buildAudioPackArchive({ ...createInput(), key: "" });
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    assert.ok(zip.file("assets/minecraft/sounds/bell.ogg"));
    assert.equal(zip.file("assets/minecraft/sounds/mcsd/bell.ogg"), null);
    const editor = JSON.parse(await zip.file(".editor/mcsd.json")!.async("text"));
    assert.equal(editor.project.key, "");
    assert.equal(editor.audioFiles[0].archivePath, "assets/minecraft/sounds/bell.ogg");
  });

  test("builds an installable Bedrock MCPACK layout", async () => {
    const archive = await buildAudioPackArchive(createInput("bedrock"));
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());

    assert.equal(archive.fileName, "Test Pack-v1.2.9.mcpack");
    assert.ok(zip.file("manifest.json"));
    assert.ok(zip.file("sounds/sound_definitions.json"));
    assert.ok(zip.file("sounds/demo/bell.ogg"));
    assert.ok(zip.file("sounds/demo/wind.ogg"));
    assert.ok(zip.file(".editor/mcsd.json"));
    const editor = JSON.parse(await zip.file(".editor/mcsd.json")!.async("text"));
    assert.equal(editor.project.platform, "bedrock");
    assert.deepEqual(editor.soundsJson.sound_definitions, buildBedrockSoundDefinitions(createInput("bedrock")).sound_definitions);
    const manifest = buildBedrockManifest(createInput("bedrock"));
    assert.equal(manifest.header.description, "Test sounds By mcsd v1.2.9");
    assert.deepEqual(manifest.header.version, [1, 2, 9]);
    assert.deepEqual(manifest.modules[0]?.version, [1, 2, 9]);
  });

  test("adds prerelease suffixes to archive names and descriptions", async () => {
    const input = { ...createInput(), releaseChannel: "beta" as const };
    const archive = await buildAudioPackArchive(input);
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    const packMeta = JSON.parse(await zip.file("pack.mcmeta")!.async("text"));

    assert.equal(archive.fileName, "Test Pack-v1.2.9-Beta.zip");
    assert.equal(packMeta.pack.description, "Test sounds By mcsd v1.2.9-Beta");
    assert.equal(formatProjectVersionTag("2.0.0", "preview"), "v2.0.0-Preview");
  });
});

describe("editor manifests", () => {
  test("includes project and workspace metadata", () => {
    const manifest = buildEditorManifest({
      ...createInput(),
      gameVersion: "1.21.8",
      customEventSuffixes: { one: "bell" },
    });
    assert.equal(manifest.project.gameVersion, "1.21.8");
    assert.deepEqual(manifest.customEventSuffixes, { one: "bell" });
    assert.deepEqual(manifest.eventBindings, createInput().eventBindings);
  });
});

describe("legacy audio pack imports", () => {
  const audioFiles = [
    { id: "bell", key: "bell", reference: "demo/bell" },
    { id: "wind", key: "wind", reference: "demo/ambient/wind" },
    { id: "unused", key: "unused", reference: "demo/unused" },
  ];

  test("restores Java events, subtitles, and weights from sounds.json", () => {
    const mappings = buildLegacySoundMappings("java", audioFiles, {
      "mcsd.bell": {
        subtitle: "Bells ring",
        sounds: [{ name: "demo/bell", stream: true, weight: 3 }],
      },
      "ambient.wind": {
        sounds: ["minecraft:demo/ambient/wind.ogg"],
      },
    });

    assert.deepEqual(mappings.eventBindings.bell, ["mcsd.bell"]);
    assert.deepEqual(mappings.eventBindings.wind, ["ambient.wind"]);
    assert.deepEqual(mappings.eventBindings.unused, []);
    assert.equal(mappings.audioSubtitles.bell, "Bells ring");
    assert.equal(mappings.eventWeights.bell?.["mcsd.bell"], 3);
    assert.equal(mappings.customEventSuffixes.bell, "bell");
  });

  test("restores Bedrock sound definitions and defaults only when definitions are absent", () => {
    const mappings = buildLegacySoundMappings("bedrock", audioFiles, {
      format_version: "1.14.0",
      sound_definitions: {
        "mcsd.wind": {
          category: "record",
          sounds: [{ name: "sounds/demo/ambient/wind", weight: 2 }],
        },
      },
    });
    const withoutDefinitions = buildLegacySoundMappings("java", audioFiles, null);

    assert.deepEqual(mappings.eventBindings.wind, ["mcsd.wind"]);
    assert.equal(mappings.eventWeights.wind?.["mcsd.wind"], 2);
    assert.deepEqual(mappings.eventBindings.bell, []);
    assert.deepEqual(withoutDefinitions.eventBindings.bell, ["mcsd.bell"]);
  });

  test("converts hand-written custom events while preserving vanilla events", () => {
    const converted = convertLegacySoundMappingsToMcsd({
      customEventSuffixes: { custom: "xx", vanilla: "bell" },
      eventBindings: {
        custom: ["xx"],
        vanilla: ["block.note_block.bell"],
      },
      eventWeights: {
        custom: { xx: 3 },
        vanilla: { "block.note_block.bell": 2 },
      },
      audioSubtitles: { custom: "Custom sound" },
    }, (eventName) => eventName === "block.note_block.bell");

    assert.deepEqual(converted.eventBindings.custom, ["mcsd.xx"]);
    assert.deepEqual(converted.eventBindings.vanilla, ["block.note_block.bell"]);
    assert.deepEqual(converted.eventWeights.custom, { "mcsd.xx": 3 });
    assert.deepEqual(converted.eventWeights.vanilla, { "block.note_block.bell": 2 });
    assert.equal(converted.customEventSuffixes.custom, "xx");
    assert.equal(converted.audioSubtitles.custom, "Custom sound");

    const definitions = buildJavaSoundsJson({
      ...createInput(),
      key: "mcsd",
      audioFiles: [{ id: "custom", key: "xx", file: new Blob(["sound"]) }],
      eventBindings: converted.eventBindings,
      eventWeights: converted.eventWeights,
      audioSubtitles: converted.audioSubtitles,
    });
    assert.deepEqual(definitions["mcsd.xx"]?.sounds, [
      { name: "mcsd/xx", stream: true, weight: 3 },
    ]);
  });
});

describe("audio pack icons", () => {
  test("calculates a centered square crop for every aspect ratio", () => {
    assert.deepEqual(calculateCenteredSquareCrop(400, 200), { x: 100, y: 0, size: 200 });
    assert.deepEqual(calculateCenteredSquareCrop(120, 240), { x: 0, y: 60, size: 120 });
    assert.deepEqual(calculateCenteredSquareCrop(64, 64), { x: 0, y: 0, size: 64 });
  });

  test("rejects invalid icon dimensions", () => {
    assert.throws(() => calculateCenteredSquareCrop(0, 256));
    assert.throws(() => calculateCenteredSquareCrop(Number.NaN, 256));
  });
});

describe("audio event weights", () => {
  test("normalizes weights and calculates random playback probability", () => {
    assert.equal(normalizeAudioEventWeight(0), 1);
    assert.equal(normalizeAudioEventWeight(2.6), 3);
    assert.equal(getAudioEventWeight({}, "one", "event"), 1);
    assert.equal(calculateAudioEventProbability(3, 4), 0.75);
  });
});

describe("project versions", () => {
  test("follows the configured version progression", () => {
    const versions = ["0.0.1"];
    for (let index = 0; index < 10; index += 1) {
      versions.push(incrementProjectVersion(versions.at(-1), 10));
    }

    assert.deepEqual(versions, [
      "0.0.1",
      "0.0.2",
      "0.0.3",
      "0.0.4",
      "0.0.5",
      "0.0.6",
      "0.0.7",
      "0.0.8",
      "0.0.9",
      "0.0.10",
      "0.1.0",
    ]);
    assert.equal(incrementProjectVersion("0.1.9", 10), "0.1.10");
    assert.equal(incrementProjectVersion("0.1.10", 10), "0.2.0");
    assert.equal(incrementProjectVersion("0.10.10", 10), "1.0.0");
    assert.equal(incrementProjectVersion("0.0.1", 20), "0.0.2");
    assert.equal(incrementProjectVersion("invalid", 10), "0.0.2");
    assert.equal(normalizeVersionIncrementLimit(101), 100);
    assert.equal(normalizeVersionIncrementLimit(0), 1);
  });

  test("branches from the highest existing project version", () => {
    const latest = getLatestProjectVersion(["1.0.0", "1.0.1", "0.10.10"]);

    assert.equal(latest, "1.0.1");
    assert.equal(incrementProjectVersion(latest, 10), "1.0.2");
    assert.equal(incrementProjectVersion("1.0.10", 10), "1.1.0");
  });
});

describe("project content fingerprints", () => {
  const project = {
    name: "Test Pack",
    key: "demo",
    description: "Test sounds",
    platform: "java" as const,
    javaPackFormat: "64",
    iconDataUrl: null,
    version: "1.0.1",
    releaseChannel: "stable" as const,
  };
  const workspace = {
    projectId: "project-1",
    schemaVersion: 1 as const,
    updatedAt: 1,
    activeStep: 0,
    eventEditorMode: "basic" as const,
    audioFiles: [{
      id: "audio-1",
      blob: new Blob(["sound"], { type: "audio/ogg" }),
      fileName: "sound.ogg",
      fileType: "audio/ogg",
      lastModified: 1,
      originalName: "sound.wav",
      name: "sound.ogg",
      key: "sound",
      size: 5,
      format: "OGG",
      codec: null,
      codecLongName: null,
      bitRate: null,
      sampleRate: null,
      channels: null,
      duration: null,
      analysisStatus: "analyzing" as const,
      conversionStatus: "idle" as const,
    }],
    customEventSuffixes: { "audio-1": "sound" },
    audioEventBindings: { "audio-1": ["mcsd.sound"] },
    audioEventWeights: {},
    audioSubtitles: { "audio-1": "Test subtitle" },
  };

  test("ignores navigation and audio analysis state", () => {
    const baseline = createProjectContentFingerprint(project, workspace);
    const analyzedWorkspace = {
      ...workspace,
      updatedAt: 2,
      activeStep: 2,
      eventEditorMode: "advanced" as const,
      audioFiles: workspace.audioFiles.map((audio) => ({
        ...audio,
        codec: "vorbis",
        analysisStatus: "ready" as const,
      })),
    };

    assert.equal(createProjectContentFingerprint(project, analyzedWorkspace), baseline);
  });

  test("detects project, audio, and event changes", () => {
    const baseline = createProjectContentFingerprint(project, workspace);

    assert.notEqual(
      createProjectContentFingerprint({ ...project, description: "Changed" }, workspace),
      baseline,
    );
    assert.notEqual(
      createProjectContentFingerprint(project, { ...workspace, audioFiles: [] }),
      baseline,
    );
    assert.notEqual(
      createProjectContentFingerprint(project, {
        ...workspace,
        audioEventBindings: { "audio-1": ["block.note_block.bell"] },
      }),
      baseline,
    );
    assert.notEqual(
      createProjectContentFingerprint(project, {
        ...workspace,
        customEventNames: ["mcsd.empty"],
      }),
      baseline,
    );
    assert.notEqual(
      createProjectContentFingerprint(project, {
        ...workspace,
        audioSubtitles: { "audio-1": "Changed subtitle" },
      }),
      baseline,
    );
    assert.notEqual(
      createProjectContentFingerprint(project, {
        ...workspace,
        audioEventWeights: { "audio-1": { "mcsd.sound": 2 } },
      }),
      baseline,
    );
  });

  test("ignores empty subtitles while detecting actual subtitle text", () => {
    const withoutSubtitle = createProjectContentFingerprint(project, {
      ...workspace,
      audioSubtitles: {},
    });

    assert.equal(
      createProjectContentFingerprint(project, {
        ...workspace,
        audioSubtitles: { "audio-1": "   " },
      }),
      withoutSubtitle,
    );
    assert.notEqual(
      createProjectContentFingerprint(project, workspace),
      withoutSubtitle,
    );
  });

  test("ignores an empty weight map", () => {
    const withoutWeights = createProjectContentFingerprint(project, {
      ...workspace,
      audioEventWeights: undefined,
    });

    assert.equal(createProjectContentFingerprint(project, workspace), withoutWeights);
  });
});
