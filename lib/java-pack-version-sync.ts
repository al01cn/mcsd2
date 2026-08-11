import fallbackJavaPackVersions, { type JavaPackVersion } from "@/lib/mcver";

const CACHE_KEY = "mcsd.java-pack-versions.v1";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const WIKI_API_URL = "https://minecraft.wiki/api.php";

type JavaPackVersionCache = {
  schemaVersion: 1;
  source: "minecraft.wiki";
  fetchedAt: number;
  revisionId: number | null;
  versions: JavaPackVersion[];
};

type WikiParseResponse = {
  parse?: {
    revid?: number;
    text?: string;
  };
};

function cleanText(value: string) {
  return value
    .replace(/\[[^\]]*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getJavaEditionPackFormatTable(document: Document) {
  return Array.from(document.querySelectorAll("table")).find((table) => {
    const firstRow = table.rows[0];
    if (!firstRow) return false;
    const headings = Array.from(firstRow.cells).map((cell) =>
      cleanText(cell.textContent ?? "").toLowerCase(),
    );
    return headings.includes("client version") && headings.includes("resource pack format");
  }) ?? null;
}

function normalizeClientVersion(value: string) {
  const version = cleanText(value).replace(/^Java Edition\s+/i, "");
  if (!version || /unobfuscated/i.test(version)) return null;
  return version
    .replace(/\s+Release Candidate\s+(\d+)$/i, "-rc$1")
    .replace(/\s+Pre-Release\s+(\d+)$/i, "-pre$1")
    .replace(/\s+Snapshot\s+(\d+)$/i, "-snapshot-$1")
    .replace(/\s+/g, "-");
}

function parseJavaEditionTable(table: HTMLTableElement) {
  const versionsByFormat = new Map<string, string[]>();
  let currentResourceFormat = "";
  let remainingResourceFormatRows = 0;

  for (const row of Array.from(table.rows).slice(1)) {
    const cells = Array.from(row.cells);
    if (!cells[0]) continue;

    if (remainingResourceFormatRows > 0) {
      remainingResourceFormatRows -= 1;
    } else {
      const resourceFormatCell = cells[1];
      const candidate = cleanText(resourceFormatCell?.textContent ?? "");
      currentResourceFormat = /^\d+(?:\.\d+)?$/.test(candidate) ? candidate : "";
      remainingResourceFormatRows = Math.max(
        0,
        Number(resourceFormatCell?.getAttribute("rowspan") ?? "1") - 1,
      );
    }

    const version = normalizeClientVersion(cells[0].textContent ?? "");
    if (!currentResourceFormat || !version) continue;
    const formatVersions = versionsByFormat.get(currentResourceFormat) ?? [];
    if (!formatVersions.includes(version)) formatVersions.push(version);
    versionsByFormat.set(currentResourceFormat, formatVersions);
  }

  return Array.from(versionsByFormat, ([packFormat, versions]) => {
    const newestVersion = versions[0];
    const oldestVersion = versions.at(-1);
    return {
      pack_format: packFormat,
      version: oldestVersion === newestVersion
        ? newestVersion
        : `${oldestVersion}-${newestVersion}`,
    };
  }).filter((item): item is JavaPackVersion => Boolean(item.version));
}

function normalizeVersions(versions: JavaPackVersion[]) {
  return versions
    .filter((item) =>
      /^\d+(?:\.\d+)?$/.test(item.pack_format)
      && item.version.length > 0
      && item.version.length <= 120,
    )
    .slice(0, 500);
}

function isUsableVersionList(versions: JavaPackVersion[]) {
  const formats = new Set(versions.map((item) => item.pack_format));
  const latestFallbackFormat = Math.max(
    ...fallbackJavaPackVersions.map((item) => Number(item.pack_format)),
  );
  const latestRemoteFormat = Math.max(...versions.map((item) => Number(item.pack_format)));
  return versions.length >= 50
    && formats.has("1")
    && formats.has("64")
    && latestRemoteFormat >= latestFallbackFormat;
}

export function parseWikiJavaPackVersions(html: string) {
  if (typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(html, "text/html");
  const table = getJavaEditionPackFormatTable(document);
  if (!table) return [];
  const versions = normalizeVersions(parseJavaEditionTable(table));
  return isUsableVersionList(versions) ? versions : [];
}

export function readJavaPackVersionCache() {
  if (typeof window === "undefined") return null;

  try {
    const rawCache = window.localStorage.getItem(CACHE_KEY);
    if (!rawCache) return null;
    const cache = JSON.parse(rawCache) as JavaPackVersionCache;
    if (
      cache.schemaVersion !== 1
      || cache.source !== "minecraft.wiki"
      || !Number.isFinite(cache.fetchedAt)
      || !Array.isArray(cache.versions)
    ) return null;
    const versions = normalizeVersions(cache.versions);
    if (!isUsableVersionList(versions)) return null;
    return { ...cache, versions };
  } catch {
    return null;
  }
}

export function isJavaPackVersionCacheFresh(cache: JavaPackVersionCache) {
  return Date.now() - cache.fetchedAt < CACHE_MAX_AGE;
}

export async function fetchWikiJavaPackVersions(signal?: AbortSignal) {
  const url = new URL(WIKI_API_URL);
  url.search = new URLSearchParams({
    action: "parse",
    page: "Pack format",
    prop: "text|revid",
    format: "json",
    formatversion: "2",
    origin: "*",
  }).toString();
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Minecraft Wiki returned ${response.status}`);
  const result = await response.json() as WikiParseResponse;
  const versions = parseWikiJavaPackVersions(result.parse?.text ?? "");
  if (!versions.length) throw new Error("Minecraft Wiki pack format table could not be parsed");

  const cache: JavaPackVersionCache = {
    schemaVersion: 1,
    source: "minecraft.wiki",
    fetchedAt: Date.now(),
    revisionId: Number.isFinite(result.parse?.revid) ? result.parse?.revid ?? null : null,
    versions,
  };
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A successful sync remains usable for this session when storage is unavailable.
  }
  return cache;
}
