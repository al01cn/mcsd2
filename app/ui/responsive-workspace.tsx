import { DesktopWorkspace } from "@/app/ui/desktop-workspace";
import { FFmpegLoadingGate } from "@/app/ui/ffmpeg-loading-gate";

export function ResponsiveWorkspace() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <FFmpegLoadingGate />
      <DesktopWorkspace />
    </main>
  );
}
