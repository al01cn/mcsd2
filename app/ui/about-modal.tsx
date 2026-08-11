"use client";

import { Button, Modal } from "@heroui/react";
import {
  Boxes,
  Braces,
  Cpu,
  Database,
  FileArchive,
  Info,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import updateLogs from "@/lib/update_logs";

type Language = "zh" | "en";

const COPY = {
  zh: {
    about: "关于",
    title: "关于 MCSD",
    eyebrow: "MINECRAFT AUDIO PACK GENERATOR",
    product: "Minecraft 音频包生成器",
    description:
      "MCSD 是一款在浏览器中运行的 Minecraft 声音资源包制作工具。它帮助你完成音频导入、格式检测与转换、声音事件映射、版本管理和资源包导出。",
    privacy: "音频和工程数据保留在当前设备，处理过程无需上传源文件。",
    technologies: "使用的技术",
    technologiesDescription: "从界面交互到音频转码，全部在浏览器端协同完成。",
    changelog: "版本更新日志",
    changelogDescription: "按发布时间从新到旧排列。",
    latest: "当前版本",
    tech: [
      ["Next.js 16 + React 19", "应用框架与交互界面", Braces],
      ["TypeScript + Tailwind CSS 4", "类型约束与响应式样式", Boxes],
      ["HeroUI 3 + Lucide", "可访问组件与界面图标", ShieldCheck],
      ["FFmpeg WebAssembly", "浏览器内音频检测与转码", Cpu],
      ["JSZip", "资源包文件组织与压缩导出", FileArchive],
      ["IndexedDB", "工程数据与历史版本本地存储", Database],
    ],
  },
  en: {
    about: "About",
    title: "About MCSD",
    eyebrow: "MINECRAFT AUDIO PACK GENERATOR",
    product: "Minecraft Audio Pack Generator",
    description:
      "MCSD is a browser-based workspace for building Minecraft sound resource packs. It covers audio import, validation and conversion, sound-event mapping, version management, and pack export.",
    privacy: "Audio and project data stay on this device. Source files are never uploaded for processing.",
    technologies: "Technology",
    technologiesDescription: "The interface, audio pipeline, and pack builder work together in the browser.",
    changelog: "Release notes",
    changelogDescription: "Listed from newest to oldest. Release-note details are maintained in Chinese.",
    latest: "Current",
    tech: [
      ["Next.js 16 + React 19", "Application framework and interaction", Braces],
      ["TypeScript + Tailwind CSS 4", "Type safety and responsive styling", Boxes],
      ["HeroUI 3 + Lucide", "Accessible components and interface icons", ShieldCheck],
      ["FFmpeg WebAssembly", "In-browser audio inspection and conversion", Cpu],
      ["JSZip", "Resource-pack assembly and archive export", FileArchive],
      ["IndexedDB", "Local projects and version history", Database],
    ],
  },
} satisfies Record<
  Language,
  {
    about: string;
    title: string;
    eyebrow: string;
    product: string;
    description: string;
    privacy: string;
    technologies: string;
    technologiesDescription: string;
    changelog: string;
    changelogDescription: string;
    latest: string;
    tech: readonly [string, string, LucideIcon][];
  }
>;

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

const RELEASES = Object.entries(updateLogs)
  .map(([version, release]) => {
    const [summary = "", ...changeLines] = release.logs.trim().split(/\n+/);
    return {
      version,
      date: release.date,
      summary,
      changes: changeLines
        .map((line) => line.replace(/^\s*-\s*/, "").trim())
        .filter(Boolean),
    };
  })
  .sort((left, right) => {
    const dateDifference = right.date.localeCompare(left.date);
    return dateDifference || compareVersions(right.version, left.version);
  });

function formatReleaseDate(date: string, language: Language) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: language === "zh" ? "2-digit" : "short",
    day: "2-digit",
  }).format(new Date(year, month - 1, day));
}

export function AboutModal({ language }: { language: Language }) {
  const c = COPY[language];
  const latestVersion = RELEASES[0]?.version ?? "0.1.0";

  return (
    <Modal>
      <Button
        className="global-tools__button global-tools__button--about"
        variant="ghost"
      >
        <Info aria-hidden="true" size={17} />
        {c.about}
      </Button>
      <Modal.Backdrop className="wiki-modal-backdrop" variant="opaque">
        <Modal.Container size="lg">
          <Modal.Dialog className="wiki-modal about-modal sm:max-w-[860px]">
            <Modal.CloseTrigger className="wiki-modal__close" />
            <Modal.Header className="wiki-modal__header">
              <Modal.Icon className="wiki-modal__icon">
                <Info aria-hidden="true" size={20} />
              </Modal.Icon>
              <div>
                <Modal.Heading className="wiki-modal__heading">{c.title}</Modal.Heading>
                <p className="wiki-modal__description">MCSD v{latestVersion}</p>
              </div>
            </Modal.Header>
            <Modal.Body className="wiki-modal__body about-modal__body">
              <section className="about-intro" aria-labelledby="about-product-title">
                <div className="about-intro__mark" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="about-intro__copy">
                  <p className="about-section__eyebrow">{c.eyebrow}</p>
                  <h2 id="about-product-title">{c.product}</h2>
                  <p>{c.description}</p>
                  <div className="about-intro__privacy">
                    <ShieldCheck aria-hidden="true" size={17} />
                    <span>{c.privacy}</span>
                  </div>
                </div>
                <span className="about-version-badge">
                  <small>{c.latest}</small>
                  v{latestVersion}
                </span>
              </section>

              <section className="about-section" aria-labelledby="about-tech-title">
                <div className="about-section__heading">
                  <div>
                    <p className="about-section__eyebrow">STACK / 06</p>
                    <h3 id="about-tech-title">{c.technologies}</h3>
                  </div>
                  <p>{c.technologiesDescription}</p>
                </div>
                <div className="about-tech-grid">
                  {c.tech.map(([name, description, Icon]) => (
                    <div className="about-tech" key={name}>
                      <span className="about-tech__icon">
                        <Icon aria-hidden="true" size={18} />
                      </span>
                      <div>
                        <strong>{name}</strong>
                        <p>{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="about-section" aria-labelledby="about-changelog-title">
                <div className="about-section__heading">
                  <div>
                    <p className="about-section__eyebrow">
                      CHANGELOG / {RELEASES.length.toString().padStart(2, "0")}
                    </p>
                    <h3 id="about-changelog-title">{c.changelog}</h3>
                  </div>
                  <p>{c.changelogDescription}</p>
                </div>
                <div
                  aria-labelledby="about-changelog-title"
                  className="release-timeline-scroll"
                  role="region"
                  tabIndex={0}
                >
                  <ol className="release-timeline">
                    {RELEASES.map((release, index) => (
                      <li className="release-timeline__item" key={release.version}>
                        <time dateTime={release.date}>
                          {formatReleaseDate(release.date, language)}
                        </time>
                        <span className="release-timeline__rail" aria-hidden="true">
                          <span className="release-timeline__node" />
                        </span>
                        <article className="release-note">
                          <div className="release-note__heading">
                            <h4>v{release.version}</h4>
                            {index === 0 ? <span>{c.latest}</span> : null}
                          </div>
                          <p className="release-note__summary">{release.summary}</p>
                          {release.changes.length > 0 ? (
                            <ul>
                              {release.changes.map((change) => (
                                <li key={change}>{change}</li>
                              ))}
                            </ul>
                          ) : null}
                        </article>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
