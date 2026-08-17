import { defineComponent, watch, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { TresCanvas, useTresContext, useLoop } from '@tresjs/core'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildTurntable, DECK_TOP, ARM_REST } from './turntable.js'
import { buildDisc } from './disc.js'
import { radialShadowTexture } from '../textures.js'
import { store } from '../store.js'
import { selectRecord, togglePlay } from '../actions.js'

const { damp, lerp, clamp, smoothstep } = THREE.MathUtils

const FOV = 30
const DECK_YAW = 0.06 // matches the 3/4 view of the Figma render

/* Where things sit, in Figma frame coordinates (0..1 of a 1280×830 board).
   song  → deck centred          song2 → deck up top, records fan in below
   song3 → deck slides left, the record panel opens on the right */
const DECK_AT = {
  hero: { u: 0.5, v: 0.523 },
  shelf: { u: 0.5, v: 0.268 },
  detail: { u: 0.311, v: 0.5 },
}
const RING_AT = {
  shelf: { u: 0.5, v: 0.762 },
  detail: { u: 0.5, v: 0.995 },
}

/* deck geometry: visual centre of the render, and where a record lands */
const DECK_MID = 0.3
const DECK_SLOT = new THREE.Vector3(-0.16, DECK_TOP + 0.105, 0.06)
const DECK_DISC_SCALE = 1.04
const SPIN_33 = (33.33 / 60) * Math.PI * 2

const World = defineComponent({
  name: 'World',
  setup() {
    const ctx = useTresContext()
    const unwrap = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v)

    const root = new THREE.Group()

    /* ---------- deck ---------- */
    const deckRig = new THREE.Group()
    deckRig.rotation.y = DECK_YAW
    const deck = buildTurntable()
    deckRig.add(deck.group)

    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 4.0),
      new THREE.MeshBasicMaterial({
        map: radialShadowTexture(),
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    )
    blob.rotation.x = -Math.PI / 2
    blob.position.y = -0.28
    deckRig.add(blob)
    root.add(deckRig)

    /* ---------- records ---------- */
    const discGroup = new THREE.Group()
    root.add(discGroup)

    const meshes = new Map()
    function syncDiscs() {
      const ids = new Set(store.records.map((r) => r.id))
      for (const [id, mesh] of meshes) {
        if (!ids.has(id)) {
          discGroup.remove(mesh)
          meshes.delete(id)
        }
      }
      store.records.forEach((rec) => {
        if (!meshes.has(rec.id)) {
          const mesh = buildDisc(rec)
          mesh.scale.setScalar(0.001)
          meshes.set(rec.id, mesh)
          discGroup.add(mesh)
        }
      })
    }
    syncDiscs()
    watch(() => store.records.map((r) => r.id).join('|'), syncDiscs)

    /* ---------- light: product-shot key, cool fill, back rim ---------- */
    const key = new THREE.DirectionalLight(0xffffff, 1.85)
    key.position.set(4.2, 6.4, 4.6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 24
    key.shadow.camera.left = -5
    key.shadow.camera.right = 5
    key.shadow.camera.top = 5
    key.shadow.camera.bottom = -5
    key.shadow.bias = -0.0006
    key.shadow.normalBias = 0.022
    key.shadow.radius = 3
    root.add(key)

    const fill = new THREE.DirectionalLight(0xdfe4ff, 0.55)
    fill.position.set(-5.4, 3.0, 2.2)
    root.add(fill)

    const rim = new THREE.DirectionalLight(0xffffff, 0.7)
    rim.position.set(-1.8, 2.6, -5.4)
    root.add(rim)

    root.add(new THREE.AmbientLight(0xffffff, 0.5))

    /* ---------- pointer ---------- */
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const pointer = { down: false, x: 0, moved: 0 }
    const ring = { spin: 0 }
    let hostEl = null

    const setNdc = (e) => {
      if (!hostEl) return false
      const r = hostEl.getBoundingClientRect()
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1
      return true
    }

    function pick() {
      const cam = unwrap(ctx.camera)
      if (!cam) return null
      ray.setFromCamera(ndc, cam)
      const targets = discGroup.children.filter((m) => m.visible && m.scale.x > 0.1)
      targets.push(deck.button)
      const hits = ray.intersectObjects(targets, false)
      if (!hits.length) return null
      const obj = hits[0].object
      if (obj === deck.button) return { kind: 'button' }
      return { kind: 'disc', id: obj.userData.recordId }
    }

    const onMove = (e) => {
      if (!setNdc(e)) return
      if (pointer.down) {
        const dx = e.clientX - pointer.x
        pointer.moved += Math.abs(dx)
        ring.spin -= dx / 110 // drag the strip along by hand
        pointer.x = e.clientX
      }
      const hit = store.stage > 0.4 || store.detail ? pick() : null
      store.hoverId = hit && hit.kind === 'disc' ? hit.id : null
      hostEl.classList.toggle('is-hot', !!hit)
    }

    const onDown = (e) => {
      setNdc(e)
      pointer.down = true
      pointer.x = e.clientX
      pointer.moved = 0
    }

    const onUp = (e) => {
      if (!pointer.down) return
      pointer.down = false
      if (e && typeof e.clientX === 'number') setNdc(e)
      if (pointer.moved < 6 && (store.stage > 0.4 || store.detail)) {
        const hit = pick()
        if (hit?.kind === 'disc') selectRecord(hit.id)
        else if (hit?.kind === 'button') togglePlay()
      }
    }

    /* ---------- animation ---------- */
    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    const camRight = new THREE.Vector3()
    const camUp = new THREE.Vector3()
    const anchorV = new THREE.Vector3()
    const slot = new THREE.Vector3()
    const deckSlotWorld = new THREE.Vector3()
    const tmpQ = new THREE.Quaternion()
    const tmpQ2 = new THREE.Quaternion()
    const tmpE = new THREE.Euler()
    const AXIS_Y = new THREE.Vector3(0, 1, 0)

    /* world point that lands at (u,v) of the frame, `dist` in front of the lens */
    function anchor(cam, u, v, dist, out) {
      const half = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * dist
      const x = (u * 2 - 1) * half * (cam.aspect || 1.6)
      const y = (1 - v * 2) * half
      return out
        .copy(camPos)
        .addScaledVector(camDir, dist)
        .addScaledVector(camRight, x)
        .addScaledVector(camUp, y)
    }

    let envDone = false
    let platterSpin = 0
    let armAngle = 0
    let armLift = 0
    let detailMix = 0
    const deckPos = new THREE.Vector3(0, 0, 0)
    const ORIGIN = new THREE.Vector3(0, 0, 0)
    let deckInit = false

    const { onBeforeRender } = useLoop()
    const tick = (delta) => {
      const dt = Math.min(delta || 0.016, 0.05)
      const renderer = unwrap(ctx.renderer)
      const scene = unwrap(ctx.scene)
      const cam = unwrap(ctx.camera)
      if (!renderer || !scene || !cam) return

      if (!envDone) {
        envDone = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        const pmrem = new THREE.PMREMGenerator(renderer)
        pmrem.compileEquirectangularShader()
        scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture
        hostEl = renderer.domElement
        hostEl.addEventListener('pointermove', onMove)
        hostEl.addEventListener('pointerdown', onDown)
        window.addEventListener('pointerup', onUp)
        store.ready = true
      }

      const t = performance.now() / 1000
      const aspect = cam.aspect || 1.6
      const stage = clamp(store.stage, 0, 1)
      detailMix = damp(detailMix, store.detail ? 1 : 0, 3.4, dt)
      const detail = smoothstep(detailMix, 0, 1)

      cam.lookAt(ORIGIN)
      cam.updateMatrixWorld()
      cam.getWorldPosition(camPos)
      cam.getWorldDirection(camDir)
      camRight.set(1, 0, 0).applyQuaternion(cam.quaternion)
      camUp.set(0, 1, 0).applyQuaternion(cam.quaternion)

      /* keep the deck at ~46% of the frame width, like the Figma render */
      const deckDist = clamp(15.8 / aspect, 7.5, 19)

      /* deck anchor: hero → shelf → detail */
      const au = lerp(lerp(DECK_AT.hero.u, DECK_AT.shelf.u, stage), DECK_AT.detail.u, detail)
      const av = lerp(lerp(DECK_AT.hero.v, DECK_AT.shelf.v, stage), DECK_AT.detail.v, detail)
      anchor(cam, au, av, deckDist, anchorV)
      anchorV.y -= DECK_MID

      if (!deckInit) {
        deckPos.copy(anchorV)
        deckInit = true
      }
      deckPos.x = damp(deckPos.x, anchorV.x, 4.2, dt)
      deckPos.y = damp(deckPos.y, anchorV.y + Math.sin(t * 0.5) * 0.02, 4.2, dt)
      deckPos.z = damp(deckPos.z, anchorV.z, 4.2, dt)
      deckRig.position.copy(deckPos)
      deckRig.updateMatrixWorld()
      deckSlotWorld.copy(DECK_SLOT).applyMatrix4(deckRig.matrixWorld)

      /* ---------- the record strip ----------
         One flat row, all at the same depth and size, drifting right → left
         and wrapping around forever. */
      const ringDist = deckDist * 0.82
      const half = Math.tan(THREE.MathUtils.degToRad(FOV) / 2)
      const frameW = 2 * ringDist * half * aspect
      const discScale = 0.12 * frameW // each record reads ~24% of the frame

      const ru = lerp(RING_AT.shelf.u, RING_AT.detail.u, detail)
      const rv = lerp(RING_AT.shelf.v, RING_AT.detail.v, detail)
      const ringCentre = anchor(cam, ru, rv, ringDist, new THREE.Vector3())

      const reveal = smoothstep(stage, 0.42, 0.98)

      const n = Math.max(store.records.length, 1)
      // spacing wide enough that the wrap always happens off-frame
      const gap = Math.max(discScale * 2.24, (frameW * 1.35) / n)
      const band = gap * n
      // slow drift; eases off while you are picking one out
      const drift = (store.hoverId ? 0.16 : 1) * (store.detail ? 0.45 : 1) * gap * 0.16
      ring.spin = (ring.spin + drift * dt) % band
      store.records.forEach((rec, idx) => {
        const mesh = meshes.get(rec.id)
        if (!mesh) return
        const a = mesh.userData.anim
        const isActive = store.activeId === rec.id
        const isHover = store.hoverId === rec.id

        a.onDeck = damp(a.onDeck, isActive && store.detail ? 1 : 0, 3.2, dt)
        a.hover = damp(a.hover, isHover && !isActive ? 1 : 0, 9, dt)

        /* slot on the strip: wrapped into the band, then centred */
        let sx = idx * gap - ring.spin
        sx = (((sx + band / 2) % band) + band) % band // 0 … band
        sx -= band / 2
        slot
          .copy(ringCentre)
          .addScaledVector(camRight, sx)
          .addScaledVector(camUp, Math.sin(t * 0.5 + a.bob) * 0.05 + (1 - reveal) * -2.2)

        const e = smoothstep(a.onDeck, 0, 1)
        mesh.position.set(
          lerp(slot.x, deckSlotWorld.x, e),
          lerp(slot.y, deckSlotWorld.y, e) + Math.sin(e * Math.PI) * 0.9,
          lerp(slot.z, deckSlotWorld.z, e),
        )

        /* spin: 33⅓ on the deck. In the air they hold still — the title is
           printed on the disc and has to stay readable. */
        const wantRate = isActive && store.playing ? SPIN_33 : 0
        a.rate = damp(a.rate ?? 0.16, wantRate, 2.2, dt)
        a.spin += a.rate * dt

        /* on the strip: square to the lens. On the deck: flat, spinning. */
        tmpQ.copy(cam.quaternion)
        tmpE.set(Math.PI / 2, 0, 0)
        tmpQ.multiply(tmpQ2.setFromEuler(tmpE))
        tmpQ.slerp(tmpQ2.copy(deckRig.quaternion), e)
        tmpQ2.setFromAxisAngle(AXIS_Y, a.spin)
        mesh.quaternion.copy(tmpQ.multiply(tmpQ2))

        const s = lerp(discScale * (1 + a.hover * 0.05) * reveal, DECK_DISC_SCALE, e)
        mesh.scale.setScalar(Math.max(0.001, s))
        mesh.visible = s > 0.02
      })

      /* ---------- deck motion ---------- */
      const onAir = store.playing && !!store.activeId
      armAngle = damp(armAngle, onAir ? -0.3 - store.needle * 0.3 : ARM_REST, 2.4, dt)
      armLift = damp(armLift, onAir ? 1 : 0, 3.2, dt)
      deck.tonearm.rotation.y = armAngle
      deck.arm.position.y = 0.26 + (1 - armLift) * 0.07
      deck.arm.rotation.x = (1 - armLift) * 0.05

      const em = deck.button.material.emissive
      const want = onAir ? 0.85 : 0.12
      em.setRGB(damp(em.r, want, 4, dt), em.g * 0.9, em.b * 0.9)

      platterSpin = damp(platterSpin, onAir ? 1 : 0, 3, dt)
      deck.platter.rotation.y += SPIN_33 * platterSpin * dt

      blob.material.opacity = 0.38 - detail * 0.1
    }
    onBeforeRender(({ delta }) => tick(delta))

    /* handle for stepping the scene by hand (headless checks, screenshots) */
    window.__yoursong = {
      store,
      deck,
      meshes,
      ring,
      ctx: {
        renderer: () => unwrap(ctx.renderer),
        scene: () => unwrap(ctx.scene),
        camera: () => unwrap(ctx.camera),
      },
      step(frames = 60, dt = 1 / 60) {
        for (let i = 0; i < frames; i++) tick(dt)
        const renderer = unwrap(ctx.renderer)
        const scene = unwrap(ctx.scene)
        const cam = unwrap(ctx.camera)
        if (renderer && scene && cam) renderer.render(scene, cam)
      },
    }

    onBeforeUnmount(() => {
      if (hostEl) {
        hostEl.removeEventListener('pointermove', onMove)
        hostEl.removeEventListener('pointerdown', onDown)
      }
      window.removeEventListener('pointerup', onUp)
    })

    return { root }
  },
  template: `<primitive :object="root" />`,
})

export const Stage = defineComponent({
  name: 'Stage',
  components: { TresCanvas, World },
  setup() {
    return { toneMapping: THREE.ACESFilmicToneMapping, fov: FOV }
  },
  template: `
    <div class="stage">
      <TresCanvas
        :alpha="true"
        :clear-alpha="0"
        :shadows="true"
        :tone-mapping="toneMapping"
        :tone-mapping-exposure="1.0"
        window-size
      >
        <TresPerspectiveCamera :position="[-0.9, 4.35, 8.7]" :fov="fov" :near="0.1" :far="80" />
        <World />
      </TresCanvas>
    </div>
  `,
})
