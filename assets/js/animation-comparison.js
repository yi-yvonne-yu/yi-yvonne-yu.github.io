import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { animationLibrary } from './animation-library.js?v=20261020-boxing-kicking-1';

const clips = animationLibrary;

const clipLoader = new FBXLoader();
const clipCache = new Map();
const players = [];
const clipSelects = [
  document.querySelector('#current-clip'),
  document.querySelector('#sage-blue-clip'),
];
let selectedClipIndex = 0;

function loadClip(path) {
  if (!clipCache.has(path)) {
    clipCache.set(path, clipLoader.loadAsync(path).then((fbx) => {
      const clip = fbx.animations?.[0];
      if (!clip) throw new Error('No animation clip found in this FBX.');
      return clip;
    }));
  }
  return clipCache.get(path);
}

function normalizeBoneName(name) {
  return name.replace(/^.*:/, '').replace(/^mixamorig/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function retargetClip(clip, bones) {
  const retargeted = clip.clone();
  retargeted.tracks = retargeted.tracks.filter((track) => {
    const dot = track.name.indexOf('.');
    if (dot < 0) return true;
    const property = track.name.slice(dot + 1);
    const parts = track.name.slice(0, dot).split(/[|/]/).reverse();
    if (parts.some((part) => normalizeBoneName(part) === 'hips') && property.startsWith('position')) return false;
    const target = parts.map((part) => bones.get(normalizeBoneName(part))).find(Boolean);
    if (!target) return false;
    track.name = `${target.name}${track.name.slice(dot)}`;
    return true;
  });
  return retargeted;
}

function createPlayer({ viewport, status, modelPath, texturePath, initialMessage }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  camera.position.set(0, 1.05, 4.5);
  camera.lookAt(0, 0.88, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  viewport.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x988897, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffead8, 3.1);
  keyLight.position.set(-2, 4, 4);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xc5dcff, 1.3);
  fillLight.position.set(3, 2, -3);
  scene.add(fillLight);

  const player = { scene, camera, renderer, status, modelPath, texturePath, bones: new Map(), mixer: null, activeAction: null, requestId: 0, ready: false };
  const resize = () => {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  new ResizeObserver(resize).observe(viewport);
  resize();
  status.textContent = initialMessage;
  players.push(player);
  return player;
}

function fitModel(player, model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  model.scale.setScalar(1.72 / Math.max(size.y, 0.001));
  const scaledBounds = new THREE.Box3().setFromObject(model);
  model.position.x -= (scaledBounds.min.x + scaledBounds.max.x) / 2;
  model.position.y -= scaledBounds.min.y;
}

async function initializePlayer(player) {
  try {
    const modelLabel = player.modelPath.includes('sage-blue') ? 'sage-blue' : 'current';
    player.status.textContent = `Loading ${modelLabel} FBX…`;
    const model = await clipLoader.loadAsync(player.modelPath);
    player.status.textContent = `Loading ${modelLabel} color texture…`;
    const texture = await new THREE.TextureLoader().loadAsync(player.texturePath);
    player.status.textContent = `Preparing ${modelLabel} character…`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.anisotropy = player.renderer.capabilities.getMaxAnisotropy();

    model.traverse((object) => {
      if (object.isSkinnedMesh) object.frustumCulled = false;
      if (object.isBone) player.bones.set(normalizeBoneName(object.name), object);
      if (!object.isMesh || !object.material) return;
      const applyTexture = (source) => {
        const material = source.clone();
        material.map = texture;
        material.normalMap = null;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(applyTexture) : applyTexture(object.material);
    });

    fitModel(player, model);
    player.scene.add(model);
    player.mixer = new THREE.AnimationMixer(model);
    player.ready = true;
    await playSelectedClip(player, selectedClipIndex);
  } catch (error) {
    player.status.textContent = `Could not load this character: ${error.message}`;
  }
}

async function playSelectedClip(player, index) {
  if (!player.ready) return;
  const requestId = ++player.requestId;
  const { label, path } = clips[index];
  player.status.textContent = `Loading ${label}…`;
  try {
    const sourceClip = await loadClip(path);
    if (requestId !== player.requestId) return;
    const clip = retargetClip(sourceClip, player.bones);
    if (!clip.tracks.length) throw new Error('No animation tracks matched this character skeleton.');

    player.activeAction?.stop();
    player.activeAction = player.mixer.clipAction(clip);
    player.activeAction.reset();
    const repeat = clips[index].loop !== false;
    player.activeAction.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat ? Infinity : 1);
    player.activeAction.clampWhenFinished = !repeat;
    player.activeAction.play();
    player.status.textContent = `${label} · ${sourceClip.duration.toFixed(2)} seconds · ${clip.tracks.length} matched tracks`;
  } catch (error) {
    if (requestId === player.requestId) player.status.textContent = `Could not load ${label}: ${error.message}`;
  }
}

function selectClip(index) {
  selectedClipIndex = index;
  clipSelects.forEach((select) => { select.value = String(index); });
  players.forEach((player) => playSelectedClip(player, index));
}

clips.forEach(({ label }, index) => {
  clipSelects.forEach((select) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = label;
    select.append(option);
  });
});

clipSelects.forEach((select) => select.addEventListener('change', () => selectClip(Number(select.value))));
document.querySelector('#current-replay').addEventListener('click', () => selectClip(selectedClipIndex));
document.querySelector('#sage-blue-replay').addEventListener('click', () => selectClip(selectedClipIndex));

createPlayer({
  viewport: document.querySelector('#current-viewport'),
  status: document.querySelector('#current-status'),
  modelPath: './assets/models/yvonne-rigged-waving.fbx',
  texturePath: './assets/models/yvonne-character-texture.webp',
  initialMessage: 'Loading current character…',
});
createPlayer({
  viewport: document.querySelector('#sage-blue-viewport'),
  status: document.querySelector('#sage-blue-status'),
  modelPath: './assets/models/yvonne-sage-blue.fbx',
  texturePath: './assets/models/yvonne-sage-blue-texture.jpg',
  initialMessage: 'Loading sage-blue model and texture…',
});
players.forEach(initializePlayer);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  players.forEach((player) => player.mixer?.update(delta));
  players.forEach((player) => player.renderer.render(player.scene, player.camera));
}
animate();
