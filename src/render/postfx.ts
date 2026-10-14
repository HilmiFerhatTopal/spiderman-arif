import {
  Color,
  DepthTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  NoBlending,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Composite: comic outlines from depth (Laplacian of inverse depth, zero on
 * planes) and view-space normals (creases), distance-faded to avoid shimmer;
 * radial speed lines; saturation, vignette, fade; linear -> sRGB.
 */
const COMPOSITE_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform vec3 uOutline;
uniform float uOutlineStrength;
uniform float uThick;
uniform float uSpeed;
uniform float uTime;
uniform float uAspect;
uniform float uFade;
uniform float uSaturation;
uniform float uVignette;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;

float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float vz = perspectiveDepthToViewZ(d, uNear, uFar);
  return 1.0 / max(-vz, 1e-3);
}
vec4 nrm(vec2 uv) {
  vec4 n = texture2D(tNormal, uv);
  return vec4(n.xyz * 2.0 - 1.0, n.a);
}
vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  vec2 o = uTexel * uThick;
  float w0 = invZ(vUv);
  float wl = invZ(vUv - vec2(o.x, 0.0));
  float wr = invZ(vUv + vec2(o.x, 0.0));
  float wd = invZ(vUv - vec2(0.0, o.y));
  float wu = invZ(vUv + vec2(0.0, o.y));
  float lap = (abs(wl + wr - 2.0 * w0) + abs(wd + wu - 2.0 * w0)) / max(w0, 1e-6);
  float eD = smoothstep(0.035, 0.11, lap);
  vec4 n0 = nrm(vUv);
  vec4 nl = nrm(vUv - vec2(o.x, 0.0));
  vec4 nr = nrm(vUv + vec2(o.x, 0.0));
  vec4 nd = nrm(vUv - vec2(0.0, o.y));
  vec4 nu = nrm(vUv + vec2(0.0, o.y));
  float dn = 0.0;
  if (n0.a > 0.5) {
    if (nl.a > 0.5) dn = max(dn, 1.0 - dot(n0.xyz, nl.xyz));
    if (nr.a > 0.5) dn = max(dn, 1.0 - dot(n0.xyz, nr.xyz));
    if (nd.a > 0.5) dn = max(dn, 1.0 - dot(n0.xyz, nd.xyz));
    if (nu.a > 0.5) dn = max(dn, 1.0 - dot(n0.xyz, nu.xyz));
  }
  float z0 = 1.0 / w0;
  float eN = smoothstep(0.28, 0.5, dn) * (1.0 - smoothstep(240.0, 760.0, z0));
  float e = max(eD, eN);
  e *= mix(1.0, 0.3, smoothstep(320.0, 1900.0, z0));
  // Lines fade with the scene fog so fogged silhouettes never look like wireframes.
  e *= 1.0 - smoothstep(uFogNear, uFogFar, z0) * 0.92;
  vec3 col = mix(c, uOutline, clamp(e, 0.0, 1.0) * uOutlineStrength);

  // Comic speed lines at the screen periphery.
  if (uSpeed > 0.001) {
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(q);
    float a = atan(q.y, q.x) / 6.2831853 + 0.5;
    float sectors = 120.0;
    float sector = floor(a * sectors);
    float h = fract(sin(sector * 12.9898) * 43758.5453);
    float h2 = fract(sin(sector * 78.233) * 12345.678);
    float start = 0.38 + 0.2 * h;
    float flow = fract(h2 + uTime * (0.8 + 1.4 * h));
    float local = fract(a * sectors);
    float thin = 1.0 - smoothstep(0.08, 0.3, abs(local - 0.5));
    float streak = smoothstep(start, start + 0.06, r) * step(0.5, h) * smoothstep(0.15, 0.35, flow) * (1.0 - smoothstep(0.75, 1.0, flow));
    col = mix(col, vec3(1.0), streak * thin * uSpeed * 0.42);
  }

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  vec2 vq = vUv - 0.5;
  col *= 1.0 - uVignette * dot(vq, vq) * 1.6;
  col *= 1.0 - uFade;
  gl_FragColor = vec4(toSRGB(col), 1.0);
}`;

export interface PostSettings {
  renderScale: number;
  dynamicResolution: boolean;
  fxaa: boolean;
  /** Upper bound for dynamic resolution scale (quality preset). */
  maxDynScale: number;
}

/**
 * Post pipeline: MRT scene pass (colour + normal + depth) -> composite
 * (outlines, speed lines, grading) -> FXAA -> screen. Internal resolution =
 * canvas size x renderScale x dynamic scale.
 */
export class PostFX {
  private sceneRT: WebGLRenderTarget;
  private compRT: WebGLRenderTarget;
  private readonly composite: ShaderMaterial;
  private readonly fxaa: ShaderMaterial;
  private readonly quadComp: FullScreenQuad;
  private readonly quadFxaa: FullScreenQuad;
  private width = 1;
  private height = 1;
  settings: PostSettings = { renderScale: 1, dynamicResolution: true, fxaa: true, maxDynScale: 1 };
  dynScale = 1;
  private frameAvg = 16.7;
  private cooldown = 0;
  speedLines = 0;
  fade = 0;
  readonly outlineColor = new Color(0x141820);

  constructor(private readonly renderer: WebGLRenderer) {
    const depth = new DepthTexture(1, 1, FloatType);
    this.sceneRT = new WebGLRenderTarget(1, 1, {
      count: 2,
      type: HalfFloatType,
      depthBuffer: true,
      depthTexture: depth,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    this.compRT = new WebGLRenderTarget(1, 1, { type: UnsignedByteType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
    this.composite = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tColor: { value: this.sceneRT.textures[0] },
        tNormal: { value: this.sceneRT.textures[1] },
        tDepth: { value: depth },
        uTexel: { value: new Vector2(1, 1) },
        uNear: { value: 0.25 },
        uFar: { value: 3200 },
        uOutline: { value: this.outlineColor },
        uOutlineStrength: { value: 0.92 },
        uThick: { value: 1 },
        uSpeed: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uFade: { value: 0 },
        uSaturation: { value: 1.12 },
        uVignette: { value: 0.35 },
        uFogNear: { value: 300 },
        uFogFar: { value: 2000 },
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.fxaa = new ShaderMaterial({
      name: 'FXAA',
      uniforms: { tDiffuse: { value: this.compRT.texture }, resolution: { value: new Vector2(1, 1) } },
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.quadComp = new FullScreenQuad(this.composite);
    this.quadFxaa = new FullScreenQuad(this.fxaa);
  }

  /** Canvas size in device pixels. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.applySize();
  }

  get internalWidth(): number {
    return this.sceneRT.width;
  }
  get internalHeight(): number {
    return this.sceneRT.height;
  }

  private applySize(): void {
    const s = Math.max(0.35, Math.min(2, this.settings.renderScale * this.dynScale));
    const w = Math.max(16, Math.round(this.width * s));
    const h = Math.max(16, Math.round(this.height * s));
    if (w !== this.sceneRT.width || h !== this.sceneRT.height) {
      this.sceneRT.setSize(w, h);
      this.compRT.setSize(w, h);
    }
    this.composite.uniforms.uTexel!.value.set(1 / w, 1 / h);
    this.composite.uniforms.uThick!.value = Math.max(1, Math.round(h / 1080));
    this.composite.uniforms.uAspect!.value = w / h;
    this.fxaa.uniforms.resolution!.value.set(1 / w, 1 / h);
  }

  /** Feed the last frame time (ms); adjusts the dynamic resolution scale. */
  updateDynamic(frameMs: number, targetMs = 16.7): void {
    if (!this.settings.dynamicResolution) {
      if (this.dynScale !== 1) {
        this.dynScale = 1;
        this.applySize();
      }
      return;
    }
    this.frameAvg += (Math.min(frameMs, 100) - this.frameAvg) * 0.05;
    this.cooldown -= frameMs;
    if (this.cooldown > 0) return;
    let next = this.dynScale;
    if (this.frameAvg > targetMs * 1.12) next = Math.max(0.5, this.dynScale - 0.06);
    else if (this.frameAvg < targetMs * 0.8) next = Math.min(this.settings.maxDynScale, this.dynScale + 0.04);
    if (next !== this.dynScale) {
      this.dynScale = next;
      this.applySize();
      this.cooldown = 600;
    }
  }

  render(scene: Scene, camera: Camera, time: number): void {
    const r = this.renderer;
    const cam = camera as PerspectiveCamera;
    this.composite.uniforms.uNear!.value = cam.near;
    this.composite.uniforms.uFar!.value = cam.far;
    this.composite.uniforms.uTime!.value = time;
    this.composite.uniforms.uSpeed!.value = this.speedLines;
    this.composite.uniforms.uFade!.value = this.fade;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    if (this.settings.fxaa) {
      r.setRenderTarget(this.compRT);
      this.quadComp.render(r);
      r.setRenderTarget(null);
      this.quadFxaa.render(r);
    } else {
      r.setRenderTarget(null);
      this.quadComp.render(r);
    }
  }

  setFog(near: number, far: number): void {
    this.composite.uniforms.uFogNear!.value = near;
    this.composite.uniforms.uFogFar!.value = far;
  }

  setOutline(color: Color, strength: number): void {
    this.outlineColor.copy(color);
    this.composite.uniforms.uOutlineStrength!.value = strength;
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.compRT.dispose();
    this.composite.dispose();
    this.fxaa.dispose();
    this.quadComp.dispose();
    this.quadFxaa.dispose();
  }
}
