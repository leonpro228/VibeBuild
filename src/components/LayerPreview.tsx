import { useEffect, useRef, useState, type MouseEvent } from "react";
import atlasUrl from "../assets/atlas.png";
import { ATLAS, INFO_BY_ID, faceTile } from "../lib/palette/palette";

/** Module-level atlas image cache (shared by all previews). */
let atlasImage: HTMLImageElement | null = null;
let atlasPromise: Promise<HTMLImageElement> | null = null;

function loadAtlas(): Promise<HTMLImageElement> {
  if (atlasImage) return Promise.resolve(atlasImage);
  atlasPromise ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      atlasImage = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error("не удалось загрузить атлас"));
    img.src = atlasUrl;
  });
  return atlasPromise;
}

/**
 * 2D layer preview drawn from real atlas tiles (crisp pixels, no smoothing).
 * rows[z][x]: row 0 (north) at the top, matching the build orientation.
 */
export function LayerPreview({
  grid,
  maxSize = 200,
  minCell = 2,
  hint = false,
}: {
  grid: string[][];
  maxSize?: number;
  minCell?: number;
  hint?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const width = Math.max(...grid.map((r) => r.length), 1);
  const depth = grid.length;
  const span = Math.max(width, depth, 1);
  const cell = Math.max(minCell, Math.floor(maxSize / span));

  useEffect(() => {
    let cancelled = false;
    loadAtlas()
      .then((img) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const pxW = width * cell;
        const pxH = depth * cell;
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#151515"; // air
        ctx.fillRect(0, 0, pxW, pxH);
        grid.forEach((row, z) => {
          row.forEach((id, x) => {
            if (!id) return;
            const info = INFO_BY_ID.get(id);
            if (!info) {
              ctx.fillStyle = "#3f3f46"; // unknown block id
              ctx.fillRect(x * cell, z * cell, cell, cell);
              return;
            }
            const tile = faceTile(info, "south");
            const sx = (tile % ATLAS.cols) * ATLAS.tileSize;
            const sy = Math.floor(tile / ATLAS.cols) * ATLAS.tileSize;
            ctx.drawImage(
              img,
              sx,
              sy,
              ATLAS.tileSize,
              ATLAS.tileSize,
              x * cell,
              z * cell,
              cell,
              cell,
            );
          });
        });
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x++) {
          ctx.beginPath();
          ctx.moveTo(x * cell + 0.5, 0);
          ctx.lineTo(x * cell + 0.5, pxH);
          ctx.stroke();
        }
        for (let z = 0; z <= depth; z++) {
          ctx.beginPath();
          ctx.moveTo(0, z * cell + 0.5);
          ctx.lineTo(pxW, z * cell + 0.5);
          ctx.stroke();
        }
      })
      .catch(() => {
        /* atlas not ready — leave the dark canvas */
      });
    return () => {
      cancelled = true;
    };
  }, [grid, cell, width, depth]);

  function onMove(e: MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
    const z = Math.floor(((e.clientY - rect.top) / rect.height) * depth);
    setHovered(grid[z]?.[x] || null);
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <canvas
        ref={canvasRef}
        style={{ imageRendering: "pixelated" }}
        className="max-w-full rounded border border-white/10"
        onMouseMove={onMove}
        onMouseLeave={() => setHovered(null)}
      />
      <div className="h-4 text-[10px] leading-4 text-neutral-500">
        {hovered ?? (hint ? "север — сверху" : "")}
      </div>
    </div>
  );
}