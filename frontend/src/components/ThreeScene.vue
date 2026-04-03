<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const props = defineProps<{ landId: string }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let animId: number
let resizeObserver: ResizeObserver
let playerMesh: THREE.Mesh

const keys = new Set<string>()

const MOVE_SPEED = 0.13
const ROT_SPEED  = 0.045
const CAM_DIST   = 9
const CAM_HEIGHT = 5.5

const _camTarget = new THREE.Vector3()
const _camDesired = new THREE.Vector3()

// ── Helpers ───────────────────────────────────────────────────────────────────

function hueFrom(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff
  return (h % 360) / 360
}

// ── Scene build ───────────────────────────────────────────────────────────────

function buildScene(landId: string) {
  // Wipe everything except renderer / camera
  scene.clear()
  keys.clear()

  const hue  = hueFrom(landId)
  const fog  = new THREE.Color().setHSL(hue, 0.15, 0.04)
  const accent = new THREE.Color().setHSL(hue, 0.85, 0.55)

  renderer.setClearColor(fog)
  scene.fog = new THREE.Fog(fog, 18, 55)

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const sun = new THREE.DirectionalLight(accent, 1.6)
  sun.position.set(8, 14, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.far = 80
  scene.add(sun)

  // Grid floor
  const grid = new THREE.GridHelper(300, 300,
    new THREE.Color().setHSL(hue, 0.3, 0.18),
    new THREE.Color().setHSL(hue, 0.15, 0.1),
  )
  scene.add(grid)

  // Solid ground beneath grid (receives shadows)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.2, 0.05),
      roughness: 1,
    }),
  )
  ground.position.y = -0.001
  ground.receiveShadow = true
  scene.add(ground)

  // Player cube
  const playerColor = new THREE.Color().setHSL(hue, 0.9, 0.62)
  playerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: playerColor,
      emissive: playerColor,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.4,
    }),
  )
  playerMesh.position.set(0, 0.5, 0)
  playerMesh.castShadow = true
  scene.add(playerMesh)

  // Player direction indicator (a small darker face on the "front")
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }),
  )
  nose.position.set(0, 0, -0.53)
  playerMesh.add(nose)

  // Decorative voxels scattered in the world
  const voxColor = new THREE.Color().setHSL((hue + 0.5) % 1, 0.6, 0.38)
  const voxMat = new THREE.MeshStandardMaterial({ color: voxColor, roughness: 0.75 })
  for (let i = 0; i < 40; i++) {
    const w = 0.8 + Math.random() * 1.2
    const h = 1 + Math.random() * 3.5
    const vox = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), voxMat)
    const angle = Math.random() * Math.PI * 2
    const dist  = 10 + Math.random() * 40
    vox.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist)
    vox.castShadow = true
    scene.add(vox)
  }

  // Reset camera behind player
  camera.position.set(0, CAM_HEIGHT, CAM_DIST)
  camera.lookAt(0, 0.5, 0)
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
    // Rotate player left / right
    if (keys.has('ArrowLeft'))  playerMesh.rotation.y += ROT_SPEED
    if (keys.has('ArrowRight')) playerMesh.rotation.y -= ROT_SPEED

    // Move forward / backward along player's facing direction
    const ry = playerMesh.rotation.y
    if (keys.has('ArrowUp')) {
      playerMesh.position.x -= Math.sin(ry) * MOVE_SPEED
      playerMesh.position.z -= Math.cos(ry) * MOVE_SPEED
    }
    if (keys.has('ArrowDown')) {
      playerMesh.position.x += Math.sin(ry) * MOVE_SPEED
      playerMesh.position.z += Math.cos(ry) * MOVE_SPEED
    }

    // 3rd-person camera: sit behind & above the player, lerp smoothly
    _camDesired.set(
      playerMesh.position.x + Math.sin(ry) * CAM_DIST,
      playerMesh.position.y + CAM_HEIGHT,
      playerMesh.position.z + Math.cos(ry) * CAM_DIST,
    )
    camera.position.lerp(_camDesired, 0.08)

    _camTarget.set(
      playerMesh.position.x,
      playerMesh.position.y + 0.5,
      playerMesh.position.z,
    )
    camera.lookAt(_camTarget)
  }

  renderer.render(scene, camera)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

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

  resizeObserver = new ResizeObserver(() => {
    const w2 = canvas.clientWidth
    const h2 = canvas.clientHeight
    if (!w2 || !h2) return
    renderer.setSize(w2, h2, false)
    camera.aspect = w2 / h2
    camera.updateProjectionMatrix()
  })
  resizeObserver.observe(canvas)

  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)

  animate()
}

watch(() => props.landId, (id) => { if (scene) buildScene(id) })

onMounted(init)

onUnmounted(() => {
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  renderer?.dispose()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div class="scene-wrap">
    <canvas ref="canvasEl" class="scene-canvas" />
    <div class="scene-hint">↑ ↓ move &nbsp;·&nbsp; ← → turn</div>
  </div>
</template>

<style scoped>
.scene-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.scene-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.72rem;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.35);
  pointer-events: none;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
</style>
