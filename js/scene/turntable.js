import * as THREE from 'three'
import { concreteTexture } from '../textures.js'

/* The deck from the Figma render (node 1043:8741): a matte concrete-grey
   slab, a thick black record disc, and a blocky low-poly tonearm. No chrome,
   no metal — everything reads diffuse. Plinth top sits at y = DECK_TOP. */

export const DECK_TOP = 0.44
/* arm parked just over the outer groove, as the still shows it */
export const ARM_REST = -0.18

export function buildTurntable() {
  const group = new THREE.Group()

  const grain = concreteTexture()

  // top plate — mid grey with a stone-ish tooth
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x35363a,
    roughness: 0.94,
    metalness: 0,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.012,
  })
  // sides / front of the slab, noticeably darker
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0x1e1f22,
    roughness: 0.9,
    metalness: 0,
  })
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x111113,
    roughness: 0.82,
    metalness: 0,
  })
  const armMat = new THREE.MeshStandardMaterial({
    color: 0x35363a,
    roughness: 0.88,
    metalness: 0,
  })

  // ---- slab: BoxGeometry groups are [+x, -x, +y, -y, +z, -z]
  const slabW = 3.3
  const slabD = 2.5
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(slabW, DECK_TOP, slabD),
    [sideMat, sideMat, plateMat, blackMat, sideMat, sideMat],
  )
  slab.position.y = DECK_TOP / 2
  slab.castShadow = slab.receiveShadow = true
  group.add(slab)

  // faint dent / logo mark near the back left, like the render
  const mark = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0x333438, roughness: 1 }),
  )
  mark.rotation.x = -Math.PI / 2
  mark.position.set(-1.06, DECK_TOP + 0.002, -0.72)
  group.add(mark)

  // ---- the record on the platter: one thick matte-black disc
  const platter = new THREE.Group()
  platter.position.set(-0.18, DECK_TOP, 0.05)

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.04, 0.11, 128), blackMat)
  disc.position.y = 0.055
  disc.castShadow = disc.receiveShadow = true
  platter.add(disc)

  // slightly lighter label area, as in the render
  const label = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.78 }),
  )
  label.rotation.x = -Math.PI / 2
  label.position.y = 0.0855
  platter.add(label)
  group.add(platter)

  const spindle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.024, 0.17, 16),
    new THREE.MeshStandardMaterial({ color: 0x8e8f93, roughness: 0.6 }),
  )
  spindle.position.set(platter.position.x, DECK_TOP + 0.17, platter.position.z)
  spindle.castShadow = true
  group.add(spindle)

  // ---- tonearm: blocky, pivots at the back-right corner and reaches
  //      forward over the record, exactly like the render
  const tonearm = new THREE.Group()
  tonearm.position.set(1.16, DECK_TOP, -0.84)

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.4), armMat)
  base.position.y = 0.13
  base.castShadow = true
  tonearm.add(base)
  const baseStep = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.34), armMat)
  baseStep.position.set(0.13, 0.32, -0.06)
  baseStep.castShadow = true
  tonearm.add(baseStep)

  const arm = new THREE.Group()
  arm.position.y = 0.26

  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.1), armMat)
  tube.position.set(0, 0.02, 0.5)
  tube.castShadow = true
  arm.add(tube)

  // stepped headshell at the far end
  const headA = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.24), armMat)
  headA.position.set(0, -0.02, 1.13)
  headA.castShadow = true
  arm.add(headA)
  const headB = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.18), armMat)
  headB.position.set(0, -0.11, 1.25)
  headB.castShadow = true
  arm.add(headB)

  const stylus = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.04), blackMat)
  stylus.position.set(0, -0.19, 1.3)
  arm.add(stylus)

  tonearm.add(arm)
  tonearm.rotation.y = ARM_REST
  group.add(tonearm)

  // ---- red start button
  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.125, 0.05, 32),
    new THREE.MeshStandardMaterial({
      color: 0xe03a1f,
      roughness: 0.62,
      metalness: 0,
      emissive: 0x1e0300,
    }),
  )
  button.position.set(-1.3, DECK_TOP + 0.025, 0.85)
  button.castShadow = true
  group.add(button)

  return { group, platter, tonearm, arm, button, stylus }
}
