'use strict';

const sidebar = document.querySelector('[data-sidebar]');
const sidebarButton = document.querySelector('[data-sidebar-btn]');

const characterButton = document.querySelector('[data-character]');
const characterHome = characterButton?.parentElement;
const characterNavbar = document.querySelector('.navbar');
let characterSequence = 'idle';
let characterStartInset = 0;
let characterStartClientX = null;
let activeTrackMove = null;
let activeJumpAnimation = null;
let characterTrackMode = 'card';
let adaptGreetingToLayout = null;

const getCharacterTrackMode = () => {
  const rect = sidebar?.getBoundingClientRect();
  const navbarIsDocked = characterNavbar && getComputedStyle(characterNavbar).position === 'fixed';
  return navbarIsDocked || (rect && rect.height > rect.width * 1.25) ? 'page' : 'card';
};

const getTrackBounds = () => {
  if (!sidebar || !characterButton) return null;
  const sidebarRect = sidebar.getBoundingClientRect();
  const sidebarStyle = getComputedStyle(sidebar);
  const borderLeft = Number.parseFloat(sidebarStyle.borderLeftWidth) || 0;
  const stageWidth = Number.parseFloat(getComputedStyle(characterButton).width) || 132;
  const isPageTrack = characterTrackMode === 'page';
  const trackWidth = isPageTrack ? window.innerWidth : sidebar.clientWidth;
  const minLeft = isPageTrack ? 8 - stageWidth * 0.2 : 8;
  const maxLeft = Math.max(
    minLeft,
    isPageTrack ? trackWidth - 8 - stageWidth * 0.8 : trackWidth - stageWidth / 2 - 8,
  );
  const safeMaxLeft = Number.parseFloat(characterButton.style.getPropertyValue('--walk-safe-max-left'));
  return {
    sidebarRect,
    originLeft: isPageTrack ? 0 : sidebarRect.left + borderLeft,
    minLeft,
    maxLeft: Number.isFinite(safeMaxLeft) && !isPageTrack ? Math.max(minLeft, Math.min(maxLeft, safeMaxLeft)) : maxLeft,
  };
};

const placeCharacterTrack = ({
  lineTop: lineTopOverride,
  stageWidth: stageWidthOverride,
  stageHeight: stageHeightOverride,
} = {}) => {
  if (!sidebar || !characterButton) return;
  const sidebarRect = sidebar.getBoundingClientRect();
  const sidebarStyle = getComputedStyle(sidebar);
  const borderLeft = Number.parseFloat(sidebarStyle.borderLeftWidth) || 0;
  const isPageTrack = characterTrackMode === 'page';
  const targetWidth = stageWidthOverride ?? Math.min(220, Math.max(88, Math.min(window.innerWidth * 0.34, window.innerHeight * 0.3)));
  const targetHeight = stageHeightOverride ?? Math.min(220, Math.max(100, Math.min(window.innerWidth * 0.38, window.innerHeight * 0.3)));

  const titleRect = sidebar.querySelector('.info-content .title')?.getBoundingClientRect();
  const inset = 8;
  const trackWidth = isPageTrack ? window.innerWidth : sidebar.clientWidth;
  const trackHeight = isPageTrack ? window.innerHeight : sidebar.clientHeight;
  const availableWidth = Math.max(1, trackWidth - inset * 2);
  const availableHeight = Math.max(1, trackHeight - inset * 2);

  const scale = stageWidthOverride !== undefined && stageHeightOverride !== undefined
    ? 1
    : Math.min(1, availableWidth / targetWidth, availableHeight / targetHeight);
  const stageWidth = targetWidth * scale;
  const stageHeight = targetHeight * scale;
  characterButton.style.setProperty('--character-stage-width', `${stageWidth}px`);
  characterButton.style.setProperty('--character-stage-height', `${stageHeight}px`);

  const minLeft = isPageTrack ? inset - stageWidth * 0.2 : inset;
  let maxLeft = Math.max(
    minLeft,
    isPageTrack ? trackWidth - inset - stageWidth * 0.8 : trackWidth - stageWidth / 2 - inset,
  );
  let startLeft;
  let endLeft;
  let top;

  if (isPageTrack) {
    const navbarRect = characterNavbar?.getBoundingClientRect();
    const navbarIsDocked = characterNavbar && getComputedStyle(characterNavbar).position === 'fixed';
    if (navbarIsDocked) {
      // On compact layouts, travel along the page edge and dance at the far side
      // of the fixed About / Resume / Publications navigation.
      startLeft = minLeft;
      endLeft = maxLeft;
    } else {
      const requestedStart = characterStartClientX === null ? maxLeft : characterStartClientX - stageWidth / 2;
      startLeft = Math.min(maxLeft, Math.max(minLeft, requestedStart));
      const cardCenter = sidebarRect.left + sidebarRect.width / 2;
      endLeft = Math.min(maxLeft, Math.max(minLeft, cardCenter - stageWidth / 2));
    }
    const trackBottom = navbarIsDocked && navbarRect ? navbarRect.top : window.innerHeight;
    top = lineTopOverride ?? Math.max(2, trackBottom - stageHeight);
  } else {
    const originLeft = sidebarRect.left + borderLeft;
    const requestedStart = characterStartClientX === null
      ? characterStartInset
      : characterStartClientX - originLeft - stageWidth / 2;
    const cardStartLeft = Math.min(maxLeft, Math.max(minLeft, requestedStart));
    const titleRight = titleRect ? titleRect.right - originLeft : sidebar.clientWidth / 2;
    const cardRight = sidebar.clientWidth - inset;
    const danceCenter = (titleRight + cardRight) / 2;
    startLeft = cardStartLeft;
    endLeft = Math.min(maxLeft, Math.max(minLeft, danceCenter - stageWidth / 2));
    top = lineTopOverride ?? Math.max(2, sidebar.clientHeight - stageHeight - 1);

    const contactRect = sidebarButton?.getBoundingClientRect();
    if (contactRect) {
      const contactTop = contactRect.top - sidebarRect.top;
      const contactBottom = contactRect.bottom - sidebarRect.top;
      if (top < contactBottom && top + stageHeight > contactTop) {
        const contactLeft = contactRect.left - originLeft;
        maxLeft = Math.max(minLeft, Math.min(maxLeft, contactLeft - stageWidth - inset));
      }
    }
  }

  startLeft = Math.min(maxLeft, Math.max(minLeft, startLeft));
  endLeft = Math.min(maxLeft, Math.max(minLeft, endLeft));
  characterButton.style.setProperty('--walk-safe-max-left', `${maxLeft}px`);
  characterButton.style.setProperty('--walk-start-left', `${startLeft}px`);
  characterButton.style.setProperty('--walk-end-left', `${endLeft}px`);
  characterButton.style.setProperty('--walk-line-top', `${top}px`);
};

const placeGreetingInAvatar = () => {
  if (!characterHome || !characterButton) return;
  const sidebarRect = sidebar?.getBoundingClientRect();
  const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
  const borderBottom = Number.parseFloat(sidebarStyle?.borderBottomWidth) || 0;
  const stageHeight = Math.min(190, Math.max(132, Math.min(window.innerHeight * 0.32, window.innerWidth * 0.5)));
  const stageWidth = Math.min(170, Math.max(112, stageHeight * 0.8));
  const stageTop = sidebarRect
    ? sidebarRect.bottom - borderBottom - characterHome.getBoundingClientRect().top - stageHeight
    : characterHome.clientHeight * 0.5 - stageHeight * 0.42;
  characterButton.style.position = 'absolute';
  characterButton.style.width = `${stageWidth}px`;
  characterButton.style.height = `${stageHeight}px`;
  characterButton.style.left = '50%';
  characterButton.style.top = `${stageTop}px`;
  characterButton.style.transform = 'translateX(-50%)';
  characterButton.style.zIndex = '30';
  characterButton.style.pointerEvents = 'none';
};

const getTrackPosition = (side) => Number.parseFloat(
  characterButton.style.getPropertyValue(side === 'end' ? '--walk-end-left' : '--walk-start-left'),
) || 0;

const setCharacterWalkFacing = (from, to, { syncImmediately = false } = {}) => {
  const isMovingLeft = to < from;
  document.body.classList.toggle('character-returning', isMovingLeft);
  if (syncImmediately) {
    document.body.dispatchEvent(new CustomEvent('character-walk-direction-change', {
      detail: { direction: isMovingLeft ? 'left' : 'right' },
    }));
  }
};

const startTrackAnimation = (move, from, to, duration) => {
  characterButton.style.left = `${from}px`;
  const animation = characterButton.animate(
    [{ left: `${from}px` }, { left: `${to}px` }],
    { duration, easing: 'linear', fill: 'forwards' },
  );
  move.animation = animation;
  if (Math.abs(to - from) >= 1) move.direction = Math.sign(to - from);
  move.duration = duration;
  move.to = to;
  animation.onfinish = () => {
    if (activeTrackMove !== move) return;
    characterButton.style.left = `${to}px`;
    animation.cancel();
    activeTrackMove = null;
    move.resolve();
  };
  if (move.paused) animation.pause();
};

const animateAlongTrack = (targetSide, duration) => new Promise((resolve) => {
  const move = { targetSide, duration, animation: null, resolve, paused: false };
  activeTrackMove = move;
  const currentLeft = Number.parseFloat(characterButton.style.left) || getTrackPosition(targetSide === 'end' ? 'start' : 'end');
  startTrackAnimation(move, currentLeft, getTrackPosition(targetSide), duration);
});

characterButton?.addEventListener('character-track-pause', () => {
  if (!activeTrackMove?.animation || activeTrackMove.paused) return;
  activeTrackMove.paused = true;
  activeTrackMove.animation.pause();
});

characterButton?.addEventListener('character-track-resume', () => {
  if (!activeTrackMove?.animation || !activeTrackMove.paused) return;
  activeTrackMove.paused = false;
  activeTrackMove.animation.play();
});

const resizeCharacterTrack = () => {
  if (!document.body.classList.contains('character-awake') || !sidebar || !characterButton) return;
  if (characterSequence === 'greeting' && characterButton.parentElement === characterHome) {
    const nextMode = getCharacterTrackMode();
    if (nextMode !== characterTrackMode) {
      adaptGreetingToLayout?.(nextMode);
      return;
    }
    placeGreetingInAvatar();
    return;
  }

  const beforeRect = characterButton.getBoundingClientRect();
  const nextMode = getCharacterTrackMode();
  if (nextMode !== characterTrackMode) {
    characterTrackMode = nextMode;
    document.body.classList.toggle('character-page-track', characterTrackMode === 'page');
    (characterTrackMode === 'page' ? document.body : sidebar).appendChild(characterButton);
  }
  const boundsBeforeLayout = getTrackBounds();
  const visualLeft = boundsBeforeLayout
    ? beforeRect.left - boundsBeforeLayout.originLeft
    : 0;
  placeCharacterTrack();

  const bounds = getTrackBounds();
  if (!bounds) return;
  const clampLeft = (left) => Math.min(bounds.maxLeft, Math.max(bounds.minLeft, left));

  if (characterSequence === 'jumping-out' && activeJumpAnimation) {
    const finishJump = activeJumpAnimation.onfinish;
    activeJumpAnimation.onfinish = null;
    activeJumpAnimation.cancel();
    activeJumpAnimation = null;
    characterButton.style.left = `${getTrackPosition('start')}px`;
    finishJump?.();
    return;
  }

  if (activeTrackMove) {
    const move = activeTrackMove;
    const animation = move.animation;
    const currentLeft = clampLeft(visualLeft);
    const targetLeft = getTrackPosition(move.targetSide);
    const movement = targetLeft - currentLeft;
    const direction = Math.abs(movement) >= 1
      ? Math.sign(movement)
      : move.direction || (move.targetSide === 'end' ? 1 : -1);
    setCharacterWalkFacing(direction < 0 ? 1 : 0, direction < 0 ? 0 : 1, { syncImmediately: true });
    if (Math.abs(currentLeft - visualLeft) < 0.5 && Math.abs(targetLeft - move.to) < 0.5) return;
    const remaining = Math.max(350, Math.min(8000, Math.abs(targetLeft - currentLeft) * 12));
    animation.onfinish = null;
    animation.cancel();
    startTrackAnimation(move, currentLeft, targetLeft, remaining);
  } else if (characterSequence === 'dancing') {
    characterButton.style.left = `${getTrackPosition('end')}px`;
  } else if (characterSequence === 'jumping-out' || characterSequence === 'walking-out') {
    characterButton.style.left = `${clampLeft(visualLeft)}px`;
  }
};

if (sidebar && 'ResizeObserver' in window) {
  const trackObserver = new ResizeObserver(() => {
    resizeCharacterTrack();
  });
  trackObserver.observe(sidebar);
}

characterButton?.addEventListener('click', () => {
  if (!sidebar || !characterButton || characterSequence !== 'idle') return;

  characterSequence = 'greeting';
  characterButton.disabled = true;
  const startRect = characterButton.getBoundingClientRect();
  characterTrackMode = getCharacterTrackMode();
  let useOfficeGreeting = characterTrackMode === 'card';
  const sidebarLeft = sidebar.getBoundingClientRect().left;
  const sidebarBorderLeft = Number.parseFloat(getComputedStyle(sidebar).borderLeftWidth) || 0;
  characterStartInset = Math.max(8, startRect.left - sidebarLeft - sidebarBorderLeft);
  document.body.classList.add('character-awake');
  if (useOfficeGreeting) {
    document.body.classList.add('character-greeting');
    placeGreetingInAvatar();
  }
  characterButton.setAttribute('aria-pressed', 'true');
  characterButton.setAttribute('aria-label', 'Yvonne is greeting, dancing, and returning to her portrait.');

  let waveFallback = 0;
  const clearWaveFallback = () => window.clearTimeout(waveFallback);
  const jumpOutAndWalk = () => {
    if (characterSequence !== 'greeting') return;
    clearWaveFallback();
    characterButton.removeEventListener('character-wave-finished', jumpOutAndWalk);
    const waveRect = characterButton.getBoundingClientRect();
    characterStartClientX = useOfficeGreeting ? waveRect.left + waveRect.width / 2 : null;

    characterSequence = 'jumping-out';
    characterTrackMode = getCharacterTrackMode();
    (characterTrackMode === 'page' ? document.body : sidebar).appendChild(characterButton);
    ['position', 'width', 'height', 'left', 'top', 'transform', 'z-index', 'pointer-events'].forEach((property) => {
      characterButton.style.removeProperty(property);
    });
    document.body.classList.remove('character-greeting');
    // Keep the office greeting at its current screen position so its first walk
    // step continues horizontally from the exact end of the wave.
    if (useOfficeGreeting) document.body.classList.add('character-walking');
    document.body.classList.toggle('character-page-track', characterTrackMode === 'page');
    const beginTrackSequence = () => {
        const startLeft = getTrackPosition('start');
        const endLeft = getTrackPosition('end');
        const walkDuration = Math.max(3000, Math.min(8000, Math.abs(endLeft - startLeft) * 12));

        const finishSequence = () => {
          characterButton.getAnimations().forEach((animation) => animation.cancel());
          activeJumpAnimation = null;
          characterHome?.appendChild(characterButton);
          ['position', 'width', 'height', 'left', 'top', 'transform', 'z-index', 'pointer-events'].forEach((property) => {
            characterButton.style.removeProperty(property);
          });
          characterButton.style.removeProperty('--character-stage-width');
          characterButton.style.removeProperty('--character-stage-height');
          characterStartInset = 0;
          characterStartClientX = null;
          characterTrackMode = 'card';
          activeTrackMove = null;
          ['--walk-start-left', '--walk-end-left', '--walk-line-top'].forEach((property) => {
            characterButton.style.removeProperty(property);
          });
          characterButton.style.removeProperty('--walk-safe-max-left');
          document.body.classList.remove('character-awake', 'character-page-track', 'character-greeting', 'character-walking', 'character-dancing', 'character-returning');
          characterButton.setAttribute('aria-pressed', 'false');
          characterButton.setAttribute('aria-label', 'Say hi to Yi Yvonne Yu');
          characterButton.disabled = false;
          characterSequence = 'idle';
        };

        const returnToPortrait = () => {
          if (characterSequence !== 'dancing') return;
          if (characterTrackMode === 'page') {
            characterSequence = 'returning-direct';
            document.body.classList.remove('character-dancing');
            document.body.classList.add('character-returning');
            const currentRect = characterButton.getBoundingClientRect();
            const homeRect = characterHome?.getBoundingClientRect();
            if (!homeRect) {
              finishSequence();
              return;
            }
            const returnScale = Math.min(
              homeRect.width / Math.max(currentRect.width, 1),
              homeRect.height / Math.max(currentRect.height, 1),
              1,
            );
            const returnAnimation = characterButton.animate([
              { transform: 'translate(0, 0) scale(1)' },
              {
                transform: `translate(${homeRect.left - currentRect.left}px, ${homeRect.top - currentRect.top}px) scale(${returnScale})`,
              },
            ], { duration: 650, easing: 'cubic-bezier(.2,.8,.25,1)' });
            activeJumpAnimation = returnAnimation;
            returnAnimation.onfinish = () => {
              activeJumpAnimation = null;
              finishSequence();
            };
            return;
          }
          characterSequence = 'walking-home';
          document.body.classList.remove('character-dancing');
          document.body.classList.add('character-walking');
          setCharacterWalkFacing(endLeft, startLeft);
          animateAlongTrack('start', walkDuration).then(finishSequence);
        };

        let walkingStarted = false;
        const startWalking = () => {
          if (walkingStarted) return;
          walkingStarted = true;
          window.clearTimeout(waveFallback);
          characterButton.removeEventListener('character-wave-finished', startWalking);
          characterSequence = 'walking-out';
          document.body.classList.remove('character-greeting');
          document.body.classList.add('character-walking');
          setCharacterWalkFacing(startLeft, endLeft);
          characterButton.style.left = `${startLeft}px`;
          animateAlongTrack('end', walkDuration).then(() => {
            characterButton.addEventListener('character-dance-finished', returnToPortrait, { once: true });
            characterSequence = 'dancing';
            document.body.classList.remove('character-walking', 'character-returning');
            document.body.classList.add('character-dancing');
          });
        };

        if (useOfficeGreeting) {
          startWalking();
        } else {
          characterSequence = 'greeting';
          characterButton.addEventListener('character-wave-finished', startWalking, { once: true });
          document.body.classList.add('character-greeting');
          waveFallback = window.setTimeout(startWalking, 2400);
        }
    };

    if (useOfficeGreeting) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const sidebarStyle = getComputedStyle(sidebar);
      const borderTop = Number.parseFloat(sidebarStyle.borderTopWidth) || 0;
      const lineTop = waveRect.top - sidebarRect.top - borderTop;
      placeCharacterTrack({
        lineTop,
        stageWidth: waveRect.width,
        stageHeight: waveRect.height,
      });
      beginTrackSequence();
      return;
    }

    placeCharacterTrack();
    requestAnimationFrame(() => {
      const targetRect = characterButton.getBoundingClientRect();
      const originScale = Math.min(
        waveRect.width / Math.max(targetRect.width, 1),
        waveRect.height / Math.max(targetRect.height, 1),
        1,
      );
      const jump = characterButton.animate([
        { transform: `translate(${waveRect.left - targetRect.left}px, ${waveRect.top - targetRect.top}px) scale(${originScale})` },
        { transform: 'translate(0, -10px) scale(1.04)', offset: 0.72 },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: 850, easing: 'cubic-bezier(.2,.8,.25,1)' });
      activeJumpAnimation = jump;
      jump.onfinish = () => {
        activeJumpAnimation = null;
        jump.cancel();
        beginTrackSequence();
      };
    });
  };

  adaptGreetingToLayout = (nextMode) => {
    if (characterSequence !== 'greeting' || characterButton.parentElement !== characterHome) return;
    characterTrackMode = nextMode;
    if (nextMode !== 'page' || !useOfficeGreeting) return;

    // If the viewport becomes portrait during the office wave, move to the
    // page-bottom route immediately and restart the greeting there.
    useOfficeGreeting = false;
    characterButton.removeEventListener('character-wave-finished', jumpOutAndWalk);
    jumpOutAndWalk();
  };

  if (useOfficeGreeting) {
    characterButton.addEventListener('character-wave-finished', jumpOutAndWalk, { once: true });
    waveFallback = window.setTimeout(jumpOutAndWalk, 2400);
  } else {
    jumpOutAndWalk();
  }
});

window.addEventListener('resize', () => {
  resizeCharacterTrack();
  requestAnimationFrame(resizeCharacterTrack);
});
window.addEventListener('orientationchange', () => {
  resizeCharacterTrack();
  requestAnimationFrame(resizeCharacterTrack);
});
window.visualViewport?.addEventListener('resize', () => {
  resizeCharacterTrack();
  requestAnimationFrame(resizeCharacterTrack);
});
window.screen?.orientation?.addEventListener?.('change', () => {
  resizeCharacterTrack();
  requestAnimationFrame(resizeCharacterTrack);
});

sidebarButton?.addEventListener('click', () => {
  sidebar?.classList.toggle('active');
});

const navigationLinks = document.querySelectorAll('[data-nav-link]');
const pages = document.querySelectorAll('[data-page]');

navigationLinks.forEach((link) => {
  link.addEventListener('click', () => {
    const destination = link.textContent.trim().toLowerCase();

    pages.forEach((page) => {
      page.classList.toggle('active', page.dataset.page === destination);
    });

    navigationLinks.forEach((item) => {
      item.classList.toggle('active', item === link);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

const qrModal = document.querySelector('[data-qr-modal]');
const qrOpenButton = document.querySelector('[data-qr-open]');
const qrCloseButtons = document.querySelectorAll('[data-qr-close]');

const setQrModalOpen = (isOpen) => {
  qrModal?.classList.toggle('active', isOpen);
  qrModal?.setAttribute('aria-hidden', String(!isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';
};

qrOpenButton?.addEventListener('click', () => setQrModalOpen(true));
qrCloseButtons.forEach((button) => {
  button.addEventListener('click', () => setQrModalOpen(false));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && qrModal?.classList.contains('active')) {
    setQrModalOpen(false);
    qrOpenButton?.focus();
  }
});
