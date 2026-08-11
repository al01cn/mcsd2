# MCSD 2.0

Minecraft 音频包生成器。无需安装专业音频软件，直接在浏览器中导入声音、设置事件并导出可安装的 Minecraft 资源包。

2.0 完全重写了 UI 与制作流程，并针对手机端进行了专门适配。无论使用电脑还是手机，都可以用更少的步骤完成一个音频包。

## 2.0 新变化

- 全新项目首页与三步式工作台：导入音频、设置事件、打包导出
- 独立的手机端界面，适合触控操作和小屏浏览
- 工程自动保存在当前浏览器，可随时继续制作
- 支持导入已有的 `ZIP` / `MCPACK` 音频资源包继续编辑
- 支持音频包版本、正式版/测试版/预览版和历史版本快照
- 更清晰的音频状态、转换进度、事件配置与导出检查

## 主要功能

### 音频处理

- 支持导入 MP3、WAV、FLAC、M4A 和 OGG
- 支持音频试听、格式检测与异常文件提示
- 使用 FFmpeg WebAssembly 在浏览器内转换为 Minecraft 所需的 OGG Vorbis 格式
- 符合规格的 OGG 文件会自动跳过转换
- 音频素材仅在当前设备处理，不会上传到服务器

### 声音事件

- 为音频创建自定义声音事件
- 将音频绑定到 Minecraft 原版声音事件
- 支持中文搜索 Java 版声音事件
- 支持游戏内字幕和随机播放权重设置
- 桌面端提供基础模式与可视化高级模式
- 手机端提供精简的基础事件编辑流程

### 工程与导出

- 支持 Minecraft Java 版与基岩版资源包
- Java 版资源包版本可从 Minecraft Wiki 同步，并在失败时使用本地数据
- 自动生成 `sounds.json`、`pack.mcmeta`、`manifest.json` 等资源包文件
- 支持自定义资源包图标、名称、简介和版本
- 自动生成 `/playsound` 与 `/stopsound` 命令，可复制或导出为 TXT
- 工程、音频与历史版本使用 IndexedDB 保存在当前浏览器

> 清除浏览器站点数据会同时删除本地工程。重要工程请及时导出资源包。

## 使用流程

1. 创建新音频包，或导入已有的 `ZIP` / `MCPACK` 文件。
2. 添加音频；应用会检测格式，并在需要时完成转换。
3. 为音频设置自定义事件或绑定原版声音事件。
4. 检查工程摘要，生成并下载资源包与命令文件。

## 本地开发

项目使用 Bun，运行 Next.js 16 App Router。Node.js 最低版本为 20.9。

```bash
bun install
bun run dev
```

开发服务器默认运行在 [http://localhost:3000](http://localhost:3000)。首次进入时需要联网加载 FFmpeg WebAssembly 核心。

## 技术栈

- Next.js 16、React 19、TypeScript
- HeroUI 3、Tailwind CSS 4、Motion
- Lucide React、Phosphor Icons
- FFmpeg WebAssembly、JSZip、IndexedDB
- XYFlow、pinyin-pro

## 项目结构

```text
app/
  ui/                       主要界面与交互组件
  globals.css               全局样式与响应式布局
lib/
  audio-pack.ts             Java / 基岩版资源包生成
  ffmpeg.ts                 音频检测、转码与 FFmpeg 加载
  project-workspace-db.ts   工程和历史版本本地存储
  sounds.ts                 Minecraft 原版声音事件数据
  update_logs.ts            应用内版本更新日志
```

界面以 `768px` 为断点：手机显示移动端工作台，平板与电脑显示桌面工作台。两套界面共享同一份工程数据与资源包生成逻辑。

## 质量检查

```bash
bunx tsc --noEmit
bun run lint
bun run build
```

## 相关链接

- [GitHub 仓库](https://github.com/al01cn/mcsd2)
- [Gitee 镜像](https://gitee.com/al01/mcsd)

MCSD 是社区工具，与 Mojang Studios 或 Microsoft 无隶属关系。Minecraft 是 Microsoft 的商标。
