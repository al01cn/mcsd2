import type {
  PersistedProjectVersionMetadata,
  PersistedProjectWorkspace,
} from "@/lib/project-workspace-db";

function sortedEntries<T>(record: Record<string, T>) {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function sortedNestedEntries(record: Record<string, Record<string, number>>) {
  return sortedEntries(record).map(([key, values]) => [key, sortedEntries(values)] as const);
}

function hashContent(value: string) {
  let first = 0xdeadbeef ^ value.length;
  let second = 0x41c6ce57 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    first = Math.imul(first ^ character, 2654435761);
    second = Math.imul(second ^ character, 1597334677);
  }

  first = Math.imul(first ^ (first >>> 16), 2246822507)
    ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507)
    ^ Math.imul(first ^ (first >>> 13), 3266489909);

  return `${(second >>> 0).toString(16).padStart(8, "0")}${
    (first >>> 0).toString(16).padStart(8, "0")
  }`;
}

export function createProjectContentFingerprint(
  project: PersistedProjectVersionMetadata,
  workspace: PersistedProjectWorkspace,
) {
  const audioSubtitles = sortedEntries(workspace.audioSubtitles ?? {}).filter(
    ([, subtitle]) => subtitle.trim().length > 0,
  );
  const audioEventWeights = sortedNestedEntries(workspace.audioEventWeights ?? {}).filter(
    ([, weights]) => weights.length > 0,
  );
  const content = JSON.stringify({
    project,
    audioFiles: workspace.audioFiles.map((audio) => ({
      id: audio.id,
      fileName: audio.fileName,
      fileType: audio.fileType,
      lastModified: audio.lastModified,
      originalName: audio.originalName,
      name: audio.name,
      key: audio.key,
      size: audio.size,
      format: audio.format,
      blobSize: audio.blob.size,
      blobType: audio.blob.type,
    })),
    customEventSuffixes: sortedEntries(workspace.customEventSuffixes),
    audioEventBindings: sortedEntries(workspace.audioEventBindings),
    ...(audioEventWeights.length > 0 ? { audioEventWeights } : {}),
    ...(audioSubtitles.length > 0 ? { audioSubtitles } : {}),
  });

  return hashContent(content);
}
