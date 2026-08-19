import { ImageResponse } from "next/og";

export const alt = "MCSD2 Minecraft 音频包生成器";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f8f9fa",
          background: "#202522",
          borderTop: "18px solid #3c992c",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", width: 1000, alignItems: "center", gap: 64 }}>
          <div
            style={{
              display: "flex",
              width: 210,
              height: 210,
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              background: "#3c992c",
              border: "8px solid #236b20",
              boxShadow: "inset 10px 10px rgba(255,255,255,.18), inset -12px -12px rgba(0,0,0,.22)",
            }}
          >
            {[64, 112, 156, 112, 64].map((height, index) => (
              <span key={index} style={{ width: 14, height, background: "#ffffff" }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#83d16f", fontSize: 24, fontWeight: 800 }}>
              MINECRAFT AUDIO PACK GENERATOR
            </span>
            <span style={{ marginTop: 14, fontSize: 96, fontWeight: 900, lineHeight: 1 }}>MCSD2</span>
            <span style={{ marginTop: 24, color: "#dce2da", fontSize: 38, fontWeight: 700 }}>
              更简单地制作 Minecraft 音频资源包
            </span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
