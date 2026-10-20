import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { animationLibrary } from './animation-library.js?v=20261020-boxing-kicking-1';

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
  let fightReturnAction = null;
  let fightRecoveryIdleAction = null;
  let fightAction = null;
  let fightBAction = null;
  let backFlipAction = null;
  let boxingAction = null;
  let kickingAction = null;
  let activeFightAction = null;
  let waveAction = null;
  let hoverWaveAction = null;
  let walkAction = null;
  let leftTurnAction = null;
  let rightTurnAction = null;
  let leftTurnToFrontAction = null;
  let rightTurnToFrontAction = null;
  const animationPath = (id) => animationLibrary.find((animation) => animation.id === id)?.path;
  const danceSourcePaths = [
    'northern-soul-floor-combo',
    'swing-dancing',
    'house-dancing',
    'jazz-dancing-1',
    'arms-hip-hop-dance',
    'macarena-dance',
    'robot-hip-hop-dance',
    'twist-dance',
    'wave-hip-hop-dance',
    'samba-dancing',
    'northern-soul-spin-combo',
    'ymca-dance',
  ].map(animationPath);
  const characterAnimationPaths = {
    waving: animationPath('waving'),
    idle: animationPath('listening-to-music'),
    fightIdle: animationPath('standing-idle-to-fight-idle'),
    fightReturn: animationPath('fight-idle-to-standing-idle'),
    fightRecoveryIdle: animationPath('idle'),
    fistFightA: animationPath('fist-fight-a'),
    fistFightB: animationPath('fist-fight-b'),
    backFlip: animationPath('back-flip-to-uppercut'),
    boxing: animationPath('boxing'),
    kicking: animationPath('kicking'),
    walking: animationPath('walking'),
    leftTurn: animationPath('left-turn-90'),
    rightTurn: animationPath('right-turn-90'),
  };
  const danceActions = new Array(danceSourcePaths.length).fill(null);
  const createDanceOrder = () => {
    const middleOrder = danceActions
      .map((_, index) => index)
      .filter((index) => index !== danceActions.length - 1);
    for (let index = middleOrder.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [middleOrder[index], middleOrder[swapIndex]] = [middleOrder[swapIndex], middleOrder[index]];
    }
    const ymcaPosition = Math.floor(Math.random() * (middleOrder.length + 1));
    middleOrder.splice(ymcaPosition, 0, danceActions.length - 1, danceActions.length - 1, danceActions.length - 1);
    return middleOrder;
  };
  let danceOrder = createDanceOrder();
  const clickReactionNames = ['whoa', 'fist-a', 'backflip', 'fist-b', 'boxing', 'kicking'];
  const clickReactionOrder = [...clickReactionNames];
  const clickReactionSpeech = {
    whoa: 'Whoa, easy there!',
    'fist-a': 'Too slow!',
    backflip: 'Surprise!',
    'fist-b': 'Take that!',
    boxing: 'No hard feelings!',
    kicking: 'Watch your toes!',
  };
  let clickReactionIndex = 0;
  let activeDanceAction = null;
  let danceIndex = 0;
  let fightResume = null;
  let fightTurnPending = null;
  let fightReturnTurnPending = null;
  let postFightResume = null;
  let postFightIdleTimer = null;
  let postFightIdleActive = false;
  const pendingClickReactions = [];
  let activeClickResume = null;
  let activeClickHoldTimer = null;
  let poseState = 'idle';
  let walkYawFrom = 0;
  let walkYawTo = 0;
  let walkYawElapsed = 0;
  let walkTurnPending = false;
  const walkYawDuration = 0.55;
  const getWalkFacingYaw = (state) => (state === 'walking-right' ? 1 : -1) * Math.PI / 2;
  const fightIdleHoldDuration = 1200;
  const fightIdleEllipsisDuration = 1200;
  const idleAfterFistFightDuration = 2200;
  let postFightIdleDuration = idleAfterFistFightDuration;
  let modelReady = false;
  let textureReady = false;
  let idleReady = false;
  let waveReady = false;
  let walkingReady = false;
  let fightIdleReady = false;
  let fightReady = false;
  let fightBReady = false;
  let fightReturnReady = false;
  let fightRecoveryIdleReady = false;
  let backFlipReady = false;
  let boxingReady = false;
  let kickingReady = false;
  let turnSourcesLoaded = 0;
  let danceSourcesLoaded = 0;
  const bonesByName = new Map();
  let headBone = null;
  let hipsBone = null;
  let active = false;
  let ready = false;
  let fightActionPlaying = false;
  let pointerNearCharacter = false;
  let lastPointerPosition = null;
  let elapsedSinceWake = 0;
  let resizeObserver;
  let fullFramingSize = new THREE.Vector3(0.8, 1.72, 0.6);
  let fullFramingCenter = new THREE.Vector3(0, 0.86, 0);

  characterButton.disabled = true;
  const updateReadyState = () => {
    if (!modelReady || !textureReady || !idleReady || !waveReady || !walkingReady || !fightIdleReady || !fightReady || !fightBReady || !fightReturnReady || !fightRecoveryIdleReady || !backFlipReady || !boxingReady || !kickingReady || turnSourcesLoaded < 2 || danceSourcesLoaded < danceSourcePaths.length) return;
    if (!idleAction || !waveAction || !hoverWaveAction || !fightIdleAction || !fightReturnAction || !fightRecoveryIdleAction || !fightAction || !fightBAction || !backFlipAction || !boxingAction || !kickingAction || !walkAction || !leftTurnAction || !rightTurnAction || !leftTurnToFrontAction || !rightTurnToFrontAction || danceActions.some((action) => !action)) {
      if (hint) hint.textContent = 'Animation files could not load';
      return;
    }
    ready = true;
    characterButton.disabled = false;
    characterButton.classList.add('character-ready');
    if (hint) hint.textContent = 'Tap to say hi 👋';
    setPoseState(pointerNearCharacter ? 'hover-wave' : 'idle');
  };

  const normalizeBoneName = (name) => name.replace(/^.*:/, '').replace(/^mixamorig/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
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

  const reverseClip = (clip) => {
    const duration = clip.duration;
    const tracks = clip.tracks.map((track) => {
      const valueSize = track.getValueSize();
      const keyCount = track.times.length;
      const reversedTrack = track.clone();
      reversedTrack.times = new Float32Array(
        Array.from(track.times).reverse().map((time) => duration - time),
      );
      const reversedValues = [];
      for (let keyIndex = keyCount - 1; keyIndex >= 0; keyIndex -= 1) {
        const offset = keyIndex * valueSize;
        for (let valueIndex = 0; valueIndex < valueSize; valueIndex += 1) {
          reversedValues.push(track.values[offset + valueIndex]);
        }
      }
      reversedTrack.values = new Float32Array(reversedValues);
      return reversedTrack;
    });
    return new THREE.AnimationClip(`${clip.name}-reverse`, duration, tracks);
  };

  const createSeamlessLoopClip = (sourceClip) => {
    const clip = sourceClip.clone();
    clip.resetDuration();
    const duration = clip.duration;
    if (!(duration > 0) || !clip.tracks.length) return clip;

    // Pick matching points from the active middle of the wave. Fixed crop
    // percentages can join opposite hand positions and make each repeat pop.
    const sampleCount = 96;
    const sampleTimes = Array.from({ length: sampleCount + 1 }, (_, index) => duration * index / sampleCount);
    const sampledTracks = clip.tracks.filter((track) => track.times.length).map((track) => {
      const interpolant = track.createInterpolant();
      return {
        track,
        valueSize: track.getValueSize(),
        isQuaternion: track.name.endsWith('.quaternion') && track.getValueSize() === 4,
        values: sampleTimes.map((time) => Array.from(interpolant.evaluate(time))),
      };
    });
    if (!sampledTracks.length) return clip;
    const matchTracks = sampledTracks;
    const poseError = (sampledTrack, firstIndex, secondIndex) => {
      const first = sampledTrack.values[firstIndex];
      const second = sampledTrack.values[secondIndex];
      if (sampledTrack.isQuaternion) {
        const firstLength = Math.hypot(...first) || 1;
        const secondLength = Math.hypot(...second) || 1;
        const dot = Math.abs(first.reduce((sum, value, index) => sum + value * second[index], 0) / (firstLength * secondLength));
        return 1 - Math.min(1, dot);
      }
      const difference = Math.hypot(...first.map((value, index) => value - second[index]));
      return Math.min(1, difference / Math.max(0.05, Math.hypot(...first), Math.hypot(...second)));
    };
    const velocityError = (sampledTrack, firstIndex, secondIndex) => {
      const beforeOffset = Math.max(0, firstIndex - 1);
      const afterOffset = Math.min(sampleCount, firstIndex + 1);
      const firstBefore = sampledTrack.values[beforeOffset];
      const firstAfter = sampledTrack.values[afterOffset];
      const secondBefore = sampledTrack.values[Math.max(0, secondIndex - 1)];
      const secondAfter = sampledTrack.values[Math.min(sampleCount, secondIndex + 1)];
      const firstBeforeAligned = sampledTrack.isQuaternion
        && firstBefore.reduce((sum, value, index) => sum + value * firstAfter[index], 0) < 0
        ? firstBefore.map((value) => -value)
        : firstBefore;
      const firstVelocity = firstAfter.map((value, index) => (value - firstBeforeAligned[index]) / (sampleTimes[afterOffset] - sampleTimes[beforeOffset]));
      const secondBeforeAligned = sampledTrack.isQuaternion
        && secondBefore.reduce((sum, value, index) => sum + value * secondAfter[index], 0) < 0
        ? secondBefore.map((value) => -value)
        : secondBefore;
      const secondVelocity = secondAfter.map((value, index) => (value - secondBeforeAligned[index]) / (sampleTimes[Math.min(sampleCount, secondIndex + 1)] - sampleTimes[Math.max(0, secondIndex - 1)]));
      const difference = Math.hypot(...firstVelocity.map((value, index) => value - secondVelocity[index]));
      return Math.min(1, difference / Math.max(0.05, Math.hypot(...firstVelocity), Math.hypot(...secondVelocity)));
    };

    const firstCandidate = Math.ceil(sampleCount * 0.18);
    const lastCandidate = Math.floor(sampleCount * 0.82);
    const minimumCycle = duration * 0.12;
    const maximumCycle = duration * 0.5;
    const preferredCycle = duration * 0.3;
    let loopStartIndex = firstCandidate;
    let loopEndIndex = lastCandidate;
    let bestScore = Infinity;
    for (let startIndex = firstCandidate; startIndex < lastCandidate; startIndex += 1) {
      for (let endIndex = startIndex + 1; endIndex <= lastCandidate; endIndex += 1) {
        const cycleDuration = sampleTimes[endIndex] - sampleTimes[startIndex];
        if (cycleDuration < minimumCycle || cycleDuration > maximumCycle) continue;
        let totalWeight = 0;
        let poseScore = 0;
        let motionScore = 0;
        matchTracks.forEach((sampledTrack) => {
          const weight = /shoulder|arm|forearm|wrist|hand|finger|thumb/i.test(sampledTrack.track.name) ? 1 : 0.1;
          poseScore += poseError(sampledTrack, startIndex, endIndex) * weight;
          motionScore += velocityError(sampledTrack, startIndex, endIndex) * weight;
          totalWeight += weight;
        });
        const periodPenalty = Math.abs(cycleDuration - preferredCycle) / duration;
        const score = poseScore / totalWeight + (motionScore / totalWeight) * 0.3 + periodPenalty * 0.015;
        if (score < bestScore) {
          bestScore = score;
          loopStartIndex = startIndex;
          loopEndIndex = endIndex;
        }
      }
    }

    const loopStart = sampleTimes[loopStartIndex];
    const loopEnd = sampleTimes[loopEndIndex];
    const loopDuration = loopEnd - loopStart;
    const seamDuration = Math.min(0.08, loopDuration * 0.06);
    const seamStart = loopEnd - seamDuration;
    const seamStartInLoop = seamStart - loopStart;
    const segments = 6;
    const tracks = sampledTracks.map(({ track }) => {
      if (!track.times.length) return track;

      const valueSize = track.getValueSize();
      const interpolant = track.createInterpolant();
      const isQuaternion = track.name.endsWith('.quaternion') && valueSize === 4;
      const sample = (time) => Array.from(interpolant.evaluate(time));
      const startPose = sample(loopStart);
      let seamPose = sample(seamStart);
      const estimateVelocity = (time) => {
        const epsilon = Math.min(0.01, seamDuration * 0.08);
        const beforeTime = Math.max(0, time - epsilon);
        const afterTime = Math.min(duration, time + epsilon);
        const reference = sample(time);
        const before = sample(beforeTime);
        const after = sample(afterTime);
        if (isQuaternion) {
          const alignHemisphere = (pose) => {
            const dot = pose.reduce((sum, value, index) => sum + value * reference[index], 0);
            return dot < 0 ? pose.map((value) => -value) : pose;
          };
          const alignedBefore = alignHemisphere(before);
          const alignedAfter = alignHemisphere(after);
          return alignedAfter.map((value, index) => (value - alignedBefore[index]) / (afterTime - beforeTime));
        }
        return after.map((value, index) => (value - before[index]) / (afterTime - beforeTime));
      };
      const startVelocity = estimateVelocity(loopStart);
      let seamVelocity = estimateVelocity(seamStart);
      if (isQuaternion) {
        const hemisphereDot = seamPose.reduce((sum, value, index) => sum + value * startPose[index], 0);
        if (hemisphereDot < 0) {
          seamPose = seamPose.map((value) => -value);
          seamVelocity = seamVelocity.map((value) => -value);
        }
      }
      const times = [];
      const values = [];

      times.push(0);
      values.push(...startPose);
      for (let keyIndex = 0; keyIndex < track.times.length; keyIndex += 1) {
        if (track.times[keyIndex] <= loopStart) continue;
        if (track.times[keyIndex] >= seamStart) break;
        times.push(track.times[keyIndex] - loopStart);
        const offset = keyIndex * valueSize;
        for (let valueIndex = 0; valueIndex < valueSize; valueIndex += 1) {
          values.push(track.values[offset + valueIndex]);
        }
      }

      times.push(seamStartInLoop);
      values.push(...seamPose);
      for (let segment = 1; segment <= segments; segment += 1) {
        const progress = segment / segments;
        times.push(seamStartInLoop + seamDuration * progress);
        const progress2 = progress * progress;
        const progress3 = progress2 * progress;
        const h00 = 2 * progress3 - 3 * progress2 + 1;
        const h10 = progress3 - 2 * progress2 + progress;
        const h01 = -2 * progress3 + 3 * progress2;
        const h11 = progress3 - progress2;
        const pose = Array.from({ length: valueSize }, (_, valueIndex) => (
          h00 * seamPose[valueIndex]
          + h10 * seamDuration * seamVelocity[valueIndex]
          + h01 * startPose[valueIndex]
          + h11 * seamDuration * startVelocity[valueIndex]
        ));
        if (isQuaternion) {
          const quaternion = new THREE.Quaternion().fromArray(pose).normalize();
          if (segment === segments) quaternion.fromArray(startPose);
          values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        } else {
          values.push(...(segment === segments ? startPose : pose));
        }
      }

      const seamlessTrack = track.clone();
      seamlessTrack.times = new Float32Array(times);
      seamlessTrack.values = new Float32Array(values);
      return seamlessTrack;
    });

    return new THREE.AnimationClip(`${clip.name}-continuous-hover`, loopDuration, tracks);
  };

  const getNextClickReaction = () => {
    if (clickReactionIndex >= clickReactionOrder.length) clickReactionIndex = 0;
    return clickReactionOrder[clickReactionIndex++];
  };

  const setPoseState = (nextState, resumeFromFightOverride = null, {
    snapTurn = false,
    fightActionOverride = null,
    fightSpeech = null,
    fightTurnActionOverride = null,
  } = {}) => {
    if (nextState === poseState) {
      if (snapTurn && (nextState === 'walking-right' || nextState === 'walking-home')) {
        const facingYaw = getWalkFacingYaw(nextState);
        if (walkTurnPending) {
          leftTurnAction?.stop();
          rightTurnAction?.stop();
          walkAction?.reset().fadeIn(0.12).play();
        }
        walkTurnPending = false;
        walkYawFrom = facingYaw;
        walkYawTo = facingYaw;
        walkYawElapsed = walkYawDuration;
        modelTurn.rotation.y = facingYaw;
        characterButton.dispatchEvent(new Event('character-turn-finished'));
      }
      return;
    }
    const wasWalking = ['walking-right', 'walking-home'].includes(poseState);
    const wasFightTurn = poseState === 'fight-turn';
    if (speechBubble) {
      let bubbleText = '';
      if (nextState === 'idle' && postFightIdleActive) {
        bubbleText = '...';
      } else if (nextState === 'fight-idle' || (nextState === 'idle' && activeClickResume)) {
        bubbleText = 'Whoa, easy there!';
      } else if (nextState === 'fighting' || nextState === 'fight-turn') {
        bubbleText = fightSpeech || (nextState === 'fight-turn' ? clickReactionSpeech[fightTurnPending?.reaction] : 'Too slow!') || '';
      } else if (nextState === 'dancing') {
        bubbleText = '🎵🎶';
      } else if (['greeting', 'hover-wave', 'walking-right', 'walking-home'].includes(nextState)) {
        bubbleText = 'Hi, I’m Yvonne!';
      }
      speechBubble.textContent = bubbleText;
      const hasBubbleText = Boolean(bubbleText.trim());
      speechBubble.hidden = !hasBubbleText;
      speechBubble.style.display = hasBubbleText ? '' : 'none';
      speechBubble.style.opacity = nextState === 'hover-wave' && !active ? '1' : '';
    }
    let resumeFromFight = resumeFromFightOverride;
    if (nextState === 'fighting') {
      fightResume ||= {
        poseState,
        danceIndex,
        danceOrder: poseState === 'dancing' ? [...danceOrder] : null,
        animationTime: poseState === 'dancing' ? activeDanceAction?.time : walkAction?.time,
      };
    } else if (poseState === 'fighting') {
      resumeFromFight = fightResume;
      fightResume = null;
    } else if (!resumeFromFight) {
      fightResume = null;
    }
    poseState = nextState;
    if (!['walking-right', 'walking-home'].includes(nextState)) {
      if (walkTurnPending) {
        leftTurnAction?.stop();
        rightTurnAction?.stop();
      }
      walkTurnPending = false;
    }
    if (!['walking-right', 'walking-home'].includes(nextState) && !wasFightTurn) {
      leftTurnAction?.stop();
      rightTurnAction?.stop();
      leftTurnToFrontAction?.stop();
      rightTurnToFrontAction?.stop();
    }
    if (nextState !== 'fighting' && nextState !== 'fight-return') fightReturnAction?.fadeOut(0.15);
    if (nextState !== 'idle' || !postFightIdleActive) fightRecoveryIdleAction?.fadeOut(0.15);
    if (nextState !== 'fighting') backFlipAction?.fadeOut(0.12);
    if (nextState === 'greeting' || nextState === 'hover-wave') {
      idleAction?.fadeOut(0.25);
      fightIdleAction?.fadeOut(0.2);
      fightAction?.fadeOut(0.2);
      fightBAction?.fadeOut(0.2);
      boxingAction?.fadeOut(0.2);
      kickingAction?.fadeOut(0.2);
      walkAction?.fadeOut(0.2);
      danceActions.forEach((action) => action?.fadeOut(0.2));
      activeDanceAction = null;
      if (nextState === 'hover-wave' && hoverWaveAction) {
        waveAction?.fadeOut(0.2);
        hoverWaveAction.reset().fadeIn(0.25).play();
      } else {
        hoverWaveAction?.fadeOut(0.2);
        waveAction?.reset().fadeIn(0.25).play();
      }
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    } else if (nextState === 'walking-right' || nextState === 'walking-home') {
      waveAction?.fadeOut(0.35);
      hoverWaveAction?.fadeOut(0.35);
      idleAction?.fadeOut(0.35);
      fightRecoveryIdleAction?.fadeOut(0.25);
      fightIdleAction?.fadeOut(0.25);
      fightReturnAction?.fadeOut(0.25);
      fightAction?.fadeOut(0.25);
      fightBAction?.fadeOut(0.25);
      boxingAction?.fadeOut(0.25);
      kickingAction?.fadeOut(0.25);
      backFlipAction?.fadeOut(0.25);
      danceActions.forEach((action) => action?.fadeOut(0.25));
      activeDanceAction = null;
      const targetYaw = getWalkFacingYaw(nextState);
      const shouldTurnInPlace = !wasWalking && !resumeFromFight;
      leftTurnAction?.stop();
      rightTurnAction?.stop();
      if (shouldTurnInPlace) {
        walkAction?.fadeOut(0.12);
        // The model faces the camera at rest, so its body-left turns toward screen-right.
        const turnAction = nextState === 'walking-right' ? leftTurnAction : rightTurnAction;
        walkTurnPending = Boolean(turnAction);
        walkYawFrom = modelTurn.rotation.y;
        walkYawTo = walkYawFrom;
        walkYawElapsed = walkYawDuration;
        turnAction?.reset().fadeIn(0.12).play();
      } else {
        // Resumes and direction changes should face the new path immediately.
        walkTurnPending = false;
        walkYawFrom = targetYaw;
        walkYawTo = targetYaw;
        walkYawElapsed = walkYawDuration;
        modelTurn.rotation.y = targetYaw;
        if (wasWalking) walkAction?.fadeIn(0.12).play();
        else walkAction?.reset().fadeIn(0.35).play();
        characterButton.dispatchEvent(new Event('character-turn-finished'));
      }
      if (resumeFromFight?.poseState === nextState && Number.isFinite(resumeFromFight.animationTime)) {
        walkAction.time = resumeFromFight.animationTime;
      }
    } else if (nextState === 'dancing') {
      waveAction?.fadeOut(0.35);
      hoverWaveAction?.fadeOut(0.35);
      idleAction?.fadeOut(0.35);
      fightRecoveryIdleAction?.fadeOut(0.25);
      fightIdleAction?.fadeOut(0.25);
      fightReturnAction?.fadeOut(0.25);
      fightAction?.fadeOut(0.25);
      fightBAction?.fadeOut(0.25);
      boxingAction?.fadeOut(0.25);
      kickingAction?.fadeOut(0.25);
      backFlipAction?.fadeOut(0.25);
      walkAction?.fadeOut(0.35);
      danceActions.forEach((action) => action?.stop());
      if (resumeFromFight?.poseState === 'dancing') {
        danceOrder = resumeFromFight.danceOrder ? [...resumeFromFight.danceOrder] : createDanceOrder();
        danceIndex = resumeFromFight.danceIndex;
      } else {
        danceOrder = createDanceOrder();
        danceIndex = 0;
      }
      activeDanceAction = danceActions[danceOrder[danceIndex]];
      activeDanceAction?.reset().fadeIn(0.35).play();
      if (resumeFromFight?.poseState === 'dancing' && Number.isFinite(resumeFromFight.animationTime)) {
        activeDanceAction.time = resumeFromFight.animationTime;
      }
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    } else if (nextState === 'fight-idle') {
      idleAction?.fadeOut(0.25);
      fightRecoveryIdleAction?.fadeOut(0.2);
      fightReturnAction?.fadeOut(0.2);
      waveAction?.fadeOut(0.2);
      hoverWaveAction?.fadeOut(0.2);
      walkAction?.fadeOut(0.2);
      fightAction?.fadeOut(0.15);
      fightBAction?.fadeOut(0.15);
      boxingAction?.fadeOut(0.15);
      kickingAction?.fadeOut(0.15);
      danceActions.forEach((action) => action?.fadeOut(0.2));
      activeDanceAction = null;
      fightIdleAction?.reset().fadeIn(0.25).play();
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    } else if (nextState === 'fighting') {
      idleAction?.fadeOut(0.12);
      fightRecoveryIdleAction?.fadeOut(0.12);
      fightIdleAction?.fadeOut(0.12);
      fightReturnAction?.fadeOut(0.12);
      waveAction?.fadeOut(0.12);
      hoverWaveAction?.fadeOut(0.12);
      walkAction?.fadeOut(0.12);
      fightBAction?.fadeOut(0.12);
      boxingAction?.fadeOut(0.12);
      kickingAction?.fadeOut(0.12);
      danceActions.forEach((action) => action?.fadeOut(0.12));
      activeDanceAction = null;
      fightActionPlaying = true;
      activeFightAction = fightActionOverride || fightAction;
      activeFightAction?.reset().fadeIn(0.12).play();
    } else if (nextState === 'fight-turn') {
      idleAction?.fadeOut(0.12);
      fightRecoveryIdleAction?.fadeOut(0.12);
      fightIdleAction?.fadeOut(0.12);
      fightReturnAction?.fadeOut(0.12);
      waveAction?.fadeOut(0.12);
      hoverWaveAction?.fadeOut(0.12);
      walkAction?.stop();
      fightAction?.fadeOut(0.12);
      fightBAction?.fadeOut(0.12);
      boxingAction?.fadeOut(0.12);
      kickingAction?.fadeOut(0.12);
      backFlipAction?.fadeOut(0.12);
      danceActions.forEach((action) => action?.fadeOut(0.12));
      activeDanceAction = null;
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = walkYawFrom;
      walkYawElapsed = walkYawDuration;
      fightTurnActionOverride?.reset().setEffectiveTimeScale(1.8).play();
    } else if (nextState === 'fight-return-turn') {
      idleAction?.fadeOut(0.12);
      fightRecoveryIdleAction?.fadeOut(0.12);
      fightIdleAction?.fadeOut(0.12);
      fightReturnAction?.fadeOut(0.12);
      walkAction?.fadeOut(0.12);
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = walkYawFrom;
      walkYawElapsed = walkYawDuration;
      fightTurnActionOverride?.reset().fadeIn(0.12).play();
    } else if (nextState === 'fight-return') {
      idleAction?.fadeOut(0.12);
      fightRecoveryIdleAction?.fadeOut(0.12);
      fightIdleAction?.fadeOut(0.12);
      waveAction?.fadeOut(0.12);
      hoverWaveAction?.fadeOut(0.12);
      walkAction?.fadeOut(0.12);
      fightAction?.fadeOut(0.12);
      fightBAction?.fadeOut(0.12);
      boxingAction?.fadeOut(0.12);
      kickingAction?.fadeOut(0.12);
      backFlipAction?.fadeOut(0.12);
      danceActions.forEach((action) => action?.fadeOut(0.12));
      activeDanceAction = null;
      fightReturnAction?.reset().fadeIn(0.12).play();
    } else {
      waveAction?.fadeOut(0.3);
      hoverWaveAction?.fadeOut(0.3);
      fightIdleAction?.fadeOut(0.3);
      fightReturnAction?.fadeOut(0.2);
      fightAction?.fadeOut(0.2);
      fightBAction?.fadeOut(0.2);
      boxingAction?.fadeOut(0.2);
      kickingAction?.fadeOut(0.2);
      backFlipAction?.fadeOut(0.2);
      walkAction?.fadeOut(0.3);
      danceActions.forEach((action) => action?.fadeOut(0.3));
      activeDanceAction = null;
      if (nextState === 'idle' && postFightIdleActive && fightRecoveryIdleAction) {
        idleAction?.fadeOut(0.15);
        fightRecoveryIdleAction.setLoop(THREE.LoopRepeat, Infinity);
        fightRecoveryIdleAction.reset().fadeIn(0.15).play();
      } else {
        fightRecoveryIdleAction?.fadeOut(0.15);
        idleAction?.reset().fadeIn(0.3).play();
      }
      walkYawFrom = modelTurn.rotation.y;
      walkYawTo = 0;
      walkYawElapsed = 0;
    }
  };

  document.body.addEventListener('character-walk-direction-change', (event) => {
    if (!['walking-right', 'walking-home'].includes(poseState)) return;
    setPoseState(event.detail.direction === 'left' ? 'walking-home' : 'walking-right', null, { snapTurn: true });
  });

  const getRequestedPose = () => {
    if (!active) return pointerNearCharacter ? 'hover-wave' : 'idle';
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
    danceOrder: poseState === 'dancing' ? [...danceOrder] : null,
    animationTime: poseState === 'dancing' ? activeDanceAction?.time : walkAction?.time,
  });
  const signalTrack = (state) => {
    characterButton.dispatchEvent(new Event(`character-track-${state}`));
  };

  const startFightReturn = (resume, idleDuration) => {
    window.clearTimeout(postFightIdleTimer);
    postFightIdleTimer = null;
    postFightResume = resume;
    postFightIdleDuration = idleDuration;
    postFightIdleActive = false;
    fightActionPlaying = false;
    activeFightAction = null;
    setPoseState('fight-return');
  };

  const startWalkingFightTurn = (reaction, resume) => {
    const walkingState = resume?.poseState;
    const facingYaw = walkTurnPending ? getWalkFacingYaw(walkingState) : modelTurn.rotation.y;
    if (Math.abs(facingYaw) < 0.15) {
      startClickReaction(reaction, resume);
      return;
    }
    // Reverse the same clip that originally turned from the camera toward this side.
    const turnAction = facingYaw > 0 ? leftTurnToFrontAction : rightTurnToFrontAction;
    if (!turnAction) {
      startClickReaction(reaction, resume);
      return;
    }
    leftTurnAction?.stop();
    rightTurnAction?.stop();
    leftTurnToFrontAction?.stop();
    rightTurnToFrontAction?.stop();
    walkTurnPending = false;
    // The reversed clip starts in the current side-facing pose and ends facing front.
    modelTurn.rotation.y = 0;
    fightTurnPending = { action: turnAction, reaction, resume };
    setPoseState('fight-turn', null, {
      fightTurnActionOverride: turnAction,
      fightSpeech: clickReactionSpeech[reaction],
    });
  };

  const startClickReaction = (reaction, resume) => {
    postFightIdleActive = false;
    postFightResume = null;
    activeClickResume = reaction === 'whoa' ? resume : null;
    fightResume = reaction === 'whoa' ? null : resume;
    if (reaction === 'whoa') {
      setPoseState('fight-idle');
    } else {
      const reactions = {
        'fist-a': { action: fightAction, speech: clickReactionSpeech['fist-a'] },
        'fist-b': { action: fightBAction, speech: clickReactionSpeech['fist-b'] },
        backflip: { action: backFlipAction, speech: clickReactionSpeech.backflip },
        boxing: { action: boxingAction, speech: clickReactionSpeech.boxing },
        kicking: { action: kickingAction, speech: clickReactionSpeech.kicking },
      };
      const selectedReaction = reactions[reaction];
      if (!selectedReaction?.action) return;
      setPoseState('fighting', null, {
        fightActionOverride: selectedReaction.action,
        fightSpeech: selectedReaction.speech,
      });
    }
  };

  const resumeOrPlayQueuedReaction = (resume) => {
    const nextReaction = pendingClickReactions.shift();
    if (nextReaction) {
      startClickReaction(nextReaction, resume);
      return;
    }
    postFightIdleActive = false;
    const requestedPose = getRequestedPose();
    const resumeForPose = resume ? { ...resume, poseState: requestedPose } : resume;
    if (['walking-right', 'walking-home'].includes(requestedPose)) {
      const targetYaw = getWalkFacingYaw(requestedPose);
      const turnAction = requestedPose === 'walking-right' ? leftTurnAction : rightTurnAction;
      if (turnAction && Math.abs(modelTurn.rotation.y - targetYaw) > 0.15) {
        leftTurnAction?.stop();
        rightTurnAction?.stop();
        fightReturnTurnPending = { action: turnAction, resume: resumeForPose, state: requestedPose };
        setPoseState('fight-return-turn', null, { fightTurnActionOverride: turnAction });
        return;
      }
    }
    setPoseState(requestedPose, resumeForPose);
    signalTrack('resume');
  };

  const scheduleClickIdleResume = () => {
    window.clearTimeout(activeClickHoldTimer);
    activeClickHoldTimer = window.setTimeout(() => {
      activeClickHoldTimer = null;
      if (!active || poseState !== 'fight-idle' || !activeClickResume) return;

      const resume = activeClickResume;
      activeClickResume = null;
      startFightReturn(resume, fightIdleEllipsisDuration);
    }, fightIdleHoldDuration);
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
    if (ready) setPoseState(isNear ? 'hover-wave' : 'idle');
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
    const isMoving = ['walking-right', 'walking-home', 'dancing'].includes(poseState);
    const isInClickReaction = ['fight-idle', 'fighting', 'fight-turn', 'fight-return', 'fight-return-turn'].includes(poseState) || postFightIdleActive;
    if (!isMoving && !isInClickReaction) return;
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
    const reaction = getNextClickReaction();
    if (isMoving) {
      signalTrack('pause');
      const resume = captureMovingPose();
      if (['walking-right', 'walking-home'].includes(poseState)) startWalkingFightTurn(reaction, resume);
      else startClickReaction(reaction, resume);
    } else {
      pendingClickReactions.push(reaction);
    }
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
    if (!speechBubble || speechBubble.hidden || !speechBubble.textContent.trim() || !headBone || (!active && poseState !== 'hover-wave')) return;
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
    const imageRect = characterButton.closest('.avatar-box')?.getBoundingClientRect();
    if (!imageRect) return;
    const bubbleWidth = hint.offsetWidth;
    const bubbleHeight = hint.offsetHeight;
    const gap = 6;
    const edge = 8;
    const top = imageRect.top - bubbleHeight - gap;

    // Anchor the hint to the office image's upper-left edge. Hide it when
    // scrolling leaves no clear space above the image rather than covering it.
    if (top < edge || imageRect.bottom <= 0 || imageRect.top >= window.innerHeight) {
      hint.style.visibility = 'hidden';
      return;
    }
    hint.style.visibility = 'visible';
    const left = THREE.MathUtils.clamp(
      imageRect.left - 48,
      edge,
      Math.max(edge, window.innerWidth - bubbleWidth - edge),
    );
    hint.style.left = `${left}px`;
    hint.style.top = `${top}px`;
    hint.style.transform = 'none';
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
    './assets/models/yvonne-sage-blue.fbx',
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

      textureLoader.load('./assets/models/yvonne-sage-blue-texture.jpg', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        // This atlas shares the OBJ's UVs, which use the standard image orientation.
        texture.flipY = true;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        model.traverse((object) => {
          if (!object.isMesh) return;
          if (!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
          const applyTexture = (sourceMaterial) => {
            const material = sourceMaterial.clone();
            material.map = texture;
            // Ignore imported normal maps to prevent triangulated highlights on fabric.
            material.normalMap = null;
            material.flatShading = false;
            material.color.set(0xffffff);
            material.needsUpdate = true;
            return material;
          };
          if (Array.isArray(object.material)) object.material = object.material.map(applyTexture);
          else if (object.material) object.material = applyTexture(object.material);
        });
        textureReady = true;
        updateReadyState();
      }, undefined, () => {
        if (hint) hint.textContent = '3D character texture could not load';
      });

      mixer = new THREE.AnimationMixer(model);
      mixer.addEventListener('finished', (event) => {
        if (event.action === waveAction) {
          if (poseState === 'greeting') characterButton.dispatchEvent(new Event('character-wave-finished'));
          return;
        }

        if (walkTurnPending
          && (event.action === leftTurnAction || event.action === rightTurnAction)
          && ['walking-right', 'walking-home'].includes(poseState)) {
          const targetYaw = getWalkFacingYaw(poseState);
          walkTurnPending = false;
          modelTurn.rotation.y = targetYaw;
          walkYawFrom = targetYaw;
          walkYawTo = targetYaw;
          walkYawElapsed = walkYawDuration;
          event.action.stop();
          (event.action === leftTurnAction ? rightTurnAction : leftTurnAction)?.stop();
          walkAction?.reset().fadeIn(0.18).play();
          characterButton.dispatchEvent(new Event('character-turn-finished'));
          return;
        }

        if (event.action === fightIdleAction && activeClickResume && poseState === 'fight-idle') {
          scheduleClickIdleResume();
          return;
        }

        if (fightTurnPending && event.action === fightTurnPending.action && poseState === 'fight-turn') {
          const { reaction, resume } = fightTurnPending;
          fightTurnPending = null;
          (event.action === leftTurnToFrontAction ? rightTurnToFrontAction : leftTurnToFrontAction)?.stop();
          walkYawFrom = 0;
          walkYawTo = 0;
          walkYawElapsed = walkYawDuration;
          startClickReaction(reaction, resume);
          event.action.fadeOut(reaction === 'whoa' ? 0.25 : 0.12);
          return;
        }

        if (fightReturnTurnPending
          && event.action === fightReturnTurnPending.action
          && poseState === 'fight-return-turn') {
          const { resume, state } = fightReturnTurnPending;
          fightReturnTurnPending = null;
          const targetYaw = getWalkFacingYaw(state);
          modelTurn.rotation.y = targetYaw;
          walkYawFrom = targetYaw;
          walkYawTo = targetYaw;
          walkYawElapsed = walkYawDuration;
          event.action.stop();
          (event.action === leftTurnAction ? rightTurnAction : leftTurnAction)?.stop();
          const nextReaction = pendingClickReactions.shift();
          if (nextReaction) startWalkingFightTurn(nextReaction, resume);
          else resumeOrPlayQueuedReaction(resume);
          return;
        }

        if (event.action === fightReturnAction && poseState === 'fight-return') {
          postFightIdleActive = true;
          setPoseState('idle', postFightResume);
          window.clearTimeout(postFightIdleTimer);
          postFightIdleTimer = window.setTimeout(() => {
            postFightIdleTimer = null;
            if (poseState !== 'idle') return;
            const resume = postFightResume;
            postFightResume = null;
            postFightIdleActive = false;
            resumeOrPlayQueuedReaction(resume);
          }, postFightIdleDuration);
          return;
        }

        if (event.action === activeFightAction && fightActionPlaying) {
          fightActionPlaying = false;
          if (poseState === 'fighting') {
            const resume = fightResume;
            fightResume = null;
            startFightReturn(resume, idleAfterFistFightDuration);
          }
          return;
        }

        const finishedActionIndex = danceActions.indexOf(event.action);
        if (finishedActionIndex < 0 || danceOrder[danceIndex] !== finishedActionIndex || event.action !== activeDanceAction || poseState !== 'dancing') return;

        danceIndex += 1;
        if (danceIndex < danceOrder.length) {
          const nextDanceAction = danceActions[danceOrder[danceIndex]];
          if (nextDanceAction === event.action) {
            activeDanceAction = nextDanceAction;
            activeDanceAction.reset().play();
          } else {
            event.action.fadeOut(0.25);
            activeDanceAction = nextDanceAction;
            activeDanceAction.reset().fadeIn(0.25).play();
          }
          return;
        }

        event.action.fadeOut(0.25);
        activeDanceAction = null;
        characterButton.dispatchEvent(new Event('character-dance-finished'));
      });

      loader.load(characterAnimationPaths.waving, (waveModel) => {
        const waveClip = waveModel.animations?.find((clip) => /wave[_\s-]*one[_\s-]*hand/i.test(clip.name))
          || waveModel.animations?.find((clip) => /wave/i.test(clip.name))
          || (waveModel.animations?.length === 1 ? waveModel.animations[0] : null);
        if (waveClip && mixer) {
          const retargetedWaveClip = retargetClip(waveClip);
          waveAction = mixer.clipAction(retargetedWaveClip);
          waveAction.setLoop(THREE.LoopOnce, 1);
          waveAction.clampWhenFinished = true;
          hoverWaveAction = mixer.clipAction(createSeamlessLoopClip(retargetedWaveClip));
          hoverWaveAction.setLoop(THREE.LoopRepeat, Infinity);
        }
        waveReady = true;
        updateReadyState();
      }, undefined, () => {
        waveReady = true;
        updateReadyState();
      });

      // Load each separate FBX as an animation source for this one character rig.
      loader.load(characterAnimationPaths.idle, (idleModel) => {
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

      loader.load(characterAnimationPaths.fightIdle, (fightIdleModel) => {
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

      loader.load(characterAnimationPaths.fightReturn, (fightReturnModel) => {
        const fightReturnClip = fightReturnModel.animations?.[0];
        if (fightReturnClip && mixer) {
          fightReturnAction = mixer.clipAction(retargetClip(fightReturnClip));
          fightReturnAction.setLoop(THREE.LoopOnce, 1);
          fightReturnAction.clampWhenFinished = true;
        }
        fightReturnReady = true;
        updateReadyState();
      }, undefined, () => {
        fightReturnReady = true;
        updateReadyState();
      });

      loader.load(characterAnimationPaths.fightRecoveryIdle, (recoveryIdleModel) => {
        const recoveryIdleClip = recoveryIdleModel.animations?.[0];
        if (recoveryIdleClip && mixer) {
          fightRecoveryIdleAction = mixer.clipAction(retargetClip(recoveryIdleClip, { keepIdleUpperBodyUpright: true }));
          fightRecoveryIdleAction.setLoop(THREE.LoopRepeat, Infinity);
        }
        fightRecoveryIdleReady = true;
        updateReadyState();
      }, undefined, () => {
        fightRecoveryIdleReady = true;
        updateReadyState();
      });

      loader.load(characterAnimationPaths.fistFightA, (fightModel) => {
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

      loader.load(characterAnimationPaths.fistFightB, (fightBModel) => {
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

      loader.load(characterAnimationPaths.backFlip, (backFlipModel) => {
        const backFlipClip = backFlipModel.animations?.[0];
        if (backFlipClip && mixer) {
          backFlipAction = mixer.clipAction(retargetClip(backFlipClip));
          backFlipAction.setLoop(THREE.LoopOnce, 1);
          backFlipAction.clampWhenFinished = true;
        }
        backFlipReady = true;
        updateReadyState();
      }, undefined, () => {
        backFlipReady = true;
        updateReadyState();
      });

      loader.load(characterAnimationPaths.boxing, (boxingModel) => {
        const boxingClip = boxingModel.animations?.[0];
        if (boxingClip && mixer) {
          boxingAction = mixer.clipAction(retargetClip(boxingClip));
          boxingAction.setLoop(THREE.LoopOnce, 1);
          boxingAction.clampWhenFinished = true;
        }
        boxingReady = true;
        updateReadyState();
      }, undefined, () => {
        boxingReady = true;
        updateReadyState();
      });

      loader.load(characterAnimationPaths.kicking, (kickingModel) => {
        const kickingClip = kickingModel.animations?.[0];
        if (kickingClip && mixer) {
          kickingAction = mixer.clipAction(retargetClip(kickingClip));
          kickingAction.setLoop(THREE.LoopOnce, 1);
          kickingAction.clampWhenFinished = true;
        }
        kickingReady = true;
        updateReadyState();
      }, undefined, () => {
        kickingReady = true;
        updateReadyState();
      });

      loader.load(characterAnimationPaths.walking, (walkingModel) => {
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

      loader.load(characterAnimationPaths.leftTurn, (turnModel) => {
        const turnClip = turnModel.animations?.[0];
        if (turnClip && mixer) {
          const retargetedTurnClip = retargetClip(turnClip);
          leftTurnAction = mixer.clipAction(retargetedTurnClip);
          leftTurnAction.setLoop(THREE.LoopOnce, 1);
          leftTurnAction.clampWhenFinished = true;
          leftTurnToFrontAction = mixer.clipAction(reverseClip(retargetedTurnClip));
          leftTurnToFrontAction.setLoop(THREE.LoopOnce, 1);
          leftTurnToFrontAction.clampWhenFinished = true;
        }
        turnSourcesLoaded += 1;
        updateReadyState();
      }, undefined, () => {
        turnSourcesLoaded += 1;
        updateReadyState();
      });

      loader.load(characterAnimationPaths.rightTurn, (turnModel) => {
        const turnClip = turnModel.animations?.[0];
        if (turnClip && mixer) {
          const retargetedTurnClip = retargetClip(turnClip);
          rightTurnAction = mixer.clipAction(retargetedTurnClip);
          rightTurnAction.setLoop(THREE.LoopOnce, 1);
          rightTurnAction.clampWhenFinished = true;
          rightTurnToFrontAction = mixer.clipAction(reverseClip(retargetedTurnClip));
          rightTurnToFrontAction.setLoop(THREE.LoopOnce, 1);
          rightTurnToFrontAction.clampWhenFinished = true;
        }
        turnSourcesLoaded += 1;
        updateReadyState();
      }, undefined, () => {
        turnSourcesLoaded += 1;
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

    if (fightActionPlaying || ['fight-turn', 'fight-return', 'fight-return-turn'].includes(poseState) || postFightIdleTimer !== null) return;

    if (!active) {
      window.clearTimeout(activeClickHoldTimer);
      activeClickHoldTimer = null;
      activeClickResume = null;
      if (lastPointerPosition) {
        updatePointerProximity(lastPointerPosition.x, lastPointerPosition.y);
      } else {
        pointerNearCharacter = false;
      }
      waveAction?.stop();
      hoverWaveAction?.stop();
      walkAction?.stop();
      danceActions.forEach((action) => action?.stop());
      activeDanceAction = null;
      setPoseState(pointerNearCharacter ? 'hover-wave' : 'idle');
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
    } else if (poseState === 'hover-wave') {
      if (hint) hint.style.visibility = 'hidden';
      positionSpeechBubble();
    } else {
      positionHintBubble();
    }
    renderer.render(scene, camera);
  });
}
