"use client";

import { Button, Modal } from "@heroui/react";
import {
  Check,
  Link2,
  LockKeyhole,
  Plus,
  RadioTower,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { vanillaSoundJava } from "@/lib/sounds";
import { searchSoundEventKeys, translateSoundEventKeyZh } from "@/lib/SoundsTranslate";
import {
  calculateAudioEventProbability,
  getAudioEventWeight,
  type AudioEventWeights,
} from "@/lib/audio-event-weight";

export type BindingAudio = {
  id: string;
  name: string;
  originalName: string;
  key: string;
};

type BindingMode = "custom" | "vanilla";
type BindingLanguage = "zh" | "en";

const VANILLA_EVENTS = Object.keys(vanillaSoundJava);
const MAX_CUSTOM_EVENT_SUFFIX_LENGTH = 8;

const COPY = {
  zh: {
    manage: "管理声音绑定",
    bound: "已绑定事件",
    custom: "自定义事件",
    vanilla: "原版事件",
    search: "搜索声音事件",
    empty: "还没有绑定声音事件",
    noResults: "没有匹配的声音事件",
    add: "添加绑定",
    added: "已添加",
    occupied: "已被其他音频绑定",
    customLimit: "此音频已有自定义事件",
    editCustom: "修改自定义声音事件",
    resetCustom: "按声音 key 自动生成",
    remove: "移除绑定",
    weight: "权重",
    probability: "随机概率",
    distribution: "随机播放分配",
    close: "完成",
    eventCount: "个事件",
    selectedHint: "当前音频的声音触发规则",
    catalog: "选择事件",
    resultCount: "项结果",
    currentAudio: "当前音频",
  },
  en: {
    manage: "Manage sound bindings",
    bound: "Bound events",
    custom: "Custom events",
    vanilla: "Vanilla events",
    search: "Search sound events",
    empty: "No sound events bound",
    noResults: "No matching sound events",
    add: "Add binding",
    added: "Added",
    occupied: "Bound to another audio",
    customLimit: "This audio already has a custom event",
    editCustom: "Edit custom sound event",
    resetCustom: "Generate from sound key",
    remove: "Remove binding",
    weight: "Weight",
    probability: "Chance",
    distribution: "Random playback distribution",
    close: "Done",
    eventCount: "events",
    selectedHint: "Sound triggers for this audio",
    catalog: "Choose events",
    resultCount: "results",
    currentAudio: "Current audio",
  },
} as const;

function EventName({ eventName, language }: { eventName: string; language: BindingLanguage }) {
  const isCustom = eventName.startsWith("mcsd.");
  const translation = isCustom ? "" : translateSoundEventKeyZh(eventName);
  const primary = language === "zh" && translation && translation !== eventName
    ? translation
    : eventName;
  const secondary = language === "zh" ? eventName : translation;

  return (
    <span className="binding-event-name">
      <strong title={primary}>{primary}</strong>
      {secondary && secondary !== primary ? <small title={secondary}>{secondary}</small> : null}
    </span>
  );
}

function CustomEventEditor({
  audio,
  suffix,
  editLabel,
  resetLabel,
  onChange,
}: {
  audio: BindingAudio;
  suffix: string;
  editLabel: string;
  resetLabel: string;
  onChange: (audioId: string, suffix: string) => void;
}) {
  return (
    <div className="binding-custom-event">
      <label className="binding-custom-event-editor">
        <code>mcsd.</code>
        <input
          aria-label={editLabel}
          maxLength={MAX_CUSTOM_EVENT_SUFFIX_LENGTH}
          value={suffix}
          onChange={(event) => onChange(audio.id, event.target.value)}
        />
        <button
          type="button"
          aria-label={resetLabel}
          title={resetLabel}
          disabled={suffix === audio.key}
          onClick={() => onChange(audio.id, audio.key)}
        >
          <RefreshCcw aria-hidden="true" size={13} />
        </button>
      </label>
      <small title={audio.originalName}>{audio.originalName}</small>
    </div>
  );
}

function EventWeightDistribution({
  eventName,
  allAudio,
  eventBindings,
  eventWeights,
  currentAudioId,
  language,
  onWeightChange,
}: {
  eventName: string;
  allAudio: BindingAudio[];
  eventBindings: Record<string, string[]>;
  eventWeights: AudioEventWeights;
  currentAudioId: string;
  language: BindingLanguage;
  onWeightChange: (audioId: string, eventName: string, weight: number) => void;
}) {
  const c = COPY[language];
  const boundAudio = allAudio.filter((item) =>
    (eventBindings[item.id] ?? []).includes(eventName),
  );
  if (boundAudio.length < 2) return null;

  const weightedAudio = boundAudio.map((item) => ({
    item,
    weight: getAudioEventWeight(eventWeights, item.id, eventName),
  }));
  const totalWeight = weightedAudio.reduce((total, entry) => total + entry.weight, 0);
  const percentFormatter = new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en", {
    style: "percent",
    maximumFractionDigits: 1,
  });

  return (
    <div className="binding-weight-distribution" role="group" aria-label={c.distribution}>
      <div className="binding-weight-distribution__heading">
        <span>{c.distribution}</span>
        <span>{c.weight}</span>
        <span>{c.probability}</span>
      </div>
      {weightedAudio.map(({ item, weight }) => (
        <label
          key={item.id}
          className={item.id === currentAudioId ? "is-current" : undefined}
        >
          <span title={item.name}>{item.name}</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            aria-label={`${item.name} ${c.weight}`}
            value={weight}
            onChange={(event) =>
              onWeightChange(item.id, eventName, event.currentTarget.valueAsNumber)
            }
          />
          <output>
            {percentFormatter.format(calculateAudioEventProbability(weight, totalWeight))}
          </output>
        </label>
      ))}
    </div>
  );
}

export function BasicEventBindingModal({
  audio,
  allAudio,
  customEventSuffixes,
  boundEvents,
  eventBindings,
  eventWeights,
  language,
  onCustomEventChange,
  onChange,
  onWeightChange,
  variant = "desktop",
}: {
  audio: BindingAudio;
  allAudio: BindingAudio[];
  customEventSuffixes: Record<string, string>;
  boundEvents: string[];
  eventBindings: Record<string, string[]>;
  eventWeights: AudioEventWeights;
  language: BindingLanguage;
  onCustomEventChange: (audioId: string, suffix: string) => void;
  onChange: (events: string[]) => void;
  onWeightChange: (audioId: string, eventName: string, weight: number) => void;
  variant?: "desktop" | "mobile";
}) {
  const c = COPY[language];
  const selectedTitleId = useId();
  const catalogTitleId = useId();
  const [mode, setMode] = useState<BindingMode>("custom");
  const [query, setQuery] = useState("");
  const customEvents = useMemo(
    () => allAudio.map((item) => `mcsd.${customEventSuffixes[item.id] ?? item.key}`),
    [allAudio, customEventSuffixes],
  );
  const customEventAudioByName = useMemo(
    () => new Map(
      allAudio.map((item) => [
        `mcsd.${customEventSuffixes[item.id] ?? item.key}`,
        item,
      ]),
    ),
    [allAudio, customEventSuffixes],
  );
  const boundCustomEvent = boundEvents.find((eventName) => eventName.startsWith("mcsd."));
  const customEventOwners = useMemo(() => {
    const owners = new Map<string, string>();
    for (const [audioId, events] of Object.entries(eventBindings)) {
      for (const eventName of events) {
        if (eventName.startsWith("mcsd.") && !owners.has(eventName)) {
          owners.set(eventName, audioId);
        }
      }
    }
    return owners;
  }, [eventBindings]);
  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (mode === "vanilla") {
      return searchSoundEventKeys(VANILLA_EVENTS, normalizedQuery);
    }
    return customEvents.filter((eventName) => {
      if (!normalizedQuery) return true;
      return eventName.toLowerCase().includes(normalizedQuery) ||
        customEventAudioByName
          .get(eventName)
          ?.originalName.toLowerCase()
          .includes(normalizedQuery) === true;
    });
  }, [customEventAudioByName, customEvents, mode, query]);

  const addBinding = (eventName: string) => {
    if (boundEvents.includes(eventName)) return;
    onChange([...boundEvents, eventName]);
  };

  const removeBinding = (eventName: string) => {
    onChange(boundEvents.filter((item) => item !== eventName));
  };

  const getCustomAudio = (eventName: string) => eventName.startsWith("mcsd.")
    ? allAudio.find(
        (item) => `mcsd.${customEventSuffixes[item.id] ?? item.key}` === eventName,
      )
    : undefined;

  const renderMobileContent = () => (
    <>
      <Modal.CloseTrigger
        aria-label={c.close}
        className="mobile-binding-header__close"
      />
      <Modal.Header className="mobile-binding-header">
        <Modal.Icon className="mobile-binding-header__icon">
          <RadioTower aria-hidden="true" size={20} />
        </Modal.Icon>
        <div className="mobile-binding-header__copy">
          <span>{c.currentAudio}</span>
          <Modal.Heading className="mobile-binding-header__title">{c.catalog}</Modal.Heading>
          <p title={audio.originalName}>
            {audio.originalName}
            {audio.originalName !== audio.name ? ` · ${audio.name}` : ""}
          </p>
        </div>
        <span className="mobile-binding-header__count" title={`${boundEvents.length} ${c.eventCount}`}>
          {boundEvents.length}
        </span>
      </Modal.Header>

      <Modal.Body className="mobile-binding-body">
        <section className="mobile-binding-selected" aria-labelledby={selectedTitleId}>
          <div className="mobile-binding-section-heading">
            <div>
              <h3 id={selectedTitleId}>{c.bound}</h3>
              <p>{c.selectedHint}</p>
            </div>
            <span>{boundEvents.length}</span>
          </div>
          {boundEvents.length > 0 ? (
            <div className="mobile-binding-selected-list">
              {boundEvents.map((eventName) => {
                const customAudio = getCustomAudio(eventName);
                return (
                  <article
                    key={customAudio ? `mobile-custom:${customAudio.id}` : `mobile:${eventName}`}
                    className="mobile-binding-selected-item"
                  >
                    <span className="mobile-binding-event-icon is-selected">
                      <Check aria-hidden="true" size={16} />
                    </span>
                    <div className="mobile-binding-selected-item__main">
                      <span className="mobile-binding-event-type">
                        {customAudio ? c.custom : c.vanilla}
                      </span>
                      {customAudio ? (
                        <CustomEventEditor
                          audio={customAudio}
                          suffix={customEventSuffixes[customAudio.id] ?? customAudio.key}
                          editLabel={c.editCustom}
                          resetLabel={c.resetCustom}
                          onChange={onCustomEventChange}
                        />
                      ) : (
                        <EventName eventName={eventName} language={language} />
                      )}
                    </div>
                    <Button
                      isIconOnly
                      className="mobile-binding-remove"
                      aria-label={`${c.remove}: ${eventName}`}
                      onPress={() => removeBinding(eventName)}
                    >
                      <Trash2 aria-hidden="true" size={18} />
                    </Button>
                    <EventWeightDistribution
                      eventName={eventName}
                      allAudio={allAudio}
                      eventBindings={eventBindings}
                      eventWeights={eventWeights}
                      currentAudioId={audio.id}
                      language={language}
                      onWeightChange={onWeightChange}
                    />
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mobile-binding-empty">{c.empty}</p>
          )}
        </section>

        <section className="mobile-binding-picker" aria-labelledby={catalogTitleId}>
          <div className="mobile-binding-controls">
            <div className="mobile-binding-tabs" role="tablist" aria-label={c.catalog}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "custom"}
                onClick={() => { setMode("custom"); setQuery(""); }}
              >
                {c.custom}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "vanilla"}
                onClick={() => { setMode("vanilla"); setQuery(""); }}
              >
                {c.vanilla}
              </button>
            </div>
            <label className="mobile-binding-search">
              <Search aria-hidden="true" size={18} />
              <input
                value={query}
                aria-label={c.search}
                placeholder={c.search}
                type="search"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="mobile-binding-catalog-heading">
            <h3 id={catalogTitleId}>{c.catalog}</h3>
            <span>{candidates.length} {c.resultCount}</span>
          </div>

          {candidates.length > 0 ? (
            <div className="mobile-binding-event-list">
              {candidates.map((eventName) => {
                const isBound = boundEvents.includes(eventName);
                const customAudio = mode === "custom" ? getCustomAudio(eventName) : undefined;
                const ownerAudioId = customEventOwners.get(eventName);
                const isOwnedByAnotherAudio =
                  mode === "custom" && ownerAudioId !== undefined && ownerAudioId !== audio.id;
                const exceedsAudioCustomLimit =
                  mode === "custom" &&
                  boundCustomEvent !== undefined &&
                  boundCustomEvent !== eventName;
                const isUnavailable =
                  !isBound && (isOwnedByAnotherAudio || exceedsAudioCustomLimit);
                const canAdd = !isBound && !isUnavailable;
                const actionLabel = isBound
                  ? c.added
                  : isOwnedByAnotherAudio
                    ? c.occupied
                    : exceedsAudioCustomLimit
                      ? c.customLimit
                      : c.add;
                return (
                  <article
                    key={customAudio ? `mobile-candidate-custom:${customAudio.id}` : `mobile-candidate:${eventName}`}
                    className={`mobile-binding-event-row${customAudio ? " has-custom-event" : ""}${isBound ? " is-added" : ""}${isUnavailable ? " is-unavailable" : ""}`}
                    role={canAdd ? "button" : undefined}
                    tabIndex={canAdd ? 0 : undefined}
                    onClick={(event) => {
                      if (canAdd && !(event.target instanceof HTMLElement && event.target.closest("input,button"))) {
                        addBinding(eventName);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (canAdd && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        addBinding(eventName);
                      }
                    }}
                  >
                    <span className="mobile-binding-event-icon">
                      <RadioTower aria-hidden="true" size={17} />
                    </span>
                    <div className="mobile-binding-event-row__main">
                      {customAudio ? (
                        <CustomEventEditor
                          audio={customAudio}
                          suffix={customEventSuffixes[customAudio.id] ?? customAudio.key}
                          editLabel={c.editCustom}
                          resetLabel={c.resetCustom}
                          onChange={onCustomEventChange}
                        />
                      ) : (
                        <EventName eventName={eventName} language={language} />
                      )}
                      <span className="mobile-binding-event-status">
                        {isBound ? <Check aria-hidden="true" size={13} /> : null}
                        {isUnavailable ? <LockKeyhole aria-hidden="true" size={13} /> : null}
                        {actionLabel}
                      </span>
                    </div>
                    <Button
                      isIconOnly
                      className="mobile-binding-add"
                      aria-label={`${actionLabel}: ${eventName}`}
                      isDisabled={isBound || isUnavailable}
                      onPress={() => addBinding(eventName)}
                    >
                      {isBound ? (
                        <Check aria-hidden="true" size={19} />
                      ) : isUnavailable ? (
                        <LockKeyhole aria-hidden="true" size={18} />
                      ) : (
                        <Plus aria-hidden="true" size={20} />
                      )}
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mobile-binding-empty mobile-binding-empty--catalog">{c.noResults}</p>
          )}
        </section>
      </Modal.Body>

      <Modal.Footer className="mobile-binding-footer">
        <Button slot="close" className="mobile-binding-done">
          <Check aria-hidden="true" size={19} />
          {c.close}
          <span>{boundEvents.length}</span>
        </Button>
      </Modal.Footer>
    </>
  );

  return (
    <Modal>
      <Modal.Trigger className="event-binding-trigger wiki-button wiki-button--neutral">
        <Link2 aria-hidden="true" size={15} />
        <span>
          <strong>{c.manage}</strong>
          <small>{boundEvents.length} {c.eventCount}</small>
        </span>
      </Modal.Trigger>
      <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
        <Modal.Container
          className={variant === "mobile" ? "mobile-binding-container" : undefined}
          size="lg"
          scroll="inside"
        >
          <Modal.Dialog
            className={`wiki-modal binding-modal sm:max-w-[920px]${
              variant === "mobile" ? " binding-modal--mobile" : ""
            }`}
          >
            {variant === "mobile" ? renderMobileContent() : (
              <>
            <Modal.CloseTrigger className="wiki-modal__close" />
            <Modal.Header className="wiki-modal__header">
              <Modal.Icon className="wiki-modal__icon">
                <Link2 aria-hidden="true" size={20} />
              </Modal.Icon>
              <div>
                <Modal.Heading className="wiki-modal__heading">{c.manage}</Modal.Heading>
                <p className="wiki-modal__description">
                  {audio.originalName}
                  {audio.originalName !== audio.name ? ` · ${audio.name}` : ""}
                </p>
              </div>
            </Modal.Header>
            <Modal.Body className="wiki-modal__body binding-modal__body">
              <section className="binding-section">
                <div className="binding-section__heading">
                  <h3>{c.bound}</h3>
                  <span>{boundEvents.length}</span>
                </div>
                {boundEvents.length > 0 ? (
                  <div className="binding-card-grid">
                    {boundEvents.map((eventName) => {
                      const customAudio = eventName.startsWith("mcsd.")
                        ? allAudio.find(
                            (item) =>
                              `mcsd.${customEventSuffixes[item.id] ?? item.key}` === eventName,
                          )
                        : undefined;
                      return (
                        <article
                          key={customAudio ? `custom:${customAudio.id}` : eventName}
                          className="binding-card is-bound"
                        >
                          <RadioTower aria-hidden="true" size={18} />
                          {customAudio ? (
                            <CustomEventEditor
                              audio={customAudio}
                              suffix={customEventSuffixes[customAudio.id] ?? customAudio.key}
                              editLabel={c.editCustom}
                              resetLabel={c.resetCustom}
                              onChange={onCustomEventChange}
                            />
                          ) : (
                            <EventName eventName={eventName} language={language} />
                          )}
                          <Button
                            isIconOnly
                            className="binding-card__action is-remove"
                            aria-label={c.remove}
                            onPress={() => removeBinding(eventName)}
                          >
                            <Trash2 aria-hidden="true" size={14} />
                          </Button>
                          <EventWeightDistribution
                            eventName={eventName}
                            allAudio={allAudio}
                            eventBindings={eventBindings}
                            eventWeights={eventWeights}
                            currentAudioId={audio.id}
                            language={language}
                            onWeightChange={onWeightChange}
                          />
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="binding-empty">{c.empty}</p>
                )}
              </section>

              <section className="binding-section binding-section--catalog">
                <div className="binding-catalog-toolbar">
                  <div className="binding-tabs" role="tablist" aria-label={c.manage}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "custom"}
                      onClick={() => { setMode("custom"); setQuery(""); }}
                    >
                      {c.custom}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "vanilla"}
                      onClick={() => { setMode("vanilla"); setQuery(""); }}
                    >
                      {c.vanilla}
                    </button>
                  </div>
                  <label className="binding-search">
                    <Search aria-hidden="true" size={15} />
                    <input
                      value={query}
                      placeholder={c.search}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                {candidates.length > 0 ? (
                  <div className="binding-card-grid binding-card-grid--catalog">
                    {candidates.map((eventName) => {
                      const isBound = boundEvents.includes(eventName);
                      const customAudio = mode === "custom"
                        ? allAudio.find(
                            (item) =>
                              `mcsd.${customEventSuffixes[item.id] ?? item.key}` === eventName,
                          )
                        : undefined;
                      const ownerAudioId = customEventOwners.get(eventName);
                      const isOwnedByAnotherAudio =
                        mode === "custom" && ownerAudioId !== undefined && ownerAudioId !== audio.id;
                      const exceedsAudioCustomLimit =
                        mode === "custom" &&
                        boundCustomEvent !== undefined &&
                        boundCustomEvent !== eventName;
                      const isUnavailable =
                        !isBound && (isOwnedByAnotherAudio || exceedsAudioCustomLimit);
                      const actionLabel = isBound
                        ? c.added
                        : isOwnedByAnotherAudio
                          ? c.occupied
                          : exceedsAudioCustomLimit
                            ? c.customLimit
                            : c.add;
                      return (
                        <article
                          key={customAudio ? `custom:${customAudio.id}` : eventName}
                          className={`binding-card${isBound ? " is-added" : ""}${isUnavailable ? " is-unavailable" : ""}`}
                        >
                          <RadioTower aria-hidden="true" size={18} />
                          {customAudio ? (
                            <CustomEventEditor
                              audio={customAudio}
                              suffix={customEventSuffixes[customAudio.id] ?? customAudio.key}
                              editLabel={c.editCustom}
                              resetLabel={c.resetCustom}
                              onChange={onCustomEventChange}
                            />
                          ) : (
                            <EventName eventName={eventName} language={language} />
                          )}
                          <Button
                            isIconOnly
                            className="binding-card__action"
                            aria-label={actionLabel}
                            isDisabled={isBound || isUnavailable}
                            onPress={() => addBinding(eventName)}
                          >
                            {isBound ? (
                              <Check aria-hidden="true" size={14} />
                            ) : isUnavailable ? (
                              <LockKeyhole aria-hidden="true" size={14} />
                            ) : (
                              <Plus aria-hidden="true" size={14} />
                            )}
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="binding-empty">{c.noResults}</p>
                )}
              </section>
            </Modal.Body>
            <Modal.Footer className="wiki-modal__footer">
              <Button slot="close" className="wiki-button wiki-button--primary">{c.close}</Button>
            </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
