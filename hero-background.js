'use strict';

// A separate controller keeps the intro and its gesture handling intact.
(() => {
  const hero = document.querySelector('.hero');
  const videos = [...document.querySelectorAll('.hero-demo')];
  if (!hero || !videos.length) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let inView = hero.getBoundingClientRect().bottom > 0;
  let pageActive = true;
  let viewerOpen = false;
  const shouldPlay = () => pageActive && inView && !viewerOpen && !document.hidden &&
    !document.body.dataset.intro && !motion.matches;
  const updateState = () => {
    const playing = videos.some(video => !video.paused);
    hero.dataset.backgroundPlayback = playing ? 'playing' : 'paused';
  };
  const updatePlayback = () => {
    videos.forEach(video => {
      if (!shouldPlay()) { video.pause(); return; }
      // Load video bytes only after the intro ends and the hero is visible.
      if (!video.hasAttribute('src')) video.src = video.dataset.src;
      video.muted = true;
      if (video.paused) {
        video.play().then(() => {
          if (!shouldPlay()) video.pause();
          updateState();
        }).catch(updateState); // Restricted autoplay keeps the static poster visible.
      }
    });
    updateState();
  };
  videos.forEach(video => {
    video.addEventListener('play', updateState);
    video.addEventListener('pause', updateState);
  });
  new MutationObserver(updatePlayback).observe(document.body, {
    attributes: true, attributeFilter: ['data-intro']
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      updatePlayback();
    }, { threshold: 0 }).observe(hero);
  } else {
    window.addEventListener('scroll', () => {
      const box = hero.getBoundingClientRect();
      inView = box.bottom > 0 && box.top < window.innerHeight;
      updatePlayback();
    }, { passive: true });
  }
  document.addEventListener('media-viewer:change', event => { viewerOpen = event.detail.open; updatePlayback(); });
  document.addEventListener('visibilitychange', updatePlayback);
  window.addEventListener('pagehide', () => { pageActive = false; updatePlayback(); });
  window.addEventListener('pageshow', () => { pageActive = true; updatePlayback(); });
  motion.addEventListener('change', updatePlayback);
  updatePlayback();
})();
