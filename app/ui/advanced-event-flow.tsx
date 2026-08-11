"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  getSmoothStepPath,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type Viewport,
  type XYPosition,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  FileAudio,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RadioTower,
  RefreshCcw,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vanillaSoundJava } from "@/lib/sounds";
import { searchSoundEventKeys, translateSoundEventKeyZh } from "@/lib/SoundsTranslate";
import {
  calculateAudioEventProbability,
  getAudioEventWeight,
  type AudioEventWeights,
} from "@/lib/audio-event-weight";

export type EventFlowAudio = {
  id: string;
  name: string;
  originalName: string;
  format: string;
  key: string;
};

type FlowLanguage = "zh" | "en";
type NodeKind = "audio" | "event";
type AudioPreviewStatus = "idle" | "loading" | "playing" | "error";
type SoundNodeData = {
  kind: NodeKind;
  label: string;
  subtitle: string;
  minecraftSubtitle?: string;
  minecraftSubtitleLabel?: string;
  minecraftSubtitlePlaceholder?: string;
  originalName?: string;
  eventName?: string;
  translation?: string;
  isCustomEvent?: boolean;
  customAudioId?: string;
  customAudioKey?: string;
  customEventSuffix?: string;
  editEventLabel?: string;
  resetEventLabel?: string;
  replaceEventLabel?: string;
  previewStatus?: AudioPreviewStatus;
  previewLabel?: string;
  onPreviewAudio?: (audioId: string) => void;
  onMinecraftSubtitleChange?: (audioId: string, value: string) => void;
  onRenameEvent?: (nodeId: string, value: string) => void;
  onReplaceEvent?: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
};
type SoundNode = Node<SoundNodeData, "soundNode">;
type BindingEdgeData = {
  audioId: string;
  eventName: string;
  audioName: string;
  weight: number;
  probability: string;
  weightLabel: string;
  probabilityLabel: string;
  editable: boolean;
  onWeightChange: (audioId: string, eventName: string, weight: number) => void;
};
type BindingEdge = Edge<BindingEdgeData, "bindingEdge">;
type MenuView = "root" | "audio" | "event";
type ContextMenuState = {
  left: number;
  top: number;
  flowPosition: XYPosition;
  view: MenuView;
  query: string;
};
type ReplaceEventState = {
  nodeId: string;
  query: string;
};
type SoundEventOption = {
  rawId: string;
  eventName: string;
  translation?: string;
  isCustomEvent: boolean;
  customAudioId?: string;
  customAudioKey?: string;
  customEventSuffix?: string;
  originalAudioName?: string;
};

const SOUND_EVENTS = Object.keys(vanillaSoundJava);
const SOUND_EVENT_SET = new Set(SOUND_EVENTS);
const EVENT_RESULT_LIMIT = 80;
const MAX_CUSTOM_EVENT_SUFFIX_LENGTH = 8;
const BINDING_EDGE_PREFIX = "binding:";
const SOUND_EVENT_TRANSLATIONS = new Map(
  SOUND_EVENTS.map((eventName) => {
    const translation = translateSoundEventKeyZh(eventName);
    return [eventName, translation === eventName ? "" : translation] as const;
  }),
);

const FLOW_COPY = {
  zh: {
    addNode: "添加节点",
    addAudio: "添加音频",
    addEvent: "添加事件",
    audio: "音频",
    event: "声音事件",
    customEvent: "自定义声音事件",
    editEvent: "修改声音事件",
    resetEvent: "按声音 key 自动生成",
    replaceEvent: "更换原版声音事件",
    replaceEventAction: "更换声音事件",
    currentEvent: "当前事件",
    searchReplacement: "搜索新的 Minecraft 声音事件",
    noReplacement: "没有可更换的声音事件",
    searchAudio: "搜索已导入音频",
    searchEvent: "搜索 Minecraft 声音事件",
    noAudio: "没有可添加的音频",
    noEvent: "没有匹配的声音事件",
    close: "关闭菜单",
    deleteNode: "删除节点",
    minecraftSubtitle: "Minecraft 声音字幕",
    minecraftSubtitlePlaceholder: "留空则不添加字幕",
    graph: "声音事件节点图",
    nodes: "节点",
    mappings: "连接",
    weight: "权重",
    probability: "随机概率",
    enterFullscreen: "全屏编辑",
    exitFullscreen: "退出全屏",
  },
  en: {
    addNode: "Add node",
    addAudio: "Add audio",
    addEvent: "Add event",
    audio: "Audio",
    event: "Sound event",
    customEvent: "Custom sound event",
    editEvent: "Edit sound event",
    resetEvent: "Generate from sound key",
    replaceEvent: "Replace vanilla sound event",
    replaceEventAction: "Replace sound event",
    currentEvent: "Current event",
    searchReplacement: "Search for a new Minecraft sound event",
    noReplacement: "No replacement sound events available",
    searchAudio: "Search imported audio",
    searchEvent: "Search Minecraft sound events",
    noAudio: "No audio available",
    noEvent: "No matching sound events",
    close: "Close menu",
    deleteNode: "Delete node",
    minecraftSubtitle: "Minecraft subtitle",
    minecraftSubtitlePlaceholder: "Leave empty to omit the subtitle",
    graph: "Sound event node graph",
    nodes: "nodes",
    mappings: "connections",
    weight: "Weight",
    probability: "Chance",
    enterFullscreen: "Edit in fullscreen",
    exitFullscreen: "Exit fullscreen",
  },
} as const;

function createBindingEdgeId(audioId: string, eventName: string) {
  return `${BINDING_EDGE_PREFIX}${encodeURIComponent(audioId)}:${encodeURIComponent(eventName)}`;
}

function SoundGraphNode({ id, data, selected }: NodeProps<SoundNode>) {
  const isAudio = data.kind === "audio";

  return (
    <div
      className={`sound-flow-node sound-flow-node--${data.kind}${selected ? " is-selected" : ""}`}
    >
      <Handle id="target" type="target" position={Position.Left} />
      {isAudio ? (
        <button
          type="button"
          className={`sound-flow-node__preview nodrag${data.previewStatus === "error" ? " is-error" : ""}`}
          aria-label={data.previewLabel}
          aria-pressed={data.previewStatus === "playing"}
          title={data.previewLabel}
          onClick={() => data.onPreviewAudio?.(id.slice("audio:".length))}
        >
          {data.previewStatus === "loading" ? (
            <LoaderCircle aria-hidden="true" className="audio-card__spinner" size={17} />
          ) : data.previewStatus === "error" ? (
            <TriangleAlert aria-hidden="true" size={16} />
          ) : data.previewStatus === "playing" ? (
            <Pause aria-hidden="true" size={16} />
          ) : (
            <Play aria-hidden="true" size={16} />
          )}
        </button>
      ) : (
        <div className="sound-flow-node__icon">
          <RadioTower aria-hidden="true" size={18} />
        </div>
      )}
      <div className="sound-flow-node__copy">
        <span>{data.subtitle}</span>
        {data.kind === "event" && data.isCustomEvent ? (
          <label className="sound-flow-node__custom-event nodrag">
            <code>mcsd.</code>
            <input
              aria-label={data.editEventLabel}
              maxLength={MAX_CUSTOM_EVENT_SUFFIX_LENGTH}
              value={data.customEventSuffix ?? ""}
              onChange={(event) => data.onRenameEvent?.(id, event.target.value)}
            />
            <button
              type="button"
              aria-label={data.resetEventLabel}
              title={data.resetEventLabel}
              disabled={data.customEventSuffix === data.customAudioKey}
              onClick={() => data.onRenameEvent?.(id, data.customAudioKey ?? "")}
            >
              <RefreshCcw aria-hidden="true" size={12} />
            </button>
          </label>
        ) : data.kind === "event" ? (
          <>
            <div className="sound-flow-node__readonly-event">
              <strong title={data.eventName ?? data.label}>
                {data.eventName ?? data.label}
              </strong>
              <button
                type="button"
                className="nodrag"
                aria-label={data.replaceEventLabel}
                title={data.replaceEventLabel}
                onClick={() => data.onReplaceEvent?.(id)}
              >
                <RefreshCcw aria-hidden="true" size={13} />
              </button>
            </div>
            {data.translation ? <small title={data.translation}>{data.translation}</small> : null}
          </>
        ) : (
          <>
            <strong title={data.label}>{data.label}</strong>
            {data.originalName ? (
              <small title={data.originalName}>{data.originalName}</small>
            ) : data.translation ? (
              <small title={data.translation}>{data.translation}</small>
            ) : null}
            <label className="sound-flow-node__subtitle-editor nodrag nowheel">
              <span>{data.minecraftSubtitleLabel}</span>
              <input
                aria-label={data.minecraftSubtitleLabel}
                value={data.minecraftSubtitle ?? ""}
                placeholder={data.minecraftSubtitlePlaceholder}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) =>
                  data.onMinecraftSubtitleChange?.(
                    id.slice("audio:".length),
                    event.target.value,
                  )
                }
              />
            </label>
          </>
        )}
      </div>
      <button
        type="button"
        className="sound-flow-node__delete nodrag"
        aria-label="Delete node"
        title="Delete node"
        onClick={() => data.onDelete(id)}
      >
        <Trash2 aria-hidden="true" size={14} />
      </button>
      <Handle id="source" type="source" position={Position.Right} />
    </div>
  );
}

const NODE_TYPES = { soundNode: SoundGraphNode };

function BindingGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<BindingEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {data?.editable ? (
        <EdgeLabelRenderer>
          <div
            className="sound-flow-edge-weight nodrag nopan nowheel"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <label>
              <span>{data.weightLabel}</span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                aria-label={`${data.audioName} ${data.weightLabel}`}
                value={data.weight}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) =>
                  data.onWeightChange(
                    data.audioId,
                    data.eventName,
                    event.currentTarget.valueAsNumber,
                  )
                }
              />
            </label>
            <output title={data.probabilityLabel}>{data.probability}</output>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const EDGE_TYPES = { bindingEdge: BindingGraphEdge };

function AdvancedEventFlowCanvas({
  audioFiles,
  customEventSuffixes,
  onCustomEventChange,
  audioSubtitles,
  onAudioSubtitleChange,
  eventBindings,
  onEventBindingsChange,
  eventWeights,
  onEventWeightChange,
  previewingAudioId,
  previewLoadingAudioId,
  previewErrorAudioId,
  onPreviewAudio,
  playPreviewLabel,
  pausePreviewLabel,
  retryPreviewLabel,
  language,
  motionEnabled,
}: {
  audioFiles: EventFlowAudio[];
  customEventSuffixes: Record<string, string>;
  onCustomEventChange: (audioId: string, suffix: string) => void;
  audioSubtitles: Record<string, string>;
  onAudioSubtitleChange: (audioId: string, subtitle: string) => void;
  eventBindings: Record<string, string[]>;
  onEventBindingsChange: (audioId: string, events: string[]) => void;
  eventWeights: AudioEventWeights;
  onEventWeightChange: (audioId: string, eventName: string, weight: number) => void;
  previewingAudioId: string | null;
  previewLoadingAudioId: string | null;
  previewErrorAudioId: string | null;
  onPreviewAudio: (audioId: string) => void;
  playPreviewLabel: string;
  pausePreviewLabel: string;
  retryPreviewLabel: string;
  language: FlowLanguage;
  motionEnabled: boolean;
}) {
  const c = FLOW_COPY[language];
  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
    fitView,
    getViewport,
    screenToFlowPosition,
    setViewport,
  } = useReactFlow<SoundNode, BindingEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<SoundNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<BindingEdge>([]);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [replaceEvent, setReplaceEvent] = useState<ReplaceEventState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const nodesRef = useRef(nodes);
  const normalViewportRef = useRef<Viewport | null>(null);
  const onCustomEventChangeRef = useRef(onCustomEventChange);
  const eventBindingsRef = useRef(eventBindings);
  const onEventBindingsChangeRef = useRef(onEventBindingsChange);

  const getPreviewState = useCallback(
    (audioId: string): { status: AudioPreviewStatus; label: string } => {
      if (previewLoadingAudioId === audioId) {
        return { status: "loading", label: playPreviewLabel };
      }
      if (previewErrorAudioId === audioId) {
        return { status: "error", label: retryPreviewLabel };
      }
      if (previewingAudioId === audioId) {
        return { status: "playing", label: pausePreviewLabel };
      }
      return { status: "idle", label: playPreviewLabel };
    },
    [
      pausePreviewLabel,
      playPreviewLabel,
      previewErrorAudioId,
      previewLoadingAudioId,
      previewingAudioId,
      retryPreviewLabel,
    ],
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    onCustomEventChangeRef.current = onCustomEventChange;
  }, [onCustomEventChange]);

  useEffect(() => {
    eventBindingsRef.current = eventBindings;
  }, [eventBindings]);

  useEffect(() => {
    onEventBindingsChangeRef.current = onEventBindingsChange;
  }, [onEventBindingsChange]);

  const commitEventBindings = useCallback((audioId: string, events: string[]) => {
    const normalizedEvents = Array.from(new Set(events.filter(Boolean)));
    eventBindingsRef.current = {
      ...eventBindingsRef.current,
      [audioId]: normalizedEvents,
    };
    onEventBindingsChangeRef.current(audioId, normalizedEvents);
  }, []);

  const openReplaceEventPicker = useCallback((nodeId: string) => {
    setMenu(null);
    setReplaceEvent({ nodeId, query: "" });
  }, []);

  const removeEventFromAllBindings = useCallback(
    (eventName: string) => {
      for (const [audioId, events] of Object.entries(eventBindingsRef.current)) {
        if (!events.includes(eventName)) continue;
        commitEventBindings(
          audioId,
          events.filter((item) => item !== eventName),
        );
      }
    },
    [commitEventBindings],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (node?.data.kind === "audio") {
        commitEventBindings(nodeId.slice("audio:".length), []);
      } else if (node?.data.kind === "event" && node.data.eventName) {
        removeEventFromAllBindings(node.data.eventName);
      }
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
      setReplaceEvent((current) => current?.nodeId === nodeId ? null : current);
    },
    [commitEventBindings, removeEventFromAllBindings, setEdges, setNodes],
  );

  const renameEvent = useCallback(
    (nodeId: string, value: string) => {
      const current = nodesRef.current;
      const currentNode = current.find((node) => node.id === nodeId);
      if (
        !currentNode ||
        currentNode.data.kind !== "event" ||
        !currentNode.data.isCustomEvent ||
        !currentNode.data.customAudioId
      ) {
        return;
      }
      const normalizedSuffix = value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, MAX_CUSTOM_EVENT_SUFFIX_LENGTH);
      const nextEventName = `mcsd.${normalizedSuffix}`;
      const isDuplicate = current.some(
        (node) =>
          node.id !== nodeId &&
          node.data.kind === "event" &&
          node.data.eventName === nextEventName,
      );
      if (isDuplicate) return;
      onCustomEventChangeRef.current(currentNode.data.customAudioId, normalizedSuffix);
    },
    [],
  );

  const replaceVanillaEvent = useCallback(
    (nextEventName: string) => {
      if (!replaceEvent || !SOUND_EVENT_SET.has(nextEventName)) return;
      const currentNode = nodesRef.current.find((node) => node.id === replaceEvent.nodeId);
      const previousEventName = currentNode?.data.eventName;
      if (
        !currentNode ||
        currentNode.data.kind !== "event" ||
        currentNode.data.isCustomEvent ||
        !previousEventName ||
        previousEventName === nextEventName
      ) {
        setReplaceEvent(null);
        return;
      }
      const nextNodeId = `event:${nextEventName}`;
      const isDuplicate = nodesRef.current.some(
        (node) =>
          node.id !== currentNode.id &&
          node.data.kind === "event" &&
          node.data.eventName === nextEventName,
      );
      if (isDuplicate) return;

      const nextTranslation = translateSoundEventKeyZh(nextEventName);
      setNodes((current) =>
        current.map((node) =>
          node.id === currentNode.id
            ? {
                ...node,
                id: nextNodeId,
                data: {
                  ...node.data,
                  label: nextEventName,
                  eventName: nextEventName,
                  translation: nextTranslation === nextEventName ? undefined : nextTranslation,
                },
              }
            : node,
        ),
      );
      setEdges((current) =>
        current.map((edge) => {
          if (edge.source !== currentNode.id && edge.target !== currentNode.id) return edge;
          const otherNodeId = edge.source === currentNode.id ? edge.target : edge.source;
          const audioNode = nodesRef.current.find(
            (node) => node.id === otherNodeId && node.data.kind === "audio",
          );
          const audioId = audioNode?.id.slice("audio:".length);
          return {
            ...edge,
            id: audioId ? createBindingEdgeId(audioId, nextEventName) : edge.id,
            source: edge.source === currentNode.id ? nextNodeId : edge.source,
            target: edge.target === currentNode.id ? nextNodeId : edge.target,
          };
        }),
      );
      for (const [audioId, events] of Object.entries(eventBindingsRef.current)) {
        if (!events.includes(previousEventName)) continue;
        const previousWeight = getAudioEventWeight(eventWeights, audioId, previousEventName);
        commitEventBindings(
          audioId,
          events.map((eventName) =>
            eventName === previousEventName ? nextEventName : eventName,
          ),
        );
        if (previousWeight > 1) {
          onEventWeightChange(audioId, nextEventName, previousWeight);
        }
      }
      setReplaceEvent(null);
    },
    [
      commitEventBindings,
      eventWeights,
      onEventWeightChange,
      replaceEvent,
      setEdges,
      setNodes,
    ],
  );

  useEffect(() => {
    const currentAudioNodeIds = new Set(audioFiles.map((audio) => `audio:${audio.id}`));
    const currentCustomEventNodeIds = new Set(
      audioFiles.map((audio) => `event:custom:${audio.id}`),
    );
    const nextNodes = nodesRef.current
      .filter(
        (node) =>
          (node.data.kind !== "audio" || currentAudioNodeIds.has(node.id)) &&
          (!node.data.isCustomEvent || currentCustomEventNodeIds.has(node.id)),
      )
      .map((node) => {
        if (node.data.kind === "audio") {
          const audio = audioFiles.find((item) => `audio:${item.id}` === node.id);
          if (!audio) return node;
          const preview = getPreviewState(audio.id);
          return {
            ...node,
            data: {
              ...node.data,
              label: audio.name,
              subtitle: audio.format,
              minecraftSubtitle: audioSubtitles[audio.id] ?? "",
              minecraftSubtitleLabel: c.minecraftSubtitle,
              minecraftSubtitlePlaceholder: c.minecraftSubtitlePlaceholder,
              originalName: audio.originalName,
              previewStatus: preview.status,
              previewLabel: preview.label,
              onPreviewAudio,
              onMinecraftSubtitleChange: onAudioSubtitleChange,
              onDelete: deleteNode,
            },
          };
        }
        if (!node.data.isCustomEvent || !node.data.customAudioId) {
          return {
            ...node,
            data: {
              ...node.data,
              subtitle: c.event,
              editEventLabel: undefined,
              onRenameEvent: undefined,
              replaceEventLabel: c.replaceEventAction,
              onReplaceEvent: openReplaceEventPicker,
              onDelete: deleteNode,
            },
          };
        }
        const audio = audioFiles.find((item) => item.id === node.data.customAudioId);
        if (!audio) return node;
        const suffix = customEventSuffixes[audio.id] ?? audio.key;
        const eventName = `mcsd.${suffix}`;
        return {
          ...node,
          data: {
            ...node.data,
            label: eventName,
            subtitle: c.customEvent,
            eventName,
            customAudioKey: audio.key,
            customEventSuffix: suffix,
            editEventLabel: c.editEvent,
            resetEventLabel: c.resetEvent,
            onRenameEvent: renameEvent,
            replaceEventLabel: undefined,
            onReplaceEvent: undefined,
            onDelete: deleteNode,
          },
        };
      });
    const nodeIds = new Set(nextNodes.map((node) => node.id));
    const eventNodeIds = new Map(
      nextNodes
        .filter((node) => node.data.kind === "event" && node.data.eventName)
        .map((node) => [node.data.eventName as string, node.id]),
    );
    const customEventOwners = new Map(
      audioFiles.map((audio) => [
        `mcsd.${customEventSuffixes[audio.id] ?? audio.key}`,
        audio,
      ]),
    );
    const boundAudioIdsByEvent = new Map<string, string[]>();
    for (const [audioId, boundEvents] of Object.entries(eventBindings)) {
      if (!audioFiles.some((audio) => audio.id === audioId)) continue;
      for (const eventName of boundEvents) {
        const audioIds = boundAudioIdsByEvent.get(eventName) ?? [];
        if (!audioIds.includes(audioId)) audioIds.push(audioId);
        boundAudioIdsByEvent.set(eventName, audioIds);
      }
    }
    const probabilityFormatter = new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en", {
      style: "percent",
      maximumFractionDigits: 1,
    });
    const desiredEdges: BindingEdge[] = [];
    let nextEventPosition = nextNodes.filter((node) => node.data.kind === "event").length;

    for (const [audioId, boundEvents] of Object.entries(eventBindings)) {
      const audio = audioFiles.find((item) => item.id === audioId);
      if (!audio) continue;
      const audioNodeId = `audio:${audio.id}`;
      if (!nodeIds.has(audioNodeId)) {
        const preview = getPreviewState(audio.id);
        nextNodes.push({
          id: audioNodeId,
          type: "soundNode",
          position: { x: 80, y: 80 + audioFiles.indexOf(audio) * 112 },
          data: {
            kind: "audio",
            label: audio.name,
            subtitle: audio.format,
            minecraftSubtitle: audioSubtitles[audio.id] ?? "",
            minecraftSubtitleLabel: c.minecraftSubtitle,
            minecraftSubtitlePlaceholder: c.minecraftSubtitlePlaceholder,
            originalName: audio.originalName,
            previewStatus: preview.status,
            previewLabel: preview.label,
            onPreviewAudio,
            onMinecraftSubtitleChange: onAudioSubtitleChange,
            editEventLabel: c.editEvent,
            onRenameEvent: renameEvent,
            onDelete: deleteNode,
          },
        });
        nodeIds.add(audioNodeId);
      }

      for (const eventName of boundEvents) {
        if (!eventName) continue;
        const customOwner = customEventOwners.get(eventName);
        let eventNodeId = eventNodeIds.get(eventName);
        if (!eventNodeId) {
          eventNodeId = customOwner
            ? `event:custom:${customOwner.id}`
            : `event:${eventName}`;
        }
        if (!nodeIds.has(eventNodeId)) {
          const translation = customOwner ? "" : translateSoundEventKeyZh(eventName);
          nextNodes.push({
            id: eventNodeId,
            type: "soundNode",
            position: { x: 440, y: 80 + nextEventPosition * 112 },
            data: {
              kind: "event",
              label: eventName,
              subtitle: customOwner ? c.customEvent : c.event,
              eventName,
              translation: translation && translation !== eventName ? translation : undefined,
              isCustomEvent: Boolean(customOwner),
              customAudioId: customOwner?.id,
              customAudioKey: customOwner?.key,
              customEventSuffix: customOwner
                ? customEventSuffixes[customOwner.id] ?? customOwner.key
                : undefined,
              editEventLabel: customOwner ? c.editEvent : undefined,
              resetEventLabel: c.resetEvent,
              onRenameEvent: customOwner ? renameEvent : undefined,
              replaceEventLabel: customOwner ? undefined : c.replaceEventAction,
              onReplaceEvent: customOwner ? undefined : openReplaceEventPicker,
              onDelete: deleteNode,
            },
          });
          nodeIds.add(eventNodeId);
          eventNodeIds.set(eventName, eventNodeId);
          nextEventPosition += 1;
        }
        const eventAudioIds = boundAudioIdsByEvent.get(eventName) ?? [audioId];
        const weight = getAudioEventWeight(eventWeights, audioId, eventName);
        const totalWeight = eventAudioIds.reduce(
          (total, itemAudioId) =>
            total + getAudioEventWeight(eventWeights, itemAudioId, eventName),
          0,
        );
        desiredEdges.push({
          id: createBindingEdgeId(audioId, eventName),
          source: audioNodeId,
          sourceHandle: "source",
          target: eventNodeId,
          targetHandle: "target",
          type: "bindingEdge",
          animated: motionEnabled,
          data: {
            audioId,
            eventName,
            audioName: audio.name,
            weight,
            probability: probabilityFormatter.format(
              calculateAudioEventProbability(weight, totalWeight),
            ),
            weightLabel: c.weight,
            probabilityLabel: c.probability,
            editable: eventAudioIds.length > 1,
            onWeightChange: onEventWeightChange,
          },
        });
      }
    }

    setNodes(nextNodes);
    setEdges((currentEdges) => {
      const currentById = new Map(currentEdges.map((edge) => [edge.id, edge]));
      return desiredEdges.map((edge) => ({ ...currentById.get(edge.id), ...edge }));
    });
  }, [
    audioFiles,
    audioSubtitles,
    c.customEvent,
    c.editEvent,
    c.event,
    c.minecraftSubtitle,
    c.minecraftSubtitlePlaceholder,
    c.probability,
    c.replaceEventAction,
    c.resetEvent,
    c.weight,
    customEventSuffixes,
    deleteNode,
    eventBindings,
    eventWeights,
    getPreviewState,
    language,
    motionEnabled,
    onAudioSubtitleChange,
    onEventWeightChange,
    onPreviewAudio,
    openReplaceEventPicker,
    renameEvent,
    setEdges,
    setNodes,
  ]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setReplaceEvent(null);
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;

    let centerFrame = 0;
    const layoutFrame = window.requestAnimationFrame(() => {
      centerFrame = window.requestAnimationFrame(() => {
        void fitView({ padding: 0.22, maxZoom: 1, duration: 0 });
      });
    });
    return () => {
      window.cancelAnimationFrame(layoutFrame);
      if (centerFrame) window.cancelAnimationFrame(centerFrame);
    };
  }, [fitView, isFullscreen]);

  useEffect(() => {
    const normalViewport = normalViewportRef.current;
    if (isFullscreen || !normalViewport) return;

    let restoreFrame = 0;
    const layoutFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => {
        void setViewport(normalViewport, { duration: 0 });
        normalViewportRef.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(layoutFrame);
      if (restoreFrame) window.cancelAnimationFrame(restoreFrame);
    };
  }, [isFullscreen, setViewport]);

  const usedAudioIds = useMemo(
    () => new Set(nodes.filter((node) => node.data.kind === "audio").map((node) => node.id)),
    [nodes],
  );
  const usedEventIds = useMemo(
    () => new Set(nodes.filter((node) => node.data.kind === "event").map((node) => node.id)),
    [nodes],
  );
  const replacementEvents = useMemo(() => {
    if (!replaceEvent) return [];
    const currentNode = nodes.find((node) => node.id === replaceEvent.nodeId);
    const currentEventName = currentNode?.data.eventName;
    if (!currentEventName || currentNode?.data.isCustomEvent) return [];
    const usedEventNames = new Set(
      nodes
        .filter(
          (node) =>
            node.id !== replaceEvent.nodeId &&
            node.data.kind === "event" &&
            node.data.eventName,
        )
        .map((node) => node.data.eventName as string),
    );
    const query = replaceEvent.query.trim().toLocaleLowerCase();
    return searchSoundEventKeys(SOUND_EVENTS.filter(
      (eventName) =>
        eventName !== currentEventName &&
        !usedEventNames.has(eventName),
    ), query)
      .map((eventName) => ({
        eventName,
        translation: SOUND_EVENT_TRANSLATIONS.get(eventName) || undefined,
      }))
      .slice(0, EVENT_RESULT_LIMIT);
  }, [nodes, replaceEvent]);
  const replacingEventName = replaceEvent
    ? nodes.find((node) => node.id === replaceEvent.nodeId)?.data.eventName
    : undefined;
  const availableAudio = useMemo(() => {
    const query = menu?.query.trim().toLocaleLowerCase() ?? "";
    return audioFiles.filter(
      (audio) =>
        !usedAudioIds.has(`audio:${audio.id}`) &&
        (!query ||
          audio.name.toLocaleLowerCase().includes(query) ||
          audio.originalName.toLocaleLowerCase().includes(query)),
    );
  }, [audioFiles, menu?.query, usedAudioIds]);
  const availableEvents = useMemo<SoundEventOption[]>(() => {
    const query = menu?.query.trim().toLocaleLowerCase() ?? "";
    const customEvents = audioFiles
      .map((audio) => ({
        rawId: `custom:${audio.id}`,
        eventName: `mcsd.${customEventSuffixes[audio.id] ?? audio.key}`,
        isCustomEvent: true,
        customAudioId: audio.id,
        customAudioKey: audio.key,
        customEventSuffix: customEventSuffixes[audio.id] ?? audio.key,
        originalAudioName: audio.originalName,
      }))
      .filter(
        (event) =>
          !usedEventIds.has(`event:${event.rawId}`) &&
          (!query ||
            event.eventName.toLocaleLowerCase().includes(query) ||
            event.originalAudioName.toLocaleLowerCase().includes(query)),
      );
    const vanillaEvents = searchSoundEventKeys(SOUND_EVENTS.filter(
      (eventName) =>
        !usedEventIds.has(`event:${eventName}`),
    ), query).map((eventName) => ({
      rawId: eventName,
      eventName,
      translation: SOUND_EVENT_TRANSLATIONS.get(eventName) || undefined,
      isCustomEvent: false,
    }));
    return [...customEvents, ...vanillaEvents].slice(0, EVENT_RESULT_LIMIT);
  }, [audioFiles, customEventSuffixes, menu?.query, usedEventIds]);

  const addNode = useCallback(
    (
      kind: NodeKind,
      rawId: string,
      label: string,
      subtitle: string,
      translation?: string,
      customEvent?: { audioId: string; audioKey: string; suffix: string },
    ) => {
      if (!menu) return;
      const nodeId = `${kind}:${rawId}`;
      const preview = kind === "audio" ? getPreviewState(rawId) : null;
      setNodes((current) => {
        if (current.some((node) => node.id === nodeId)) return current;
        return [
          ...current,
          {
            id: nodeId,
            type: "soundNode",
            position: menu.flowPosition,
            data: {
              kind,
              label,
              subtitle,
              eventName: kind === "event" ? label : undefined,
              previewStatus: preview?.status,
              previewLabel: preview?.label,
              onPreviewAudio: kind === "audio" ? onPreviewAudio : undefined,
              minecraftSubtitle: kind === "audio" ? audioSubtitles[rawId] ?? "" : undefined,
              minecraftSubtitleLabel: kind === "audio" ? c.minecraftSubtitle : undefined,
              minecraftSubtitlePlaceholder: kind === "audio"
                ? c.minecraftSubtitlePlaceholder
                : undefined,
              onMinecraftSubtitleChange: kind === "audio"
                ? onAudioSubtitleChange
                : undefined,
              translation,
              originalName: kind === "audio"
                ? audioFiles.find((audio) => audio.id === rawId)?.originalName
                : undefined,
              isCustomEvent: Boolean(customEvent),
              customAudioId: customEvent?.audioId,
              customAudioKey: customEvent?.audioKey,
              customEventSuffix: customEvent?.suffix,
              editEventLabel: customEvent ? c.editEvent : undefined,
              resetEventLabel: c.resetEvent,
              onRenameEvent: customEvent ? renameEvent : undefined,
              replaceEventLabel: kind === "event" && !customEvent
                ? c.replaceEventAction
                : undefined,
              onReplaceEvent: kind === "event" && !customEvent
                ? openReplaceEventPicker
                : undefined,
              onDelete: deleteNode,
            },
          },
        ];
      });
      setMenu(null);
    },
    [
      c.editEvent,
      c.minecraftSubtitle,
      c.minecraftSubtitlePlaceholder,
      c.replaceEventAction,
      c.resetEvent,
      audioFiles,
      audioSubtitles,
      deleteNode,
      getPreviewState,
      menu,
      onAudioSubtitleChange,
      onPreviewAudio,
      openReplaceEventPicker,
      renameEvent,
      setNodes,
    ],
  );

  const getNormalizedPair = useCallback(
    (connection: Pick<Connection, "source" | "target">, currentNodes = nodesRef.current) => {
      const sourceNode = currentNodes.find((node) => node.id === connection.source);
      const targetNode = currentNodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode || sourceNode.data.kind === targetNode.data.kind) return null;
      return sourceNode.data.kind === "audio"
        ? { audioNode: sourceNode, eventNode: targetNode }
        : { audioNode: targetNode, eventNode: sourceNode };
    },
    [],
  );

  const isValidConnection = useCallback(
    (connection: Connection | BindingEdge) => {
      const pair = getNormalizedPair(connection);
      if (!pair) return false;
      const audioId = pair.audioNode.id.slice("audio:".length);
      const eventName = pair.eventNode.data.eventName;
      if (!eventName) return false;
      if (pair.eventNode.data.isCustomEvent) {
        const audioCustomEvent = (eventBindingsRef.current[audioId] ?? []).find((item) =>
          item.startsWith("mcsd."),
        );
        if (audioCustomEvent && audioCustomEvent !== eventName) return false;
        const isBoundToAnotherAudio = Object.entries(eventBindingsRef.current).some(
          ([itemAudioId, events]) => itemAudioId !== audioId && events.includes(eventName),
        );
        if (isBoundToAnotherAudio) return false;
      }
      return !edges.some(
        (edge) => edge.source === pair.audioNode.id && edge.target === pair.eventNode.id,
      );
    },
    [edges, getNormalizedPair],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const pair = getNormalizedPair(connection);
      if (!pair || !isValidConnection(connection)) return;
      const audioId = pair.audioNode.id.slice("audio:".length);
      const eventName = pair.eventNode.data.eventName;
      if (!eventName) return;
      commitEventBindings(audioId, [
        ...(eventBindingsRef.current[audioId] ?? []),
        eventName,
      ]);
      setEdges((current) =>
        addEdge(
          {
            id: createBindingEdgeId(audioId, eventName),
            source: pair.audioNode.id,
            sourceHandle: "source",
            target: pair.eventNode.id,
            targetHandle: "target",
            type: "bindingEdge",
            animated: motionEnabled,
          },
          current,
        ),
      );
    },
    [commitEventBindings, getNormalizedPair, isValidConnection, motionEnabled, setEdges],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: BindingEdge[]) => {
      const nextBindings = Object.fromEntries(
        Object.entries(eventBindingsRef.current).map(([audioId, events]) => [audioId, [...events]]),
      );
      const changedAudioIds = new Set<string>();
      for (const edge of deletedEdges) {
        const pair = getNormalizedPair(edge);
        const eventName = pair?.eventNode.data.eventName;
        if (!pair || !eventName) continue;
        const audioId = pair.audioNode.id.slice("audio:".length);
        nextBindings[audioId] = (nextBindings[audioId] ?? []).filter(
          (item) => item !== eventName,
        );
        changedAudioIds.add(audioId);
      }
      eventBindingsRef.current = nextBindings;
      for (const audioId of changedAudioIds) {
        onEventBindingsChangeRef.current(audioId, nextBindings[audioId] ?? []);
      }
    },
    [getNormalizedPair],
  );

  const openContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const menuWidth = 292;
      const menuHeight = 230;
      setReplaceEvent(null);
      setMenu({
        left: Math.max(10, Math.min(event.clientX - rect.left, rect.width - menuWidth - 10)),
        top: Math.max(10, Math.min(event.clientY - rect.top, rect.height - menuHeight - 10)),
        flowPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        view: "root",
        query: "",
      });
    },
    [screenToFlowPosition],
  );

  const openAddMenu = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    setReplaceEvent(null);
    setMenu({
      left: 12,
      top: 60,
      flowPosition: screenToFlowPosition(center),
      view: "root",
      query: "",
    });
  }, [screenToFlowPosition]);

  const setMenuView = (view: MenuView) => {
    setMenu((current) => (current ? { ...current, view, query: "" } : current));
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) normalViewportRef.current = getViewport();
    setIsFullscreen((current) => !current);
  };

  return (
    <div
      ref={wrapperRef}
      className={`advanced-event-flow${isFullscreen ? " is-fullscreen" : ""}`}
      aria-label={c.graph}
    >
      <ReactFlow<SoundNode, BindingEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onPaneContextMenu={openContextMenu}
        onPaneClick={() => {
          setMenu(null);
          setReplaceEvent(null);
        }}
        onNodeClick={() => setMenu(null)}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={1.5}
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          style: { strokeWidth: 2 },
          selectable: true,
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.4} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => (node.data.kind === "audio" ? "#3a971e" : "#3366cc")}
        />
      </ReactFlow>

      <button
        type="button"
        className="sound-flow-add-button nodrag nopan"
        aria-label={c.addNode}
        aria-haspopup="menu"
        title={c.addNode}
        onClick={openAddMenu}
      >
        <Plus aria-hidden="true" size={17} />
      </button>

      <button
        type="button"
        className="sound-flow-fullscreen-button nodrag nopan"
        aria-label={isFullscreen ? c.exitFullscreen : c.enterFullscreen}
        aria-pressed={isFullscreen}
        title={isFullscreen ? c.exitFullscreen : c.enterFullscreen}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? (
          <Minimize2 aria-hidden="true" size={17} />
        ) : (
          <Maximize2 aria-hidden="true" size={17} />
        )}
      </button>

      <div className="sound-flow-stats" aria-live="polite">
        <span>{nodes.length} {c.nodes}</span>
        <span>{edges.length} {c.mappings}</span>
      </div>

      {replaceEvent && replacingEventName ? (
        <div
          className="sound-flow-menu sound-flow-replace-menu nodrag nowheel"
          role="dialog"
          aria-label={c.replaceEvent}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="sound-flow-menu__header">
            <strong>{c.replaceEvent}</strong>
            <button
              type="button"
              aria-label={c.close}
              title={c.close}
              onClick={() => setReplaceEvent(null)}
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>
          <div className="sound-flow-replace-menu__current">
            <span>{c.currentEvent}</span>
            <code title={replacingEventName}>{replacingEventName}</code>
          </div>
          <label className="sound-flow-menu__search">
            <Search aria-hidden="true" size={15} />
            <input
              autoFocus
              value={replaceEvent.query}
              placeholder={c.searchReplacement}
              onKeyDown={(event) => event.stopPropagation()}
              onChange={(event) =>
                setReplaceEvent((current) =>
                  current ? { ...current, query: event.target.value } : current,
                )
              }
            />
          </label>
          <div className="sound-flow-menu__list" role="listbox">
            {replacementEvents.length > 0 ? replacementEvents.map((event) => {
              const primaryLabel = language === "zh" && event.translation
                ? event.translation
                : event.eventName;
              const secondaryLabel = language === "zh"
                ? event.eventName
                : event.translation;
              return (
                <button
                  key={event.eventName}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => replaceVanillaEvent(event.eventName)}
                >
                  <RadioTower aria-hidden="true" size={15} />
                  <span>
                    <strong title={primaryLabel}>{primaryLabel}</strong>
                    {secondaryLabel ? (
                      <small title={secondaryLabel}>{secondaryLabel}</small>
                    ) : null}
                  </span>
                </button>
              );
            }) : <p>{c.noReplacement}</p>}
          </div>
        </div>
      ) : null}

      {menu ? (
        <div
          className="sound-flow-menu nodrag nowheel"
          style={{ left: menu.left, top: menu.top }}
          role="menu"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="sound-flow-menu__header">
            <strong>
              {menu.view === "audio" ? c.addAudio : menu.view === "event" ? c.addEvent : c.graph}
            </strong>
            <button type="button" aria-label={c.close} title={c.close} onClick={() => setMenu(null)}>
              <X aria-hidden="true" size={15} />
            </button>
          </div>

          {menu.view === "root" ? (
            <div className="sound-flow-menu__actions">
              <button type="button" role="menuitem" onClick={() => setMenuView("audio")}>
                <span className="is-audio"><FileAudio aria-hidden="true" size={18} /></span>
                <span><strong>{c.addAudio}</strong><small>{availableAudio.length}</small></span>
                <Plus aria-hidden="true" size={16} />
              </button>
              <button type="button" role="menuitem" onClick={() => setMenuView("event")}>
                <span className="is-event"><RadioTower aria-hidden="true" size={18} /></span>
                <span>
                  <strong>{c.addEvent}</strong>
                  <small>{Math.max(0, SOUND_EVENTS.length + audioFiles.length - usedEventIds.size)}</small>
                </span>
                <Plus aria-hidden="true" size={16} />
              </button>
            </div>
          ) : (
            <>
              <label className="sound-flow-menu__search">
                <Search aria-hidden="true" size={15} />
                <input
                  autoFocus
                  value={menu.query}
                  placeholder={menu.view === "audio" ? c.searchAudio : c.searchEvent}
                  onChange={(event) =>
                    setMenu((current) =>
                      current ? { ...current, query: event.target.value } : current,
                    )
                  }
                />
              </label>
              <div className="sound-flow-menu__list" role="menu">
                {menu.view === "audio" ? (
                  availableAudio.length > 0 ? availableAudio.map((audio) => (
                    <button
                      key={audio.id}
                      type="button"
                      role="menuitem"
                      onClick={() => addNode("audio", audio.id, audio.name, audio.format)}
                    >
                      <FileAudio aria-hidden="true" size={15} />
                      <span>
                        <strong title={audio.name}>{audio.name}</strong>
                        <small title={audio.originalName}>{audio.originalName}</small>
                      </span>
                    </button>
                  )) : <p>{c.noAudio}</p>
                ) : availableEvents.length > 0 ? availableEvents.map((event) => {
                  const primaryLabel = event.isCustomEvent
                    ? event.eventName
                    : language === "zh" && event.translation
                      ? event.translation
                      : event.eventName;
                  const secondaryLabel = event.isCustomEvent
                    ? event.originalAudioName ?? c.customEvent
                    : language === "zh"
                      ? event.eventName
                      : event.translation;
                  return (
                    <button
                      key={event.rawId}
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        addNode(
                          "event",
                          event.rawId,
                          event.eventName,
                          event.isCustomEvent ? c.customEvent : c.event,
                          event.isCustomEvent ? undefined : event.translation,
                          event.isCustomEvent && event.customAudioId && event.customEventSuffix
                            ? {
                                audioId: event.customAudioId,
                                audioKey: event.customAudioKey ?? event.customEventSuffix,
                                suffix: event.customEventSuffix,
                              }
                            : undefined,
                        )
                      }
                    >
                      <RadioTower aria-hidden="true" size={15} />
                      <span>
                        <strong title={primaryLabel}>{primaryLabel}</strong>
                        {secondaryLabel ? <small title={secondaryLabel}>{secondaryLabel}</small> : null}
                      </span>
                    </button>
                  );
                }) : <p>{c.noEvent}</p>}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AdvancedEventFlow(props: {
  audioFiles: EventFlowAudio[];
  customEventSuffixes: Record<string, string>;
  onCustomEventChange: (audioId: string, suffix: string) => void;
  audioSubtitles: Record<string, string>;
  onAudioSubtitleChange: (audioId: string, subtitle: string) => void;
  eventBindings: Record<string, string[]>;
  onEventBindingsChange: (audioId: string, events: string[]) => void;
  eventWeights: AudioEventWeights;
  onEventWeightChange: (audioId: string, eventName: string, weight: number) => void;
  previewingAudioId: string | null;
  previewLoadingAudioId: string | null;
  previewErrorAudioId: string | null;
  onPreviewAudio: (audioId: string) => void;
  playPreviewLabel: string;
  pausePreviewLabel: string;
  retryPreviewLabel: string;
  language: FlowLanguage;
  motionEnabled: boolean;
}) {
  return (
    <ReactFlowProvider>
      <AdvancedEventFlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
