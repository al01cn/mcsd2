export type AudioEventWeights = Record<string, Record<string, number>>;

export const DEFAULT_AUDIO_EVENT_WEIGHT = 1;

export function normalizeAudioEventWeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_AUDIO_EVENT_WEIGHT;
  return Math.max(DEFAULT_AUDIO_EVENT_WEIGHT, Math.round(value));
}

export function getAudioEventWeight(
  weights: AudioEventWeights | undefined,
  audioId: string,
  eventName: string,
) {
  return normalizeAudioEventWeight(
    weights?.[audioId]?.[eventName] ?? DEFAULT_AUDIO_EVENT_WEIGHT,
  );
}

export function calculateAudioEventProbability(weight: number, totalWeight: number) {
  if (totalWeight <= 0) return 0;
  return normalizeAudioEventWeight(weight) / totalWeight;
}
