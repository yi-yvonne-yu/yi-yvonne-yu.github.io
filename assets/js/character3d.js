import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const canvasHost = document.querySelector('[data-character-canvas]');
const characterButton = document.querySelector('[data-character]');
const hint = document.querySelector('[data-character-hint]');
const speechBubble = characterButton?.querySelector('.character-speech');
const sidebarButton = document.querySelector('[data-sidebar-btn]');

// Keep the bubbles outside clipped cards so they can sit above every page layer.
if (hint) document.body.appendChild(hint);
if (speechBubble) document.body.appendChild(speechBubble);

if (canvasHost && characterButton) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const characterRaycaster = new THREE.Raycaster();
  const characterPointer = new THREE.Vector2();
  const speechAnchor = new THREE.Vector3();
  const speechSideAnchor = new THREE.Vector3();
  const speechCameraRight = new THREE.Vector3();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  canvasHost.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb6a5a0, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffead8, 3.1);
  keyLight.position.set(-2, 4, 4);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xc5dcff, 1.3);
  fillLight.position.set(3, 2, -3);
  scene.add(fillLight);

  const characterRoot = new THREE.Group();
  const modelTurn = new THREE.Group();
  modelTurn.rotation.y = 0;
  scene.add(characterRoot);
  characterRoot.add(modelTurn);

  const clock = new THREE.Clock();
  let mixer = null;
  let characterModel = null;
  let idleAction = null;
  let fightIdleAction = null;
  let fightAction = null;
  let fightBAction = null;
  let activeFightAction = null;
  let waveAction = null;
  let walkAction = null;
  const danceSourcePaths = [
    './assets/models/yvonne-rigged-jazz-dancing-1.fbx',
    './assets/models/yvonne-rigged-jazz-dancing-2.fbx',
    './assets/models/yvonne-rigged-northern-soul-floor-combo.fbx',
    './assets/models/yvonne-rigged-swing-dancing.fbx',
    './assets/models/yvonne-rigged-house-dancing.fbx',
    './assets/models/yvonne-rigged-ymca-dance.fbx',
    './assets/models/yvonne-rigged-headspin-end.fbx',
  ];
  const danceActions = new Array(danceSourcePaths.length).fill(null);
  let activeDanceAction = null;
  let danceIndex = 0;
  let fightResume = null;
  let postFightResume = null;
  let postFightIdleTimer = null;
  let postFightIdleActive = false;
  let activeClickResume = null;
  let activeClickCount = 0;
  let activeClickHoldTimer = null;
  let activeClickTransitionTimer = null;
  let activeFightStartTimer = null;
  let activeClickTransitionFinished = false;
  let activeClickRestartedAfterFight = false;
  let pendingFightAction = false;
  let poseState = 'idle';
  let walkYawFrom = 0;
  let walkYawTo = 0;
  let walkYawElapsed = 0;
  const walkYawDuration = 0.55;
  const fightClickThreshold = 3;
  const idleBeforeFightIdleDuration = 450;
  const fightIdleHoldDuration = 1200;
  const fightIdleEllipsisDuration = 1200;
  const idleBeforeFistFightDuration = 550;
  const idleAfterFistFightDuration = 2200;
  let modelReady = false;
  let idleReady = false;
  let walkingReady = false;
  let fightIdleReady = false;
  let fightReady = false;
  let fightBReady = false;
  let danceSourcesLoaded = 0;
  const bonesByName = new Map();
  let headBone = null;
  let hipsBone = null;
  let active = false;
  let ready = false;
  let fightActionPlaying = false;
  let queueNextFightRequested = false;
  let pointerNearCharacter = false;
  let lastPointerPosition = null;
  let elapsedSinceWake = 0;
  let resizeObserver;
  let fullFramingSize = new THREE.Vector3(0.8, 1.72, 0.6);
  let fullFramingCenter = new THREE.Vector3(0, 0.86, 0);

  characterButton.disabled = true;
  const updateReadyState = () => {
    if (!modelReady || !idleReady || !walkingReady || !fightIdleReady || !fightReady || !fightBReady || danceSourcesLoaded < danceSourcePaths.length) return;
    if (!idleAction || !fightIdleAction || !fightAction || !fightBAction || !walkAction || danceActions.some((action) => !action)) {
      if (hint) hint.textContent = 'Animation files could not load';
      return;
    }
    ready = true;
    characterButton.disabled = false;
    characterButton.classList.add('character-ready');
    if (hint) hint.textContent = 'Tap to say hi 👋';
    setPoseState(pointerNearCharacter ? 'fight-idle' : 'idle');
  };

  const normalizeBoneName = (name) => name.replace(/^.*:/, '').replace(/^mixamorig/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const upperGarmentBones = new Set([
    'spine', 'spine1', 'spine2', 'spine3',
    'leftshoulder', 'rightshoulder', 'leftarm', 'rightarm', 'leftforearm', 'rightforearm',
  ]);
  const lowerGarmentBones = new Set(['hips', 'leftupleg', 'rightupleg', 'leftleg', 'rightleg']);
  const createClothingTexture = (sourceTexture, meshes) => {
    const sourceImage = sourceTexture.image;
    const width = sourceImage?.naturalWidth || sourceImage?.width;
    const height = sourceImage?.naturalHeight || sourceImage?.height;
    if (!width || !height) return null;

    const maskScale = Math.min(1, 2048 / Math.max(width, height));
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = Math.max(1, Math.round(width * maskScale));
    maskCanvas.height = Math.max(1, Math.round(height * maskScale));
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskContext) return null;
    maskContext.lineJoin = 'round';

    let drewGarment = false;
    meshes.forEach((mesh) => {
      const geometry = mesh.geometry;
      const skinIndices = geometry.getAttribute('skinIndex');
      const skinWeights = geometry.getAttribute('skinWeight');
      const uv = geometry.getAttribute('uv');
      const positions = geometry.getAttribute('position');
      if (!skinIndices || !skinWeights || !uv || !positions || !mesh.skeleton?.bones?.length) return;

      const vertexTypes = new Uint8Array(positions.count);
      const bounds = geometry.boundingBox || (geometry.computeBoundingBox(), geometry.boundingBox);
      const heightRange = Math.max(0.001, bounds.max.y - bounds.min.y);
      const shoeCutoff = bounds.min.y + heightRange * 0.075;
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        let upperWeight = 0;
        let lowerWeight = 0;
        for (let influence = 0; influence < skinIndices.itemSize; influence += 1) {
          const weight = skinWeights.getComponent(vertex, influence);
          if (weight <= 0) continue;
          const bone = mesh.skeleton.bones[skinIndices.getComponent(vertex, influence)];
          const boneName = bone ? normalizeBoneName(bone.name) : '';
          if (upperGarmentBones.has(boneName)) upperWeight += weight;
          if (lowerGarmentBones.has(boneName)) lowerWeight += weight;
        }
        if (positions.getY(vertex) <= shoeCutoff) lowerWeight = 0;
        if (upperWeight >= 0.16 && upperWeight > lowerWeight * 1.08) vertexTypes[vertex] = 1;
        else if (lowerWeight >= 0.16 && lowerWeight > upperWeight * 1.08) vertexTypes[vertex] = 2;
      }

      const index = geometry.index;
      const vertexAt = (offset) => index ? index.getX(offset) : offset;
      const elementCount = index ? index.count : positions.count;
      for (let offset = 0; offset + 2 < elementCount; offset += 3) {
        const a = vertexAt(offset);
        const b = vertexAt(offset + 1);
        const c = vertexAt(offset + 2);
        const aType = vertexTypes[a];
        const bType = vertexTypes[b];
        const cType = vertexTypes[c];
        const upperCount = Number(aType === 1) + Number(bType === 1) + Number(cType === 1);
        const lowerCount = Number(aType === 2) + Number(bType === 2) + Number(cType === 2);
        const region = upperCount >= 2 ? 1 : lowerCount >= 2 ? 2 : 0;
        if (!region) continue;

        maskContext.fillStyle = region === 1 ? '#ff0000' : '#0000ff';
        maskContext.beginPath();
        [a, b, c].forEach((vertex, corner) => {
          const x = uv.getX(vertex) * maskCanvas.width;
          const y = (1 - uv.getY(vertex)) * maskCanvas.height;
          if (corner === 0) maskContext.moveTo(x, y);
          else maskContext.lineTo(x, y);
        });
        maskContext.closePath();
        maskContext.fill();
        drewGarment = true;
      }
    });

    if (!drewGarment) return null;
    const mask = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = width;
    textureCanvas.height = height;
    const textureContext = textureCanvas.getContext('2d', { willReadFrequently: true });
    if (!textureContext) return null;
    textureContext.drawImage(sourceImage, 0, 0, width, height);
    const pixels = textureContext.getImageData(0, 0, width, height);
    const colors = { upper: [130, 151, 122], lower: [126, 153, 181] };
    for (let y = 0; y < height; y += 1) {
      const maskY = Math.min(maskCanvas.height - 1, Math.floor(y * maskCanvas.height / height));
      for (let x = 0; x < width; x += 1) {
        const maskX = Math.min(maskCanvas.width - 1, Math.floor(x * maskCanvas.width / width));
        const maskOffset = (maskY * maskCanvas.width + maskX) * 4;
        const garmentColor = mask.data[maskOffset] > mask.data[maskOffset + 2] ? colors.upper
          : mask.data[maskOffset + 2] > mask.data[maskOffset] ? colors.lower : null;
        if (!garmentColor) continue;

        const pixelOffset = (y * width + x) * 4;
        const red = pixels.data[pixelOffset];
        const green = pixels.data[pixelOffset + 1];
        const blue = pixels.data[pixelOffset + 2];
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (Math.max(red, green, blue) < 72 || chroma > 52) continue;

        const neutralFabric = 1 - THREE.MathUtils.smoothstep(chroma, 22, 52);
        for (let channel = 0; channel < 3; channel += 1) {
          const original = pixels.data[pixelOffset + channel];
          const tinted = original * garmentColor[channel] / 255;
          pixels.data[pixelOffset + channel] = Math.round(THREE.MathUtils.lerp(original, tinted, neutralFabric));
        }
      }
    }
    textureContext.putImageData(pixels, 0, 0);

    const clothingTexture = new THREE.CanvasTexture(textureCanvas);
    clothingTexture.colorSpace = sourceTexture.colorSpace;
    clothingTexture.flipY = sourceTexture.flipY;
    clothingTexture.wrapS = sourceTexture.wrapS;
    clothingTexture.wrapT = sourceTexture.wrapT;
    clothingTexture.magFilter = sourceTexture.magFilter;
    clothingTexture.minFilter = sourceTexture.minFilter;
    clothingTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    clothingTexture.needsUpdate = true;
    return clothingTexture;
  };

  const retargetClip = (clip, { keepIdleUpperBodyUpright = false } = {}) => {
    const retargeted = clip.clone();
    const keptTracks = [];
    const uprightBones = new Set(['hips', 'spine', 'spine1', 'spine2', 'spine3', 'neck', 'head']);
    retargeted.tracks.forEach((track) => {
      const dot = track.name.indexOf('.');
      if (dot < 0) {
        keptTracks.push(track);
        return;
      }
      const nodePath = track.name.slice(0, dot);
      const candidates = nodePath.split(/[|/]/).reverse();
      const isHips = candidates.some((candidate) => normalizeBoneName(candidate) === 'hips');
      const property = track.name.slice(dot + 1);
      const isUprightBone = candidates.some((candidate) => uprightBones.has(normalizeBoneName(candidate)));
      // Keep the character planted; source clips sometimes animate the whole rig upward.
      if (isHips && property.startsWith('position')) return;
      // Keep the idle portrait upright and facing the camera instead of inheriting a leaning pose.
      if (keepIdleUpperBodyUpright && isUprightBone && (property.startsWith('quaternion') || property.startsWith('rotation'))) return;
      const target = candidates.map((candidate) => bonesByName.get(normalizeBoneName(candidate))).find(Boolean);
      if (target) track.name = `${target.name}${track.name.slice(dot)}`;
      keptTracks.push(track);
    });
    retargeted.tracks = keptTracks;
    return retargeted;
  };

  const setPoseState = (nextState, resumeFromFightOverride = null, { snapTurn = false } = {}) => {
    if (nextState === poseState) {
      if (snapTurn && (nextState === 'walking-right' || nextState === 'walking-home')) {
        const facingYaw = nextState === 'walking-right' ? 0.72 : -0.72;
        walkYawFrom = facingYaw;
        walkYawTo = facingYaw;
        walkYawElapsed = walkYawDuration;
        modelTurn.rotation.y = facingYaw;
      }
      return;
    }
    const wasWalking = ['walking-right', 'walking-home'].includes(poseState);
    if (speechBubble) {
      let bubbleText = '';
      if (nextState === 'idle' && postFightIdleActive) {
        bubbleText = '...';
      } else if (nextState === 'fight-idle' || (nextState === 'idle' && activeClickResume)) {
        bubbleText = 'Whoa, easy there!';
      } else if (nextState === 'fighting') {
        bubbleText = "You can't catch me!";
      } else if (nextState === 'dancing') {
        bubbleText = '🎵🎶';
      } else if (['greeting', 'walking-right', 'walking-home'].includes(nextState)) {
        bubbleText = 'Hi, I’m Yvonne!';
      }
      speechBubble.textContent = bubbleText;
      speechBubble.hidden = !bubbleText;
    }
    let resumeFromFight = resumeFromFightOverride;
    if (nextState === 'fighting') {
      fightResume ||= {
        poseState,
        danceIndex,
        animationTime: poseState === 'dancing' ? activeDanceAction?.time : walkAction?.time,
      };
    } else if (poseState === 'fighting') {
      resumeFromFight = fightResume;
      fightResume = null;
    } else if (!resumeFromFight) {
      fightResume = null;
    }
    poseState = nextState;
    if (nextState === 'greeting') {
      idleAction?.fadeOut(0.25);
      fightIdleAction?.fadeOut(0.2);
      fightAction?.fadeOut(0.2);
      fightBAction?.fadeOut(0.2);
      walkAction?.fadeOut(0.2);
      danceActions.forEach((action) => action?.fadeOut(0.2));
      activeDanceAction = null;
      waveAction?.reset().fadeIn(0.25).play();
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    } else if (nextState === 'walking-right' || nextState === 'walking-home') {
      waveAction?.fadeOut(0.35);
      idleAction?.fadeOut(0.35);
      fightIdleAction?.fadeOut(0.25);
      fightAction?.fadeOut(0.25);
      fightBAction?.fadeOut(0.25);
      danceActions.forEach((action) => action?.fadeOut(0.25));
      activeDanceAction = null;
      if (wasWalking) walkAction?.fadeIn(0.12).play();
      else walkAction?.reset().fadeIn(0.35).play();
      if (resumeFromFight?.poseState === nextState && Number.isFinite(resumeFromFight.animationTime)) {
        walkAction.time = resumeFromFight.animationTime;
      }
      // The character faces the camera at yaw 0 (local +Z). In Three.js, a
      // positive Y rotation turns that forward direction toward screen-right;
      // use the matching sign so the walk pose faces the direction of travel.
      walkYawTo = nextState === 'walking-right' ? 0.72 : -0.72;
      if (snapTurn) {
        walkYawFrom = walkYawTo;
        walkYawElapsed = walkYawDuration;
        modelTurn.rotation.y = walkYawTo;
      } else {
        walkYawFrom = modelTurn.rotation.y;
        walkYawElapsed = 0;
      }
    } else if (nextState === 'dancing') {
      waveAction?.fadeOut(0.35);
      idleAction?.fadeOut(0.35);
      fightIdleAction?.fadeOut(0.25);
      fightAction?.fadeOut(0.25);
      fightBAction?.fadeOut(0.25);
      walkAction?.fadeOut(0.35);
      danceActions.forEach((action) => action?.stop());
      danceIndex = resumeFromFight?.poseState === 'dancing' ? resumeFromFight.danceIndex : 0;
      activeDanceAction = danceActions[danceIndex];
      activeDanceAction?.reset().fadeIn(0.35).play();
      if (resumeFromFight?.poseState === 'dancing' && Number.isFinite(resumeFromFight.animationTime)) {
        activeDanceAction.time = resumeFromFight.animationTime;
      }
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    } else if (nextState === 'fight-idle') {
      idleAction?.fadeOut(0.25);
      waveAction?.fadeOut(0.2);
      walkAction?.fadeOut(0.2);
      fightAction?.fadeOut(0.15);
      fightBAction?.fadeOut(0.15);
      danceActions.forEach((action) => action?.fadeOut(0.2));
      activeDanceAction = null;
      fightIdleAction?.reset().fadeIn(0.25).play();
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    } else if (nextState === 'fighting') {
      idleAction?.fadeOut(0.12);
      fightIdleAction?.fadeOut(0.12);
      waveAction?.fadeOut(0.12);
      walkAction?.fadeOut(0.12);
      fightBAction?.fadeOut(0.12);
      danceActions.forEach((action) => action?.fadeOut(0.12));
      activeDanceAction = null;
      fightActionPlaying = true;
      activeFightAction = fightAction;
      fightAction?.reset().fadeIn(0.12).play();
    } else {
      waveAction?.fadeOut(0.3);
      fightIdleAction?.fadeOut(0.3);
      fightAction?.fadeOut(0.2);
      fightBAction?.fadeOut(0.2);
      walkAction?.fadeOut(0.3);
      danceActions.forEach((action) => action?.fadeOut(0.3));
      activeDanceAction = null;
      idleAction?.reset().fadeIn(0.3).play();
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    }
  };

  const setFightBubbleCase = (isSecondFight) => {
    if (!speechBubble) return;
    speechBubble.textContent = isSecondFight ? 'Too slow!' : "You can't catch me!";
    speechBubble.hidden = false;
  };

  document.body.addEventListener('character-walk-direction-change', (event) => {
    if (!['walking-right', 'walking-home'].includes(poseState)) return;
    setPoseState(event.detail.direction === 'left' ? 'walking-home' : 'walking-right', null, { snapTurn: true });
  });

  const getRequestedPose = () => {
    if (!active) return pointerNearCharacter ? 'fight-idle' : 'idle';
    if (document.body.classList.contains('character-dancing')) return 'dancing';
    if (document.body.classList.contains('character-walking')) {
      return document.body.classList.contains('character-returning') ? 'walking-home' : 'walking-right';
    }
    if (document.body.classList.contains('character-greeting')) return 'greeting';
    return 'idle';
  };

  const captureMovingPose = () => ({
    poseState,
    danceIndex,
    animationTime: poseState === 'dancing' ? activeDanceAction?.time : walkAction?.time,
  });
  const signalTrack = (state) => {
    characterButton.dispatchEvent(new Event(`character-track-${state}`));
  };

  const scheduleClickIdleResume = () => {
    window.clearTimeout(activeClickHoldTimer);
    activeClickHoldTimer = window.setTimeout(() => {
      activeClickHoldTimer = null;
      if (!active || poseState !== 'fight-idle' || !activeClickResume || pendingFightAction) return;

      const resume = activeClickResume;
      activeClickResume = null;
      activeClickCount = 0;
      activeClickTransitionFinished = false;
      activeClickRestartedAfterFight = false;
      postFightResume = resume;
      postFightIdleActive = true;
      setPoseState('idle');

      window.clearTimeout(postFightIdleTimer);
      postFightIdleTimer = window.setTimeout(() => {
        postFightIdleTimer = null;
        postFightIdleActive = false;
        if (poseState !== 'idle') return;
        const idleResume = postFightResume;
        postFightResume = null;
        setPoseState(getRequestedPose(), idleResume);
        signalTrack('resume');
      }, fightIdleEllipsisDuration);
    }, fightIdleHoldDuration);
  };

  const beginFistFight = () => {
    if (!active || !activeClickResume || !pendingFightAction) return;
    window.clearTimeout(activeClickHoldTimer);
    window.clearTimeout(activeClickTransitionTimer);
    window.clearTimeout(activeFightStartTimer);
    activeClickHoldTimer = null;
    activeClickTransitionTimer = null;
    activeFightStartTimer = null;
    fightResume = activeClickResume;
    activeClickResume = null;
    activeClickCount = 0;
    activeClickTransitionFinished = false;
    activeClickRestartedAfterFight = false;
    pendingFightAction = false;
    queueNextFightRequested = false;
    setPoseState('fighting');
  };

  const scheduleFistFight = (immediate = false) => {
    if (immediate) {
      beginFistFight();
      return;
    }
    if (poseState === 'fight-idle') setPoseState('idle');
    window.clearTimeout(activeFightStartTimer);
    activeFightStartTimer = window.setTimeout(() => {
      activeFightStartTimer = null;
      if (!active || poseState !== 'idle' || !activeClickResume || !pendingFightAction) return;
      beginFistFight();
    }, idleBeforeFistFightDuration);
  };

  const updatePointerProximity = (clientX, clientY) => {
    lastPointerPosition = { x: clientX, y: clientY };
    if (active) return;
    const rect = characterButton.getBoundingClientRect();
    const distanceX = Math.max(rect.left - clientX, 0, clientX - rect.right);
    const distanceY = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
    const isNear = Math.hypot(distanceX, distanceY) <= 28;
    if (isNear === pointerNearCharacter) return;
    pointerNearCharacter = isNear;
    if (ready) setPoseState(isNear ? 'fight-idle' : 'idle');
  };

  window.addEventListener('pointermove', (event) => {
    updatePointerProximity(event.clientX, event.clientY);
  });
  window.addEventListener('pointerleave', () => {
    lastPointerPosition = null;
    if (!pointerNearCharacter) return;
    pointerNearCharacter = false;
    if (!active && ready) setPoseState('idle');
  });

  document.addEventListener('pointerdown', (event) => {
    if (!active || !ready || !fightAction) return;
    const clickedDuringFight = fightActionPlaying && poseState === 'fighting';
    const isMoving = ['walking-right', 'walking-home', 'dancing'].includes(poseState);
    const restartingAfterFight = postFightIdleActive && poseState === 'idle';
    const canCountAnotherTap = activeClickResume && ['idle', 'fight-idle'].includes(poseState);
    if (!clickedDuringFight && !isMoving && !canCountAnotherTap && !restartingAfterFight) return;
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, summary, [role="button"], [contenteditable="true"]')) return;

    const rect = canvasHost.getBoundingClientRect();
    if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;

    characterPointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    characterModel?.updateMatrixWorld(true);
    characterRaycaster.setFromCamera(characterPointer, camera);
    if (!characterModel || characterRaycaster.intersectObject(characterModel, true).length === 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (clickedDuringFight) {
      // Queue the next fight action and let the current one finish cleanly.
      queueNextFightRequested = true;
      return;
    }

    if (restartingAfterFight) {
      window.clearTimeout(postFightIdleTimer);
      postFightIdleTimer = null;
      postFightIdleActive = false;
      activeClickResume = postFightResume || {
        poseState: getRequestedPose(),
        danceIndex,
        animationTime: poseState === 'dancing' ? activeDanceAction?.time : walkAction?.time,
      };
      postFightResume = null;
      activeClickCount = 1;
      activeClickTransitionFinished = false;
      activeClickRestartedAfterFight = true;
      pendingFightAction = false;
      window.clearTimeout(activeClickTransitionTimer);
      activeClickTransitionTimer = window.setTimeout(() => {
        activeClickTransitionTimer = null;
        if (active && activeClickResume && poseState === 'idle') setPoseState('fight-idle');
      }, idleBeforeFightIdleDuration);
      return;
    }

    if (isMoving) {
      signalTrack('pause');
      activeClickResume = captureMovingPose();
      activeClickCount = 1;
      activeClickTransitionFinished = false;
      activeClickRestartedAfterFight = false;
      pendingFightAction = false;
      setPoseState('idle');
      window.clearTimeout(activeClickTransitionTimer);
      activeClickTransitionTimer = window.setTimeout(() => {
        activeClickTransitionTimer = null;
        if (active && activeClickResume && poseState === 'idle') setPoseState('fight-idle');
      }, idleBeforeFightIdleDuration);
      return;
    }

    if (poseState === 'fight-idle' && activeClickResume) {
      pendingFightAction = true;
      activeClickCount = fightClickThreshold;
      scheduleFistFight(true);
      return;
    }

    if (activeClickRestartedAfterFight && poseState === 'idle' && activeClickResume) {
      pendingFightAction = true;
      activeClickCount = fightClickThreshold;
      return;
    }

    if (pendingFightAction) return;
    activeClickCount += 1;
    if (activeClickCount >= fightClickThreshold) {
      window.clearTimeout(activeClickHoldTimer);
      activeClickHoldTimer = null;
      pendingFightAction = true;
      if (activeClickTransitionFinished) scheduleFistFight();
      return;
    }
    if (activeClickTransitionFinished) scheduleClickIdleResume();
  }, true);

  const resize = () => {
    const width = Math.max(canvasHost.clientWidth, 1);
    const height = Math.max(canvasHost.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const fitCamera = () => {
    camera.fov = active ? 42 : 46;
    let framingSize = fullFramingSize;
    let framingCenter = fullFramingCenter;
    if (!active) {
      characterRoot.updateMatrixWorld(true);
      const headPosition = headBone?.getWorldPosition(new THREE.Vector3());
      const hipsPosition = hipsBone?.getWorldPosition(new THREE.Vector3());
      const fallbackBottom = fullFramingCenter.y - fullFramingSize.y / 2 + fullFramingSize.y * 0.52;
      const lower = hipsPosition ? hipsPosition.y + fullFramingSize.y * 0.02 : fallbackBottom;
      const upper = headPosition ? headPosition.y + fullFramingSize.y * 0.24 : fullFramingCenter.y + fullFramingSize.y * 0.5;
      const height = Math.max((upper - lower) * 1.28, fullFramingSize.y * 0.52);
      framingSize = new THREE.Vector3(fullFramingSize.x * 0.7, height, fullFramingSize.z);
      framingCenter = new THREE.Vector3(
        headPosition && hipsPosition ? (headPosition.x + hipsPosition.x) / 2 : fullFramingCenter.x,
        (upper + lower) / 2,
        fullFramingCenter.z,
      );
    }
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(canvasHost.clientWidth / Math.max(canvasHost.clientHeight, 1), 0.1);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const verticalDistance = framingSize.y / (2 * Math.tan(verticalFov / 2));
    const horizontalDistance = framingSize.x / (2 * Math.tan(horizontalFov / 2));
    // Keep extended dance poses inside the profile card's clipped animation area.
    const framingMargin = active ? 1.28 : 1.12;
    if (active) {
      // Anchor the character's feet to the bottom edge of the card's stage.
      framingCenter = new THREE.Vector3(
        fullFramingCenter.x,
        fullFramingCenter.y + (fullFramingSize.y * (framingMargin - 1)) / 2,
        fullFramingCenter.z,
      );
    }
    const distance = Math.max(verticalDistance, horizontalDistance) * framingMargin;
    camera.position.set(framingCenter.x, framingCenter.y, framingCenter.z + distance);
    camera.lookAt(framingCenter);
    camera.updateProjectionMatrix();
  };
  const positionSpeechBubble = () => {
    if (!speechBubble || !headBone || !active) return;
    const width = canvasHost.clientWidth;
    const height = canvasHost.clientHeight;
    if (!width || !height) return;

    headBone.getWorldPosition(speechAnchor);
    speechAnchor.y += fullFramingSize.y * 0.24;
    camera.updateMatrixWorld();
    speechCameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    speechSideAnchor.copy(speechAnchor).addScaledVector(speechCameraRight, fullFramingSize.x * 0.2);
    speechAnchor.project(camera);
    speechSideAnchor.project(camera);
    const headX = ((speechAnchor.x + 1) / 2) * width;
    const headTopY = ((1 - speechAnchor.y) / 2) * height;
    const headRightX = ((speechSideAnchor.x + 1) / 2) * width;
    const headLeftX = headX - (headRightX - headX);
    const bubbleWidth = speechBubble.offsetWidth;
    const bubbleHeight = speechBubble.offsetHeight;
    const stageRect = characterButton.getBoundingClientRect();
    const stageScaleX = stageRect.width / Math.max(characterButton.offsetWidth, 1);
    const stageScaleY = stageRect.height / Math.max(characterButton.offsetHeight, 1);
    const clipRect = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const contactRect = sidebarButton?.getBoundingClientRect();
    const gap = 12;
    const candidates = [
      { left: headRightX + gap, top: headTopY - bubbleHeight - gap },
      { left: headLeftX - bubbleWidth - gap, top: headTopY - bubbleHeight - gap },
      { left: headX - bubbleWidth / 2, top: headTopY - bubbleHeight - gap },
    ];

    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate, index) => {
      const globalLeft = stageRect.left + candidate.left * stageScaleX;
      const globalTop = stageRect.top + candidate.top * stageScaleY;
      const globalRight = globalLeft + bubbleWidth;
      const globalBottom = globalTop + bubbleHeight;
      const overlapsContact = contactRect
        && globalLeft < contactRect.right && globalRight > contactRect.left
        && globalTop < contactRect.bottom && globalBottom > contactRect.top;
      const overflow = Math.max(clipRect.left - globalLeft, 0)
        + Math.max(globalRight - clipRect.right, 0)
        + Math.max(clipRect.top - globalTop, 0)
        + Math.max(globalBottom - clipRect.bottom, 0);
      const score = (overlapsContact ? 100000 : 0) + overflow * 100 + index;
      if (score < bestScore) {
        best = { left: globalLeft, top: globalTop };
        bestScore = score;
      }
    });

    speechBubble.style.left = `${best.left}px`;
    speechBubble.style.top = `${best.top}px`;
    speechBubble.style.transform = 'none';
  };
  const positionHintBubble = () => {
    if (!hint || active) return;
    const stageRect = characterButton.getBoundingClientRect();
    hint.style.left = `${stageRect.left + stageRect.width / 2}px`;
    hint.style.top = `${stageRect.top - 36}px`;
  };
  resizeObserver = new ResizeObserver(() => {
    resize();
    fitCamera();
  });
  resizeObserver.observe(canvasHost);
  resize();
  fitCamera();

  const loader = new FBXLoader();
  const textureLoader = new THREE.TextureLoader();
  loader.load(
    './assets/models/yvonne-rigged-waving.fbx',
    (model) => {
      characterModel = model;
      modelTurn.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 1.72 / Math.max(size.y, 0.001);
      model.scale.setScalar(scale);
      const scaledBounds = new THREE.Box3().setFromObject(model);
      model.position.x -= (scaledBounds.min.x + scaledBounds.max.x) / 2;
      model.position.y -= scaledBounds.min.y;
      model.position.z -= (scaledBounds.min.z + scaledBounds.max.z) / 2;
      const finalBounds = new THREE.Box3().setFromObject(model);
      fullFramingSize = finalBounds.getSize(new THREE.Vector3());
      fullFramingCenter = finalBounds.getCenter(new THREE.Vector3());

      // Use the actual rig joints to crop the idle portrait around the face and torso.
      model.traverse((object) => {
        if (object.isSkinnedMesh) object.frustumCulled = false;
        if (!object.isBone) return;
        const name = normalizeBoneName(object.name);
        bonesByName.set(name, object);
        if (name.endsWith('head')) headBone = object;
        if (name.endsWith('hips')) hipsBone = object;
      });
      fitCamera();

      textureLoader.load('./assets/models/yvonne-character-texture.webp', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        // This atlas shares the OBJ's UVs, which use the standard image orientation.
        texture.flipY = true;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const skinnedMeshes = [];
        model.traverse((object) => {
          if (object.isSkinnedMesh) skinnedMeshes.push(object);
        });
        const clothingTexture = createClothingTexture(texture, skinnedMeshes) || texture;
        model.traverse((object) => {
          if (!object.isMesh) return;
          const applyTexture = (sourceMaterial) => {
            const material = sourceMaterial.clone();
            material.map = clothingTexture;
            material.color.set(0xffffff);
            material.needsUpdate = true;
            return material;
          };
          if (Array.isArray(object.material)) object.material = object.material.map(applyTexture);
          else if (object.material) object.material = applyTexture(object.material);
        });
      if (clothingTexture !== texture) texture.dispose();
      });

      if (model.animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        mixer.addEventListener('finished', (event) => {
          if (event.action === waveAction && poseState === 'greeting') {
            characterButton.dispatchEvent(new Event('character-wave-finished'));
            return;
          }

          if (event.action === fightIdleAction && activeClickResume && poseState === 'fight-idle') {
            activeClickTransitionFinished = true;
            if (pendingFightAction) scheduleFistFight();
            else scheduleClickIdleResume();
            return;
          }

          if (event.action === activeFightAction && fightActionPlaying) {
            fightActionPlaying = false;
            if (poseState === 'fighting') {
              if (queueNextFightRequested) {
                queueNextFightRequested = false;
                event.action.fadeOut(0.12);
                activeFightAction = fightBAction || fightAction;
                setFightBubbleCase(true);
                fightActionPlaying = true;
                activeFightAction.reset().fadeIn(0.12).play();
                return;
              }
              activeFightAction = null;
              postFightResume = fightResume;
              fightResume = null;
              postFightIdleActive = true;
              activeClickRestartedAfterFight = false;
              setPoseState('idle');
              window.clearTimeout(postFightIdleTimer);
              postFightIdleTimer = window.setTimeout(() => {
                postFightIdleTimer = null;
                postFightIdleActive = false;
                if (poseState !== 'idle') return;
                const resume = postFightResume;
                postFightResume = null;
                setPoseState(getRequestedPose(), resume);
                signalTrack('resume');
              }, idleAfterFistFightDuration);
            }
            return;
          }

          const finishedIndex = danceActions.indexOf(event.action);
          if (finishedIndex < 0 || event.action !== activeDanceAction || poseState !== 'dancing') return;

          event.action.fadeOut(0.25);
          danceIndex = finishedIndex + 1;
          if (danceIndex < danceActions.length) {
            activeDanceAction = danceActions[danceIndex];
            activeDanceAction.reset().fadeIn(0.25).play();
            return;
          }

          activeDanceAction = null;
          characterButton.dispatchEvent(new Event('character-dance-finished'));
        });
        const waveClip = model.animations.find((clip) => /wave[_\s-]*one[_\s-]*hand/i.test(clip.name))
          || model.animations.find((clip) => /wave/i.test(clip.name))
          // Meshy's @Waving export stores its single Mixamo action as "mixamo.com".
          || (model.animations.length === 1 ? model.animations[0] : null);
        if (waveClip) {
          waveAction = mixer.clipAction(retargetClip(waveClip));
          waveAction.setLoop(THREE.LoopOnce, 1);
          waveAction.clampWhenFinished = true;
        }
      }

      // Load each separate FBX as an animation source for this one character rig.
      loader.load('./assets/models/yvonne-rigged-listening-to-music.fbx', (idleModel) => {
        const idleClip = idleModel.animations?.length === 1 ? idleModel.animations[0] : null;
        if (idleClip && mixer) {
          idleAction = mixer.clipAction(retargetClip(idleClip, { keepIdleUpperBodyUpright: true }));
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          if (!active) idleAction.play();
          mixer.update(0.01);
          fitCamera();
        }
        idleReady = true;
        updateReadyState();
      }, undefined, () => {
        idleReady = true;
        updateReadyState();
      });

      loader.load('./assets/models/yvonne-rigged-standing-idle-to-fight-idle.fbx', (fightIdleModel) => {
        const fightIdleClip = fightIdleModel.animations?.[0];
        if (fightIdleClip && mixer) {
          fightIdleAction = mixer.clipAction(retargetClip(fightIdleClip));
          fightIdleAction.setLoop(THREE.LoopOnce, 1);
          fightIdleAction.clampWhenFinished = true;
        }
        fightIdleReady = true;
        updateReadyState();
      }, undefined, () => {
        fightIdleReady = true;
        updateReadyState();
      });

      loader.load('./assets/models/yvonne-rigged-fist-fight-a.fbx', (fightModel) => {
        const fightClip = fightModel.animations?.[0];
        if (fightClip && mixer) {
          fightAction = mixer.clipAction(retargetClip(fightClip));
          fightAction.setLoop(THREE.LoopOnce, 1);
          fightAction.clampWhenFinished = true;
        }
        if (fightBReady && !fightBAction) fightBAction = fightAction;
        fightReady = true;
        updateReadyState();
      }, undefined, () => {
        fightReady = true;
        updateReadyState();
      });

      loader.load('./assets/models/yvonne-rigged-fist-fight-b.fbx', (fightBModel) => {
        const fightBClip = fightBModel.animations?.[0];
        if (fightBClip && mixer) {
          fightBAction = mixer.clipAction(retargetClip(fightBClip));
          fightBAction.setLoop(THREE.LoopOnce, 1);
          fightBAction.clampWhenFinished = true;
        }
        if (!fightBAction) fightBAction = fightAction;
        fightBReady = true;
        updateReadyState();
      }, undefined, () => {
        fightBAction = fightAction;
        fightBReady = true;
        updateReadyState();
      });

      loader.load('./assets/models/yvonne-rigged-walking.fbx', (walkingModel) => {
        const walkingClip = walkingModel.animations?.[0];
        if (walkingClip && mixer) {
          walkAction = mixer.clipAction(retargetClip(walkingClip));
          walkAction.setLoop(THREE.LoopRepeat, Infinity);
        }
        walkingReady = true;
        updateReadyState();
      }, undefined, () => {
        walkingReady = true;
        updateReadyState();
      });

      danceSourcePaths.forEach((path, index) => {
        loader.load(path, (danceModel) => {
          const danceClip = danceModel.animations?.[0];
          if (danceClip && mixer) {
            const action = mixer.clipAction(retargetClip(danceClip));
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            danceActions[index] = action;
          }
          danceSourcesLoaded += 1;
          updateReadyState();
        }, undefined, () => {
          danceSourcesLoaded += 1;
          updateReadyState();
        });
      });

      modelReady = true;
      updateReadyState();
    },
    undefined,
    () => {
      characterButton.classList.add('character-load-error');
      if (hint) hint.textContent = '3D character could not load';
    },
  );

  const observer = new MutationObserver(() => {
    const nextActive = document.body.classList.contains('character-awake');
    if (nextActive !== active) {
      active = nextActive;
      characterRoot.position.y = 0;
      if (!active) modelTurn.rotation.set(0, 0, 0);
      fitCamera();
    }

    if (fightActionPlaying || postFightIdleTimer !== null) return;

    if (!active) {
      window.clearTimeout(activeClickHoldTimer);
      activeClickHoldTimer = null;
      window.clearTimeout(activeClickTransitionTimer);
      activeClickTransitionTimer = null;
      window.clearTimeout(activeFightStartTimer);
      activeFightStartTimer = null;
      activeClickResume = null;
      activeClickCount = 0;
      activeClickTransitionFinished = false;
      activeClickRestartedAfterFight = false;
      pendingFightAction = false;
      if (lastPointerPosition) {
        updatePointerProximity(lastPointerPosition.x, lastPointerPosition.y);
      } else {
        pointerNearCharacter = false;
      }
      waveAction?.stop();
      walkAction?.stop();
      danceActions.forEach((action) => action?.stop());
      activeDanceAction = null;
      setPoseState(pointerNearCharacter ? 'fight-idle' : 'idle');
      return;
    }

    if (activeClickResume) return;

    if (document.body.classList.contains('character-dancing')) setPoseState('dancing');
    else if (document.body.classList.contains('character-walking')) {
      setPoseState(document.body.classList.contains('character-returning') ? 'walking-home' : 'walking-right');
    } else if (document.body.classList.contains('character-greeting')) setPoseState('greeting');
    else setPoseState('idle');
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(delta);

    if (active) {
      elapsedSinceWake += delta;
      characterRoot.position.y = 0;
      if (walkYawElapsed < walkYawDuration) {
        walkYawElapsed = Math.min(walkYawElapsed + delta, walkYawDuration);
        const progress = walkYawElapsed / walkYawDuration;
        const eased = progress * progress * (3 - 2 * progress);
        modelTurn.rotation.y = walkYawFrom + (walkYawTo - walkYawFrom) * eased;
      }
      positionSpeechBubble();
    } else {
      positionHintBubble();
    }
    renderer.render(scene, camera);
  });
}
