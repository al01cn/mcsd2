import { JAVA_SOUND_RENAMES } from "@/lib/java-sound-history";
import { vanillaSoundJava } from "@/lib/sounds";

const nextNames = new Map<string, string[]>();
const previousNames = new Map<string, string[]>();
const knownNames = new Set(Object.keys(vanillaSoundJava));

for (const { before, after } of JAVA_SOUND_RENAMES) {
  nextNames.set(before, [...(nextNames.get(before) ?? []), after]);
  previousNames.set(after, [...(previousNames.get(after) ?? []), before]);
  knownNames.add(before);
  knownNames.add(after);
}

function collectNames(name: string, links: ReadonlyMap<string, readonly string[]>, seen = new Set<string>()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  for (const linked of links.get(name) ?? []) collectNames(linked, links, seen);
  return seen;
}

const aliasesByName = new Map<string, readonly string[]>();
for (const name of knownNames) {
  if (!nextNames.has(name) && !previousNames.has(name)) continue;
  // Traverse forward once, then only backward from each terminal. Never follow
  // another forward branch through a shared old name (e.g. dig.stone).
  const terminals = [...collectNames(name, nextNames)].filter((item) => !nextNames.has(item));
  const aliases = new Set<string>();
  for (const terminal of terminals) {
    for (const alias of collectNames(terminal, previousNames)) aliases.add(alias);
  }
  aliasesByName.set(name, [...aliases]);
}

export function normalizeJavaSoundEventName(rawName: string): string {
  const name = rawName.trim();
  const unqualified = name.replace(/^minecraft:/i, "");
  return knownNames.has(unqualified) ? unqualified : name;
}

export function isVanillaJavaSoundEvent(rawName: string): boolean {
  return knownNames.has(normalizeJavaSoundEventName(rawName));
}

export function getJavaSoundEventNames(rawName: string): readonly string[] {
  const name = normalizeJavaSoundEventName(rawName);
  return aliasesByName.get(name) ?? [name];
}

export function getJavaSoundSearchAliases(rawName: string): readonly string[] {
  const names = getJavaSoundEventNames(rawName);
  return isVanillaJavaSoundEvent(rawName)
    ? names.flatMap((name) => [name, `minecraft:${name}`])
    : [];
}
