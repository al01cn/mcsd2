"use client";

import { Button, Dropdown, Label } from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  EllipsisVertical,
  FileAudio,
  FolderOpen,
  KeyRound,
  LoaderCircle,
  PackageOpen,
  Pause,
  PencilLine,
  Play,
  Plus,
  RefreshCcw,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { WaveformIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { NoviceEventManager } from "@/app/ui/novice-event-manager";
import {
  CreateOrImportModal,
  type NewProjectData,
  type PackPlatform,
} from "@/app/ui/create-project-modal";
import { ExportWorkspace } from "@/app/ui/export-workspace";
import type { AudioEventWeights } from "@/lib/audio-event-weight";
import { ComplianceFooter } from "@/app/ui/compliance-footer";
import type { ReleaseChannel } from "@/lib/project-version";

type Language = "zh" | "en";

type MobileProject = {
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
};

type MobileAudio = {
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
  analysisStatus: "analyzing" | "ready" | "error";
  conversionStatus: "idle" | "queued" | "converting" | "converted" | "skipped" | "error";
};

const COPY = {
  zh: {
    appName: "MCSD2 音频包",
    projects: "我的音频包",
    projectsHint: "保存在当前设备",
    create: "创建或导入",
    empty: "还没有音频包",
    emptyHint: "创建一个工程，从手机里选择音频开始制作。",
    sounds: "个音频",
    updated: "更新",
    edit: "修改信息",
    versions: "版本记录",
    delete: "删除工程",
    more: "更多操作",
    audio: "音频",
    events: "事件",
    export: "导出",
    home: "项目",
    addAudio: "添加手机里的音频",
    addAudioHint: "支持 MP3、WAV、FLAC、M4A、OGG",
    noAudio: "还没有音频",
    noAudioHint: "添加音频后，可以试听并转换成 Minecraft 所需格式。",
    local: "素材仅在本机处理，不会上传到服务器",
    convert: "转换并设置事件",
    converting: "正在处理",
    remove: "删除音频",
    removeAction: "移除",
    modifyKey: "修改 key",
    keyLabel: "音频 key",
    keyPlaceholder: "小写字母、数字、下划线，最多 8 位",
    keyEmptyError: "key 不能为空",
    keyDuplicateError: "该 key 已被其他音频使用",
    cancel: "取消",
    save: "保存",
    play: "播放预览",
    pause: "暂停预览",
    retry: "预览失败，点击重试",
    eventBinding: "声音事件",
    subtitle: "游戏内字幕",
    subtitleHint: "可选，留空则不生成字幕",
    noEvents: "先添加音频",
    noEventsHint: "移动端只提供基础事件绑定，添加音频后即可设置。",
    nextExport: "检查并导出",
    previous: "上一步",
    next: "下一步",
    restart: "返回音频",
    settings: "设置",
  },
  en: {
    appName: "MCSD2 Audio Packs",
    projects: "My audio packs",
    projectsHint: "Saved on this device",
    create: "Create or import",
    empty: "No audio packs yet",
    emptyHint: "Create a project and choose audio from your phone.",
    sounds: "sounds",
    updated: "Updated",
    edit: "Edit info",
    versions: "Version history",
    delete: "Delete project",
    more: "More actions",
    audio: "Audio",
    events: "Events",
    export: "Export",
    home: "Projects",
    addAudio: "Add audio from this phone",
    addAudioHint: "MP3, WAV, FLAC, M4A and OGG",
    noAudio: "No audio yet",
    noAudioHint: "Add audio to preview and convert it for Minecraft.",
    local: "Files stay on this device and are never uploaded",
    convert: "Convert and set events",
    converting: "Processing",
    remove: "Remove audio",
    removeAction: "Remove",
    modifyKey: "Change key",
    keyLabel: "Audio key",
    keyPlaceholder: "Lowercase letters, numbers, underscores, up to 8",
    keyEmptyError: "Key cannot be empty",
    keyDuplicateError: "This key is already in use",
    cancel: "Cancel",
    save: "Save",
    play: "Play preview",
    pause: "Pause preview",
    retry: "Preview failed, tap to retry",
    eventBinding: "Sound event",
    subtitle: "In-game subtitle",
    subtitleHint: "Optional. Leave empty to omit it.",
    noEvents: "Add audio first",
    noEventsHint: "Mobile includes the basic event editor only.",
    nextExport: "Review and export",
    previous: "Previous",
    next: "Next",
    restart: "Back to audio",
    settings: "Settings",
  },
} as const;

const WAVEFORM = [34, 64, 46, 82, 52, 72, 40, 88, 58, 76, 44, 68];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number, language: Language) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function MobilePackIcon({ project }: { project: MobileProject }) {
  return (
    <span className="mobile-project-icon" aria-hidden="true">
      {project.iconDataUrl ? (
        <Image src={project.iconDataUrl} alt="" width={52} height={52} unoptimized />
      ) : (
        <WaveformIcon size={26} weight="bold" />
      )}
    </span>
  );
}

export function MobileWorkspace({
  language,
  colorMode,
  motionEnabled,
  showComplianceInfo,
  view,
  activeStep,
  projects,
  selectedProject,
  audioFiles,
  globalTools,
  versionIncrementLimit,
  inputRef,
  isPreparingAudio,
  preparingAudioIndex,
  audioConversionProgress,
  audioPreparationError,
  previewingAudioId,
  previewLoadingAudioId,
  previewErrorAudioId,
  customEventSuffixes,
  customEventNames,
  audioEventBindings,
  audioEventWeights,
  audioSubtitles,
  onCreateProject,
  onImportProject,
  onOpenProject,
  onEditProject,
  onManageVersions,
  onDeleteProject,
  onShowProjects,
  onStepChange,
  onFiles,
  onPreviewAudio,
  onRemoveAudio,
  onRenameAudioKey,
  onPrepareAudio,
  onCreateCustomEvent,
  onRenameCustomEvent,
  onDeleteEvent,
  onReplaceEvent,
  onEventBindingsChange,
  onEventWeightChange,
  onSubtitleChange,
  onReturnToAudio,
}: {
  language: Language;
  colorMode: "day" | "night";
  motionEnabled: boolean;
  showComplianceInfo: boolean;
  view: "home" | "workspace";
  activeStep: number;
  projects: MobileProject[];
  selectedProject: MobileProject | undefined;
  audioFiles: MobileAudio[];
  globalTools: ReactNode;
  versionIncrementLimit: number;
  inputRef: RefObject<HTMLInputElement | null>;
  isPreparingAudio: boolean;
  preparingAudioIndex: number;
  audioConversionProgress: number;
  audioPreparationError: string | null;
  previewingAudioId: string | null;
  previewLoadingAudioId: string | null;
  previewErrorAudioId: string | null;
  customEventSuffixes: Record<string, string>;
  customEventNames: string[];
  audioEventBindings: Record<string, string[]>;
  audioEventWeights: AudioEventWeights;
  audioSubtitles: Record<string, string>;
  onCreateProject: (data: NewProjectData) => void;
  onImportProject: (file: File) => void | boolean | Promise<void | boolean>;
  onOpenProject: (project: MobileProject) => void;
  onEditProject: (projectId: string) => void;
  onManageVersions: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onShowProjects: () => void;
  onStepChange: (step: number) => void;
  onFiles: (files: FileList | File[]) => void;
  onPreviewAudio: (audio: MobileAudio) => void;
  onRemoveAudio: (audioId: string) => void;
  onRenameAudioKey: (audioId: string, nextKey: string) => string | null;
  onPrepareAudio: () => void;
  onCreateCustomEvent: (eventName: string) => void;
  onRenameCustomEvent: (eventName: string, nextEventName: string) => void;
  onDeleteEvent: (eventName: string) => void;
  onReplaceEvent: (eventName: string, nextEventName: string) => void;
  onEventBindingsChange: (audioId: string, events: string[]) => void;
  onEventWeightChange: (audioId: string, eventName: string, weight: number) => void;
  onSubtitleChange: (audioId: string, subtitle: string) => void;
  onReturnToAudio: () => void;
}) {
  const c = COPY[language];
  const workflowSteps = [c.audio, c.events, c.export];

  const [actionSheetAudioId, setActionSheetAudioId] = useState<string | null>(null);
  const [keyEditorAudioId, setKeyEditorAudioId] = useState<string | null>(null);
  const [keyEditorValue, setKeyEditorValue] = useState("");
  const [keyEditorError, setKeyEditorError] = useState<string | null>(null);
  const longPressRef = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressRef.current !== null) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };

  const startLongPress = (audioId: string) => {
    if (isPreparingAudio) return;
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      setActionSheetAudioId(audioId);
      longPressRef.current = null;
    }, 450);
  };

  const openKeyEditor = (audioId: string) => {
    const audio = audioFiles.find((item) => item.id === audioId);
    setKeyEditorAudioId(audioId);
    setKeyEditorValue(audio?.key ?? "");
    setKeyEditorError(null);
  };

  const submitKeyEditor = () => {
    if (!keyEditorAudioId) return;
    const error = onRenameAudioKey(keyEditorAudioId, keyEditorValue);
    if (error) {
      setKeyEditorError(error === "duplicate" ? c.keyDuplicateError : c.keyEmptyError);
      return;
    }
    setKeyEditorAudioId(null);
    setKeyEditorError(null);
  };

  const renderPreviewIcon = (audio: MobileAudio) => {
    if (previewLoadingAudioId === audio.id) {
      return <LoaderCircle aria-hidden="true" className="mobile-spin" size={20} />;
    }
    if (previewErrorAudioId === audio.id) return <TriangleAlert aria-hidden="true" size={20} />;
    if (previewingAudioId === audio.id) return <Pause aria-hidden="true" size={20} />;
    return <Play aria-hidden="true" size={20} />;
  };

  return (
    <div
      className="mcsd-mobile-app"
      data-color-mode={colorMode}
      data-motion={motionEnabled ? "on" : "off"}
    >
      <header className="mobile-app-bar">
        <div className="mobile-app-bar__identity">
          <span className="mobile-app-bar__mark">
            <WaveformIcon aria-hidden="true" size={22} weight="bold" />
          </span>
          <div>
            <strong>{view === "home" ? c.appName : selectedProject?.name}</strong>
            <span>{view === "home" ? c.projectsHint : `MCSD2 / ${selectedProject?.key ?? "mcsd"}`}</span>
          </div>
        </div>
        <div className="mobile-app-bar__tools">{globalTools}</div>
      </header>

      <main className="mobile-app-content">
        {view === "home" ? (
          <>
            <section className="mobile-home-heading">
              <div>
                <p>{c.projectsHint}</p>
                <h1>{c.projects}</h1>
              </div>
              <span>{projects.length}</span>
            </section>

            <section className="mobile-create-action" aria-label={c.create}>
              <CreateOrImportModal
                language={language}
                versionIncrementLimit={versionIncrementLimit}
                onCreate={onCreateProject}
                onImport={onImportProject}
              />
            </section>

            {projects.length > 0 ? (
              <section className="mobile-project-list" aria-label={c.projects}>
                {projects.map((project) => (
                  <article key={project.id} className="mobile-project-row">
                    <button
                      type="button"
                      className="mobile-project-row__open"
                      onClick={() => onOpenProject(project)}
                    >
                      <MobilePackIcon project={project} />
                      <span className="mobile-project-row__copy">
                        <strong>{project.name}</strong>
                        <span>{project.soundCount} {c.sounds} · {c.updated} {formatDate(project.updatedAt, language)}</span>
                      </span>
                      <ChevronRight aria-hidden="true" size={19} />
                    </button>
                    <Dropdown>
                      <Button
                        isIconOnly
                        aria-label={c.more}
                        className="mobile-project-row__more"
                        variant="ghost"
                      >
                        <EllipsisVertical aria-hidden="true" size={20} />
                      </Button>
                      <Dropdown.Popover className="project-menu-popover" placement="bottom end">
                        <Dropdown.Menu
                          aria-label={c.more}
                          onAction={(key) => {
                            if (key === "edit") onEditProject(project.id);
                            if (key === "versions") onManageVersions(project.id);
                            if (key === "delete") onDeleteProject(project.id);
                          }}
                        >
                          <Dropdown.Item id="edit" textValue={c.edit}>
                            <PencilLine aria-hidden="true" size={16} />
                            <Label>{c.edit}</Label>
                          </Dropdown.Item>
                          <Dropdown.Item id="versions" textValue={c.versions}>
                            <RefreshCcw aria-hidden="true" size={16} />
                            <Label>{c.versions}</Label>
                          </Dropdown.Item>
                          <Dropdown.Item id="delete" textValue={c.delete} variant="danger">
                            <Trash2 aria-hidden="true" size={16} />
                            <Label>{c.delete}</Label>
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  </article>
                ))}
              </section>
            ) : (
              <section className="mobile-empty-state">
                <FolderOpen aria-hidden="true" size={28} />
                <strong>{c.empty}</strong>
                <p>{c.emptyHint}</p>
              </section>
            )}
          </>
        ) : (
          <>
            <section className="mobile-workspace-heading">
              <button type="button" aria-label={c.home} onClick={onShowProjects}>
                <ArrowLeft aria-hidden="true" size={21} />
              </button>
              <div>
                <span>{selectedProject?.name}</span>
                <h1>{workflowSteps[activeStep]}</h1>
              </div>
            </section>

            <div className="mobile-step-header">
              <ol className="mobile-step-bar" aria-label="Workflow steps">
                {workflowSteps.map((label, index) => {
                  const isComplete = activeStep > index;
                  const isActive = activeStep === index;
                  return (
                    <li
                      key={label}
                      className={isActive ? "is-active" : isComplete ? "is-complete" : undefined}
                      aria-current={isActive ? "step" : undefined}
                    >
                      <span className="mobile-step-bar__marker">
                        {isComplete ? <Check aria-hidden="true" size={15} /> : `0${index + 1}`}
                      </span>
                      <strong>{label}</strong>
                    </li>
                  );
                })}
              </ol>
              <div className="mobile-step-nav">
                <Button
                  isIconOnly
                  aria-label={c.previous}
                  className="mobile-step-nav__button"
                  isDisabled={activeStep === 0 || isPreparingAudio}
                  onPress={() => onStepChange(activeStep - 1)}
                >
                  <ArrowLeft aria-hidden="true" size={18} />
                </Button>
                <Button
                  isIconOnly
                  aria-label={activeStep === 0 ? c.convert : c.next}
                  className="mobile-step-nav__button mobile-step-nav__button--primary"
                  isDisabled={
                    activeStep === 2 ||
                    (activeStep === 0 && (audioFiles.length === 0 || isPreparingAudio))
                  }
                  onPress={() => {
                    if (activeStep === 0) onPrepareAudio();
                    else onStepChange(activeStep + 1);
                  }}
                >
                  {activeStep === 0 && isPreparingAudio ? (
                    <LoaderCircle aria-hidden="true" className="mobile-spin" size={18} />
                  ) : (
                    <ArrowRight aria-hidden="true" size={18} />
                  )}
                </Button>
              </div>
            </div>

            {activeStep === 0 && isPreparingAudio ? (
              <div className="mobile-convert-progress" role="status">
                <LoaderCircle aria-hidden="true" className="mobile-spin" size={14} />
                <span>{c.converting} {preparingAudioIndex}/{audioFiles.length} · {audioConversionProgress}%</span>
              </div>
            ) : null}

            {activeStep === 0 ? (
              <section className="mobile-audio-screen">
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  multiple
                  disabled={isPreparingAudio}
                  accept="audio/*,.ogg,.wav,.mp3,.flac,.m4a"
                  onChange={(event) => {
                    if (event.target.files) onFiles(event.target.files);
                    event.target.value = "";
                  }}
                />

                <button
                  type="button"
                  className="mobile-audio-picker"
                  disabled={isPreparingAudio}
                  onClick={() => inputRef.current?.click()}
                >
                  <span><Plus aria-hidden="true" size={24} /></span>
                  <span>
                    <strong>{c.addAudio}</strong>
                    <small>{c.addAudioHint}</small>
                  </span>
                  <Upload aria-hidden="true" size={19} />
                </button>

                {audioFiles.length > 0 ? (
                  <div className="mobile-audio-list">
                    {audioFiles.map((audio, index) => {
                      const isPlaying = previewingAudioId === audio.id;
                      const previewLabel = previewErrorAudioId === audio.id
                        ? c.retry
                        : isPlaying ? c.pause : c.play;
                      const processing = audio.conversionStatus !== "idle";
                      return (
                        <article
                          key={audio.id}
                          className="mobile-audio-item"
                          onContextMenu={(event) => event.preventDefault()}
                          onPointerDown={(event) => {
                            if (event.pointerType === "mouse") return;
                            startLongPress(audio.id);
                          }}
                          onPointerUp={clearLongPress}
                          onPointerCancel={clearLongPress}
                        >
                          <div className="mobile-audio-item__wave" aria-hidden="true">
                            {WAVEFORM.map((height, barIndex) => (
                              <span
                                key={`${audio.id}-${barIndex}`}
                                style={{ height: `${WAVEFORM[(barIndex + index) % WAVEFORM.length] ?? height}%` }}
                              />
                            ))}
                          </div>
                          <Button
                            isIconOnly
                            aria-label={previewLabel}
                            aria-pressed={isPlaying}
                            className="mobile-audio-item__play"
                            isDisabled={previewLoadingAudioId === audio.id || isPreparingAudio}
                            onPress={() => onPreviewAudio(audio)}
                          >
                            {renderPreviewIcon(audio)}
                          </Button>
                          <div className="mobile-audio-item__main">
                            <strong>{audio.name}</strong>
                            <code>{audio.key}</code>
                            <span>{audio.format} · {formatFileSize(audio.size)}</span>
                          </div>
                          <Button
                            isIconOnly
                            aria-label={c.remove}
                            className="mobile-audio-item__delete"
                            isDisabled={isPreparingAudio}
                            variant="ghost"
                            onPress={() => onRemoveAudio(audio.id)}
                          >
                            <Trash2 aria-hidden="true" size={18} />
                          </Button>
                          {processing ? (
                            <span className={`mobile-audio-status is-${audio.conversionStatus}`}>
                              {audio.conversionStatus === "converted" || audio.conversionStatus === "skipped"
                                ? <Check aria-hidden="true" size={13} />
                                : audio.conversionStatus === "error"
                                  ? <TriangleAlert aria-hidden="true" size={13} />
                                  : <LoaderCircle aria-hidden="true" className="mobile-spin" size={13} />}
                              {audio.conversionStatus}
                            </span>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mobile-empty-state mobile-empty-state--compact">
                    <FileAudio aria-hidden="true" size={28} />
                    <strong>{c.noAudio}</strong>
                    <p>{c.noAudioHint}</p>
                  </div>
                )}

                <p className="mobile-local-note">
                  <PackageOpen aria-hidden="true" size={17} />
                  {c.local}
                </p>

                {audioPreparationError ? (
                  <p className="mobile-inline-error" role="alert">
                    <TriangleAlert aria-hidden="true" size={17} />
                    {audioPreparationError}
                  </p>
                ) : null}
              </section>
            ) : null}

            {activeStep === 1 ? (
              <section className="mobile-event-screen">
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
                  playPreviewLabel={c.play}
                  pausePreviewLabel={c.pause}
                  retryPreviewLabel={c.retry}
                  onPreviewAudio={(audioId) => {
                    const audio = audioFiles.find((item) => item.id === audioId);
                    if (audio) onPreviewAudio(audio);
                  }}
                  onEventBindingsChange={onEventBindingsChange}
                  onEventWeightChange={onEventWeightChange}
                  onSubtitleChange={onSubtitleChange}
                  onCreateCustomEvent={onCreateCustomEvent}
                  onRenameCustomEvent={onRenameCustomEvent}
                  onDeleteEvent={onDeleteEvent}
                  onReplaceEvent={onReplaceEvent}
                />
              </section>
            ) : null}

            {activeStep === 2 ? (
              <section className="mobile-export-screen">
                <ExportWorkspace
                  project={selectedProject}
                  audioFiles={audioFiles}
                  eventBindings={audioEventBindings}
                  eventWeights={audioEventWeights}
                  audioSubtitles={audioSubtitles}
                  customEventSuffixes={customEventSuffixes}
                  customEventNames={customEventNames}
                  language={language}
                  variant="mobile"
                />
                <Button className="mobile-primary-action" onPress={onReturnToAudio}>
                  <RefreshCcw aria-hidden="true" size={18} />
                  {c.restart}
                </Button>
              </section>
            ) : null}
          </>
        )}
        {view === "home" ? <ComplianceFooter visible={showComplianceInfo} /> : null}
      </main>

      {actionSheetAudioId ? (() => {
        const target = audioFiles.find((item) => item.id === actionSheetAudioId);
        return (
          <>
            <div
              className="novice-context-menu-backdrop"
              onClick={() => setActionSheetAudioId(null)}
              aria-hidden="true"
            />
            <div className="novice-context-menu is-touch" role="menu" aria-label={c.more}>
              {target ? <div className="mobile-action-sheet__header">{target.name}</div> : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = actionSheetAudioId;
                  setActionSheetAudioId(null);
                  openKeyEditor(id);
                }}
              >
                <KeyRound aria-hidden="true" size={15} /> {c.modifyKey}
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  const id = actionSheetAudioId;
                  setActionSheetAudioId(null);
                  onRemoveAudio(id);
                }}
              >
                <Trash2 aria-hidden="true" size={15} /> {c.removeAction}
              </button>
            </div>
          </>
        );
      })() : null}

      {keyEditorAudioId ? (
        <div
          className="novice-event-manager__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={c.modifyKey}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setKeyEditorAudioId(null);
          }}
        >
          <form
            className="novice-event-manager__move-dialog novice-event-manager__rename-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              submitKeyEditor();
            }}
          >
            <header>
              <strong>{c.modifyKey}</strong>
              <button type="button" aria-label={c.cancel} onClick={() => setKeyEditorAudioId(null)}>
                <X aria-hidden="true" size={16} />
              </button>
            </header>
            <input
              autoFocus
              value={keyEditorValue}
              aria-label={c.keyLabel}
              placeholder={c.keyPlaceholder}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setKeyEditorValue(event.target.value);
                setKeyEditorError(null);
              }}
            />
            {keyEditorError ? (
              <p className="mobile-key-editor__error" role="alert">
                <TriangleAlert aria-hidden="true" size={14} />
                {keyEditorError}
              </p>
            ) : null}
            <button type="submit" className="wiki-button wiki-button--primary">
              <Check aria-hidden="true" size={15} /> {c.save}
            </button>
          </form>
        </div>
      ) : null}

    </div>
  );
}
