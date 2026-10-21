(() => {
  const section = document.querySelector('#showcase');
  if (!section) return;
  const cases = JSON.parse(document.querySelector('#showcase-data').textContent);
  const video = section.querySelector('video');
  const caseCount = section.querySelector('.showcase-case-count');
  const observation = section.querySelector('#showcase-observation');
  const thumbnails = section.querySelector('.showcase-thumbnails');
  const previous = section.querySelector('.showcase-previous');
  const next = section.querySelector('.showcase-next');
  const pageCount = section.querySelector('.showcase-page-count');
  const controls = section.querySelector('.showcase-controls');
  const play = section.querySelector('.showcase-play');
  const replay = section.querySelector('.showcase-replay');
  const progress = section.querySelector('.showcase-progress');
  const time = section.querySelector('.showcase-time');
  const error = section.querySelector('.showcase-error');
  const mobile = matchMedia('(max-width:600px)');
  const sidebar = matchMedia('(min-width:901px)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let scrollTimer;
  let inView = !('IntersectionObserver' in window);
  let userPaused = false;
  let inViewer = false;
  let viewerBlocking = false;
  let manualPlayback = false;
  let progressFrame = null;
  let scrubbing = false;
  video.muted = true;
  video.loop = false;
  video.playsInline = true;
  let selected = 0;
  let page = 0;
  let pageSize = mobile.matches ? 3 : 6;
  const number = value => String(value).padStart(2, '0');
  function updatePlayback() {
    play.textContent = video.paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', `${video.paused ? 'Play' : 'Pause'} TF and Ours together`);
    updateProgress();
  }
  function updateProgress() {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
    if (Number(progress.max) !== duration) progress.max = duration;
    if (!scrubbing) progress.value = video.currentTime;
    const label = `${video.currentTime.toFixed(1)} / ${duration.toFixed(1)}s`;
    if (time.textContent !== label) time.textContent = label;
  }
  function stopProgressFrames() {
    if (progressFrame !== null) cancelAnimationFrame(progressFrame);
    progressFrame = null;
  }
  function startProgressFrames() {
    stopProgressFrames();
    updateProgress();
    if (video.paused || video.ended || document.hidden) return;
    const tick = () => {
      progressFrame = null;
      updateProgress();
      if (!video.paused && !video.ended && !document.hidden) progressFrame = requestAnimationFrame(tick);
    };
    progressFrame = requestAnimationFrame(tick);
  }
  async function start() {
    if (video.ended) video.currentTime = 0;
    try { await video.play(); } catch { updatePlayback(); }
  }
  function autoplayVisibleDemo() {
    const waitingForEntry = ['pending', 'aligning'].includes(section.dataset.chapterEntry);
    if ((inView || inViewer) && !viewerBlocking && !document.hidden && !userPaused && (inViewer || !waitingForEntry)) start();
  }
  function updatePageControls() {
    thumbnails.setAttribute('aria-label', sidebar.matches ? 'Demo gallery; scroll vertically to browse examples' : 'Demo gallery; scroll horizontally or use the previous and next buttons');
    previous.disabled = page === 0;
    next.disabled = (page + 1) * pageSize >= cases.length;
    pageCount.textContent = `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, cases.length)} / ${cases.length}`;
  }
  function pageOffset(index) {
    const first = thumbnails.children[0];
    const target = thumbnails.children[index * pageSize];
    return first && target ? target.offsetLeft - first.offsetLeft : 0;
  }
  function movePage(index, animate = true) {
    page = Math.max(0, Math.min(index, Math.ceil(cases.length / pageSize) - 1));
    updatePageControls();
    const behavior = animate && !motion.matches ? 'smooth' : 'instant';
    if (sidebar.matches) {
      const target = thumbnails.children[page * pageSize];
      thumbnails.scrollTo({ top: target ? target.offsetTop - thumbnails.children[0].offsetTop : 0, left: 0, behavior });
    } else thumbnails.scrollTo({ left: pageOffset(page), top: 0, behavior });
  }
  function syncPageFromScroll() {
    if (sidebar.matches) return;
    const stride = pageOffset(1);
    if (stride > 0) page = Math.max(0, Math.min(Math.round(thumbnails.scrollLeft / stride), Math.ceil(cases.length / pageSize) - 1));
    updatePageControls();
  }
  function renderIndex() {
    thumbnails.replaceChildren();
    cases.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'showcase-thumbnail';
      button.setAttribute('aria-label', `${number(index + 1)}: ${item.title}`);
      button.setAttribute('aria-pressed', String(index === selected));
      button.title = item.title;
      const image = document.createElement('img');
      image.src = item.thumbnail;
      image.alt = '';
      image.width = 240;
      image.height = 135;
      image.loading = 'lazy';
      const label = document.createElement('span');
      label.textContent = number(index + 1);
      button.append(image, label);
      button.addEventListener('click', () => select(index));
      thumbnails.append(button);
    });
    // Pad the last page so it can align cleanly without shifting the last items.
    const padding = (pageSize - cases.length % pageSize) % pageSize;
    for (let index = 0; index < padding; index++) {
      const spacer = document.createElement('span');
      spacer.className = 'showcase-thumbnail-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      thumbnails.append(spacer);
    }
    movePage(page, false);
  }
  function useCurrentVideoLoop() {
    manualPlayback = true;
    video.loop = true;
  }
  function select(index, manual = true) {
    if (manual) useCurrentVideoLoop();
    selected = index;
    const item = cases[index];
    video.pause();
    error.hidden = true;
    video.poster = item.poster;
    video.src = item.video;
    video.setAttribute('aria-label', `${item.title}: Teacher forcing on the left, Ours on the right`);
    observation.textContent = item.observation;
    caseCount.textContent = `CASE ${number(index + 1)} / ${number(cases.length)}`;
    video.querySelector('a').href = item.video;
    video.load();
    userPaused = false;
    updatePlayback();
    autoplayVisibleDemo();
    // Keep keyboard focus on the thumbnail the visitor just selected.
    [...thumbnails.children].slice(0, cases.length).forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === selected));
    });
  }
  play.addEventListener('click', () => {
    useCurrentVideoLoop();
    userPaused = !video.paused;
    if (userPaused) video.pause();
    else start();
  });
  replay.addEventListener('click', () => { useCurrentVideoLoop(); userPaused = false; video.currentTime = 0; start(); });
  progress.addEventListener('pointerdown', () => {
    useCurrentVideoLoop();
    scrubbing = true;
  });
  const finishScrubbing = () => { scrubbing = false; updateProgress(); };
  document.addEventListener('pointerup', finishScrubbing);
  document.addEventListener('pointercancel', finishScrubbing);
  progress.addEventListener('blur', finishScrubbing);
  progress.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) useCurrentVideoLoop();
  });
  progress.addEventListener('input', () => {
    useCurrentVideoLoop();
    if (video.readyState > 0) video.currentTime = Number(progress.value);
    updatePlayback();
  });
  ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'ended', 'emptied', 'seeked'].forEach(name => video.addEventListener(name, updatePlayback));
  ['play', 'playing'].forEach(name => video.addEventListener(name, startProgressFrames));
  ['pause', 'ended', 'emptied'].forEach(name => video.addEventListener(name, stopProgressFrames));
  video.addEventListener('ended', () => {
    if (manualPlayback) return;
    select((selected + 1) % cases.length, false);
    // Move only the gallery viewport, leaving the page scroll position intact.
    if (sidebar.matches) {
      const target = thumbnails.children[selected];
      const top = target.offsetTop - thumbnails.children[0].offsetTop;
      if (top < thumbnails.scrollTop || top + target.offsetHeight > thumbnails.scrollTop + thumbnails.clientHeight) {
        thumbnails.scrollTo({ top, behavior: motion.matches ? 'instant' : 'smooth' });
      }
    } else movePage(Math.floor(selected / pageSize));
  });
  video.addEventListener('error', () => { error.hidden = false; });
  previous.addEventListener('click', () => movePage(page - 1));
  next.addEventListener('click', () => movePage(page + 1));
  thumbnails.setAttribute('tabindex', '0');
  thumbnails.setAttribute('role', 'region');
  thumbnails.setAttribute('aria-label', 'Demo gallery; scroll horizontally or use the previous and next buttons');
  thumbnails.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncPageFromScroll, 140);
  }, { passive: true });
  thumbnails.addEventListener('scrollend', () => {
    clearTimeout(scrollTimer);
    syncPageFromScroll();
  });
  thumbnails.addEventListener('keydown', event => {
    if (event.target !== thumbnails) return;
    if (sidebar.matches) {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const top = event.key === 'Home' ? 0 : event.key === 'End' ? thumbnails.scrollHeight : thumbnails.scrollTop + (event.key === 'ArrowDown' ? 1 : -1) * thumbnails.clientHeight * .8;
      thumbnails.scrollTo({ top, behavior: motion.matches ? 'instant' : 'smooth' });
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') movePage(0);
    else if (event.key === 'End') movePage(Math.ceil(cases.length / pageSize) - 1);
    else movePage(page + (event.key === 'ArrowRight' ? 1 : -1));
  });
  mobile.addEventListener('change', () => {
    pageSize = mobile.matches ? 3 : 6;
    page = Math.floor(selected / pageSize);
    renderIndex();
  });
  sidebar.addEventListener('change', () => {
    page = Math.floor(selected / pageSize);
    movePage(page, false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopProgressFrames(); scrubbing = false; video.pause(); }
    else autoplayVisibleDemo();
  });
  document.addEventListener('media-viewer:change', event => {
    inViewer = event.detail.open && Boolean(event.detail.element?.contains(video));
    viewerBlocking = event.detail.open && !inViewer;
    if (viewerBlocking) video.pause();
    else autoplayVisibleDemo();
  });
  document.addEventListener('chapter:ready', autoplayVisibleDemo);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView || inViewer) autoplayVisibleDemo();
    else video.pause();
  }, { threshold: .25 }).observe(video);
  // A single two-panel video keeps both methods frame-accurate during play and seek.
  renderIndex();
  select(0, false);
  video.controls = false;
  controls.hidden = false;
})();
