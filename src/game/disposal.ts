import type {
  BufferGeometry,
  Material,
  Object3D,
  Texture,
  WebGLRenderTarget,
} from 'three';
import { Mesh, Points, Line, Sprite } from 'three';

/**
 * Undisposed three.js resources leak silently and crash mobile after several
 * runs (CLAUDE.md § Gotchas). The reincarnation loop makes this worse, because
 * the player cycles scenes forever.
 *
 * So every scene builds through a tracker and is torn down by one `disposeAll`
 * call. The tracker also counts what it released, which the gate asserts
 * against: a scene that unloads without freeing what it allocated fails.
 */

export interface Disposable {
  dispose(): void;
}

export interface DisposalCounts {
  geometries: number;
  materials: number;
  textures: number;
  renderTargets: number;
  other: number;
}

export class ResourceTracker {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly textures = new Set<Texture>();
  private readonly renderTargets = new Set<WebGLRenderTarget>();
  private readonly other = new Set<Disposable>();
  private readonly detach: (() => void)[] = [];
  private released: DisposalCounts | undefined;

  track<T extends BufferGeometry>(resource: T): T;
  track<T extends Material>(resource: T): T;
  track<T extends Texture>(resource: T): T;
  track<T extends WebGLRenderTarget>(resource: T): T;
  track<T extends Disposable>(resource: T): T;
  track(resource: Disposable): Disposable {
    if (isGeometry(resource)) {
      this.geometries.add(resource);
    } else if (isMaterial(resource)) {
      this.materials.add(resource);
    } else if (isTexture(resource)) {
      this.textures.add(resource);
    } else if (isRenderTarget(resource)) {
      this.renderTargets.add(resource);
    } else {
      this.other.add(resource);
    }
    return resource;
  }

  /** Track everything hanging off an object graph, including nested children. */
  trackTree(root: Object3D): Object3D {
    root.traverse((node) => {
      if (node instanceof Mesh || node instanceof Points || node instanceof Line || node instanceof Sprite) {
        this.track(node.geometry);
        for (const material of toMaterialList(node.material as Material | Material[])) {
          this.track(material);
          for (const texture of texturesOf(material)) {
            this.track(texture);
          }
        }
      }
    });
    return root;
  }

  /** Register a teardown callback — event listeners, timers, observers. */
  onDispose(teardown: () => void): void {
    this.detach.push(teardown);
  }

  /** Release everything. Safe to call twice; the second call is a no-op. */
  disposeAll(): DisposalCounts {
    if (this.released) {
      return this.released;
    }

    const counts: DisposalCounts = {
      geometries: this.geometries.size,
      materials: this.materials.size,
      textures: this.textures.size,
      renderTargets: this.renderTargets.size,
      other: this.other.size,
    };

    for (const teardown of this.detach.splice(0)) {
      teardown();
    }
    for (const set of [this.geometries, this.materials, this.textures, this.renderTargets, this.other]) {
      for (const resource of set) {
        resource.dispose();
      }
      set.clear();
    }

    this.released = counts;
    return counts;
  }

  /** What is still held. The gate reads this before and after a scene unload. */
  get live(): DisposalCounts {
    return {
      geometries: this.geometries.size,
      materials: this.materials.size,
      textures: this.textures.size,
      renderTargets: this.renderTargets.size,
      other: this.other.size,
    };
  }
}

function isGeometry(resource: Disposable): resource is BufferGeometry {
  return 'isBufferGeometry' in resource && resource.isBufferGeometry === true;
}

function isMaterial(resource: Disposable): resource is Material {
  return 'isMaterial' in resource && resource.isMaterial === true;
}

function isTexture(resource: Disposable): resource is Texture {
  return 'isTexture' in resource && resource.isTexture === true;
}

function isRenderTarget(resource: Disposable): resource is WebGLRenderTarget {
  return 'isRenderTarget' in resource && resource.isRenderTarget === true;
}

function toMaterialList(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function texturesOf(material: Material): Texture[] {
  const found: Texture[] = [];
  // three.js materials carry texture slots whose names differ per material
  // type, so the only way to sweep them generically is an indexed read of the
  // material's own properties.
  const slots = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(slots)) {
    const value = slots[key];
    if (value !== null && typeof value === 'object' && 'isTexture' in value) {
      found.push(value as Texture);
    }
  }
  return found;
}
