import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { JAVA_SOUND_RENAMES } from "../lib/java-sound-history";

// Content-addressed original Mojang sounds.json files, resolved through the
// launcher version manifest and asset indexes. No downloaded data is committed.
const assets = {
  "1.8.9": "5e06ca070067486427a3167ade2ffe01623e5591",
  "1.9": "97accfa8d1505c3c2de436883c58efff7266fdc5",
  "1.12.2": "975a99ed9870f51bbae348533d775d730e3fee18",
  "1.13": "e6fbfd02f0c7b3cf745cd623e2a9e218ff41a32f",
  "1.14": "b9be2246b416bbff0749415d4482a06d82fee78a",
  "1.16": "eba408d95e5cbb92a37f31524aaf7e4100302af6",
  "1.17": "31c5637f3d0d4c08fbbe16387956460f141616a1",
  "1.20": "40a4222b7ada165fa98cb9215129aeb8d9b6b379",
  "1.20.6": "427feddfacf01984a95a15ffad70bf3531dbf344",
  "1.21": "09eab141cce7550f9a74c65db0e9abbb342cf50f",
  "1.21.5": "054ce6faf33806879f0f1f38204ee9eb080388ec",
  "1.21.6": "25fe1e45f2f3f67a59ccf53652f8e4182056f6cb",
};
const transitions: Record<string, readonly [string, string]> = {
  "1.9": ["1.8.9", "1.9"],
  "1.13": ["1.12.2", "1.13"],
  "1.16": ["1.14", "1.16"],
  "1.17": ["1.16", "1.17"],
  "1.20": ["registry:1.19.4", "1.20"],
  "1.20.5": ["registry:1.20.3", "1.20.6"],
  "1.21": ["1.20.6", "1.21"],
  "1.21.6": ["1.21.5", "1.21.6"],
};
const viaRevision = "588376a2839cabfad448166dfb8f3ecd0eb9f637";

async function fetchBytes(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  assert.ok(response.ok, `${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const catalogs = new Map<string, Set<string>>();
await Promise.all(Object.entries(assets).map(async ([version, hash]) => {
  const bytes = await fetchBytes(`https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`);
  assert.equal(createHash("sha1").update(bytes).digest("hex"), hash);
  catalogs.set(version, new Set(Object.keys(JSON.parse(bytes.toString("utf8")))));
}));

// These asset indexes were updated in place and no longer contain their old
// experimental names. Check the version-specific extracted registries instead.
await Promise.all(["1.19.4", "1.20.3"].map(async (version) => {
  const bytes = await fetchBytes(
    `https://raw.githubusercontent.com/ViaVersion/Mappings/${viaRevision}/mappings/mapping-${version}.json`,
  );
  const registry = JSON.parse(bytes.toString("utf8"));
  assert.ok(Array.isArray(registry.sounds));
  catalogs.set(`registry:${version}`, new Set(registry.sounds));
}));

for (const { before, after, version } of JAVA_SOUND_RENAMES) {
  const [oldCatalog, newCatalog] = transitions[version];
  assert.ok(catalogs.get(oldCatalog)?.has(before), `Missing ${before} in ${oldCatalog}`);
  assert.ok(catalogs.get(newCatalog)?.has(after), `Missing ${after} in ${newCatalog}`);
}

const renamedLegacy = new Set(JAVA_SOUND_RENAMES.filter((row) => row.version === "1.9").map((row) => row.before));
for (const name of catalogs.get("1.8.9")!) {
  assert.ok(catalogs.get("1.9")!.has(name) || renamedLegacy.has(name), `Unreviewed legacy event: ${name}`);
}
console.log(`Verified ${JAVA_SOUND_RENAMES.length} transitions against pinned original assets and versioned registries.`);
