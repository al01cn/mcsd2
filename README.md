# MCSD v2

在浏览器内制作 Minecraft 音效资源包的 Next.js 应用。

## 技术栈

- Bun
- Next.js 16 / React 19
- HeroUI 3.2.2 / Tailwind CSS 4
- Motion（Framer Motion）
- Lucide React / Phosphor Icons
- FFmpeg WASM

## 本地开发

```bash
bun install
bun run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

## 布局约定

界面在 `768px` 处切换：

- `app/ui/desktop-workspace.tsx`：PC 与平板布局
- `app/ui/mobile-workspace.tsx`：移动端布局
- `app/ui/responsive-workspace.tsx`：只负责选择显示哪套布局

两套布局分别维护，不依赖 JavaScript 用户代理判断；平板始终使用 PC 布局。

## 校验

```bash
bunx tsc --noEmit
bun run lint
bun run build
```
