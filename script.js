'use strict';
function initializeHeroIntro() {
  const template = document.querySelector('#hero-intro-template');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const atTop = !window.location.hash || window.location.hash === '#top';
  const navigation = performance.getEntriesByType('navigation')[0];
  const restoreScrolling = () => {
    const original = document.documentElement.dataset.introScrollRestoration;
    if (original !== undefined) {
      window.history.scrollRestoration = original;
      delete document.documentElement.dataset.introScrollRestoration;
    }
  };
  if (!template || !atTop || motion.matches || navigation?.type === 'back_forward') {
    restoreScrolling();
    return;
  }
  // A background tab starts its introduction when the user actually opens it.
  if (document.hidden) {
    const whenVisible = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', whenVisible);
      initializeHeroIntro();
    };
    document.addEventListener('visibilitychange', whenVisible);
    return;
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  const overlay = template.content.firstElementChild.cloneNode(true);
  const events = new AbortController();
  let ending = false;
  let removed = false;
  let landingTimer;
  let activeTouch = false;
  let activePointer = false;
  const landingEvents = new AbortController();
  let revealTimer;
  let removalTimer;
  const titleAnimations = [];
  const pinHome = () => {
    if (window.location.hash && window.location.hash !== '#top') {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#top`);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  const releaseLandingAfterIdle = () => {
    window.clearTimeout(landingTimer);
    if (!removed || activeTouch || activePointer) return;
    // Consume only the gesture that dismissed the intro, including trackpad inertia.
    landingTimer = window.setTimeout(() => {
      pinHome();
      landingEvents.abort();
    }, 220);
  };
  const remove = () => {
    if (removed) return;
    removed = true;
    window.clearTimeout(revealTimer);
    window.clearTimeout(removalTimer);
    events.abort();
    overlay.remove();
    titleAnimations.forEach(animation => animation.cancel());
    delete document.body.dataset.intro;
    pinHome();
    restoreScrolling();
    releaseLandingAfterIdle();
  };
  const finish = (immediate = false) => {
    if (immediate) { remove(); return; }
    if (ending) return;
    ending = true;
    pinHome();
    const sourceParts = [...overlay.querySelectorAll('.intro-word, .intro-dot')];
    const targetParts = [...document.querySelectorAll('#project-title .title-looking, #project-title em, #project-title .title-period')];
    if (sourceParts.length === 3 && targetParts.length === 3 && sourceParts.every(part => typeof part.animate === 'function')) {
      // Reveal the page without moving its layout, keeping its real title invisible until handoff.
      document.body.dataset.intro = 'handoff';
      overlay.classList.add('is-handoff');
      const textBounds = element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getBoundingClientRect();
      };
      try {
        sourceParts.forEach((source, index) => {
          const box = source.getBoundingClientRect();
          const from = textBounds(source);
          const to = textBounds(targetParts[index]);
          const scale = to.width / from.width;
          if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid title bounds');
          const x = to.left - box.left - (from.left - box.left) * scale;
          const y = to.top - box.top - (from.top - box.top) * scale;
          titleAnimations.push(source.animate([
            { transform: 'translate(0px, 0px) scale(1)' },
            { transform: `translate(${x}px, ${y}px) scale(${scale})` }
          ], { duration: 765, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }));
        });
        removalTimer = window.setTimeout(remove, 765);
        return;
      } catch {
        remove();
        return;
      }
    }
    // Fall back to the simple dissolve if text animation is unavailable.
    document.body.dataset.intro = 'revealing';
    overlay.classList.add('is-leaving');
    removalTimer = window.setTimeout(remove, 595);
  };

  document.body.dataset.intro = 'playing';
  document.body.append(overlay);
  // Hold the completed diagram for an additional 1.5 seconds before the title handoff.
  revealTimer = window.setTimeout(() => finish(), 5750);
  const skip = () => finish(true);
  const consumeSkipGesture = event => {
    // A skip opens the homepage; its default action must not scroll or click through it.
    if (event.cancelable && !event.metaKey && !event.ctrlKey) event.preventDefault();
    if (event.type === 'click') event.stopPropagation();
    if (event.type === 'touchstart') activeTouch = true;
    if (event.type === 'pointerdown') activePointer = true;
    skip();
    pinHome();
    releaseLandingAfterIdle();
  };
  const landingOptions = { passive: false, capture: true, signal: landingEvents.signal };
  ['wheel', 'touchstart', 'keydown', 'pointerdown', 'click'].forEach(type => {
    window.addEventListener(type, consumeSkipGesture, landingOptions);
  });
  window.addEventListener('touchmove', event => {
    if (event.cancelable) event.preventDefault();
    pinHome();
    releaseLandingAfterIdle();
  }, landingOptions);
  ['touchend', 'touchcancel'].forEach(type => window.addEventListener(type, () => {
    activeTouch = false;
    pinHome();
    releaseLandingAfterIdle();
  }, { passive: true, capture: true, signal: landingEvents.signal }));
  ['pointerup', 'pointercancel'].forEach(type => window.addEventListener(type, () => {
    activePointer = false;
    releaseLandingAfterIdle();
  }, { passive: true, capture: true, signal: landingEvents.signal }));
  window.addEventListener('blur', () => {
    activeTouch = false;
    activePointer = false;
    releaseLandingAfterIdle();
  }, { signal: landingEvents.signal });
  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) pinHome();
  }, { passive: true, signal: landingEvents.signal });
  window.addEventListener('hashchange', skip, { signal: events.signal });
  window.addEventListener('resize', () => { if (ending) skip(); }, { signal: events.signal });
  window.addEventListener('pagehide', skip, { signal: events.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); }, { signal: events.signal });
  motion.addEventListener('change', () => { if (motion.matches) skip(); }, { signal: events.signal });
  overlay.querySelector('.intro-skip').addEventListener('click', skip, { signal: events.signal });
}
initializeHeroIntro();

// All project videos are permanently silent, including manual playback and replay.
function initializeSilentVideos() {
  document.querySelectorAll('video').forEach(video => {
    const enforceSilence = () => {
      if (!video.defaultMuted) video.defaultMuted = true;
      if (!video.muted) video.muted = true;
      if (video.volume !== 0) video.volume = 0;
    };
    enforceSilence();
    ['volumechange', 'play', 'loadstart'].forEach(type => video.addEventListener(type, enforceSilence));
  });
}
initializeSilentVideos();

const methodTabList = document.querySelector('.method-tabs');
if (methodTabList) {
  const methodTabs = [...methodTabList.querySelectorAll('[role="tab"]')];
  const activateMethodTab = selectedTab => {
    methodTabs.forEach(tab => {
      const selected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      panel.dataset.active = String(selected);
      panel.setAttribute('aria-hidden', String(!selected));
      panel.inert = !selected;
    });
  };
  methodTabs.forEach((tab, index) => {
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    tab.addEventListener('click', () => activateMethodTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % methodTabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + methodTabs.length) % methodTabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = methodTabs.length - 1;
      else return;
      event.preventDefault();
      activateMethodTab(methodTabs[nextIndex]);
      methodTabs[nextIndex].focus();
    });
  });
  activateMethodTab(methodTabs[0]);
  // Overlapping grid panels reserve only the tallest paragraph at the current width.
  document.querySelector('.method-detail-panels').dataset.tabsReady = 'true';
  methodTabList.hidden = false;
}

// Native image panels replace the pre-composed paper figures.
const representationData = JSON.parse(document.querySelector('#representation-data').textContent);
const representationButtons = [...document.querySelectorAll('[data-representation]')];
const queryControls = document.querySelector('#representation-query-controls');
let representationScene = 'pasta';
function showRepresentationQuery(index) {
  const scene = representationData.spatial[representationScene];
  const query = scene.queries[index];
  ['reference', 'tf', 'fcp'].forEach(kind => {
    const link = document.querySelector(`#representation-${kind}`);
    const img = link.querySelector('img');
    link.href = query.assets[kind];
    img.src = query.assets[kind];
    const method = kind === 'reference' ? 'video frame' : kind === 'tf' ? 'Teacher forcing similarity map' : 'FCP similarity map';
    img.alt = `${scene.title}: ${method}, query ${index + 1}`;
    link.setAttribute('aria-label', `Open ${img.alt} at original resolution`);
  });
  queryControls.querySelectorAll('button').forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === index));
  });
  document.querySelector('#representation-scale-min').textContent = query.range[0].toFixed(4);
  document.querySelector('#representation-scale-max').textContent = query.range[1].toFixed(4);
}
representationButtons.forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.representation;
    const temporal = key === 'temporal';
    representationButtons.forEach(item => {
      const active = item === button;
      item.setAttribute('aria-pressed', String(active));
      item.classList.toggle('active', active);
    });
    document.querySelector('#representation-spatial').hidden = temporal;
    document.querySelector('#representation-temporal').hidden = !temporal;
  });
});
document.querySelectorAll('[data-spatial-scene]').forEach(button => {
  button.addEventListener('click', () => {
    representationScene = button.dataset.spatialScene;
    document.querySelectorAll('[data-spatial-scene]').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    buildRepresentationQueries();
  });
});
function buildRepresentationQueries() {
  const scene = representationData.spatial[representationScene];
  queryControls.replaceChildren(...scene.queries.map((query, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = query.label;
    button.title = `Selected token: row ${query.query[0]}, column ${query.query[1]}`;
    button.setAttribute('aria-pressed', String(index === 0));
    button.addEventListener('click', () => showRepresentationQuery(index));
    return button;
  }));
  queryControls.hidden = false;
  showRepresentationQuery(0);
}
buildRepresentationQueries();

let temporalScene = 'traffic';
function showTemporalQuery(index) {
  const scene = representationData.temporal.scenes[temporalScene];
  const query = scene.queries[index];
  const grid = document.querySelector('#temporal-grid');
  const cells = [];
  const corner = document.createElement('span');
  corner.setAttribute('aria-hidden', 'true');
  cells.push(corner);
  query.frames.forEach(frame => {
    const heading = document.createElement('p');
    heading.className = 'temporal-frame-heading';
    heading.textContent = `Frame ${frame.rgb_frame}${frame.latent === query.anchor_latent ? ' · query' : ''}`;
    cells.push(heading);
  });
  [['reference', 'Video frame'], ['fcp', '+ FCP']].forEach(([kind, label]) => {
    const row = document.createElement('p');
    row.className = 'temporal-row-label';
    row.textContent = label;
    cells.push(row);
    query.frames.forEach(frame => {
      const link = document.createElement('a');
      link.href = frame.assets[kind];
      link.dataset.mediaViewer = 'image';
      const image = document.createElement('img');
      image.src = frame.assets[kind];
      image.alt = `${scene.title}: ${label}, frame ${frame.rgb_frame}, fixed query ${index + 1}`;
      image.width = 768;
      image.height = 432;
      image.loading = 'lazy';
      link.setAttribute('aria-label', `Open ${image.alt} at original resolution`);
      link.append(image);
      cells.push(link);
    });
  });
  grid.replaceChildren(...cells);
  document.querySelector('#temporal-scale-min').textContent = query.range[0].toFixed(4);
  document.querySelector('#temporal-scale-max').textContent = query.range[1].toFixed(4);
  document.querySelectorAll('#temporal-query-controls button').forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === index));
  });
}
function buildTemporalQueries() {
  const scene = representationData.temporal.scenes[temporalScene];
  document.querySelector('#temporal-query-controls').replaceChildren(...scene.queries.map((query, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = query.label;
    button.title = `Fixed token: row ${query.query[0]}, column ${query.query[1]}; frame ${query.anchor_rgb_frame}`;
    button.addEventListener('click', () => showTemporalQuery(index));
    return button;
  }));
  showTemporalQuery(0);
}
document.querySelectorAll('[data-temporal-scene]').forEach(button => {
  button.addEventListener('click', () => {
    temporalScene = button.dataset.temporalScene;
    document.querySelectorAll('[data-temporal-scene]').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    buildTemporalQueries();
  });
});
// Initialize the extra scene gallery only when first opened, keeping its images lazy.
let temporalInitialized = false;
representationButtons.find(button => button.dataset.representation === 'temporal')?.addEventListener('click', () => {
  if (!temporalInitialized) {
    buildTemporalQueries();
    temporalInitialized = true;
  }
});

if ('IntersectionObserver' in window) {
  const navLinks = [...document.querySelectorAll('.site-header nav a')];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        const active = link.hash === `#${entry.target.id}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });
  document.querySelectorAll('main section[id]').forEach(section => observer.observe(section));
}

const siteHeader = document.querySelector('.site-header');
const navToggle = document.querySelector('.nav-toggle');
const mainNavigation = document.querySelector('#main-navigation');
const compactNavigation = window.matchMedia('(max-width: 900px)');
const setNavigationOpen = open => {
  siteHeader.dataset.navOpen = String(open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
};
navToggle.addEventListener('click', () => {
  setNavigationOpen(navToggle.getAttribute('aria-expanded') !== 'true');
});
mainNavigation.addEventListener('click', event => {
  if (event.target.closest('a')) setNavigationOpen(false);
});
document.addEventListener('click', event => {
  if (!siteHeader.contains(event.target)) setNavigationOpen(false);
});
document.addEventListener('focusin', event => {
  if (!siteHeader.contains(event.target)) setNavigationOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
    setNavigationOpen(false);
    navToggle.focus();
  }
});
compactNavigation.addEventListener('change', () => setNavigationOpen(false));

// Keep the Idea diagram available as a still; motion is an explicit user choice.
const ideaFigure = document.querySelector('.idea-figure');
const ideaReplay = document.querySelector('.idea-replay');
if (ideaFigure && ideaReplay) {
  const ideaMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updateIdeaReplay = () => {
    ideaReplay.hidden = ideaMotion.matches;
    if (ideaMotion.matches) ideaFigure.classList.remove('is-playing');
  };
  updateIdeaReplay();
  ideaMotion.addEventListener('change', updateIdeaReplay);
  ideaReplay.addEventListener('click', () => {
    if (ideaMotion.matches) return;
    ideaFigure.classList.remove('is-playing');
    void ideaFigure.offsetWidth;
    ideaFigure.classList.add('is-playing');
  });
}

function initializeResultReveals() {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || !('IntersectionObserver' in window)) return;
  const cards = [...document.querySelectorAll('.controlled-card, .physics-summary-card')];
  const inView = new Set();
  const reveal = card => {
    if (card.dataset.resultReveal !== 'pending') return;
    const chapter = card.closest('.section');
    if (['pending', 'aligning'].includes(chapter?.dataset.chapterEntry) || document.documentElement.dataset.chapterAligning) return;
    card.dataset.resultReveal = 'visible';
    observer.unobserve(card);
    inView.delete(card);
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) { inView.delete(entry.target); return; }
      inView.add(entry.target);
      if (!document.hidden) reveal(entry.target);
    });
  }, { threshold: .2 });
  cards.forEach(card => { card.dataset.resultReveal = 'pending'; });
  document.querySelectorAll('.physics-summary-card').forEach((card, index) => {
    card.style.setProperty('--result-reveal-delay', `${index * 100}ms`);
  });
  cards.forEach(card => observer.observe(card));
  // Reveal only the visible cards, so stacked mobile cards animate when reached.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) [...inView].forEach(reveal);
  });
  document.addEventListener('chapter:ready', () => {
    if (!document.hidden) [...inView].forEach(reveal);
  });
  cards.forEach(card => card.addEventListener('focusin', () => reveal(card)));
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    observer.disconnect();
    inView.clear();
    cards.forEach(card => { delete card.dataset.resultReveal; });
  });
}

function initializeChapterEntries() {
  const desktop = window.matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const chapters = [...document.querySelectorAll('main > .section')].map(section => ({
    section,
    heading: section.querySelector('.section-label') || section
  }));
  const visited = new Set();
  let lastY = window.scrollY;
  let lastInput = -Infinity;
  let idleTimer;
  let finishTimer;
  let snapping = false;
  let snapTarget = 0;
  let activeChapter = null;
  const ready = (section, animate = true) => {
    if (['ready', 'bypassed'].includes(section.dataset.chapterEntry)) return;
    section.dataset.chapterEntry = animate ? 'ready' : 'bypassed';
    document.dispatchEvent(new CustomEvent('chapter:ready', { detail: { section, animate } }));
  };
  if (desktop.matches && !motion.matches) {
    chapters.forEach(({ section }) => { section.dataset.chapterEntry = 'pending'; });
  }
  const enabled = () => desktop.matches && !motion.matches && !document.hidden && !document.body.dataset.intro && !document.documentElement.classList.contains('media-viewer-open');
  const entryViewport = () => {
    const top = document.querySelector('.site-header').getBoundingClientRect().bottom;
    const height = Math.max(0, window.innerHeight - top);
    return { top, height, trigger: top + height * .35 };
  };
  const entryTop = () => entryViewport().top + 24;
  const clearIdle = () => window.clearTimeout(idleTimer);
  const recordPassed = () => {
    const top = entryTop();
    const viewport = entryViewport();
    chapters.forEach(({ section, heading }) => {
      if (section.getBoundingClientRect().top <= viewport.top || heading.getBoundingClientRect().top <= top + 6) {
        visited.add(section);
        ready(section, false);
      }
    });
  };
  const release = (completed = false) => {
    snapping = false;
    lastY = window.scrollY;
    window.clearTimeout(finishTimer);
    delete document.documentElement.dataset.chapterAligning;
    if (activeChapter) ready(activeChapter, completed);
    activeChapter = null;
  };
  const cancelSnap = () => {
    if (!snapping) return;
    // Let new user input take over immediately; never prevent a wheel/key event.
    window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: 'instant' });
    release();
  };
  const alignEntry = () => {
    if (!enabled() || snapping) return;
    if (Date.now() - lastInput > 1000) {
      recordPassed();
      // Scrollbar/anchor navigation can enter a chapter without a wheel gesture.
      const viewport = entryViewport();
      chapters.forEach(({ section }) => {
        if (section.getBoundingClientRect().top <= viewport.trigger) ready(section, false);
      });
      return;
    }
    const top = entryTop();
    const viewport = entryViewport();
    let candidate;
    for (const chapter of chapters) {
      if (visited.has(chapter.section)) continue;
      const bounds = chapter.section.getBoundingClientRect();
      const boundary = bounds.top;
      const shortChapter = bounds.height < viewport.height * .75;
      // Short chapters get an earlier catch window so momentum cannot easily skip them.
      const trigger = shortChapter ? viewport.top + viewport.height * .5 : viewport.trigger;
      const overshootAllowance = shortChapter ? viewport.height * .35 : 0;
      if (boundary < viewport.top - overshootAllowance) {
        visited.add(chapter.section);
        ready(chapter.section, false);
        continue;
      }
      // Pick the first unread chapter in document order, even when several are visible.
      if (boundary <= trigger) {
        candidate = { ...chapter, delta: chapter.heading.getBoundingClientRect().top - top };
        break;
      }
    }
    if (!candidate) return;
    visited.add(candidate.section);
    if (Math.abs(candidate.delta) < 6) { ready(candidate.section); return; }
    snapTarget = Math.max(0, Math.min(window.scrollY + candidate.delta,
      document.documentElement.scrollHeight - window.innerHeight));
    snapping = true;
    activeChapter = candidate.section;
    activeChapter.dataset.chapterEntry = 'aligning';
    document.documentElement.dataset.chapterAligning = 'true';
    lastInput = -Infinity;
    window.scrollTo({ top: snapTarget, behavior: 'smooth' });
    finishTimer = window.setTimeout(() => {
      if (Math.abs(window.scrollY - snapTarget) < 2) release(true);
      else cancelSnap();
    }, 900);
  };
  const noteInput = event => {
    clearIdle();
    cancelSnap();
    if (event.defaultPrevented || !enabled()) { lastInput = -Infinity; return; }
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], .controlled-table-scroll, .idea-diagram-scroll, .temporal-scroll')) return;
    if (event.type === 'wheel') lastInput = event.deltaY > 0 ? Date.now() : -Infinity;
    else if (event.type === 'keydown') {
      const forward = ['ArrowDown', 'PageDown', ' '].includes(event.key) && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
      lastInput = forward ? Date.now() : -Infinity;
    } else lastInput = -Infinity;
  };
  recordPassed();
  window.addEventListener('wheel', noteInput, { passive: true });
  window.addEventListener('keydown', noteInput);
  window.addEventListener('pointerdown', noteInput, { passive: true });
  window.addEventListener('touchstart', noteInput, { passive: true });
  window.addEventListener('scroll', () => {
    const currentY = window.scrollY;
    const downward = currentY > lastY;
    lastY = currentY;
    clearIdle();
    if (!enabled()) return;
    if (snapping) {
      // Fallback for browsers without scrollend: wait for the final scroll event to settle.
      idleTimer = window.setTimeout(() => {
        if (snapping && Math.abs(window.scrollY - snapTarget) < 2) release(true);
      }, 120);
      return;
    }
    if (!downward) { lastInput = -Infinity; recordPassed(); return; }
    idleTimer = window.setTimeout(alignEntry, 160);
  }, { passive: true });
  window.addEventListener('scrollend', () => {
    if (snapping && Math.abs(window.scrollY - snapTarget) < 2) release(true);
  });
  const resetIntent = () => {
    clearIdle();
    cancelSnap();
    lastInput = -Infinity;
    lastY = window.scrollY;
    if (!desktop.matches || motion.matches) {
      chapters.forEach(({ section }) => ready(section, false));
    } else recordPassed();
  };
  window.addEventListener('hashchange', resetIntent);
  window.addEventListener('resize', resetIntent);
  document.addEventListener('media-viewer:change', resetIntent);
  document.addEventListener('visibilitychange', resetIntent);
  desktop.addEventListener('change', resetIntent);
  motion.addEventListener('change', resetIntent);
}
initializeChapterEntries();
initializeResultReveals();
