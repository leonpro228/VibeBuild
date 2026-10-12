import { useEffect, useRef } from "react";
import { VoxelScene } from "../lib/render/VoxelScene";
import type { Build } from "../lib/build/types";

export function Viewer3D({
  build,
  focusY = null,
}: {
  build: Build | null;
  focusY?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<VoxelScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const scene = new VoxelScene(canvas);
    sceneRef.current = scene;

    const ro = new ResizeObserver(() => {
      scene.resize(container.clientWidth, container.clientHeight);
    });
    ro.observe(container);
    scene.resize(container.clientWidth, container.clientHeight);

    return () => {
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (build) sceneRef.current?.setBuild(build, focusY);
  }, [build, focusY]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
