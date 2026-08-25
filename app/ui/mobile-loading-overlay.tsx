"use client";

import { Button } from "@heroui/react";
import { CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import ffmpeg, { type FFmpegLoadPhase } from "@/lib/ffmpeg";

const MOBILE_QUERY = "(max-width: 767px)";

const PHASE_LABELS: Record<FFmpegLoadPhase, string> = {
  idle: "正在准备运行环境",
  "probing-sources": "正在测速下载源",
  "downloading-core": "正在下载 FFmpeg 核心",
  "downloading-wasm": "正在下载 WebAssembly",
  initializing: "正在初始化音频引擎",
  "switching-source": "正在切换下载源",
  processing: "正在处理音频",
  ready: "加载完成",
  error: "加载失败",
};

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getMobileServerSnapshot() {
  return false;
}

export function MobileLoadingOverlay() {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot,
  );
  const snapshot = useSyncExternalStore(
    ffmpeg.subscribe,
    ffmpeg.getSnapshot,
    ffmpeg.getServerSnapshot,
  );
  const ready = isMobile && snapshot.loaded && snapshot.status === "success";

  const progress = Math.max(0, Math.min(100, snapshot.progress));
  const isError = snapshot.status === "error";

  return (
    <div
      className={`mobile-loading-overlay${ready ? " is-ready" : ""}`}
      aria-hidden={ready}
      aria-busy={!ready}
    >
      <div className="mobile-loading-overlay__panel" role="status">
        <div className={`mobile-loading-overlay__icon${isError ? " is-error" : ""}`}>
          {isError ? (
            <RefreshCw aria-hidden="true" size={25} />
          ) : ready ? (
            <CheckCircle2 aria-hidden="true" size={25} />
          ) : (
            <LoaderCircle aria-hidden="true" size={25} />
          )}
        </div>
        <strong className="mobile-loading-overlay__title">
          {isError ? "运行环境加载失败" : ready ? "移动版工作区已准备好" : "正在准备移动版工作区"}
        </strong>
        <p className="mobile-loading-overlay__description">
          {isError
            ? "请检查网络连接后重新尝试。"
            : ready
              ? "加载完成，即将进入工作区。"
              : "页面适配完成前不会显示未完成的工作区。"}
        </p>
        <div
          className="mobile-loading-overlay__progress"
          role="progressbar"
          aria-label="移动版加载进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="mobile-loading-overlay__meta">
          <span>{PHASE_LABELS[snapshot.phase]}</span>
          <strong>{progress}%</strong>
        </div>
        {isError ? (
          <Button
            className="mobile-loading-overlay__retry"
            onPress={() => void ffmpeg.load().catch(() => undefined)}
          >
            <RefreshCw aria-hidden="true" size={16} />
            重新尝试
          </Button>
        ) : null}
      </div>
    </div>
  );
}
