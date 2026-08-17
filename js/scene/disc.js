import * as THREE from 'three'
import { faceTexture, grooveTextures } from '../textures.js'

const RADIUS = 1.0
const THICKNESS = 0.018
let geo = null

function discGeometry() {
  if (!geo) geo = new THREE.CylinderGeometry(RADIUS, RADIUS, THICKNESS, 160, 1)
  return geo
}

export function buildDisc(rec) {
  const map = faceTexture(rec.src)
  const { roughnessMap } = grooveTextures()

  /* a picture disc is printed, not glossy black — keep the coat subtle so the
     artwork stays readable and the grooves only glance the light */
  const face = new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap,
    roughness: 0.82,
    metalness: 0.03,
    clearcoat: 0.12,
    clearcoatRoughness: 0.7,
    specularIntensity: 0.25,
    envMapIntensity: 0.4,
  })
  const edge = new THREE.MeshPhysicalMaterial({
    color: 0x111114,
    roughness: 0.6,
    metalness: 0.1,
    clearcoat: 0.4,
  })

  // CylinderGeometry groups: [side, top, bottom]
  const mesh = new THREE.Mesh(discGeometry(), [edge, face, face])
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.recordId = rec.id

  mesh.userData.anim = {
    hover: 0,
    onDeck: 0,
    bob: Math.random() * Math.PI * 2,
    spin: 0,
    rate: 0,
  }
  return mesh
}

export const DISC_RADIUS = RADIUS
