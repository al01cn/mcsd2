"use client";

import { Button, Modal } from "@heroui/react";
import { CheckCircle2, LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import ffmpeg, { type FFmpegLoadPhase } from "@/lib/ffmpeg";

const PHASE_LABELS: Record<FFmpegLoadPhase, string> = {
  idle: "准备加载 FFmpeg",
  "probing-sources": "正在测速下载源",
  "downloading-core": "正在下载 FFmpeg 核心脚本",
  "downloading-wasm": "正在下载 FFmpeg WebAssembly",
  initializing: "正在初始化 FFmpeg",
  "switching-source": "当前下载源失败，正在切换下一个",
  processing: "FFmpeg 正在处理音频",
  ready: "FFmpeg 加载成功",
  error: "FFmpeg 加载失败",
};

const MOBILE_QUERY = "(max-width: 767px)";

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

export function FFmpegLoadingGate() {
  const snapshot = useSyncExternalStore(
    ffmpeg.subscribe,
    ffmpeg.getSnapshot,
    ffmpeg.getServerSnapshot,
  );
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot,
  );
  const [startupGateActive, setStartupGateActive] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Let the responsive workspace hydrate first. Mobile gets a short paint window
    // before the core starts, while desktop preloads during browser idle time.
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const load = () => void ffmpeg.load().catch(() => undefined);
    let idleCallback: number | undefined;
    let fallbackTimer: number | undefined;

    if (mobileQuery.matches) {
      fallbackTimer = window.setTimeout(load, 120);
    } else {
      idleCallback = window.requestIdleCallback?.(load, { timeout: 1200 });
      fallbackTimer = idleCallback === undefined ? window.setTimeout(load, 180) : undefined;
    }

    return () => {
      if (idleCallback !== undefined) window.cancelIdleCallback?.(idleCallback);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (isMobile) return;

    if (snapshot.status === "loading" && snapshot.phase !== "processing") {
      const openTimer = window.setTimeout(() => {
        setStartupGateActive(true);
        setIsClosing(false);
      }, 0);
      return () => window.clearTimeout(openTimer);
    }

    if (snapshot.status === "success" && snapshot.phase === "ready" && startupGateActive && !isClosing) {
      const holdTimer = window.setTimeout(() => setIsClosing(true), 3000);
      return () => window.clearTimeout(holdTimer);
    }

    if (isClosing) {
      const closeTimer = window.setTimeout(() => {
        setIsClosing(false);
        setStartupGateActive(false);
      }, 180);
      return () => window.clearTimeout(closeTimer);
    }
  }, [isClosing, isMobile, snapshot.phase, snapshot.status, startupGateActive]);

  const isOpen = !isMobile &&
    ((snapshot.status === "loading" && snapshot.phase !== "processing") ||
      snapshot.status === "error" ||
      (startupGateActive && snapshot.status === "success" && snapshot.phase === "ready"));

  const sourceHost = (() => {
    if (!snapshot.source) return "-";
    try {
      return new URL(snapshot.source).host;
    } catch {
      return snapshot.source;
    }
  })();

  const retry = () => {
    void ffmpeg.load().catch(() => undefined);
  };

  return (
    <Modal isOpen={isOpen}>
      <Modal.Backdrop
        className={`ffmpeg-gate-backdrop${isClosing ? " is-closing" : ""}`}
        isDismissable={false}
        isKeyboardDismissDisabled
        variant="opaque"
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className={`ffmpeg-gate sm:max-w-[620px]${isClosing ? " is-closing" : ""}`}>
            <Modal.Header className="ffmpeg-gate__header">
              <Modal.Icon
                className={`ffmpeg-gate__icon ${
                  snapshot.status === "error" ? "is-error" : snapshot.loaded ? "is-success" : ""
                }`}
              >
                {snapshot.status === "error" ? (
                  <WifiOff aria-hidden="true" size={22} />
                ) : snapshot.loaded ? (
                  <CheckCircle2 aria-hidden="true" size={22} />
                ) : (
                  <LoaderCircle aria-hidden="true" className="ffmpeg-gate__spinner" size={22} />
                )}
              </Modal.Icon>
              <div>
                <Modal.Heading className="ffmpeg-gate__heading">
                  {PHASE_LABELS[snapshot.phase]}
                </Modal.Heading>
                <p className="ffmpeg-gate__description">
                  {snapshot.status === "error"
                    ? "所有下载源均无法访问，请检查网络连接后重新尝试。"
                    : snapshot.loaded
                      ? "核心已就绪，窗口将在 3 秒后自动关闭。"
                      : "首次访问需要下载运行核心，请保持当前页面打开。"}
                </p>
              </div>
            </Modal.Header>

            <Modal.Body className="ffmpeg-gate__body">
              <div
                className="ffmpeg-progress"
                role="progressbar"
                aria-label="FFmpeg 下载和加载进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={snapshot.progress}
              >
                <div className="ffmpeg-progress__track">
                  <span style={{ width: `${snapshot.progress}%` }} />
                </div>
                <div className="ffmpeg-progress__meta">
                  <strong>{snapshot.progress}%</strong>
                  <span>{PHASE_LABELS[snapshot.phase]}</span>
                </div>
              </div>

              <dl
                className={`ffmpeg-load-details ${snapshot.attempt > 1 ? "has-retry-progress" : ""}`}
              >
                <div>
                  <dt>当前下载源</dt>
                  <dd title={snapshot.source ?? undefined}>{sourceHost}</dd>
                </div>
                {snapshot.attempt > 1 ? (
                  <div>
                    <dt>尝试进度</dt>
                    <dd>
                      {snapshot.attempt} / {snapshot.totalSources}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {snapshot.phase === "switching-source" ? (
                <p className="ffmpeg-gate__notice">下载失败，正在自动尝试列表中的下一个可用源。</p>
              ) : null}

              {snapshot.status === "error" ? (
                <div className="ffmpeg-gate__error" role="alert">
                  <strong>网络错误</strong>
                  <p>请确认设备已联网，并检查浏览器扩展、防火墙或代理是否阻止 CDN 请求。</p>
                  {snapshot.error ? <code>{snapshot.error}</code> : null}
                </div>
              ) : null}
            </Modal.Body>

            {snapshot.status === "error" ? (
              <Modal.Footer className="ffmpeg-gate__footer">
                <Button className="wiki-button wiki-button--primary" onPress={retry}>
                  <RefreshCw aria-hidden="true" size={17} />
                  重新尝试
                </Button>
              </Modal.Footer>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
