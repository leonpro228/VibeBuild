import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import atlasUrl from "../../assets/atlas.png";
import { buildGeometry } from "./voxelGeometry";
import type { Build } from "../build/types";

export class VoxelScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group: THREE.Group;
  /** Persistent atlas texture — reused across builds (never re-fetched). */
  private atlasTexture: THREE.Texture;
  private animationId = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
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
    this.atlasTexture.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}