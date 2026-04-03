<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const props = defineProps<{
  landId: string
  videoId?: string
}>()

const wrapEl    = ref<HTMLDivElement | null>(null)
const canvasEl  = ref<HTMLCanvasElement | null>(null)
const videoLayer = ref<HTMLDivElement | null>(null)

let renderer:   THREE.WebGLRenderer
let scene:      THREE.Scene
let camera:     THREE.PerspectiveCamera
let playerMesh: THREE.Mesh
let animId:     number
let resizeObs:  ResizeObserver

let videoIframe:   HTMLIFrameElement | null = null
let videoWorldPos: THREE.Vector3 | null = null
let frameGroup: THREE.Group | null = null

const keys = new Set<string>()

const MOVE_SPEED = 0.13
const ROT_SPEED  = 0.045
const CAM_DIST   = 9
const CAM_HEIGHT = 5.5
const IFRAME_W   = 640
const IFRAME_H   = 360
const FW         = 8       // world units wide
const FH         = 4.5     // world units tall
const VID_AHEAD  = 6
const VID_Y      = 3.0
const FT         = 0.15

const _camTarget  = new THREE.Vector3()
const _camDesired = new THREE.Vector3()
const _proj       = new THREE.Vector3()

// ── Utils ─────────────────────────────────────────────────────────────────────

function hueFrom(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff
  return (h % 360) / 360
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function buildScene(landId: string) {
  scene.clear()
  frameGroup = null
  videoWorldPos = null
  videoIframe = null
  keys.clear()

  const hue    = hueFrom(landId)
  const fogCol = new THREE.Color().setHSL(hue, 0.15, 0.04)
  const accent = new THREE.Color().setHSL(hue, 0.85, 0.55)

  renderer.setClearColor(fogCol)
  if (wrapEl.value) wrapEl.value.style.background = fogCol.getStyle()
  scene.fog = new THREE.Fog(fogCol, 18, 55)

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const sun = new THREE.DirectionalLight(accent, 1.6)
  sun.position.set(8, 14, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.far = 80
  scene.add(sun)

  scene.add(new THREE.GridHelper(300, 300,
    new THREE.Color().setHSL(hue, 0.3, 0.18),
    new THREE.Color().setHSL(hue, 0.15, 0.1),
  ))

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.2, 0.05), roughness: 1 }),
  )
  ground.position.y = -0.001
  ground.receiveShadow = true
  scene.add(ground)

  const pcol = new THREE.Color().setHSL(hue, 0.9, 0.62)
  playerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: pcol, emissive: pcol, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.4 }),
  )
  playerMesh.position.set(0, 0.5, 0)
  playerMesh.castShadow = true
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }),
  )
  nose.position.z = -0.53
  playerMesh.add(nose)
  scene.add(playerMesh)

  const vcol = new THREE.Color().setHSL((hue + 0.5) % 1, 0.6, 0.38)
  const vmat = new THREE.MeshStandardMaterial({ color: vcol, roughness: 0.75 })
  for (let i = 0; i < 40; i++) {
    const w = 0.8 + Math.random() * 1.2
    const h = 1 + Math.random() * 3.5
    const v = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), vmat)
    const a = Math.random() * Math.PI * 2
    const d = 10 + Math.random() * 40
    v.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d)
    v.castShadow = true
    scene.add(v)
  }

  camera.position.set(0, CAM_HEIGHT, CAM_DIST)
  camera.lookAt(0, 0.5, 0)
}

// ── Video ─────────────────────────────────────────────────────────────────────
// Screen-space overlay: the iframe is a regular DOM element positioned each frame
// by projecting the 3D world position with Vector3.project(camera).
// This is 100% reliable — no CSS3D coordinate mismatch, no alpha transparency tricks.

function placeVideo(videoId: string) {
  removeVideo()

  const ry = playerMesh.rotation.y
  const vx = playerMesh.position.x - Math.sin(ry) * VID_AHEAD
  const vz = playerMesh.position.z - Math.cos(ry) * VID_AHEAD

  videoWorldPos = new THREE.Vector3(vx, VID_Y, vz)

  // ── DOM iframe ───────────────────────────────────────────────────────────
  videoIframe = document.createElement('iframe')
  videoIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
  videoIframe.width  = String(IFRAME_W)
  videoIframe.height = String(IFRAME_H)
  videoIframe.style.border        = 'none'
  videoIframe.style.borderRadius  = '4px'
  videoIframe.style.position      = 'absolute'
  videoIframe.style.top           = '0'
  videoIframe.style.left          = '0'
  videoIframe.style.transformOrigin = '50% 50%'
  videoIframe.style.pointerEvents = 'auto'
  videoIframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture')
  videoLayer.value!.appendChild(videoIframe)

  // ── WebGL frame (4 border rails, no centre panel) ─────────────────────
  const fmat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.9 })
  frameGroup = new THREE.Group()
  frameGroup.position.set(vx, VID_Y, vz)
  frameGroup.rotation.y = ry

  const rail = (w: number, h: number, ox: number, oy: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), fmat)
    m.position.set(ox, oy, 0)
    frameGroup!.add(m)
  }
  rail(FW + FT * 2, FT, 0,                FH / 2 + FT / 2)
  rail(FW + FT * 2, FT, 0,               -FH / 2 - FT / 2)
  rail(FT,          FH, -FW / 2 - FT / 2, 0)
  rail(FT,          FH,  FW / 2 + FT / 2, 0)

  const poleH = VID_Y - FH / 2
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, poleH),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.9 }),
  )
  pole.position.y = -(FH / 2 + poleH / 2)
  frameGroup.add(pole)

  scene.add(frameGroup)
}

function removeVideo() {
  if (videoIframe) { videoIframe.remove(); videoIframe = null }
  if (frameGroup)  { scene.remove(frameGroup); frameGroup = null }
  videoWorldPos = null
}

// Project video world position → screen-space, then move + scale the iframe to match.
// Formula: screen pixels = world_size × (focal_px / depth)
//   focal_px = canvasH / (2 × tan(fov/2))
function updateVideoOverlay() {
  if (!videoWorldPos || !videoIframe) return

  const canvas = canvasEl.value!
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight

  _proj.copy(videoWorldPos).project(camera)

  // NDC z > 1 means behind camera — hide the iframe
  if (_proj.z > 1) { videoIframe.style.display = 'none'; return }
  videoIframe.style.display = 'block'

  // Screen-space centre
  const sx = (_proj.x  + 1) * 0.5 * cw
  const sy = (-_proj.y + 1) * 0.5 * ch

  // Depth from camera
  const depth = camera.position.distanceTo(videoWorldPos)

  // Pixel size of FW world units at this depth
  const focalPx = ch / (2 * Math.tan((camera.fov * Math.PI / 180) / 2))
  const screenW = FW * focalPx / depth
  const scale   = screenW / IFRAME_W

  videoIframe.style.transform =
    `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${scale})`
}

// ── Input ─────────────────────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
  keys.add(e.code)
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault()
}
function onKeyUp(e: KeyboardEvent) { keys.delete(e.code) }

// ── Render loop ───────────────────────────────────────────────────────────────

function animate() {
  animId = requestAnimationFrame(animate)

  if (playerMesh) {
    if (keys.has('ArrowLeft'))  playerMesh.rotation.y += ROT_SPEED
    if (keys.has('ArrowRight')) playerMesh.rotation.y -= ROT_SPEED
    const ry = playerMesh.rotation.y
    if (keys.has('ArrowUp')) {
      playerMesh.position.x -= Math.sin(ry) * MOVE_SPEED
      playerMesh.position.z -= Math.cos(ry) * MOVE_SPEED
    }
    if (keys.has('ArrowDown')) {
      playerMesh.position.x += Math.sin(ry) * MOVE_SPEED
      playerMesh.position.z += Math.cos(ry) * MOVE_SPEED
    }

    _camDesired.set(
      playerMesh.position.x + Math.sin(ry) * CAM_DIST,
      playerMesh.position.y + CAM_HEIGHT,
      playerMesh.position.z + Math.cos(ry) * CAM_DIST,
    )
    camera.position.lerp(_camDesired, 0.08)
    _camTarget.set(playerMesh.position.x, playerMesh.position.y + 0.5, playerMesh.position.z)
    camera.lookAt(_camTarget)
  }

  updateVideoOverlay()
  renderer.render(scene, camera)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function onResize() {
  const canvas = canvasEl.value!
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function init() {
  const canvas = canvasEl.value!
  const w = canvas.clientWidth || canvas.offsetWidth
  const h = canvas.clientHeight || canvas.offsetHeight

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.shadowMap.enabled = true

  camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 300)
  scene  = new THREE.Scene()

  buildScene(props.landId)

  resizeObs = new ResizeObserver(onResize)
  resizeObs.observe(canvas)

  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)

  animate()
}

watch(() => props.landId, (id) => { if (scene) { removeVideo(); buildScene(id) } })
watch(() => props.videoId, (id) => {
  if (!playerMesh) return
  id ? placeVideo(id) : removeVideo()
})

onMounted(init)
onUnmounted(() => {
  cancelAnimationFrame(animId)
  resizeObs?.disconnect()
  renderer?.dispose()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div ref="wrapEl" class="scene-wrap">
    <canvas ref="canvasEl" class="scene-canvas" />
    <!-- Screen-space iframe overlay — positioned by updateVideoOverlay() each frame -->
    <div ref="videoLayer" class="video-layer" />
    <div class="scene-hint">↑ ↓ move &nbsp;·&nbsp; ← → turn</div>
  </div>
</template>

<style scoped>
.scene-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0a0a;
}

.scene-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.video-layer {
  position: absolute;
  inset: 0;
  pointer-events: none; /* iframe inside sets pointer-events: auto */
  overflow: hidden;
}

.scene-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.72rem;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
</style>
