import assert from "node:assert/strict";
import { describe, test } from "node:test";
import JSZip from "jszip";
import {
  getJavaSoundEventNames,
  getJavaSoundSearchAliases,
  isVanillaJavaSoundEvent,
  normalizeJavaSoundEventName,
} from "@/lib/java-sound-aliases";
import { JAVA_SOUND_RENAMES } from "@/lib/java-sound-history";
import {
  buildAudioPackArchive,
  buildBedrockSoundDefinitions,
  buildEditorManifest,
  buildJavaSoundsJson,
  buildLegacySoundMappings,
  convertLegacySoundMappingsToMcsd,
  type AudioPackBuildInput,
} from "@/lib/audio-pack";
import { searchSoundEventKeys } from "@/lib/SoundsTranslate";
import { vanillaSoundJava } from "@/lib/sounds";

function input(events: string[] = ["entity.item.pickup"]): AudioPackBuildInput {
  return {
    name: "Compatibility",
    platform: "java",
    key: "demo",
    audioFiles: [{ id: "one", key: "pickup", file: new Blob(["sound"]) }],
    eventBindings: { one: events },
    eventWeights: { one: Object.fromEntries(events.map((event) => [event, 3])) },
    audioSubtitles: { one: "Pickup" },
  };
}

describe("Java sound history", () => {
  test("has unique, acyclic, versioned transitions", () => {
    const pairs = JAVA_SOUND_RENAMES.map(({ before, after }) => `${before}>${after}`);
    assert.equal(new Set(pairs).size, pairs.length);
    const next = new Map<string, string[]>();
    for (const row of JAVA_SOUND_RENAMES) {
      assert.match(row.version, /^\d+\.\d+(?:\.\d+)?$/);
      assert.notEqual(row.before, row.after);
      next.set(row.before, [...(next.get(row.before) ?? []), row.after]);
    }
    function visit(name: string, seen: Set<string>) {
      assert.ok(!seen.has(name), `Cycle at ${name}`);
      for (const child of next.get(name) ?? []) visit(child, new Set([...seen, name]));
    }
    for (const name of next.keys()) visit(name, new Set());
  });

  for (const names of [
    ["entity.item.pickup", "random.pop"],
    ["block.note_block.harp", "block.note.harp", "note.harp"],
    ["music_disc.cat", "record.cat", "records.cat"],
    ["entity.zombified_piglin.ambient", "entity.zombie_pigman.ambient", "entity.zombie_pig.ambient", "mob.zombiepig.zpig"],
    ["entity.firework_rocket.large_blast", "entity.firework.large_blast", "fireworks.largeBlast"],
    ["block.sweet_berry_bush.pick_berries", "item.sweet_berries.pick_from_bush"],
    ["item.lead.break", "entity.leash_knot.break", "entity.leashknot.break"],
  ]) {
    test(`expands every historical name in ${names[0]}`, () => {
      for (const name of names) assert.deepEqual(getJavaSoundEventNames(name), names);
    });
  }

  test("shared historical names do not connect modern siblings", () => {
    assert.deepEqual(getJavaSoundEventNames("block.stone.break"), ["block.stone.break", "dig.stone"]);
    assert.deepEqual(getJavaSoundEventNames("block.stone.place"), ["block.stone.place", "dig.stone"]);
    assert.deepEqual(getJavaSoundEventNames("dig.stone"), ["block.stone.break", "dig.stone", "block.stone.place"]);
    assert.ok(!getJavaSoundEventNames("entity.item.pickup").includes("entity.item_frame.add_item"));
    assert.ok(!getJavaSoundEventNames("entity.wolf.howl").includes("entity.wolf_angry.ambient"));
  });

  test("recognizes vanilla namespace prefixes without rewriting other names", () => {
    assert.deepEqual(getJavaSoundEventNames(" minecraft:random.pop "), ["entity.item.pickup", "random.pop"]);
    assert.equal(normalizeJavaSoundEventName("minecraft:entity.item.pickup"), "entity.item.pickup");
    for (const name of ["mcsd.random_pop", "mod:random.pop", "unknown.sound", "minecraft:unknown.sound", "constructor"]) {
      assert.equal(isVanillaJavaSoundEvent(name), false);
      assert.deepEqual(getJavaSoundEventNames(name), [name]);
      assert.deepEqual(getJavaSoundSearchAliases(name), []);
    }
    assert.equal(isVanillaJavaSoundEvent("minecraft:fireworks.largeBlast"), true);
  });
});

describe("Java compatibility export", () => {
  for (const events of [
    ["entity.item.pickup"],
    ["random.pop"],
    ["entity.item.pickup", "random.pop", "random.pop"],
    ["minecraft:random.pop"],
  ]) {
    test(`exports the same definitions from ${events.join(", ")}`, () => {
      const definitions = buildJavaSoundsJson(input(events));
      const expected = {
        replace: true,
        subtitle: "Pickup",
        sounds: [{ name: "demo/pickup", stream: true, weight: 3 }],
      };
      assert.deepEqual(definitions["entity.item.pickup"], expected);
      assert.deepEqual(definitions["random.pop"], expected);
      assert.equal(Object.keys(definitions).length, 2);
    });
  }

  test("does not depend on game version or pack format", () => {
    assert.deepEqual(
      buildJavaSoundsJson({ ...input(), gameVersion: "1.8.9", javaPackFormat: "1" }),
      buildJavaSoundsJson({ ...input(), gameVersion: "1.21.8", javaPackFormat: "64" }),
    );
  });

  test("merges different audio and preserves per-audio weights and first subtitle", () => {
    const base = input();
    base.audioFiles.push({ id: "two", key: "second", file: new Blob(["second"]) });
    base.eventBindings.two = ["random.pop"];
    base.eventWeights!.two = { "random.pop": 5 };
    base.audioSubtitles!.two = "Second subtitle";
    const definitions = buildJavaSoundsJson(base);
    assert.deepEqual(definitions["random.pop"], definitions["entity.item.pickup"]);
    assert.deepEqual(definitions["random.pop"].sounds, [
      { name: "demo/pickup", stream: true, weight: 3 },
      { name: "demo/second", stream: true, weight: 5 },
    ]);
    assert.equal(definitions["random.pop"].subtitle, "Pickup");
  });

  test("direct bindings win weight conflicts independently of selection order", () => {
    for (const events of [["random.pop", "entity.item.pickup"], ["entity.item.pickup", "random.pop"]]) {
      const base = input(events);
      base.eventWeights = { one: { "random.pop": 7, "entity.item.pickup": 1 } };
      const definitions = buildJavaSoundsJson(base);
      assert.equal(definitions["random.pop"].sounds[0].weight, 7);
      assert.equal(definitions["entity.item.pickup"].sounds[0].weight, undefined);
    }
  });

  test("uses fixed mapping order for an alias without a direct binding", () => {
    for (const events of [["note.harp", "block.note.harp"], ["block.note.harp", "note.harp"]]) {
      const base = input(events);
      base.eventWeights = { one: { "note.harp": 8, "block.note.harp": 4 } };
      assert.equal(buildJavaSoundsJson(base)["block.note_block.harp"].sounds[0].weight, 4);
    }
  });

  test("deduplicates final paths even across audio IDs and honors later direct weights", () => {
    const base = input(["entity.item.pickup"]);
    base.audioFiles.push({ id: "two", key: "pickup", file: new Blob(["same path"]) });
    base.eventBindings.two = ["random.pop"];
    base.eventWeights!.two = { "random.pop": 1 };
    const definitions = buildJavaSoundsJson(base);
    assert.equal(definitions["random.pop"].sounds.length, 1);
    assert.equal(definitions["random.pop"].sounds[0].weight, undefined);
    assert.equal(definitions["entity.item.pickup"].sounds[0].weight, 3);
  });

  test("merges only the shared old event, not the modern siblings", () => {
    const base = input(["block.stone.break"]);
    base.audioFiles.push({ id: "two", key: "place", file: new Blob(["place"]) });
    base.eventBindings.two = ["block.stone.place"];
    const definitions = buildJavaSoundsJson(base);
    assert.equal(definitions["dig.stone"].sounds.length, 2);
    assert.equal(definitions["block.stone.break"].sounds.length, 1);
    assert.equal(definitions["block.stone.place"].sounds.length, 1);
    assert.equal(definitions["block.stone.hit"], undefined);
  });

  test("keeps original case and leaves new-only/custom events alone", () => {
    const definitions = buildJavaSoundsJson(input([
      "fireworks.largeBlast", "entity.warden.ambient", "mcsd.pickup", "mod:random.pop", "unknown.event",
    ]));
    assert.ok(definitions["fireworks.largeBlast"]);
    assert.equal(definitions["fireworks.largeblast"], undefined);
    assert.equal(definitions["mcsd.pickup"].replace, undefined);
    assert.ok(definitions["mod:random.pop"]);
    assert.ok(definitions["unknown.event"]);
    assert.deepEqual(getJavaSoundEventNames("entity.warden.ambient"), ["entity.warden.ambient"]);
  });

  test("does not expand Bedrock definitions", () => {
    const definitions = buildBedrockSoundDefinitions({ ...input(["random.pop"]), platform: "bedrock" });
    assert.deepEqual(Object.keys(definitions.sound_definitions), ["random.pop"]);
  });

  test("preserves bindings, folders and weights while expanding only the editor snapshot", () => {
    const base = { ...input(), customEventNames: ["entity.item.pickup", "mcsd.empty"] };
    const before = JSON.stringify({ ...base, audioFiles: [] });
    const editor = buildEditorManifest(base);
    assert.deepEqual(editor.eventBindings, base.eventBindings);
    assert.deepEqual(editor.eventWeights, base.eventWeights);
    assert.deepEqual(editor.customEventNames, base.customEventNames);
    assert.ok(editor.soundsJson["random.pop"]);
    assert.equal(JSON.stringify({ ...base, audioFiles: [] }), before);
  });

  test("writes the same definitions to ZIP and editor metadata and round-trips", async () => {
    const base = input(["minecraft:random.pop"]);
    const archive = await buildAudioPackArchive(base);
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    const sounds = JSON.parse(await zip.file("assets/minecraft/sounds.json")!.async("text"));
    const editor = JSON.parse(await zip.file(".editor/mcsd.json")!.async("text"));
    assert.deepEqual(sounds, buildJavaSoundsJson(base));
    assert.deepEqual(editor.soundsJson, sounds);
    assert.deepEqual(editor.eventBindings, base.eventBindings);
    assert.deepEqual(buildJavaSoundsJson({ ...base, ...editor }), sounds);
    const imported = buildLegacySoundMappings("java", [{ id: "one", key: "pickup", reference: "demo/pickup" }], sounds);
    assert.deepEqual(buildJavaSoundsJson({ ...base, ...imported }), sounds);
  });

  test("import keeps known old names and weights instead of converting them to custom events", () => {
    const mappings = buildLegacySoundMappings("java", [{ id: "one", key: "pickup", reference: "demo/pickup" }], {
      "minecraft:random.pop": { subtitle: "Pickup", sounds: [{ name: "demo/pickup", weight: 6 }] },
      "random.pop": { sounds: [{ name: "demo/pickup", weight: 4 }] },
    });
    const converted = convertLegacySoundMappingsToMcsd(mappings, isVanillaJavaSoundEvent);
    assert.deepEqual(converted.eventBindings, mappings.eventBindings);
    assert.deepEqual(converted.eventWeights, mappings.eventWeights);
    const definitions = buildJavaSoundsJson({ ...input(), ...converted });
    assert.ok(definitions["entity.item.pickup"]);
    assert.equal(definitions["mcsd.randompop"], undefined);
  });
});

describe("Java historical event search", () => {
  const keys = Object.keys(vanillaSoundJava);

  test("old names find modern entries exactly once", () => {
    for (const query of ["random.pop", "minecraft:random.pop", " RANDOM.POP "]) {
      assert.deepEqual(searchSoundEventKeys(keys, query, getJavaSoundSearchAliases), ["entity.item.pickup"]);
    }
    assert.equal(searchSoundEventKeys(keys, "fireworks.largeBlast", getJavaSoundSearchAliases)[0], "entity.firework_rocket.large_blast");
  });

  test("shared old names return each modern branch once", () => {
    const results = searchSoundEventKeys(keys, "dig.stone", getJavaSoundSearchAliases);
    assert.deepEqual(results.sort(), ["block.stone.break", "block.stone.place"]);
  });

  test("exact old-name matches precede substring matches", () => {
    assert.deepEqual(searchSoundEventKeys(
      ["example.random.pop.extra", "entity.item.pickup"], "random.pop", getJavaSoundSearchAliases,
    ), ["entity.item.pickup", "example.random.pop.extra"]);
  });

  test("default/Bedrock search has no Java aliases", () => {
    assert.deepEqual(searchSoundEventKeys(keys, "random.pop"), []);
    assert.deepEqual(searchSoundEventKeys(keys, "", getJavaSoundSearchAliases), keys);
  });

  test("preserves current-name and Chinese search ranking", () => {
    for (const query of ["猪", "pig", "entity.item.pickup"]) {
      assert.equal(
        searchSoundEventKeys(keys, query, getJavaSoundSearchAliases)[0],
        searchSoundEventKeys(keys, query)[0],
      );
    }
  });
});
