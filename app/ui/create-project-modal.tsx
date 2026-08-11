"use client";

import { Button, Modal } from "@heroui/react";
import {
  Archive,
  Check,
  ChevronDown,
  FileArchive,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Search,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchWikiJavaPackVersions,
  isJavaPackVersionCacheFresh,
  readJavaPackVersionCache,
} from "@/lib/java-pack-version-sync";
import { normalizeAudioPackIcon } from "@/lib/audio-pack-icon";
import mcVersions from "@/lib/mcver";
import {
  DEFAULT_PROJECT_VERSION,
  DEFAULT_RELEASE_CHANNEL,
  DEFAULT_VERSION_INCREMENT_LIMIT,
  formatProjectVersionTag,
  normalizeProjectVersion,
  normalizeVersionIncrementLimit,
  type ReleaseChannel,
} from "@/lib/project-version";

type Language = "zh" | "en";
export type PackPlatform = "java" | "bedrock";
type JavaPackFormatSource = "syncing" | "wiki" | "cache" | "fallback";

export type NewProjectData = {
  name: string;
  key: string;
  description: string;
  platform: PackPlatform;
  javaPackFormat: string;
  gameVersion?: string;
  iconDataUrl: string | null;
  version: string;
  releaseChannel: ReleaseChannel;
};

const NAME_MAX_LENGTH = 10;
const KEY_MAX_LENGTH = 5;
const JAVA_DESC_MAX_LENGTH = 20;
const BEDROCK_DESC_MAX_LENGTH = 40;
const AUTO_DESC_SUFFIX = "By mcsd";

type VersionParts = [string, string, string];

function createJavaPackFormatOptions(versions: typeof mcVersions) {
  return [...versions]
    .map((item) => ({ packFormat: item.pack_format, version: item.version }))
    .sort((a, b) => {
      const formatDifference = Number(b.packFormat) - Number(a.packFormat);
      return formatDifference || b.version.localeCompare(a.version);
    });
}

const FALLBACK_JAVA_PACK_FORMAT_OPTIONS = createJavaPackFormatOptions(mcVersions);

const DEFAULT_JAVA_PACK_FORMAT = FALLBACK_JAVA_PACK_FORMAT_OPTIONS[0]?.packFormat ?? "15";

const COPY = {
  zh: {
    create: "创建新音频包",
    createOrImport: "创建或导入",
    createOrImportDescription: "创建一个新资源包，或导入已有音频包。",
    createChoice: "创建",
    createChoiceDescription: "填写资源包信息，从零开始制作。",
    importChoice: "导入",
    importChoiceDescription: "上传已有的 Minecraft 音频资源包。",
    subtitle: "填写资源包的基本信息，创建后进入工作台。",
    edit: "修改音频包信息",
    editSubtitle: "修改当前工程的资源包基本信息。",
    icon: "音频包图标",
    chooseIcon: "选择图标",
    replaceIcon: "更换图标",
    processingIcon: "正在处理图标",
    iconProcessingError: "无法处理这个图标，请选择 PNG、JPG 或 WebP 图片。",
    name: "音频包名称",
    namePlaceholder: "例如：我的世界原声",
    key: "主 Key（文件夹名）",
    keyPlaceholder: "例如：mcsd",
    keyHint: "仅支持英文字母和数字，生成路径：assets/minecraft/sounds/",
    platform: "游戏版本",
    java: "Java 版",
    bedrock: "基岩版",
    packFormat: "资源包版本",
    projectVersion: "音频包版本",
    majorVersion: "主版本",
    minorVersion: "次版本",
    patchVersion: "修订版本",
    releaseChannel: "版本类型",
    stable: "正式版",
    beta: "测试版",
    preview: "预览版",
    choosePackFormat: "选择资源包版本",
    searchVersion: "搜索游戏版本或 Pack Format",
    noVersionFound: "没有匹配的资源包版本",
    versionResults: "个版本",
    packFormatSourceSyncing: "正在同步 Wiki",
    packFormatSourceWiki: "Minecraft Wiki 已同步",
    packFormatSourceCache: "使用 Wiki 缓存",
    packFormatSourceFallback: "使用内置版本数据",
    description: "简介（可选）",
    descriptionPlaceholder: "简短描述",
    finalDescription: "最终简介",
    required: "必填",
    cancel: "取消",
    confirm: "创建并进入工作台",
    save: "保存修改",
    importTitle: "导入音频包",
    importSubtitle: "将已有的 Minecraft 音频包导入到当前设备。",
    dropAudioPack: "将音频包拖到这里",
    chooseAudioPack: "选择音频包",
    supportedArchives: "支持 ZIP 或 MCPACK 文件",
    selectedFile: "已选择",
    invalidArchive: "请选择 ZIP 或 MCPACK 文件。",
    importAndOpen: "导入并打开工作台",
  },
  en: {
    create: "Create audio pack",
    createOrImport: "Create or import",
    createOrImportDescription: "Start a new pack or bring an existing audio pack here.",
    createChoice: "Create",
    createChoiceDescription: "Fill in pack information and start from scratch.",
    importChoice: "Import",
    importChoiceDescription: "Upload an existing Minecraft audio resource pack.",
    subtitle: "Fill in the pack metadata before entering the workspace.",
    edit: "Edit audio pack information",
    editSubtitle: "Update the resource pack metadata for this project.",
    icon: "Pack icon",
    chooseIcon: "Choose icon",
    replaceIcon: "Replace icon",
    processingIcon: "Processing icon",
    iconProcessingError: "Could not process this icon. Choose a PNG, JPG, or WebP image.",
    name: "Pack name",
    namePlaceholder: "e.g. My Minecraft OST",
    key: "Main key (folder)",
    keyPlaceholder: "e.g. mcsd",
    keyHint: "Letters and numbers only. Output path: assets/minecraft/sounds/",
    platform: "Edition",
    java: "Java Edition",
    bedrock: "Bedrock Edition",
    packFormat: "Pack format",
    projectVersion: "Pack version",
    majorVersion: "Major version",
    minorVersion: "Minor version",
    patchVersion: "Patch version",
    releaseChannel: "Release channel",
    stable: "Stable",
    beta: "Beta",
    preview: "Preview",
    choosePackFormat: "Choose pack format",
    searchVersion: "Search game version or pack format",
    noVersionFound: "No matching pack format",
    versionResults: "versions",
    packFormatSourceSyncing: "Syncing Minecraft Wiki",
    packFormatSourceWiki: "Synced from Minecraft Wiki",
    packFormatSourceCache: "Using Wiki cache",
    packFormatSourceFallback: "Using bundled version data",
    description: "Description (optional)",
    descriptionPlaceholder: "Short description",
    finalDescription: "Final description",
    required: "Required",
    cancel: "Cancel",
    confirm: "Create and open workspace",
    save: "Save changes",
    importTitle: "Import audio pack",
    importSubtitle: "Bring an existing Minecraft audio pack onto this device.",
    dropAudioPack: "Drop an audio pack here",
    chooseAudioPack: "Choose audio pack",
    supportedArchives: "ZIP or MCPACK files are supported",
    selectedFile: "Selected",
    invalidArchive: "Choose a ZIP or MCPACK file.",
    importAndOpen: "Import and open workspace",
  },
} as const;

function getDescriptionLimit(platform: PackPlatform) {
  return platform === "bedrock" ? BEDROCK_DESC_MAX_LENGTH : JAVA_DESC_MAX_LENGTH;
}

function buildDescription(description: string, versionTag: string) {
  const trimmed = description.trim();
  return trimmed
    ? `${trimmed} ${AUTO_DESC_SUFFIX} ${versionTag}`
    : `${AUTO_DESC_SUFFIX} ${versionTag}`;
}

function normalizeVersionPart(value: string) {
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

function constrainVersionParts(parts: VersionParts, maximum: number): VersionParts {
  const constrain = (value: string) => value
    ? String(Math.min(Number(value), maximum))
    : value;
  return [parts[0], constrain(parts[1]), constrain(parts[2])];
}

function getVersionParts(value: string | undefined, maximum: number): VersionParts {
  const parts = normalizeProjectVersion(value).split(".") as VersionParts;
  return constrainVersionParts(parts, maximum);
}

export function ProjectInfoModal({
  language,
  mode = "create",
  initialData,
  versionIncrementLimit = DEFAULT_VERSION_INCREMENT_LIMIT,
  isOpen,
  onOpenChange,
  onSubmit,
}: {
  language: Language;
  mode?: "create" | "edit";
  initialData?: NewProjectData;
  versionIncrementLimit?: number;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onSubmit: (project: NewProjectData) => void;
}) {
  const c = COPY[language];
  const isEditMode = mode === "edit";
  const normalizedVersionIncrementLimit = normalizeVersionIncrementLimit(versionIncrementLimit);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const iconProcessingRequestRef = useRef(0);
  const hasManuallySelectedJavaPackFormatRef = useRef(false);
  const [name, setName] = useState(initialData?.name ?? "");
  const [key, setKey] = useState(initialData?.key ?? "mcsd");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [platform, setPlatform] = useState<PackPlatform>(initialData?.platform ?? "java");
  const [javaPackFormat, setJavaPackFormat] = useState(
    initialData?.javaPackFormat || DEFAULT_JAVA_PACK_FORMAT,
  );
  const [versionParts, setVersionParts] = useState<VersionParts>(() =>
    getVersionParts(initialData?.version ?? DEFAULT_PROJECT_VERSION, normalizedVersionIncrementLimit),
  );
  const [releaseChannel, setReleaseChannel] = useState<ReleaseChannel>(
    initialData?.releaseChannel ?? DEFAULT_RELEASE_CHANNEL,
  );
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(initialData?.iconDataUrl ?? null);
  const [isProcessingIcon, setIsProcessingIcon] = useState(false);
  const [iconProcessingError, setIconProcessingError] = useState(false);
  const [packFormatQuery, setPackFormatQuery] = useState("");
  const [javaPackFormatOptions, setJavaPackFormatOptions] = useState(
    FALLBACK_JAVA_PACK_FORMAT_OPTIONS,
  );
  const [javaPackFormatSource, setJavaPackFormatSource] =
    useState<JavaPackFormatSource>("syncing");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function syncJavaPackVersions() {
      const cached = readJavaPackVersionCache();
      const applyVersions = (versions: typeof mcVersions) => {
        if (cancelled) return;
        const options = createJavaPackFormatOptions(versions);
        if (!options.length) return;
        setJavaPackFormatOptions(options);
        if (!isEditMode && !hasManuallySelectedJavaPackFormatRef.current) {
          setJavaPackFormat((current) => options[0]?.packFormat ?? current);
        }
      };

      if (cached) {
        applyVersions(cached.versions);
        setJavaPackFormatSource("cache");
      }
      if (cached && isJavaPackVersionCacheFresh(cached)) return;

      try {
        const synced = await fetchWikiJavaPackVersions(controller.signal);
        applyVersions(synced.versions);
        if (!cancelled) setJavaPackFormatSource("wiki");
      } catch (error) {
        if (controller.signal.aborted) return;
        setJavaPackFormatSource(cached ? "cache" : "fallback");
        console.warn("[MCSD] Minecraft Wiki pack format sync failed.", error);
      }
    }

    void syncJavaPackVersions();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isEditMode]);

  const baseDescriptionLimit = getDescriptionLimit(platform);
  const version = versionParts.map(normalizeVersionPart).join(".");
  const versionTag = formatProjectVersionTag(version, releaseChannel);
  const descriptionLimit = baseDescriptionLimit + versionTag.length + 1;
  const finalDescription = buildDescription(description, versionTag);
  const descriptionInputLimit = Math.max(0, baseDescriptionLimit - AUTO_DESC_SUFFIX.length - 1);
  const versionPartLabels = [c.majorVersion, c.minorVersion, c.patchVersion] as const;
  const packFormatSourceLabel = {
    syncing: c.packFormatSourceSyncing,
    wiki: c.packFormatSourceWiki,
    cache: c.packFormatSourceCache,
    fallback: c.packFormatSourceFallback,
  }[javaPackFormatSource];
  const canCreate = name.trim().length > 0 && key.trim().length > 0;
  const selectedPackFormat = javaPackFormatOptions.find(
    (option) => option.packFormat === javaPackFormat,
  );
  const filteredPackFormats = useMemo(() => {
    const query = packFormatQuery.trim().toLowerCase();
    if (!query) return javaPackFormatOptions;
    return javaPackFormatOptions.filter(
      (option) =>
        option.version.toLowerCase().includes(query) ||
        option.packFormat.toLowerCase().includes(query),
    );
  }, [javaPackFormatOptions, packFormatQuery]);

  function resetForm() {
    setName("");
    setKey("mcsd");
    setDescription("");
    setPlatform("java");
    const latestPackFormat = javaPackFormatOptions[0]?.packFormat ?? DEFAULT_JAVA_PACK_FORMAT;
    hasManuallySelectedJavaPackFormatRef.current = false;
    setJavaPackFormat(latestPackFormat);
    setVersionParts(getVersionParts(DEFAULT_PROJECT_VERSION, normalizedVersionIncrementLimit));
    setReleaseChannel(DEFAULT_RELEASE_CHANNEL);
    iconProcessingRequestRef.current += 1;
    setIconDataUrl(null);
    setIsProcessingIcon(false);
    setIconProcessingError(false);
    setPackFormatQuery("");
  }

  async function chooseIcon(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const requestId = iconProcessingRequestRef.current + 1;
    iconProcessingRequestRef.current = requestId;
    setIsProcessingIcon(true);
    setIconProcessingError(false);

    try {
      const normalizedIcon = await normalizeAudioPackIcon(file);
      if (iconProcessingRequestRef.current === requestId) {
        setIconDataUrl(normalizedIcon);
      }
    } catch (error) {
      if (iconProcessingRequestRef.current === requestId) {
        setIconProcessingError(true);
        console.warn("[MCSD] Audio pack icon processing failed.", error);
      }
    } finally {
      if (iconProcessingRequestRef.current === requestId) {
        setIsProcessingIcon(false);
      }
    }
  }

  const isControlled = isOpen !== undefined;

  return (
    <Modal {...(isEditMode || isControlled ? { isOpen, onOpenChange } : {})}>
      {!isEditMode && !isControlled ? (
        <Button className="new-project-card" variant="ghost">
          <span className="new-project-card__icon">
            <Plus aria-hidden="true" size={32} strokeWidth={2.4} />
          </span>
          <span className="new-project-card__copy">
            <strong>{c.create}</strong>
            <small>{c.subtitle}</small>
          </span>
          <Plus aria-hidden="true" className="new-project-card__plus" size={18} />
        </Button>
      ) : null}

      <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="wiki-modal create-project-modal sm:max-w-[880px]">
            {({ close }) => (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canCreate || isProcessingIcon) return;
                  onSubmit({
                    name: name.trim(),
                    key: key.trim(),
                    description: description.trim(),
                    platform,
                    javaPackFormat,
                    gameVersion: selectedPackFormat?.version ?? "",
                    iconDataUrl,
                    version,
                    releaseChannel,
                  });
                  if (!isEditMode) resetForm();
                  close();
                }}
              >
                <Modal.CloseTrigger className="wiki-modal__close" />
                <Modal.Header className="wiki-modal__header">
                  <Modal.Icon className="wiki-modal__icon">
                    <Plus aria-hidden="true" size={20} />
                  </Modal.Icon>
                  <div>
                    <Modal.Heading className="wiki-modal__heading">
                      {isEditMode ? c.edit : c.create}
                    </Modal.Heading>
                    <p className="wiki-modal__description">
                      {isEditMode ? c.editSubtitle : c.subtitle}
                    </p>
                  </div>
                </Modal.Header>

                <Modal.Body className="wiki-modal__body create-project-form">
                  <section className="create-project-icon-field">
                    <div className="create-project-icon-preview">
                      {iconDataUrl ? (
                        <Image src={iconDataUrl} alt={c.icon} width={128} height={128} unoptimized />
                      ) : (
                        <ImageIcon aria-hidden="true" size={34} />
                      )}
                    </div>
                    <input
                      ref={iconInputRef}
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void chooseIcon(file);
                      }}
                    />
                    <div>
                      <strong>{c.icon}</strong>
                      <Button
                        className="wiki-button wiki-button--neutral"
                        isDisabled={isProcessingIcon}
                        type="button"
                        onPress={() => iconInputRef.current?.click()}
                      >
                        {isProcessingIcon ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="create-project-icon-spinner"
                            size={16}
                          />
                        ) : (
                          <UploadCloud aria-hidden="true" size={16} />
                        )}
                        {isProcessingIcon
                          ? c.processingIcon
                          : iconDataUrl
                            ? c.replaceIcon
                            : c.chooseIcon}
                      </Button>
                      {iconProcessingError ? (
                        <small className="create-project-icon-error" role="alert">
                          {c.iconProcessingError}
                        </small>
                      ) : null}
                    </div>
                  </section>

                  <div className="create-project-fields">
                    <label className="create-project-field create-project-field--wide">
                      <span>
                        {c.name} <b>{c.required}</b>
                      </span>
                      <div className="create-project-input-wrap">
                        <input
                          required
                          autoFocus
                          maxLength={NAME_MAX_LENGTH}
                          placeholder={c.namePlaceholder}
                          value={name}
                          onChange={(event) => setName(event.target.value.slice(0, NAME_MAX_LENGTH))}
                        />
                        <small>{name.length}/{NAME_MAX_LENGTH}</small>
                      </div>
                    </label>

                    <label className="create-project-field create-project-field--wide">
                      <span>
                        {c.key} <b>{c.required}</b>
                      </span>
                      <div className="create-project-input-wrap">
                        <input
                          required
                          maxLength={KEY_MAX_LENGTH}
                          className="is-mono"
                          placeholder={c.keyPlaceholder}
                          value={key}
                          onChange={(event) =>
                            setKey(
                              event.target.value
                                .replace(/[^a-zA-Z0-9]/g, "")
                                .toLowerCase()
                                .slice(0, KEY_MAX_LENGTH),
                            )
                          }
                        />
                        <small>{key.length}/{KEY_MAX_LENGTH}</small>
                      </div>
                      <small className="create-project-field__hint">
                        {c.keyHint}<strong>{key || "mcsd"}</strong>/...
                      </small>
                    </label>

                    <div className="create-project-field">
                      <span>{c.platform}</span>
                      <div className="create-project-platform" role="group" aria-label={c.platform}>
                        {(["java", "bedrock"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={platform === option}
                            onClick={() => {
                              setPlatform(option);
                              const nextLimit = getDescriptionLimit(option);
                              const maxInput = Math.max(0, nextLimit - AUTO_DESC_SUFFIX.length - 1);
                              setDescription((current) => current.slice(0, maxInput));
                            }}
                          >
                            {option === "java" ? c.java : c.bedrock}
                          </button>
                        ))}
                      </div>
                    </div>

                    {platform === "java" ? (
                      <div className="create-project-field">
                        <span>{c.packFormat}</span>
                        <Modal>
                          <Button
                            className="create-project-version-trigger"
                            type="button"
                            variant="ghost"
                            onPress={() => setPackFormatQuery("")}
                          >
                            <span>
                              <strong>{selectedPackFormat?.version ?? javaPackFormat}</strong>
                              <small>Pack Format {javaPackFormat}</small>
                            </span>
                            <ChevronDown aria-hidden="true" size={16} />
                          </Button>

                          <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
                            <Modal.Container size="md" scroll="inside">
                              <Modal.Dialog className="wiki-modal pack-format-modal sm:max-w-[680px]">
                                {({ close: closePackFormat }) => (
                                  <>
                                    <Modal.CloseTrigger className="wiki-modal__close" />
                                    <Modal.Header className="wiki-modal__header">
                                      <Modal.Icon className="wiki-modal__icon">
                                        <Search aria-hidden="true" size={19} />
                                      </Modal.Icon>
                                      <div>
                                        <Modal.Heading className="wiki-modal__heading">
                                          {c.choosePackFormat}
                                        </Modal.Heading>
                                        <p className="wiki-modal__description">
                                          {filteredPackFormats.length} {c.versionResults}
                                          {" · "}
                                          {packFormatSourceLabel}
                                        </p>
                                      </div>
                                    </Modal.Header>
                                    <Modal.Body className="wiki-modal__body pack-format-modal__body">
                                      <label className="pack-format-search">
                                        <Search aria-hidden="true" size={17} />
                                        <input
                                          autoFocus
                                          value={packFormatQuery}
                                          placeholder={c.searchVersion}
                                          onChange={(event) => setPackFormatQuery(event.target.value)}
                                        />
                                      </label>

                                      <div className="pack-format-list" role="listbox" aria-label={c.packFormat}>
                                        {filteredPackFormats.length > 0 ? (
                                          filteredPackFormats.map((option) => {
                                            const isSelected = option.packFormat === javaPackFormat;
                                            return (
                                              <button
                                                key={`${option.packFormat}-${option.version}`}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => {
                                                  hasManuallySelectedJavaPackFormatRef.current = true;
                                                  setJavaPackFormat(option.packFormat);
                                                  closePackFormat();
                                                }}
                                              >
                                                <span>
                                                  <strong>{option.version}</strong>
                                                  <small>Pack Format {option.packFormat}</small>
                                                </span>
                                                {isSelected ? <Check aria-hidden="true" size={17} /> : null}
                                              </button>
                                            );
                                          })
                                        ) : (
                                          <div className="pack-format-empty">
                                            <Search aria-hidden="true" size={24} />
                                            <span>{c.noVersionFound}</span>
                                          </div>
                                        )}
                                      </div>
                                    </Modal.Body>
                                  </>
                                )}
                              </Modal.Dialog>
                            </Modal.Container>
                          </Modal.Backdrop>
                        </Modal>
                      </div>
                    ) : null}

                    <div className="create-project-field">
                      <span>
                        {c.projectVersion} <b>{c.required}</b>
                      </span>
                      <div
                        className="create-project-version-input"
                        role="group"
                        aria-label={c.projectVersion}
                      >
                        {versionParts.map((part, index) => {
                          return (
                            <div
                              className="create-project-version-input__part"
                              key={versionPartLabels[index]}
                            >
                              {index > 0 ? <span aria-hidden="true">.</span> : null}
                              <input
                                inputMode="numeric"
                                value={part}
                                aria-label={versionPartLabels[index]}
                                onFocus={(event) => event.currentTarget.select()}
                                onBlur={() => {
                                  setVersionParts((current) => {
                                    const next = [...current] as VersionParts;
                                    next[index] = normalizeVersionPart(current[index]);
                                    return next;
                                  });
                                }}
                                onChange={(event) => {
                                  const digits = event.target.value.replace(/\D/g, "");
                                  const nextValue = index === 0 || !digits
                                    ? digits
                                    : String(Math.min(Number(digits), normalizedVersionIncrementLimit));
                                  setVersionParts((current) => {
                                    const next = [...current] as VersionParts;
                                    next[index] = nextValue;
                                    return next;
                                  });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="create-project-field">
                      <span>{c.releaseChannel}</span>
                      <div
                        className="create-project-platform create-project-release-channel"
                        role="group"
                        aria-label={c.releaseChannel}
                      >
                        {(["stable", "beta", "preview"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={releaseChannel === option}
                            onClick={() => setReleaseChannel(option)}
                          >
                            {c[option]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="create-project-field create-project-field--wide">
                      <span>{c.description}</span>
                      <div className="create-project-input-wrap">
                        <input
                          maxLength={descriptionInputLimit}
                          placeholder={c.descriptionPlaceholder}
                          value={description}
                          onChange={(event) =>
                            setDescription(event.target.value.slice(0, descriptionInputLimit))
                          }
                        />
                        <small>{finalDescription.length}/{descriptionLimit}</small>
                      </div>
                      <small className="create-project-field__hint">
                        {c.finalDescription}: <strong>{finalDescription}</strong>
                      </small>
                    </label>
                  </div>
                </Modal.Body>

                <Modal.Footer className="wiki-modal__footer">
                  <Button
                    className="wiki-button wiki-button--neutral"
                    type="button"
                    onPress={close}
                  >
                    {c.cancel}
                  </Button>
                  <Button
                    className="wiki-button wiki-button--primary"
                    isDisabled={!canCreate || isProcessingIcon}
                    type="submit"
                  >
                    {isEditMode ? c.save : c.confirm}
                  </Button>
                </Modal.Footer>
              </form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

type ImportAudioPackModalProps = {
  language: Language;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onImport: (file: File) => void | boolean | Promise<void | boolean>;
};

function ImportAudioPackModal({
  language,
  isOpen,
  onOpenChange,
  onImport,
}: ImportAudioPackModalProps) {
  const c = COPY[language];
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState(false);

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    const isArchive = /\.(zip|mcpack)$/i.test(nextFile.name);
    setFileError(!isArchive);
    setFile(isArchive ? nextFile : null);
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) {
          setFile(null);
          setFileError(false);
          setIsDragging(false);
        }
        onOpenChange(nextIsOpen);
      }}
    >
      <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
        <Modal.Container size="md">
          <Modal.Dialog className="wiki-modal import-pack-modal sm:max-w-[650px]">
            {({ close }) => (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!file) return;
                  const imported = await onImport(file);
                  if (imported === false) {
                    setFileError(true);
                    return;
                  }
                  close();
                }}
              >
                <Modal.CloseTrigger className="wiki-modal__close" />
                <Modal.Header className="wiki-modal__header">
                  <Modal.Icon className="wiki-modal__icon">
                    <Archive aria-hidden="true" size={20} />
                  </Modal.Icon>
                  <div>
                    <Modal.Heading className="wiki-modal__heading">{c.importTitle}</Modal.Heading>
                    <p className="wiki-modal__description">{c.importSubtitle}</p>
                  </div>
                </Modal.Header>
                <Modal.Body className="wiki-modal__body import-pack-modal__body">
                  <input
                    ref={inputRef}
                    className="sr-only"
                    type="file"
                    accept=".zip,.mcpack"
                    onChange={(event) => chooseFile(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className={`import-pack-dropzone${isDragging ? " is-dragging" : ""}`}
                    onClick={() => inputRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                      setIsDragging(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDragging(false);
                      chooseFile(event.dataTransfer.files[0]);
                    }}
                  >
                    <span className="import-pack-dropzone__icon">
                      <FileArchive aria-hidden="true" size={30} />
                    </span>
                    <strong>{file ? file.name : c.dropAudioPack}</strong>
                    <span>{file ? `${c.selectedFile} · ${formatFileSize(file.size)}` : c.chooseAudioPack}</span>
                    <small>{c.supportedArchives}</small>
                  </button>
                  {fileError ? <p className="import-pack-error">{c.invalidArchive}</p> : null}
                </Modal.Body>
                <Modal.Footer className="wiki-modal__footer">
                  <Button className="wiki-button wiki-button--neutral" type="button" onPress={close}>
                    {c.cancel}
                  </Button>
                  <Button className="wiki-button wiki-button--primary" isDisabled={!file} type="submit">
                    <UploadCloud aria-hidden="true" size={16} />
                    {c.importAndOpen}
                  </Button>
                </Modal.Footer>
              </form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateOrImportModal({
  language,
  versionIncrementLimit,
  onCreate,
  onImport,
}: {
  language: Language;
  versionIncrementLimit: number;
  onCreate: (project: NewProjectData) => void;
  onImport: (file: File) => void | boolean | Promise<void | boolean>;
}) {
  const c = COPY[language];
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <Modal>
        <Button className="new-project-card" variant="ghost">
          <span className="new-project-card__icon">
            <Plus aria-hidden="true" size={32} strokeWidth={2.4} />
          </span>
          <span className="new-project-card__copy">
            <strong>{c.createOrImport}</strong>
            <small>{c.createOrImportDescription}</small>
          </span>
          <Plus aria-hidden="true" className="new-project-card__plus" size={18} />
        </Button>
        <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
          <Modal.Container size="md">
            <Modal.Dialog className="wiki-modal create-or-import-modal sm:max-w-[700px]">
              {({ close }) => (
                <>
                  <Modal.CloseTrigger className="wiki-modal__close" />
                  <Modal.Header className="wiki-modal__header">
                    <Modal.Icon className="wiki-modal__icon">
                      <Plus aria-hidden="true" size={20} />
                    </Modal.Icon>
                    <div>
                      <Modal.Heading className="wiki-modal__heading">{c.createOrImport}</Modal.Heading>
                      <p className="wiki-modal__description">{c.createOrImportDescription}</p>
                    </div>
                  </Modal.Header>
                  <Modal.Body className="wiki-modal__body create-or-import-modal__body">
                    <button
                      type="button"
                      className="create-or-import-choice"
                      onClick={() => {
                        close();
                        setCreateOpen(true);
                      }}
                    >
                      <span className="create-or-import-choice__icon"><Plus aria-hidden="true" size={25} /></span>
                      <span>
                        <strong>{c.createChoice}</strong>
                        <small>{c.createChoiceDescription}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="create-or-import-choice"
                      onClick={() => {
                        close();
                        setImportOpen(true);
                      }}
                    >
                      <span className="create-or-import-choice__icon is-import"><UploadCloud aria-hidden="true" size={25} /></span>
                      <span>
                        <strong>{c.importChoice}</strong>
                        <small>{c.importChoiceDescription}</small>
                      </span>
                    </button>
                  </Modal.Body>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ProjectInfoModal
        key={versionIncrementLimit}
        language={language}
        mode="create"
        versionIncrementLimit={versionIncrementLimit}
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={onCreate}
      />
      <ImportAudioPackModal
        language={language}
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        onImport={onImport}
      />
    </>
  );
}
