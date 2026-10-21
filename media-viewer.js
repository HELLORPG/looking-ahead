(() => {
  const dialog = document.querySelector('#media-viewer');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const content = dialog.querySelector('.media-viewer-content');
  const title = dialog.querySelector('#media-viewer-title');
  const closeButton = dialog.querySelector('.media-viewer-close');
  const zoomTools = dialog.querySelector('.media-viewer-zoom');
  const zoomValue = dialog.querySelector('.media-viewer-zoom-value');
  const stage = dialog.querySelector('.media-viewer-stage');
  let active = null;
  let zoom = 1;
  function notify(open, element) {
    document.dispatchEvent(new CustomEvent('media-viewer:change', { detail: { open, element } }));
  }
  function setZoom(value) {
    zoom = Math.min(3, Math.max(1, value));
    content.style.setProperty('--media-zoom', zoom);
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    dialog.querySelector('[data-media-zoom="out"]').disabled = zoom === 1;
    dialog.querySelector('[data-media-zoom="in"]').disabled = zoom === 3;
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  function open({ trigger, element, image, label, kind }) {
    if (dialog.open) return;
    const scroll = { x: window.scrollX, y: window.scrollY };
    active = { trigger, element, scroll };
    title.textContent = label;
    dialog.dataset.kind = kind;
    content.classList.toggle('media-viewer-showcase', kind === 'video');
    zoomTools.hidden = kind !== 'image';
    document.documentElement.classList.add('media-viewer-open');
    if (element) {
      const rect = element.getBoundingClientRect();
      const placeholder = document.createElement('div');
      placeholder.className = 'media-viewer-placeholder';
      placeholder.style.height = `${rect.height}px`;
      placeholder.setAttribute('aria-hidden', 'true');
      element.before(placeholder);
      active.placeholder = placeholder;
      active.wasPlaying = Boolean(element.querySelector('video') && !element.querySelector('video').paused);
      content.append(element);
    } else {
      const img = document.createElement('img');
      img.className = 'media-viewer-image';
      img.alt = label;
      img.src = image;
      img.draggable = false;
      content.append(img);
    }
    dialog.showModal();
    notify(true, element || null);
    setZoom(1);
    stage.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    closeButton.focus({ preventScroll: true });
    if (active.wasPlaying) {
      const video = element.querySelector('video');
      video.muted = true;
      video.play().catch(() => {});
    }
  }
  dialog.addEventListener('close', () => {
    if (!active) return;
    const previous = active;
    active = null;
    if (previous.element) {
      const video = previous.element.querySelector('video');
      const resume = video && !video.paused;
      previous.placeholder.replaceWith(previous.element);
      if (resume) {
        if (video && !document.hidden) {
          video.muted = true;
          video.play().catch(() => {});
        }
      }
    }
    content.replaceChildren();
    content.classList.remove('media-viewer-showcase');
    document.documentElement.classList.remove('media-viewer-open');
    notify(false, previous.element);
    window.scrollTo({ left: previous.scroll.x, top: previous.scroll.y, behavior: 'instant' });
    if (previous.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
  });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === stage || event.target === content) close(); });
  dialog.querySelectorAll('[data-media-zoom]').forEach(button => button.addEventListener('click', () => {
    setZoom(button.dataset.mediaZoom === 'fit' ? 1 : zoom + (button.dataset.mediaZoom === 'in' ? .5 : -.5));
  }));
  document.addEventListener('click', event => {
    const imageLink = event.target.closest('a[data-media-viewer="image"]');
    if (imageLink) {
      event.preventDefault();
      open({ trigger: imageLink, image: imageLink.href, label: imageLink.querySelector('img')?.alt || 'Future Chunk Prediction architecture', kind: 'image' });
      return;
    }
    const button = event.target.closest('[data-viewer-target]');
    if (!button) return;
    event.preventDefault();
    if (dialog.open) { close(); return; }
    const element = document.querySelector(button.dataset.viewerTarget);
    if (!element) return;
    open({ trigger: button, element, label: button.dataset.viewerTitle, kind: button.dataset.viewerKind });
  });
})();
