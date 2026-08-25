"use client";

import { Button, Modal, Tooltip } from "@heroui/react";
import {
  Archive,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  FileAudio,
  FileJson,
  FileText,
  FolderTree,
  LoaderCircle,
  PackageCheck,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PackPlatform } from "@/app/ui/create-project-modal";
import type { AudioEventWeights } from "@/lib/audio-event-weight";
import {
  buildAudioPackArchive,
  buildCommandGroups,
  buildCommandsText,
  safeDownloadName,
  type AudioPackBuildInput,
} from "@/lib/audio-pack";
import {
  formatProjectVersionTag,
  type ReleaseChannel,
} from "@/lib/project-version";

type ExportAudio = {
  id: string;
  key: string;
  file: File;
  name?: string;
  originalName?: string;
  conversionStatus: "idle" | "queued" | "converting" | "converted" | "skipped" | "error";
};

type ExportProject = {
  name: string;
  key?: string;
  description?: string;
  platform?: PackPlatform;
  javaPackFormat?: string;
  gameVersion?: string;
  iconDataUrl?: string | null;
  version?: string;
  releaseChannel?: ReleaseChannel;
  customEventSuffixes?: Record<string, string>;
  customEventNames?: string[];
};

const COPY = {
  zh: {
    summary: "工程摘要",
    description: "确认产物结构与事件数量，然后下载可直接安装的资源包。",
    project: "工程",
    edition: "游戏版本",
    java: "Java 版",
    bedrock: "基岩版",
    format: "资源包版本",
    version: "音频包版本",
    sounds: "音频文件",
    events: "声音事件",
    output: "输出文件",
    ready: "可以打包",
    notReady: "仍有音频未完成转换，请返回上一步重试。",
    unbound: "个音频未绑定事件，它们会写入包内，但无法通过命令播放。",
    structure: "资源包结构",
    pack: "生成并下载资源包",
    building: "正在压缩资源包",
    built: "资源包已生成并开始下载。",
    commands: "播放命令",
    commandsDescription: "命令根据当前事件绑定实时生成。",
    previewCommands: "查看全部命令",
    commandTxt: "下载命令 TXT",
    noCommands: "还没有可用命令",
    noCommandsDescription: "请返回上一步，至少为一个音频绑定声音事件。",
    copy: "复制",
    copied: "已复制",
    copyAll: "复制全部",
    close: "完成",
    buildFailed: "资源包生成失败，请重试。",
  },
  en: {
    summary: "Project summary",
    description: "Review the output structure and events, then download an installable resource pack.",
    project: "Project",
    edition: "Edition",
    java: "Java Edition",
    bedrock: "Bedrock Edition",
    format: "Pack format",
    version: "Pack version",
    sounds: "Audio files",
    events: "Sound events",
    output: "Output file",
    ready: "Ready to build",
    notReady: "Some audio files are not converted. Return to the previous step and retry.",
    unbound: "audio files have no events. They will be included, but commands cannot play them.",
    structure: "Pack structure",
    pack: "Build and download pack",
    building: "Compressing resource pack",
    built: "The resource pack was built and the download has started.",
    commands: "Play commands",
    commandsDescription: "Commands update from the current event bindings.",
    previewCommands: "View all commands",
    commandTxt: "Download command TXT",
    noCommands: "No commands available",
    noCommandsDescription: "Return to the previous step and bind at least one sound event.",
    copy: "Copy",
    copied: "Copied",
    copyAll: "Copy all",
    close: "Done",
    buildFailed: "Could not build the resource pack. Try again.",
  },
} as const;

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ExportWorkspace({
  project,
  audioFiles,
  eventBindings,
  eventWeights,
  audioSubtitles,
  customEventSuffixes,
  customEventNames,
  language,
  variant = "desktop",
}: {
  project: ExportProject | undefined;
  audioFiles: ExportAudio[];
  eventBindings: Record<string, string[]>;
  eventWeights: AudioEventWeights;
  audioSubtitles: Record<string, string>;
  customEventSuffixes?: Record<string, string>;
  customEventNames?: string[];
  language: "zh" | "en";
  variant?: "desktop" | "mobile";
}) {
  const c = COPY[language];
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildComplete, setBuildComplete] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const platform = project?.platform ?? "java";
  const input = useMemo<AudioPackBuildInput>(() => ({
    name: project?.name ?? "MCSD2 Audio Pack",
    key: project?.key ?? "mcsd",
    description: project?.description,
    platform,
    javaPackFormat: project?.javaPackFormat,
    gameVersion: project?.gameVersion,
    iconDataUrl: project?.iconDataUrl,
    version: project?.version,
    releaseChannel: project?.releaseChannel,
    audioFiles: audioFiles.map((audio) => ({
      id: audio.id,
      key: audio.key,
      file: audio.file,
      name: audio.name,
      originalName: audio.originalName,
      format: "OGG",
      codec: "vorbis",
      codecLongName: "Vorbis",
      bitRate: null,
      sampleRate: 44100,
      channels: 2,
      duration: null,
    })),
    eventBindings,
    eventWeights,
    audioSubtitles,
    customEventSuffixes,
    customEventNames,
  }), [audioFiles, audioSubtitles, customEventNames, customEventSuffixes, eventBindings, eventWeights, platform, project]);
  const commandGroups = useMemo(() => buildCommandGroups(input), [input]);
  const allCommands = useMemo(
    () => commandGroups.flatMap((group) => group.lines),
    [commandGroups],
  );
  const uniqueEventCount = useMemo(
    () => new Set(Object.values(eventBindings).flat().map((event) => event.trim()).filter(Boolean)).size,
    [eventBindings],
  );
  const unboundAudioCount = useMemo(
    () => audioFiles.filter((audio) => !(eventBindings[audio.id] ?? []).some((event) => event.trim())).length,
    [audioFiles, eventBindings],
  );
  const isReady = audioFiles.length > 0 && audioFiles.every(
    (audio) => audio.conversionStatus === "converted" || audio.conversionStatus === "skipped",
  );
  const archiveExtension = platform === "bedrock" ? "mcpack" : "zip";
  const versionTag = formatProjectVersionTag(input.version, input.releaseChannel);
  const archiveName = `${safeDownloadName(input.name)}-${versionTag}.${archiveExtension}`;
  const treeLines = platform === "java"
    ? [".editor/mcsd.json", "pack.mcmeta", ...(project?.iconDataUrl ? ["pack.png"] : []), "assets/minecraft/sounds.json", `assets/minecraft/sounds/${input.key}/…`]
    : [".editor/mcsd.json", "manifest.json", ...(project?.iconDataUrl ? ["pack_icon.png"] : []), "sounds/sound_definitions.json", `sounds/${input.key}/…`];

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const markCopied = (value: string) => {
    setCopiedValue(value);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopiedValue(null), 1_500);
  };

  const handleCopy = async (value: string, marker = value) => {
    await copyText(value);
    markCopied(marker);
  };

  const handleBuild = async () => {
    if (!isReady || isBuilding) return;
    setIsBuilding(true);
    setBuildComplete(false);
    setBuildError(null);
    setBuildProgress(0);

    try {
      const archive = await buildAudioPackArchive(input, setBuildProgress);
      downloadBlob(archive.blob, archive.fileName);
      setBuildProgress(100);
      setBuildComplete(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setBuildError(detail ? `${c.buildFailed} ${detail}` : c.buildFailed);
    } finally {
      setIsBuilding(false);
    }
  };

  const downloadCommands = () => {
    const content = buildCommandsText(input, language);
    downloadBlob(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
      `${safeDownloadName(input.name)}-${versionTag}_playsound.txt`,
    );
  };

  const buildButton = (
    <Button
      className={variant === "mobile"
        ? "mobile-export-build"
        : "wiki-button wiki-button--primary export-build-button"}
      isDisabled={!isReady || isBuilding}
      onPress={() => void handleBuild()}
    >
      {isBuilding ? (
        <LoaderCircle aria-hidden="true" className="export-spinner" size={18} />
      ) : (
        <Archive aria-hidden="true" size={18} />
      )}
      <span>{isBuilding ? `${c.building} ${buildProgress}%` : c.pack}</span>
    </Button>
  );

  const mobileWorkspace = (
    <div className="mobile-export-workspace">
      <section className="mobile-export-summary">
        <header>
          <span className="mobile-export-summary__icon">
            <PackageCheck aria-hidden="true" size={22} />
          </span>
          <div>
            <span>{c.summary}</span>
            <h3>{input.name}</h3>
          </div>
          <code>{versionTag}</code>
        </header>

        <dl className="mobile-export-facts">
          <div><dt>{c.project}</dt><dd>{input.name}</dd></div>
          <div><dt>{c.version}</dt><dd>{versionTag}</dd></div>
          <div><dt>{c.sounds}</dt><dd>{audioFiles.length}</dd></div>
          <div><dt>{c.events}</dt><dd>{uniqueEventCount}</dd></div>
          <div><dt>{c.output}</dt><dd>{archiveExtension.toUpperCase()}</dd></div>
        </dl>

        <div className={`mobile-export-readiness${isReady ? " is-ready" : " is-error"}`}>
          {isReady ? <Check aria-hidden="true" size={16} /> : <TriangleAlert aria-hidden="true" size={16} />}
          <span>{isReady ? c.ready : c.notReady}</span>
        </div>
        {unboundAudioCount > 0 ? (
          <div className="mobile-export-warning">
            <TriangleAlert aria-hidden="true" size={16} />
            <span><strong>{unboundAudioCount}</strong> {c.unbound}</span>
          </div>
        ) : null}

        {buildButton}
        {isBuilding ? <div className="export-progress"><span style={{ width: `${buildProgress}%` }} /></div> : null}
        {buildComplete ? <p className="export-success"><Check aria-hidden="true" size={14} />{c.built}</p> : null}
        {buildError ? <p className="export-error"><TriangleAlert aria-hidden="true" size={14} />{buildError}</p> : null}
      </section>

      <section className="mobile-export-tools">
        <header>
          <div>
            <span>{c.commands}</span>
            <strong>{archiveName}</strong>
          </div>
          <Terminal aria-hidden="true" size={20} />
        </header>
        <p>{allCommands.length > 0 ? c.commandsDescription : c.noCommandsDescription}</p>
        <div>
          <Button
            className="mobile-export-tool-button"
            isDisabled={allCommands.length === 0}
            onPress={() => setCommandsOpen(true)}
          >
            <Terminal aria-hidden="true" size={17} />
            {c.previewCommands}
          </Button>
          <Button
            className="mobile-export-tool-button"
            isDisabled={allCommands.length === 0}
            onPress={downloadCommands}
          >
            <FileText aria-hidden="true" size={17} />
            {c.commandTxt}
          </Button>
        </div>
      </section>
    </div>
  );

  return (
    <>
      {variant === "mobile" ? mobileWorkspace : (
      <div className="export-workspace">
        <section className="export-summary-panel">
          <div className="export-section-heading">
            <PackageCheck aria-hidden="true" size={19} />
            <div>
              <h3>{c.summary}</h3>
              <p>{c.description}</p>
            </div>
          </div>

          <dl className="project-summary">
            <div><dt>{c.project}</dt><dd>{input.name}</dd></div>
            <div><dt>{c.edition}</dt><dd>{platform === "java" ? c.java : c.bedrock}</dd></div>
            {platform === "java" ? <div><dt>{c.format}</dt><dd>{project?.javaPackFormat || "15"}</dd></div> : null}
            <div><dt>{c.version}</dt><dd><code>{versionTag}</code></dd></div>
            <div><dt>{c.sounds}</dt><dd>{audioFiles.length}</dd></div>
            <div><dt>{c.events}</dt><dd>{uniqueEventCount}</dd></div>
            <div><dt>{c.output}</dt><dd><code>{archiveName}</code></dd></div>
          </dl>

          <div className={`export-readiness${isReady ? " is-ready" : " is-error"}`}>
            {isReady ? <Check aria-hidden="true" size={16} /> : <TriangleAlert aria-hidden="true" size={16} />}
            <span>{isReady ? c.ready : c.notReady}</span>
          </div>
          {unboundAudioCount > 0 ? (
            <div className="export-warning">
              <TriangleAlert aria-hidden="true" size={16} />
              <span><strong>{unboundAudioCount}</strong> {c.unbound}</span>
            </div>
          ) : null}
        </section>

        <section className="export-output-panel">
          <div className="export-section-heading">
            <FolderTree aria-hidden="true" size={19} />
            <div>
              <h3>{c.structure}</h3>
              <p>{archiveName}</p>
            </div>
          </div>
          <div className="export-file-tree">
            {treeLines.map((line, index) => (
              <div key={line}>
                {line.endsWith("…") ? <FileAudio aria-hidden="true" size={14} /> : <FileJson aria-hidden="true" size={14} />}
                <code>{line}</code>
                {index === 1 ? <span>{archiveExtension.toUpperCase()}</span> : null}
              </div>
            ))}
          </div>

          {buildButton}
          {isBuilding ? <div className="export-progress"><span style={{ width: `${buildProgress}%` }} /></div> : null}
          {buildComplete ? <p className="export-success"><Check aria-hidden="true" size={14} />{c.built}</p> : null}
          {buildError ? <p className="export-error"><TriangleAlert aria-hidden="true" size={14} />{buildError}</p> : null}
        </section>

        <section className="export-command-panel">
          <div className="export-section-heading">
            <Terminal aria-hidden="true" size={19} />
            <div>
              <h3>{c.commands}</h3>
              <p>{c.commandsDescription}</p>
            </div>
          </div>
          {allCommands.length > 0 ? (
            <div className="command-preview">
              {allCommands.slice(0, 3).map((command) => <code key={command}>{command}</code>)}
              {allCommands.length > 3 ? <span>+{allCommands.length - 3}</span> : null}
            </div>
          ) : (
            <div className="command-empty">
              <strong>{c.noCommands}</strong>
              <span>{c.noCommandsDescription}</span>
            </div>
          )}
          <div className="export-command-actions">
            <Button
              className="wiki-button wiki-button--neutral"
              isDisabled={allCommands.length === 0}
              onPress={() => setCommandsOpen(true)}
            >
              <Terminal aria-hidden="true" size={16} />
              {c.previewCommands}
            </Button>
            <Button
              className="wiki-button wiki-button--neutral"
              isDisabled={allCommands.length === 0}
              onPress={downloadCommands}
            >
              <FileText aria-hidden="true" size={16} />
              {c.commandTxt}
            </Button>
          </div>
        </section>
      </div>
      )}

      <Modal.Backdrop
        isOpen={commandsOpen}
        onOpenChange={setCommandsOpen}
        className="wiki-modal-backdrop"
        variant="opaque"
      >
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className={`wiki-modal command-modal sm:max-w-[980px]${
            variant === "mobile" ? " command-modal--mobile" : ""
          }`}>
              <Modal.CloseTrigger className="wiki-modal__close" />
              <Modal.Header className="wiki-modal__header">
                <Modal.Icon className="wiki-modal__icon"><Terminal aria-hidden="true" size={20} /></Modal.Icon>
                <div>
                  <Modal.Heading className="wiki-modal__heading">{c.commands}</Modal.Heading>
                  <p className="wiki-modal__description">{c.commandsDescription}</p>
                </div>
              </Modal.Header>
              <Modal.Body className="wiki-modal__body command-modal__body">
                <div className="command-modal__toolbar">
                  <span>{uniqueEventCount} {c.events}</span>
                  <div>
                    <Button
                      className="wiki-button wiki-button--neutral"
                      onPress={() => void handleCopy(buildCommandsText(input, language), "__all__")}
                    >
                      {copiedValue === "__all__" ? <Check aria-hidden="true" size={15} /> : <ClipboardCopy aria-hidden="true" size={15} />}
                      {copiedValue === "__all__" ? c.copied : c.copyAll}
                    </Button>
                    <Button className="wiki-button wiki-button--neutral" onPress={downloadCommands}>
                      <Download aria-hidden="true" size={15} />
                      {c.commandTxt}
                    </Button>
                  </div>
                </div>
                <div className="command-groups">
                  {commandGroups.map((group) => (
                    <section key={group.id} className="command-group">
                      <header>
                        <Terminal aria-hidden="true" size={15} />
                        <h4>{language === "zh" ? group.titleZh : group.titleEn}</h4>
                        <span>{group.lines.length}</span>
                      </header>
                      <div>
                        {group.lines.map((command) => (
                          <div className="command-row" key={`${group.id}:${command}`}>
                            <code>{command}</code>
                            <Tooltip>
                              <Button
                                isIconOnly
                                aria-label={copiedValue === command ? c.copied : c.copy}
                                className="command-copy-button"
                                onPress={() => void handleCopy(command)}
                              >
                                {copiedValue === command ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
                              </Button>
                              <Tooltip.Content>{copiedValue === command ? c.copied : c.copy}</Tooltip.Content>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </Modal.Body>
              <Modal.Footer className="wiki-modal__footer">
                <Button slot="close" className="wiki-button wiki-button--primary">{c.close}</Button>
              </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
