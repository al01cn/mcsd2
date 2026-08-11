export type ReleaseChannel = "stable" | "beta" | "preview";

export const DEFAULT_PROJECT_VERSION = "0.0.1";
export const DEFAULT_RELEASE_CHANNEL: ReleaseChannel = "stable";
export const DEFAULT_VERSION_INCREMENT_LIMIT = 10;
export const MAX_VERSION_INCREMENT_LIMIT = 100;

const PROJECT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function isValidProjectVersion(value: string) {
  if (!PROJECT_VERSION_PATTERN.test(value.trim())) return false;
  return value.split(".").every((part) => Number.isSafeInteger(Number(part)));
}

export function parseProjectVersion(value?: string): [number, number, number] {
  const candidate = value?.trim() ?? "";
  if (!isValidProjectVersion(candidate)) return [0, 0, 1];
  const [major, minor, patch] = candidate.split(".").map(Number);
  return [major, minor, patch];
}

export function normalizeProjectVersion(value?: string) {
  return parseProjectVersion(value).join(".");
}

export function formatProjectVersionTag(
  version?: string,
  channel: ReleaseChannel = DEFAULT_RELEASE_CHANNEL,
) {
  const normalizedVersion = `v${normalizeProjectVersion(version)}`;
  if (channel === "beta") return `${normalizedVersion}-Beta`;
  if (channel === "preview") return `${normalizedVersion}-Preview`;
  return normalizedVersion;
}

export function normalizeVersionIncrementLimit(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_VERSION_INCREMENT_LIMIT;
  return Math.min(MAX_VERSION_INCREMENT_LIMIT, Math.max(1, Math.round(value!)));
}

export function incrementProjectVersion(value?: string, configuredLimit?: number) {
  const limit = normalizeVersionIncrementLimit(configuredLimit);
  const [major, minor, patch] = parseProjectVersion(value);

  if (patch < limit) return `${major}.${minor}.${patch + 1}`;
  if (minor < limit) return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

export function compareProjectVersions(a?: string, b?: string) {
  const left = parseProjectVersion(a);
  const right = parseProjectVersion(b);

  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function getLatestProjectVersion(values: Array<string | undefined>) {
  return values.reduce<string>(
    (latest, value) => compareProjectVersions(value, latest) > 0
      ? normalizeProjectVersion(value)
      : latest,
    DEFAULT_PROJECT_VERSION,
  );
}
