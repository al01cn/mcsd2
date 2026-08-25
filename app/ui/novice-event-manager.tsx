"use client";

import {
  Check,
  ChevronRight,
  FileAudio,
  Folder,
  FolderInput,
  FolderPlus,
  GripVertical,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PencilLine,
  Play,
  Plus,
  RadioTower,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { vanillaSoundJava } from "@/lib/sounds";
import { searchSoundEventKeys, translateSoundEventKeyZh } from "@/lib/SoundsTranslate";
import {
  calculateAudioEventProbability,
  getAudioEventWeight,
  type AudioEventWeights,
} from "@/lib/audio-event-weight";

const UNASSIGNED_EVENT = "__mcsd_unassigned__";
const CUSTOM_EVENT_PREFIX = "mcsd.";
const MAX_CUSTOM_EVENT_SUFFIX_LENGTH = 32;
const LONG_PRESS_DELAY = 450;
const VANILLA_EVENTS = Object.keys(vanillaSoundJava);

type Language = "zh" | "en";
type EventPickerMode = "custom" | "vanilla";
type ContextMenuTarget = {
  kind: "folder";
  eventName: string;
} | {
  kind: "audio";
  audioId: string;
};
type ContextMenuState = ContextMenuTarget & { x: number; y: number };
type ContextMenuSource = "mouse" | "touch";

export type NoviceEventAudio = {
  id: string;
  name: string;
  originalName: string;
  key: string;
};

type Props = {
  audioFiles: NoviceEventAudio[];
  customEventSuffixes: Record<string, string>;
  customEventNames: string[];
  eventBindings: Record<string, string[]>;
  eventWeights: AudioEventWeights;
  audioSubtitles: Record<string, string>;
  language: Language;
  previewingAudioId: string | null;
  previewLoadingAudioId: string | null;
  previewErrorAudioId: string | null;
  playPreviewLabel: string;
  pausePreviewLabel: string;
  retryPreviewLabel: string;
  onPreviewAudio: (audioId: string) => void;
  onEventBindingsChange: (audioId: string, events: string[]) => void;
  onEventWeightChange: (audioId: string, eventName: string, weight: number) => void;
  onSubtitleChange: (audioId: string, subtitle: string) => void;
  onCreateCustomEvent: (eventName: string) => void;
  onRenameCustomEvent: (eventName: string, nextEventName: string) => void;
  onDeleteEvent: (eventName: string) => void;
  onReplaceEvent: (eventName: string, nextEventName: string) => void;
};

const COPY = {
  zh: {
    title: "小白模式",
    enterFullscreen: "全屏操作",
    exitFullscreen: "退出全屏",
    folders: "事件文件夹",
    files: "文件",
    unassigned: "未分组音频",
    create: "新建事件文件夹",
    chooseEvent: "选择要作为文件夹的声音事件",
    searchEvent: "搜索声音事件",
    added: "已添加",
    modify: "修改",
    replaceItem: "替换",
    removeItem: "移除",
    rename: "重命名",
    delete: "删除事件",
    replace: "更换原版事件",
    searchFolder: "搜索事件文件夹",
    searchAudio: "搜索音频",
    addAudio: "添加现有音频",
    addSelected: "添加到文件夹",
    remove: "移出文件夹",
    move: "移动到",
    emptyFolder: "这个文件夹还没有音频",
    emptyFolderHint: "从右上角添加，或把音频拖到左侧文件夹。",
    noAudio: "工程里还没有音频",
    selected: "已选",
    clearSelection: "取消选择",
    subtitle: "游戏内字幕",
    subtitlePlaceholder: "留空则不添加字幕",
    weight: "随机权重",
    probability: "概率",
    vanilla: "原版事件",
    custom: "自定义事件",
    replaceSearch: "搜索 Minecraft 声音事件",
    noResults: "没有匹配的事件",
    close: "关闭",
    edit: "编辑",
    drag: "拖动音频",
  },
  en: {
    title: "Easy mode",
    enterFullscreen: "Fullscreen editor",
    exitFullscreen: "Exit fullscreen",
    folders: "Event folders",
    files: "files",
    unassigned: "Unassigned audio",
    create: "New event folder",
    chooseEvent: "Choose the sound event for this folder",
    searchEvent: "Search sound events",
    added: "Added",
    modify: "Edit",
    replaceItem: "Replace",
    removeItem: "Remove",
    rename: "Rename",
    delete: "Delete event",
    replace: "Replace vanilla event",
    searchFolder: "Search event folders",
    searchAudio: "Search audio",
    addAudio: "Add existing audio",
    addSelected: "Add to folder",
    remove: "Remove from folder",
    move: "Move to",
    emptyFolder: "This folder has no audio",
    emptyFolderHint: "Add from the top right, or drag audio to a folder.",
    noAudio: "No audio in this project yet",
    selected: "selected",
    clearSelection: "Clear selection",
    subtitle: "In-game subtitle",
    subtitlePlaceholder: "Leave empty to omit the subtitle",
    weight: "Random weight",
    probability: "Chance",
    vanilla: "Vanilla event",
    custom: "Custom event",
    replaceSearch: "Search Minecraft sound events",
    noResults: "No matching events",
    close: "Close",
    edit: "Edit",
    drag: "Drag audio",
  },
} as const;

function isCustomEvent(eventName: string) {
  return eventName.startsWith(CUSTOM_EVENT_PREFIX);
}

function eventLabel(eventName: string, language: Language) {
  if (eventName === UNASSIGNED_EVENT) return COPY[language].unassigned;
  if (isCustomEvent(eventName)) return eventName.slice(CUSTOM_EVENT_PREFIX.length);
  return language === "zh" ? translateSoundEventKeyZh(eventName) : eventName;
}

function normalizeCustomEvent(value: string) {
  const suffix = value
    .trim()
    .replace(/^mcsd\./i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, MAX_CUSTOM_EVENT_SUFFIX_LENGTH);
  return suffix ? `${CUSTOM_EVENT_PREFIX}${suffix}` : "";
}

export function NoviceEventManager({
  audioFiles,
  customEventSuffixes,
  customEventNames,
  eventBindings,
  eventWeights,
  audioSubtitles,
  language,
  previewingAudioId,
  previewLoadingAudioId,
  previewErrorAudioId,
  playPreviewLabel,
  pausePreviewLabel,
  retryPreviewLabel,
  onPreviewAudio,
  onEventBindingsChange,
  onEventWeightChange,
  onSubtitleChange,
  onCreateCustomEvent,
  onRenameCustomEvent,
  onDeleteEvent,
  onReplaceEvent,
}: Props) {
  void previewLoadingAudioId;
  const c = COPY[language];
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(UNASSIGNED_EVENT);
  const [folderQuery, setFolderQuery] = useState("");
  const [audioQuery, setAudioQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<EventPickerMode>("custom");
  const [createQuery, setCreateQuery] = useState("");
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [replaceEvent, setReplaceEvent] = useState<string | null>(null);
  const [replaceQuery, setReplaceQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addSelection, setAddSelection] = useState<string[]>([]);
  const [movingAudioIds, setMovingAudioIds] = useState<string[]>([]);
  const [moveSourceEvent, setMoveSourceEvent] = useState<string | null>(null);
  const [swipedAudioId, setSwipedAudioId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuSource, setContextMenuSource] = useState<ContextMenuSource>("mouse");
  const longPressRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ id: string; x: number } | null>(null);
  const audioSubtitleInputRefs = useRef(new Map<string, HTMLInputElement>());

  const toggleFullscreen = () => setIsFullscreen((current) => !current);

  const allEventNames = useMemo(() => {
    const names = new Set<string>(customEventNames.filter((eventName) => eventName.trim()));
    for (const events of Object.values(eventBindings)) {
      for (const eventName of events) if (eventName.trim()) names.add(eventName);
    }
    return Array.from(names).sort((left, right) => {
      if (isCustomEvent(left) !== isCustomEvent(right)) return isCustomEvent(left) ? -1 : 1;
      return left.localeCompare(right);
    });
  }, [customEventNames, eventBindings]);

  const customEventAudioByName = useMemo(
    () => new Map(
      audioFiles.map((audio) => [
        `${CUSTOM_EVENT_PREFIX}${customEventSuffixes[audio.id] ?? audio.key}`,
        audio,
      ]),
    ),
    [audioFiles, customEventSuffixes],
  );

  const createOptions = useMemo(() => {
    const query = createQuery.trim().toLocaleLowerCase();
    if (createMode === "vanilla") {
      return searchSoundEventKeys(VANILLA_EVENTS, query);
    }
    return Array.from(customEventAudioByName.entries())
      .filter(([eventName, audio]) =>
        !query || `${eventName} ${audio.name} ${audio.originalName}`.toLocaleLowerCase().includes(query),
      )
      .map(([eventName]) => eventName);
  }, [createMode, createQuery, customEventAudioByName]);

  const visibleEventNames = useMemo(() => {
    const query = folderQuery.trim().toLocaleLowerCase();
    const filtered = allEventNames.filter((eventName) =>
      !query || eventName.toLocaleLowerCase().includes(query) || eventLabel(eventName, language).toLocaleLowerCase().includes(query),
    );
    const hasUnassigned = audioFiles.some((audio) => !(eventBindings[audio.id] ?? []).some(Boolean));
    return hasUnassigned || filtered.length === 0 ? [UNASSIGNED_EVENT, ...filtered] : filtered;
  }, [allEventNames, audioFiles, eventBindings, folderQuery, language]);

  useEffect(() => {
    if (selectedEvent !== UNASSIGNED_EVENT && !allEventNames.includes(selectedEvent)) {
      const timer = window.setTimeout(
        () => setSelectedEvent(visibleEventNames[0] ?? UNASSIGNED_EVENT),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [allEventNames, selectedEvent, visibleEventNames]);

  const currentAudio = useMemo(() => {
    const query = audioQuery.trim().toLocaleLowerCase();
    return audioFiles.filter((audio) => {
      const bound = (eventBindings[audio.id] ?? []).includes(selectedEvent);
      const isUnassigned = selectedEvent === UNASSIGNED_EVENT && !(eventBindings[audio.id] ?? []).some(Boolean);
      const matchesFolder = selectedEvent === UNASSIGNED_EVENT ? isUnassigned : bound;
      return matchesFolder && (!query || `${audio.name} ${audio.originalName} ${audio.key}`.toLocaleLowerCase().includes(query));
    });
  }, [audioFiles, audioQuery, eventBindings, selectedEvent]);

  const availableAudio = useMemo(() => {
    const query = audioQuery.trim().toLocaleLowerCase();
    return audioFiles.filter((audio) => {
      const events = eventBindings[audio.id] ?? [];
      const alreadyBound = selectedEvent === UNASSIGNED_EVENT
        ? !events.some(Boolean)
        : events.includes(selectedEvent);
      return !alreadyBound && (!query || `${audio.name} ${audio.originalName} ${audio.key}`.toLocaleLowerCase().includes(query));
    });
  }, [audioFiles, audioQuery, eventBindings, selectedEvent]);

  const replaceOptions = useMemo(() => {
    if (!replaceEvent) return [];
    return searchSoundEventKeys(
      VANILLA_EVENTS.filter((eventName) => eventName !== replaceEvent),
      replaceQuery.trim().toLocaleLowerCase(),
    );
  }, [replaceEvent, replaceQuery]);

  const bindAudioToEvent = (audioId: string, eventName: string) => {
    const current = eventBindings[audioId] ?? [];
    if (eventName === UNASSIGNED_EVENT) {
      onEventBindingsChange(audioId, []);
      return;
    }
    if (!current.includes(eventName)) onEventBindingsChange(audioId, [...current, eventName]);
  };

  const bindManyToEvent = (audioIds: string[], eventName: string) => {
    audioIds.forEach((audioId) => bindAudioToEvent(audioId, eventName));
    setMovingAudioIds([]);
    setAddSelection([]);
    setAddOpen(false);
  };

  const moveManyToEvent = (audioIds: string[], eventName: string) => {
    audioIds.forEach((audioId) => {
      const current = eventBindings[audioId] ?? [];
      const retained = moveSourceEvent
        ? current.filter((item) => item !== moveSourceEvent)
        : current;
      const next = eventName === UNASSIGNED_EVENT
        ? []
        : retained.includes(eventName)
          ? retained
          : [...retained, eventName];
      onEventBindingsChange(audioId, next);
    });
    setMovingAudioIds([]);
    setMoveSourceEvent(null);
  };

  const removeAudioFromEvent = (audioId: string, eventName: string) => {
    const current = eventBindings[audioId] ?? [];
    if (eventName === UNASSIGNED_EVENT) return;
    onEventBindingsChange(audioId, current.filter((item) => item !== eventName));
  };

  const handleCreate = (eventName: string) => {
    if (allEventNames.includes(eventName)) return;
    onCreateCustomEvent(eventName);
    setSelectedEvent(eventName);
    setCreateQuery("");
    setCreateOpen(false);
  };

  const handleRename = () => {
    if (!editingEvent) return;
    const nextEvent = normalizeCustomEvent(editingValue);
    if (!nextEvent || nextEvent === editingEvent || allEventNames.includes(nextEvent)) return;
    onRenameCustomEvent(editingEvent, nextEvent);
    setSelectedEvent(nextEvent);
    setEditingEvent(null);
  };

  const openContextMenu = (
    event: React.MouseEvent,
    target: ContextMenuTarget,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 176;
    const menuHeight = 132;
    setContextMenuSource("mouse");
    setContextMenu({
      ...target,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  };

  const openTouchActionSheet = (target: ContextMenuTarget) => {
    clearLongPress();
    setContextMenuSource("touch");
    setContextMenu({
      ...target,
      x: Math.max(8, window.innerWidth / 2 - 88),
      y: Math.max(8, window.innerHeight - 190),
    });
  };

  const editAudioSettings = (audioId: string) => {
    const input = audioSubtitleInputRefs.current.get(audioId);
    input?.focus();
    input?.select();
    setContextMenu(null);
  };

  const clearLongPress = () => {
    if (longPressRef.current !== null) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };

  const startLongPress = (target: ContextMenuTarget) => {
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      openTouchActionSheet(target);
      longPressRef.current = null;
    }, LONG_PRESS_DELAY);
  };

  const handleDrop = (eventName: string, event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-mcsd-audio") || event.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids)) bindManyToEvent(ids, eventName);
    } catch {
      bindManyToEvent([raw], eventName);
    }
  };

  useEffect(() => {
    if (!createOpen && !addOpen && !movingAudioIds.length && !editingEvent && !replaceEvent && !contextMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCreateOpen(false);
      setAddOpen(false);
      setMovingAudioIds([]);
      setMoveSourceEvent(null);
      setEditingEvent(null);
      setReplaceEvent(null);
      setContextMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addOpen, contextMenu, createOpen, editingEvent, movingAudioIds.length, replaceEvent]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".novice-context-menu")) return;
      setContextMenu(null);
    };
    const closeMenuImmediately = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenuImmediately);
    window.addEventListener("resize", closeMenuImmediately);
    window.addEventListener("scroll", closeMenuImmediately, true);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenuImmediately);
      window.removeEventListener("resize", closeMenuImmediately);
      window.removeEventListener("scroll", closeMenuImmediately, true);
    };
  }, [contextMenu]);

  return (
    <section className={`novice-event-manager${isFullscreen ? " is-expanded" : ""}`} aria-label={c.title}>
      <header className="novice-event-manager__header">
        <div>
          <div className="novice-event-manager__eyebrow"><Folder aria-hidden="true" size={14} /> {c.title}</div>
        </div>
        <button
          type="button"
          className="novice-event-manager__fullscreen"
          aria-label={isFullscreen ? c.exitFullscreen : c.enterFullscreen}
          title={isFullscreen ? c.exitFullscreen : c.enterFullscreen}
          aria-pressed={isFullscreen}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize2 aria-hidden="true" size={16} /> : <Maximize2 aria-hidden="true" size={16} />}
        </button>
      </header>

      <div className="novice-event-manager__body">
        <aside className="novice-event-manager__folders">
          <div className="novice-event-manager__pane-heading">
            <strong>{c.folders}</strong>
            <div className="novice-event-manager__pane-actions">
              <button
                type="button"
                className="novice-event-manager__folder-create"
                aria-label={c.create}
                title={c.create}
                onClick={() => { setCreateMode("custom"); setCreateQuery(""); setCreateOpen(true); }}
              >
                <FolderPlus aria-hidden="true" size={15} />
              </button>
              <span>{allEventNames.length}</span>
            </div>
          </div>
          <label className="novice-event-manager__search"><Search aria-hidden="true" size={15} /><input value={folderQuery} placeholder={c.searchFolder} aria-label={c.searchFolder} onChange={(event) => setFolderQuery(event.target.value)} /></label>
          <div className="novice-event-manager__folder-list">
            {visibleEventNames.map((eventName) => {
              const count = eventName === UNASSIGNED_EVENT
                ? audioFiles.filter((audio) => !(eventBindings[audio.id] ?? []).some(Boolean)).length
                : audioFiles.filter((audio) => (eventBindings[audio.id] ?? []).includes(eventName)).length;
              const custom = isCustomEvent(eventName);
              const isSelected = selectedEvent === eventName;
              return (
                <div
                  key={eventName}
                  className={`novice-event-folder${isSelected ? " is-selected" : ""}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (window.matchMedia("(pointer: coarse)").matches) return;
                    if (eventName === UNASSIGNED_EVENT) return;
                    setSelectedEvent(eventName);
                    setAudioQuery("");
                    openContextMenu(event, { kind: "folder", eventName });
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType !== "mouse" && eventName !== UNASSIGNED_EVENT) startLongPress({ kind: "folder", eventName });
                  }}
                  onPointerUp={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(eventName, event)}
                >
                  <button type="button" className="novice-event-folder__button" onClick={() => { setSelectedEvent(eventName); setAudioQuery(""); }}>
                    {custom ? <Folder aria-hidden="true" size={17} /> : <RadioTower aria-hidden="true" size={17} />}
                    <span><strong title={eventLabel(eventName, language)}>{eventLabel(eventName, language)}</strong>{eventName !== UNASSIGNED_EVENT && language === "zh" && !custom ? <small title={eventName}>{eventName}</small> : null}</span>
                    <em>{count}</em>
                  </button>
                  {isSelected && eventName !== UNASSIGNED_EVENT ? (
                    <div className="novice-event-folder__actions">
                      {custom ? <button type="button" aria-label={c.rename} title={c.rename} onClick={() => { setEditingEvent(eventName); setEditingValue(eventName.slice(CUSTOM_EVENT_PREFIX.length)); }}><PencilLine aria-hidden="true" size={13} /></button> : <button type="button" aria-label={c.replace} title={c.replace} onClick={() => { setReplaceEvent(eventName); setReplaceQuery(""); }}><RefreshCcw aria-hidden="true" size={13} /></button>}
                      <button type="button" aria-label={c.delete} title={c.delete} onClick={() => onDeleteEvent(eventName)}><Trash2 aria-hidden="true" size={13} /></button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <div className="novice-event-manager__files" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(selectedEvent, event)}>
          <div className="novice-event-manager__files-heading">
            <div><span>{selectedEvent === UNASSIGNED_EVENT ? c.unassigned : (isCustomEvent(selectedEvent) ? c.custom : c.vanilla)}</span><h3>{eventLabel(selectedEvent, language)}</h3></div>
            <div className="novice-event-manager__files-tools">
              <label className="novice-event-manager__search"><Search aria-hidden="true" size={15} /><input value={audioQuery} placeholder={c.searchAudio} aria-label={c.searchAudio} onChange={(event) => setAudioQuery(event.target.value)} /></label>
              {selectedEvent !== UNASSIGNED_EVENT ? <button type="button" className="wiki-button wiki-button--neutral" onClick={() => { setAddSelection([]); setAddOpen(true); }}><Plus aria-hidden="true" size={15} /> {c.addAudio}</button> : null}
            </div>
          </div>

          {currentAudio.length > 0 ? <div className="novice-event-manager__audio-list">{currentAudio.map((audio) => {
            const isPlaying = previewingAudioId === audio.id;
            const hasError = previewErrorAudioId === audio.id;
            const weight = selectedEvent === UNASSIGNED_EVENT ? 1 : getAudioEventWeight(eventWeights, audio.id, selectedEvent);
            const totalWeight = selectedEvent === UNASSIGNED_EVENT ? 1 : currentAudio.reduce((total, item) => total + getAudioEventWeight(eventWeights, item.id, selectedEvent), 0);
            const probability = calculateAudioEventProbability(weight, totalWeight);
            return <article key={audio.id} className={`novice-audio-item${swipedAudioId === audio.id ? " is-swiped" : ""}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-mcsd-audio", JSON.stringify([audio.id])); event.dataTransfer.setData("text/plain", audio.id); }} onContextMenu={(event) => { event.preventDefault(); if (window.matchMedia("(pointer: coarse)").matches) return; openContextMenu(event, { kind: "audio", audioId: audio.id }); }} onPointerDown={(event) => { if (event.pointerType !== "mouse") startLongPress({ kind: "audio", audioId: audio.id }); }} onPointerUp={clearLongPress} onPointerCancel={clearLongPress} onTouchStart={(event) => { touchStartRef.current = { id: audio.id, x: event.touches[0]?.clientX ?? 0 }; }} onTouchEnd={(event) => { const start = touchStartRef.current; if (start?.id === audio.id && (start.x - (event.changedTouches[0]?.clientX ?? start.x)) > 60) setSwipedAudioId(audio.id); touchStartRef.current = null; }}>
              <div className="novice-audio-item__main"><button type="button" className={`novice-audio-item__play${hasError ? " is-error" : ""}`} aria-label={hasError ? retryPreviewLabel : isPlaying ? pausePreviewLabel : playPreviewLabel} title={hasError ? retryPreviewLabel : isPlaying ? pausePreviewLabel : playPreviewLabel} onClick={(event) => { event.stopPropagation(); onPreviewAudio(audio.id); }}>{isPlaying ? <MoreHorizontal aria-hidden="true" size={17} /> : <Play aria-hidden="true" size={16} />}</button><GripVertical aria-hidden="true" className="novice-audio-item__grip" size={17} /><div className="novice-audio-item__copy"><strong title={audio.name}>{audio.name}</strong><small title={audio.originalName}>{audio.key}{audio.originalName !== audio.name ? ` · ${audio.originalName}` : ""}</small></div></div>
              <div className="novice-audio-item__settings"><label><span>{c.subtitle}</span><input ref={(input) => { if (input) audioSubtitleInputRefs.current.set(audio.id, input); else audioSubtitleInputRefs.current.delete(audio.id); }} value={audioSubtitles[audio.id] ?? ""} placeholder={c.subtitlePlaceholder} onClick={(event) => event.stopPropagation()} onChange={(event) => onSubtitleChange(audio.id, event.target.value)} /></label>{selectedEvent !== UNASSIGNED_EVENT ? <label className="novice-audio-item__weight"><span>{c.weight} <output>{Math.round(probability * 100)}% {c.probability}</output></span><input type="number" min={1} step={1} inputMode="numeric" value={weight} onClick={(event) => event.stopPropagation()} onChange={(event) => onEventWeightChange(audio.id, selectedEvent, event.currentTarget.valueAsNumber)} /></label> : null}</div>
              <div className="novice-audio-item__actions"><button type="button" aria-label={`${c.move}: ${audio.name}`} title={c.move} onClick={(event) => { event.stopPropagation(); setMoveSourceEvent(selectedEvent === UNASSIGNED_EVENT ? null : selectedEvent); setMovingAudioIds([audio.id]); }}><FolderInput aria-hidden="true" size={16} /></button>{selectedEvent !== UNASSIGNED_EVENT ? <button type="button" aria-label={`${c.remove}: ${audio.name}`} title={c.remove} onClick={(event) => { event.stopPropagation(); removeAudioFromEvent(audio.id, selectedEvent); }}><Trash2 aria-hidden="true" size={16} /></button> : null}</div>
              {swipedAudioId === audio.id && selectedEvent !== UNASSIGNED_EVENT ? <button type="button" className="novice-audio-item__swipe-remove" onClick={(event) => { event.stopPropagation(); removeAudioFromEvent(audio.id, selectedEvent); setSwipedAudioId(null); }}><Trash2 aria-hidden="true" size={15} /> {c.remove}</button> : null}
            </article>;
          })}</div> : <div className="novice-event-manager__empty"><FileAudio aria-hidden="true" size={28} /><strong>{audioFiles.length === 0 ? c.noAudio : c.emptyFolder}</strong><p>{audioFiles.length === 0 ? c.noAudio : c.emptyFolderHint}</p></div>}
        </div>
      </div>

      {contextMenu ? (
        <>
          <div className="novice-context-menu-backdrop" onClick={() => setContextMenu(null)} aria-hidden="true" />
          <div
            className={`novice-context-menu${contextMenuSource === "touch" ? " is-touch" : ""}`}
            role="menu"
            aria-label={contextMenu.kind === "folder" ? c.folders : c.files}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
          {contextMenu.kind === "folder" ? (
            <>
              {contextMenu.eventName !== UNASSIGNED_EVENT && isCustomEvent(contextMenu.eventName) ? (
                <button type="button" role="menuitem" onClick={() => { setEditingEvent(contextMenu.eventName); setEditingValue(contextMenu.eventName.slice(CUSTOM_EVENT_PREFIX.length)); setContextMenu(null); }}>
                  <PencilLine aria-hidden="true" size={15} /> {c.modify}
                </button>
              ) : contextMenu.eventName !== UNASSIGNED_EVENT ? (
                <button type="button" role="menuitem" onClick={() => { setReplaceEvent(contextMenu.eventName); setReplaceQuery(""); setContextMenu(null); }}>
                  <RefreshCcw aria-hidden="true" size={15} /> {c.replaceItem}
                </button>
              ) : null}
              {contextMenu.eventName !== UNASSIGNED_EVENT ? (
                <button type="button" role="menuitem" className="is-danger" onClick={() => { onDeleteEvent(contextMenu.eventName); setContextMenu(null); }}>
                  <Trash2 aria-hidden="true" size={15} /> {c.removeItem}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => editAudioSettings(contextMenu.audioId)}>
                <PencilLine aria-hidden="true" size={15} /> {c.modify}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMoveSourceEvent(selectedEvent === UNASSIGNED_EVENT ? null : selectedEvent); setMovingAudioIds([contextMenu.audioId]); setContextMenu(null); }}>
                <RefreshCcw aria-hidden="true" size={15} /> {c.replaceItem}
              </button>
              {selectedEvent !== UNASSIGNED_EVENT ? (
                <button type="button" role="menuitem" className="is-danger" onClick={() => { removeAudioFromEvent(contextMenu.audioId, selectedEvent); setContextMenu(null); }}>
                  <Trash2 aria-hidden="true" size={15} /> {c.removeItem}
                </button>
              ) : null}
            </>
          )}
          </div>
        </>
      ) : null}

      {createOpen ? (
        <div
          className="novice-event-manager__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={c.create}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <div className="novice-event-manager__move-dialog novice-event-picker-dialog">
            <header>
              <div>
                <strong>{c.create}</strong>
                <small>{c.chooseEvent}</small>
              </div>
              <button type="button" aria-label={c.close} title={c.close} onClick={() => setCreateOpen(false)}>
                <X aria-hidden="true" size={16} />
              </button>
            </header>
            <section className="novice-event-picker-dialog__toolbar">
              <div className="novice-event-picker-dialog__tabs" role="tablist" aria-label={c.create}>
                <button type="button" role="tab" aria-selected={createMode === "custom"} onClick={() => { setCreateMode("custom"); setCreateQuery(""); }}>{c.custom}</button>
                <button type="button" role="tab" aria-selected={createMode === "vanilla"} onClick={() => { setCreateMode("vanilla"); setCreateQuery(""); }}>{c.vanilla}</button>
              </div>
              <label className="novice-event-manager__search">
                <Search aria-hidden="true" size={15} />
                <input autoFocus value={createQuery} placeholder={c.searchEvent} aria-label={c.searchEvent} onChange={(event) => setCreateQuery(event.target.value)} />
              </label>
            </section>
            <div className="novice-event-manager__replace-list novice-event-picker-dialog__list">
              {createOptions.length > 0 ? createOptions.map((eventName) => {
                const exists = allEventNames.includes(eventName);
                const customAudio = customEventAudioByName.get(eventName);
                return (
                  <button
                    type="button"
                    key={eventName}
                    disabled={exists}
                    aria-label={`${exists ? c.added : c.create}: ${eventName}`}
                    onClick={() => handleCreate(eventName)}
                  >
                    {isCustomEvent(eventName) ? <Folder aria-hidden="true" size={16} /> : <RadioTower aria-hidden="true" size={16} />}
                    <span>
                      <strong>{eventLabel(eventName, language)}</strong>
                      <small>{customAudio ? `${eventName} · ${customAudio.originalName}` : eventName}</small>
                    </span>
                    {exists ? <Check aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}
                  </button>
                );
              }) : <p className="novice-event-manager__empty-copy">{c.noResults}</p>}
            </div>
          </div>
        </div>
      ) : null}

      {movingAudioIds.length > 0 ? <div className="novice-event-manager__overlay" role="dialog" aria-modal="true" aria-label={c.move}><div className="novice-event-manager__move-dialog"><header><strong>{c.move}</strong><button type="button" aria-label={c.close} onClick={() => { setMovingAudioIds([]); setMoveSourceEvent(null); }}><X aria-hidden="true" size={16} /></button></header><div>{allEventNames.filter((eventName) => eventName !== moveSourceEvent).map((eventName) => <button type="button" key={eventName} onClick={() => moveManyToEvent(movingAudioIds, eventName)}><Folder aria-hidden="true" size={16} /><span>{eventLabel(eventName, language)}</span><ChevronRight aria-hidden="true" size={15} /></button>)}</div></div></div> : null}

      {addOpen ? (
        <div
          className="novice-event-manager__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={c.addAudio}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAddOpen(false);
          }}
        >
          <div className="novice-event-manager__move-dialog novice-audio-picker-dialog">
            <header>
              <div>
                <strong>{c.addAudio}</strong>
                <small>{eventLabel(selectedEvent, language)}</small>
              </div>
              <button type="button" aria-label={c.close} title={c.close} onClick={() => setAddOpen(false)}>
                <X aria-hidden="true" size={16} />
              </button>
            </header>
            {availableAudio.length > 0 ? (
              <>
                <div className="novice-audio-picker-dialog__list">
                  {availableAudio.map((audio) => (
                    <label key={audio.id} className="novice-event-manager__picker-row">
                      <input
                        type="checkbox"
                        checked={addSelection.includes(audio.id)}
                        onChange={() =>
                          setAddSelection((current) =>
                            current.includes(audio.id)
                              ? current.filter((id) => id !== audio.id)
                              : [...current, audio.id],
                          )
                        }
                      />
                      <span>
                        <strong>{audio.name}</strong>
                        <small>{audio.key}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <footer className="novice-audio-picker-dialog__footer">
                  <span>{addSelection.length} {c.selected}</span>
                  <button
                    type="button"
                    className="wiki-button wiki-button--primary"
                    disabled={addSelection.length === 0}
                    onClick={() => bindManyToEvent(addSelection, selectedEvent)}
                  >
                    <Plus aria-hidden="true" size={15} /> {c.addSelected}
                  </button>
                </footer>
              </>
            ) : (
              <p className="novice-event-manager__empty-copy">{c.noAudio}</p>
            )}
          </div>
        </div>
      ) : null}

      {editingEvent ? <div className="novice-event-manager__overlay" role="dialog" aria-modal="true" aria-label={c.rename}><form className="novice-event-manager__move-dialog novice-event-manager__rename-dialog" onSubmit={(event) => { event.preventDefault(); handleRename(); }}><header><strong>{c.rename}</strong><button type="button" aria-label={c.close} onClick={() => setEditingEvent(null)}><X aria-hidden="true" size={16} /></button></header><input autoFocus value={editingValue} onChange={(event) => setEditingValue(event.target.value)} /><button type="submit" className="wiki-button wiki-button--primary"><Check aria-hidden="true" size={15} /> {c.rename}</button></form></div> : null}

      {replaceEvent ? <div className="novice-event-manager__overlay" role="dialog" aria-modal="true" aria-label={c.replace}><div className="novice-event-manager__move-dialog"><header><strong>{c.replace}</strong><button type="button" aria-label={c.close} onClick={() => setReplaceEvent(null)}><X aria-hidden="true" size={16} /></button></header><label className="novice-event-manager__search"><Search aria-hidden="true" size={15} /><input autoFocus value={replaceQuery} placeholder={c.replaceSearch} onChange={(event) => setReplaceQuery(event.target.value)} /></label><div className="novice-event-manager__replace-list">{replaceOptions.length > 0 ? replaceOptions.map((eventName) => <button type="button" key={eventName} onClick={() => { onReplaceEvent(replaceEvent, eventName); setSelectedEvent(eventName); setReplaceEvent(null); }}><RadioTower aria-hidden="true" size={16} /><span><strong>{eventName}</strong><small>{translateSoundEventKeyZh(eventName)}</small></span><ChevronRight aria-hidden="true" size={15} /></button>) : <p className="novice-event-manager__empty-copy">{c.noResults}</p>}</div></div></div> : null}
    </section>
  );
}
