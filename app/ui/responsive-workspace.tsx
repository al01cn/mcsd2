import { DesktopWorkspace } from "@/app/ui/desktop-workspace";
import { FFmpegLoadingGate } from "@/app/ui/ffmpeg-loading-gate";
import { MobileLoadingOverlay } from "@/app/ui/mobile-loading-overlay";

export function ResponsiveWorkspace() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <FFmpegLoadingGate />
      <MobileLoadingOverlay />
      <DesktopWorkspace />
    </main>
  );
}
