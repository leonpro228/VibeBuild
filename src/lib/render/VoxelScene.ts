import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import atlasUrl from "../../assets/atlas.png";
import { buildGeometry } from "./voxelGeometry";
import type { Build } from "../build/types";

// Daytime sky — a deliberate exception to the monochrome UI chrome (summary §2):
// the 3D viewport depicts the "world", and a black void reads as creepy.
const SKY_COLOR = 0x78a7ff;

// Flat procedural clouds on a coarse grid: chunky rectangles that drift along
// +x and wrap seamlessly (the pattern is periodic, two copies cover the loop).
const CLOUD_Y = 96;
const CLOUD_CELL = 8; // units per pattern cell
const CLOUD_GRID = 44; // cells per side → 352-unit field
const CLOUD_SPEED = 1.1; // units per second
const CLOUD_FIELD = CLOUD_GRID * CLOUD_CELL;

/** Small deterministic PRNG so the cloud pattern is stable between launches. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildClouds(): THREE.Group {
  const rand = mulberry32(20250917);
  const n = CLOUD_GRID;

  // Random overlapping rectangles on a wrapping grid — merged quads form
  // Minecraft-style chunky clumps without any texture.
  const occupancy = new Uint8Array(n * n);
  for (let k = 0; k < 26; k++) {
    const w = 3 + Math.floor(rand() * 8);
    const h = 2 + Math.floor(rand() * 6);
    const x0 = Math.floor(rand() * n);
    const y0 = Math.floor(rand() * n);
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        occupancy[((x0 + dx) % n) * n + ((y0 + dy) % n)] = 1;
      }
    }
  }

  const verts: number[] = [];
  const half = CLOUD_FIELD / 2;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      if (!occupancy[x * n + y]) continue;
      const x0 = x * CLOUD_CELL - half;
      const z0 = y * CLOUD_CELL - half;
      const x1 = x0 + CLOUD_CELL;
      const z1 = z0 + CLOUD_CELL;
      verts.push(x0, CLOUD_Y, z0, x1, CLOUD_Y, z0, x1, CLOUD_Y, z1);
      verts.push(x0, CLOUD_Y, z0, x1, CLOUD_Y, z1, x0, CLOUD_Y, z1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const group = new THREE.Group();
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  b.position.x = CLOUD_FIELD;
  group.add(a, b);
  return group;
}

export class VoxelScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group: THREE.Group;
  /** Persistent atlas texture — reused across builds (never re-fetched). */
  private atlasTexture: THREE.Texture;
  private clouds: THREE.Group;
  private startedAt = performance.now();
  private animationId = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOR);
    // Gentle depth cue toward the horizon; builds (~50 units away) stay clear.
    this.scene.fog = new THREE.Fog(SKY_COLOR, 90, 260);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.position.set(12, 10, 14);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(8, 14, 6);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-6, 8, -10);
    this.scene.add(fill);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.clouds = buildClouds();
    this.scene.add(this.clouds);

    this.atlasTexture = new THREE.TextureLoader().load(atlasUrl);
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.generateMipmaps = false;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    const loop = () => {
      if (this.disposed) return;
      this.animationId = requestAnimationFrame(loop);
      const elapsed = (performance.now() - this.startedAt) / 1000;
      this.clouds.position.x = -((elapsed * CLOUD_SPEED) % CLOUD_FIELD);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /**
   * Shows the build. With `focusY` (instruction mode): the focused layer is
   * fully lit, layers below it render as ghosts, layers above are hidden —
   * mimicking the real construction order.
   */
  setBuild(build: Build, focusY: number | null = null): void {
    this.clearGroup();

    const material = (ghost: boolean, alpha: boolean) =>
      new THREE.MeshLambertMaterial({
        map: this.atlasTexture,
        ...(ghost
          ? { transparent: true, opacity: 0.15, depthWrite: false }
          : alpha
            ? { transparent: true, alphaTest: 0.4 }
            : {}),
        ...(ghost && alpha ? { alphaTest: 0.4 } : {}),
      });
    const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      this.group.add(new THREE.Mesh(geo, mat));
    };

    if (focusY === null) {
      addMesh(buildGeometry(build, false), material(false, false));
      addMesh(buildGeometry(build, true), material(false, true));
    } else {
      // Layers above the focus are hidden — faces opening into them are exposed,
      // otherwise the focused layer looks "eaten" where hidden walls sit above.
      const exposedAbove = focusY + 1;
      addMesh(
        buildGeometry(build, false, { y: (y) => y < focusY, exposedAbove }),
        material(true, false),
      );
      addMesh(
        buildGeometry(build, true, { y: (y) => y < focusY, exposedAbove }),
        material(true, true),
      );
      addMesh(
        buildGeometry(build, false, { y: (y) => y === focusY, exposedAbove }),
        material(false, false),
      );
      addMesh(
        buildGeometry(build, true, { y: (y) => y === focusY, exposedAbove }),
        material(false, true),
      );
    }

    const { width: w, height: h, depth: d } = build.size;
    this.group.position.set(-w / 2, 0, -d / 2);

    // Frame the camera on the whole build (focus does not re-frame).
    const maxDim = Math.max(w, h, d);
    this.controls.target.set(0, h / 2, 0);
    const dir = new THREE.Vector3(1, 0.75, 1.2).normalize();
    this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(maxDim * 2.1));
    this.camera.updateProjectionMatrix();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private clearGroup(): void {
    this.group.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      mat?.dispose();
    });
    this.group.clear();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.clearGroup();
    this.clouds.children.forEach((child) => {
      (child as THREE.Mesh).geometry?.dispose();
      ((child as THREE.Mesh).material as THREE.Material | undefined)?.dispose();
    });
    this.atlasTexture.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}