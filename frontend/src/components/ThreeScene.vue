<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'

const props = defineProps<{
  landId: string
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let animId: number
let resizeObserver: ResizeObserver

// Objects we'll animate
let terrain: THREE.Mesh
let particles: THREE.Points
let ambientLight: THREE.AmbientLight
let dirLight: THREE.DirectionalLight

// Derive a deterministic hue from the landId string
function landHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff
  return (h % 360) / 360
}

function buildScene(landId: string) {
  scene.clear()

  const hue = landHue(landId)
  const primary = new THREE.Color().setHSL(hue, 0.7, 0.5)
  const secondary = new THREE.Color().setHSL((hue + 0.55) % 1, 0.6, 0.35)

  // Sky gradient via background color
  renderer.setClearColor(new THREE.Color().setHSL(hue, 0.4, 0.08))

  // Fog
  scene.fog = new THREE.FogExp2(renderer.getClearColor(new THREE.Color()), 0.035)

  // Lights
  ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
  dirLight = new THREE.DirectionalLight(primary, 1.8)
  dirLight.position.set(5, 10, 5)
  scene.add(ambientLight, dirLight)

  // Terrain — subdivided plane with displaced vertices
  const geo = new THREE.PlaneGeometry(40, 40, 80, 80)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const y =
      Math.sin(x * 0.3) * Math.cos(z * 0.3) * 1.2 +
      Math.sin(x * 0.7 + 1) * Math.cos(z * 0.5) * 0.5
    pos.setY(i, y)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({
    color: secondary,
    roughness: 0.85,
    metalness: 0.1,
    wireframe: false,
  })
  terrain = new THREE.Mesh(geo, mat)
  scene.add(terrain)

  // Floating particles
  const pCount = 600
  const pPositions = new Float32Array(pCount * 3)
  for (let i = 0; i < pCount; i++) {
    pPositions[i * 3] = (Math.random() - 0.5) * 30
    pPositions[i * 3 + 1] = Math.random() * 10
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 30
  }
  const pGeo = new THREE.BufferGeometry()
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
  const pMat = new THREE.PointsMaterial({ color: primary, size: 0.08, sizeAttenuation: true })
  particles = new THREE.Points(pGeo, pMat)
  scene.add(particles)

  // Floating icosahedra
  for (let i = 0; i < 8; i++) {
    const r = 0.2 + Math.random() * 0.6
    const g = new THREE.IcosahedronGeometry(r, 0)
    const m = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.3,
      metalness: 0.7,
      emissive: primary,
      emissiveIntensity: 0.15,
    })
    const mesh = new THREE.Mesh(g, m)
    mesh.position.set(
      (Math.random() - 0.5) * 20,
      2 + Math.random() * 5,
      (Math.random() - 0.5) * 20,
    )
    mesh.userData.floatOffset = Math.random() * Math.PI * 2
    mesh.userData.rotSpeed = (Math.random() - 0.5) * 0.02
    scene.add(mesh)
  }
}

function init() {
  const canvas = canvasEl.value!
  const w = canvas.clientWidth
  const h = canvas.clientHeight

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 200)
  camera.position.set(0, 6, 14)
  camera.lookAt(0, 0, 0)

  buildScene(props.landId)

  resizeObserver = new ResizeObserver(() => {
    const w2 = canvas.clientWidth
    const h2 = canvas.clientHeight
    renderer.setSize(w2, h2, false)
    camera.aspect = w2 / h2
    camera.updateProjectionMatrix()
  })
  resizeObserver.observe(canvas)

  animate()
}

function animate() {
  animId = requestAnimationFrame(animate)
  const t = performance.now() * 0.001

  // Slow camera orbit
  camera.position.x = Math.sin(t * 0.08) * 14
  camera.position.z = Math.cos(t * 0.08) * 14
  camera.lookAt(0, 0, 0)

  // Float particles
  particles.rotation.y = t * 0.04

  // Animate icosahedra
  scene.children.forEach((obj) => {
    if (obj instanceof THREE.Mesh && obj !== terrain && obj.userData.floatOffset !== undefined) {
      obj.position.y += Math.sin(t + obj.userData.floatOffset) * 0.005
      obj.rotation.x += obj.userData.rotSpeed
      obj.rotation.y += obj.userData.rotSpeed * 0.7
    }
  })

  renderer.render(scene, camera)
}

// Rebuild scene when land changes
watch(() => props.landId, (id) => {
  if (scene) buildScene(id)
})

onMounted(init)

onUnmounted(() => {
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvasEl" class="three-canvas" />
</template>

<style scoped>
.three-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
