export const AUDIO_PACK_ICON_SIZE = 256;

export type SquareCrop = {
  x: number;
  y: number;
  size: number;
};

export function calculateCenteredSquareCrop(width: number, height: number): SquareCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("The pack icon has invalid dimensions.");
  }

  const size = Math.min(width, height);
  return {
    x: (width - size) / 2,
    y: (height - size) / 2,
    size,
  };
}

function renderNormalizedIcon(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
) {
  const crop = calculateCenteredSquareCrop(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = AUDIO_PACK_ICON_SIZE;
  canvas.height = AUDIO_PACK_ICON_SIZE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to prepare the pack icon canvas.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    AUDIO_PACK_ICON_SIZE,
    AUDIO_PACK_ICON_SIZE,
  );

  return canvas.toDataURL("image/png");
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Unable to decode the pack icon.")), {
        once: true,
      });
      image.src = objectUrl;
    });
    return renderNormalizedIcon(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function normalizeAudioPackIcon(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("The selected file is not an image.");
  }

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        return renderNormalizedIcon(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      // Some browsers expose createImageBitmap but cannot decode every supported image type.
    }
  }

  return loadImageElement(file);
}
