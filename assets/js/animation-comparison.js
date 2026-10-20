import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const currentClipFiles = [
  ['Listening To Music (idle)', './assets/models/yvonne-rigged-listening-to-music.fbx'],
  ['Walking', './assets/models/yvonne-rigged-walking.fbx'],
  ['Waving', './assets/models/yvonne-rigged-waving.fbx'],
  ['Jazz Dancing 1', './assets/models/yvonne-rigged-jazz-dancing-1.fbx'],
  ['Jazz Dancing 2', './assets/models/yvonne-rigged-jazz-dancing-2.fbx'],
  ['Northern Soul Floor Combo', './assets/models/yvonne-rigged-northern-soul-floor-combo.fbx'],
  ['Swing Dancing', './assets/models/yvonne-rigged-swing-dancing.fbx'],
  ['House Dancing', './assets/models/yvonne-rigged-house-dancing.fbx'],
  ['YMCA Dance', './assets/models/yvonne-rigged-ymca-dance.fbx'],
  ['Standing Idle To Fight Idle', './assets/models/yvonne-rigged-standing-idle-to-fight-idle.fbx'],
  ['Fist Fight A', './assets/models/yvonne-rigged-fist-fight-a.fbx'],
  ['Fist Fight B', './assets/models/yvonne-rigged-fist-fight-b.fbx'],
];

const newModelPath = './assets/models/animation-comparison/meshy-biped/Meshy_AI_chibi_palms_down_mixa_biped_Meshy_Merged_Animations.fbx';
const currentModelPath = './assets/models/yvonne-rigged-waving.fbx';
const loader = new FBXLoader();
const currentSelect = document.querySelector('#current-clip');
const newSelect = document.querySelector('#new-clip');
const currentStatus = document.querySelector('#current-status');
const newStatus = document.querySelector('#new-status');
const players = [];

const normalizeBoneName = (name) => name.replace(/^.*:/, '').replace(/^mixamorig/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

function makePlayer(viewport) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  camera.position.set(0, 1.05, 4.5);
  camera.lookAt(0, 0.9, 0);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  viewport.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x988897, 2.1));
  const key = new THREE.DirectionalLight(0xffead8, 3.1);
  key.position.set(-2, 4, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc5dcff, 1.3);
  fill.position.set(3, 2, -3);
  scene.add(fill);

  const player = { scene, camera, renderer, mixer: null, model: null, bones: new Map(), activeAction: null };
  const resize = () => {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  new ResizeObserver(resize).observe(viewport);
  resize();
  players.push(player);
  return player;
}

function fitModel(player, model) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  model.scale.setScalar(1.72 / Math.max(size.y, 0.001));
  const scaledBounds = new THREE.Box3().setFromObject(model);
  model.position.x -= (scaledBounds.min.x + scaledBounds.max.x) / 2;
  model.position.y -= scaledBounds.min.y;
  player.camera.lookAt(0, 0.88, 0);
}

function retargetClip(clip, player) {
  const retargeted = clip.clone();
  retargeted.tracks = retargeted.tracks.filter((track) => {
    const dot = track.name.indexOf('.');
    if (dot < 0) return true;
    const pathParts = track.name.slice(0, dot).split(/[|/]/).reverse();
    if (pathParts.some((part) => normalizeBoneName(part) === 'hips') && track.name.slice(dot + 1).startsWith('position')) return false;
    const target = pathParts.map((part) => player.bones.get(normalizeBoneName(part))).find(Boolean);
    if (!target) return false;
    track.name = `${target.name}${track.name.slice(dot)}`;
    return true;
  });
  return retargeted;
}

function playClip(player, clip, repeat = true) {
  if (!player.mixer || !clip) return;
  if (player.activeAction) player.activeAction.stop();
  const action = player.mixer.clipAction(clip);
  action.reset();
  action.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat ? Infinity : 1);
  action.clampWhenFinished = !repeat;
  action.play();
  player.activeAction = action;
}

function addOption(select, label, value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

async function loadCurrentPlayer(player) {
  const model = await loader.loadAsync(currentModelPath);
  player.model = model;
  model.traverse((object) => {
    if (object.isSkinnedMesh) object.frustumCulled = false;
    if (object.isBone) player.bones.set(normalizeBoneName(object.name), object);
  });
  fitModel(player, model);
  player.scene.add(model);

  const texture = await new THREE.TextureLoader().loadAsync('./assets/models/yvonne-character-texture.webp');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.anisotropy = player.renderer.capabilities.getMaxAnisotropy();
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const apply = (source) => {
      const material = source.clone();
      material.map = texture;
      material.normalMap = null;
      material.color.set(0xffffff);
      material.needsUpdate = true;
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(apply) : apply(object.material);
  });
  player.mixer = new THREE.AnimationMixer(model);

  currentClipFiles.forEach(([label], index) => addOption(currentSelect, label, String(index)));
  currentSelect.value = '0';
  currentSelect.addEventListener('change', () => loadCurrentAnimation(player, Number(currentSelect.value)));
  document.querySelector('#current-replay').addEventListener('click', () => loadCurrentAnimation(player, Number(currentSelect.value)));
  await loadCurrentAnimation(player, 0);
}

async function loadCurrentAnimation(player, index) {
  const [label, path] = currentClipFiles[index];
  currentStatus.textContent = `Loading ${label}…`;
  try {
    const source = await loader.loadAsync(path);
    const clip = source.animations?.[0];
    if (!clip) throw new Error('No animation clip found in this FBX.');
    const mapped = retargetClip(clip, player);
    if (!mapped.tracks.length) throw new Error('No tracks matched the current character skeleton.');
    playClip(player, mapped, !['Standing Idle To Fight Idle', 'Fist Fight A', 'Fist Fight B'].includes(label));
    currentStatus.textContent = `${label} · ${clip.duration.toFixed(2)} seconds · ${mapped.tracks.length} matched tracks`;
  } catch (error) {
    currentStatus.textContent = `Could not load ${label}: ${error.message}`;
  }
}

async function loadNewPlayer(player) {
  try {
    const model = await loader.loadAsync(newModelPath);
    player.model = model;
    model.traverse((object) => {
      if (object.isSkinnedMesh) object.frustumCulled = false;
      if (object.isBone) player.bones.set(normalizeBoneName(object.name), object);
    });
    fitModel(player, model);
    player.scene.add(model);
    player.mixer = new THREE.AnimationMixer(model);

    const clips = model.animations || [];
    if (!clips.length) {
      newStatus.textContent = 'The FBX loaded, but Three.js did not find animation clips in it.';
      return;
    }
    clips.forEach((clip, index) => addOption(newSelect, `${clip.name || `Take ${index + 1}`} · ${clip.duration.toFixed(2)}s`, String(index)));
    newSelect.disabled = false;
    document.querySelector('#new-replay').disabled = false;
    const playSelected = () => {
      const index = Number(newSelect.value);
      const clip = clips[index];
      playClip(player, clip, true);
      newStatus.textContent = `${clip.name || `Take ${index + 1}`} · ${clip.duration.toFixed(2)} seconds · ${clip.tracks.length} tracks`;
    };
    newSelect.addEventListener('change', playSelected);
    document.querySelector('#new-replay').addEventListener('click', playSelected);
    newSelect.value = String(Math.max(0, clips.findIndex((clip) => /walking|walk|running|run/i.test(clip.name))));
    playSelected();
  } catch (error) {
    newStatus.textContent = `Could not load the separate test FBX: ${error.message}`;
  }
}

const currentPlayer = makePlayer(document.querySelector('#current-viewport'));
const newPlayer = makePlayer(document.querySelector('#new-viewport'));

loadCurrentPlayer(currentPlayer).catch((error) => {
  currentStatus.textContent = `Could not load current character: ${error.message}`;
});
loadNewPlayer(newPlayer);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  players.forEach((player) => player.mixer?.update(delta));
  players.forEach((player) => player.renderer.render(player.scene, player.camera));
}
animate();
