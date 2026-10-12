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
  private buildTexture: THREE.Texture | null = null;
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

  setBuild(build: Build): void {
    this.clearGroup();

    const opaqueGeo = buildGeometry(build, false);
    const transparentGeo = buildGeometry(build, true);
    const texture = new THREE.TextureLoader().load(atlasUrl);
    this.buildTexture = texture;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;

    const opaqueMat = new THREE.MeshLambertMaterial({ map: texture });
    const transparentMat = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.4,
    });

    const { width: w, height: h, depth: d } = build.size;
    this.group.position.set(-w / 2, 0, -d / 2);
    this.group.add(new THREE.Mesh(opaqueGeo, opaqueMat));
    this.group.add(new THREE.Mesh(transparentGeo, transparentMat));

    // Frame the camera on the build.
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
    this.buildTexture?.dispose();
    this.buildTexture = null;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.clearGroup();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
