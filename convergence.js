(() => {
  const host = document.querySelector('#convergence-chart-host');
  const source = document.querySelector('#convergence-chart-data');
  if (!host || !source) return;
  const data = JSON.parse(source.textContent);
  const svg = host.querySelector('svg');
  const buttons = [...document.querySelectorAll('[data-training-budget]')];
  const namespace = 'http://www.w3.org/2000/svg';
  const colors = [['#f9d8b8', '#d98a47'], ['#c3dcff', '#4d93ff']];
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true, addEventListener() {} };
  const chapter = host.closest ? host.closest('.section') : null;
  let revealed = motion.matches || !('IntersectionObserver' in window) || typeof svg.animate !== 'function';
  let playing = false;
  let inView = false;
  let animations = [];
  let observer;
  host.dataset.convergenceReveal = revealed ? 'visible' : 'pending';
  let axis = 'compute';
  let previousWidth = 0;
  let frame = null;
  const node = (tag, attrs = {}, text) => {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const mix = (light, dark, amount) => '#' + [1, 3, 5].map(offset => {
    const a = parseInt(light.slice(offset, offset + 2), 16);
    const b = parseInt(dark.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  }).join('');
  function equalScoreComparison() {
    const baseline = data.series.find(series => series.method === 'TF baseline');
    const fcp = data.series.find(series => series.method === 'Ours');
    const target = fcp.points[0];
    const fit = baseline.fit_parameters;
    if (!(fit.gain > 0)) return null;
    const relativeScore = (target.iq - fit.intercept) / fit.gain;
    if (relativeScore < 0 || relativeScore > 1) return null;
    const fraction = -fit.tau_over_span * Math.log1p(-relativeScore * -Math.expm1(-1 / fit.tau_over_span));
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
    const baselineCompute = fit.x_min_1e20_flops + fraction * (fit.x_max_1e20_flops - fit.x_min_1e20_flops);
    const baselineSamples = baselineCompute * 1e20 / baseline.estimated_flops_per_global_step * data.global_batch_size;
    return { target, baselineCompute, baselineSamples };
  }
  const comparison = equalScoreComparison();
  function render() {
    const width = Math.round(host.getBoundingClientRect().width);
    if (width < 100) return;
    if (playing) finishEntrance();
    previousWidth = width;
    const compact = width < 420;
    const expanded = Boolean(host.closest && host.closest('.media-viewer'));
    const height = expanded ? Math.max(240, Math.min(600, width * .5, window.innerHeight - 180)) : compact ? 340 : Math.max(340, Math.min(380, width * .52));
    const left = 54, right = 24, top = 16, bottom = 66;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const xmin = axis === 'compute' ? .4 : 30;
    const xmax = axis === 'compute' ? 2.5 : 170;
    const x = value => left + (value - xmin) / (xmax - xmin) * plotWidth;
    const y = value => top + (32 - value) / (32 - 23.5) * plotHeight;
    const pointX = point => axis === 'compute' ? point.training_flops / 1e20 : point.sample_presentations / 1000;
    const content = [];
    content.push(node('title', { id: 'convergence-native-title' }, `${data.model}: IQ versus ${axis === 'compute' ? 'training compute' : 'samples seen'}`));
    content.push(node('desc', { id: 'convergence-native-description' }, 'Teacher forcing is orange; FCP is blue. Solid lines and dots show measured IQ scores. Dashed lines show monotone exponential trend fits within the observed ranges. Darker colors mean more training sample presentations, including repeated samples.'));
    const defs = node('defs');
    colors.forEach(([light, dark], index) => {
      const gradient = node('linearGradient', { id: `convergence-depth-${index}`, x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
      gradient.append(node('stop', { offset: '0%', 'stop-color': light }), node('stop', { offset: '100%', 'stop-color': dark }));
      defs.append(gradient);
    });
    content.push(defs);
    const grids = node('g', { class: 'convergence-grid' });
    const labels = node('g', { class: 'convergence-labels' });
    [25, 27, 29, 31].forEach(value => {
      grids.append(node('line', { x1: left, y1: y(value), x2: width - right, y2: y(value) }));
      labels.append(node('text', { x: left - 9, y: y(value), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, value));
    });
    const ticks = axis === 'data' ? [40, 80, 120, 160] : compact ? [.5, 1.5, 2.5] : [.5, 1, 1.5, 2, 2.5];
    ticks.forEach(value => {
      grids.append(node('line', { x1: x(value), y1: top, x2: x(value), y2: height - bottom }));
      labels.append(node('text', { x: x(value), y: height - bottom + 21, 'text-anchor': 'middle' }, axis === 'data' ? String(value) : value.toFixed(1)));
    });
    content.push(grids, labels);
    const axes = node('path', { d: `M${left},${top}V${height - bottom}H${width - right}`, class: 'convergence-axes', fill: 'none' });
    content.push(axes);
    content.push(node('text', { x: 13, y: top + plotHeight / 2, transform: `rotate(-90 13 ${top + plotHeight / 2})`, 'text-anchor': 'middle', class: 'convergence-axis-title' }, 'Physics-IQ ↑'));
    const xlabel = node('text', { x: left + plotWidth / 2, y: height - 7, 'text-anchor': 'middle', class: 'convergence-axis-title' });
    if (axis === 'data') {
      xlabel.textContent = compact ? 'Samples processed (×10' : 'Training samples processed (×10';
      xlabel.append(node('tspan', { 'baseline-shift': 'super', 'font-size': '70%' }, '3'), node('tspan', {}, ')'));
    } else {
      xlabel.textContent = compact ? 'Training FLOPs (×10' : 'Estimated training FLOPs (×10';
      xlabel.append(node('tspan', { 'baseline-shift': 'super', 'font-size': '70%' }, '20'), node('tspan', {}, ')'));
    }
    content.push(xlabel);
    const comparisonGuides = node('g', { class: 'convergence-comparison-guides', 'pointer-events': 'none' });
    content.push(comparisonGuides);
    // Render fitted trends behind measured paths, with identical precomputed parameters.
    data.series.forEach((series, index) => {
      const fit = series.fit_parameters;
      const points = Array.from({ length: 200 }, (_, i) => {
        const fraction = i / 199;
        const compute = fit.x_min_1e20_flops + fraction * (fit.x_max_1e20_flops - fit.x_min_1e20_flops);
        const score = fit.intercept + fit.gain * (-Math.expm1(-fraction / fit.tau_over_span) / -Math.expm1(-1 / fit.tau_over_span));
        const value = axis === 'compute' ? compute : compute * 1e20 / series.estimated_flops_per_global_step * data.global_batch_size / 1000;
        return `${x(value).toFixed(3)},${y(score).toFixed(3)}`;
      });
      content.push(node('polyline', { points: points.join(' '), fill: 'none', stroke: `url(#convergence-depth-${index})`, 'stroke-width': 1.8, 'stroke-dasharray': '6 4', opacity: .45, 'data-curve': 'fit' }));
    });
    data.series.forEach((series, index) => {
      content.push(node('polyline', { points: series.points.map(point => `${x(pointX(point)).toFixed(3)},${y(point.iq).toFixed(3)}`).join(' '), fill: 'none', stroke: `url(#convergence-depth-${index})`, 'stroke-width': 2.3, 'stroke-linejoin': 'round', 'data-curve': 'measured', 'data-series-index': index }));
      series.points.forEach(point => {
        const depth = (point.sample_presentations - 40000) / 120000;
        const dot = node('circle', { cx: x(pointX(point)), cy: y(point.iq), r: 3.6, fill: mix(...colors[index], depth), 'data-step': point.step, 'data-series-index': index });
        dot.append(node('title', {}, `${series.label} · ${point.step.toLocaleString()} steps · IQ ${point.iq.toFixed(3)} · ${(point.training_flops / 1e20).toFixed(3)} ×10²⁰ FLOPs · ${point.sample_presentations.toLocaleString()} samples seen`));
        content.push(dot);
      });
    });
    if (comparison) {
      const { target, baselineCompute, baselineSamples } = comparison;
      const fcpBudget = pointX(target);
      const baselineBudget = axis === 'compute' ? baselineCompute : baselineSamples / 1000;
      const saving = (1 - fcpBudget / baselineBudget) * 100;
      const from = x(fcpBudget), to = x(baselineBudget), level = y(target.iq);
      const arrowY = y(23.9);
      const annotation = node('g', { class: 'convergence-comparison', 'data-saving-percent': saving.toFixed(1), 'data-target-iq': target.iq, 'data-arrow-y': arrowY, 'data-plot-bottom': height - bottom });
      annotation.append(node('title', {}, `At IQ ${target.iq.toFixed(3)}, FCP uses ${saving.toFixed(1)}% less ${axis === 'compute' ? 'estimated training compute' : 'training sample presentations'} than the Teacher forcing fit. This compares an FCP measured point with an in-domain fitted TF estimate.`));
      [from, to].forEach(position => comparisonGuides.append(node('line', {
        x1: position, y1: level + 6, x2: position, y2: arrowY,
        stroke: '#9dbbe5', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: .5
      })));
      comparisonGuides.append(node('line', { x1: from + 2, y1: arrowY, x2: to - 2, y2: arrowY, stroke: '#b5d3ff', 'stroke-width': 1.6 }));
      comparisonGuides.append(node('path', { d: `M${from + 7},${arrowY - 3}L${from + 2},${arrowY}L${from + 7},${arrowY + 3}M${to - 7},${arrowY - 3}L${to - 2},${arrowY}L${to - 7},${arrowY + 3}`, fill: 'none', stroke: '#b5d3ff', 'stroke-width': 1.6 }));
      const crossing = node('circle', { cx: to, cy: level, r: 4.5, fill: '#0c111b', stroke: '#e6a46a', 'stroke-width': 1.8, 'data-fit-crossing': baselineBudget });
      crossing.append(node('title', {}, `TF fit: IQ ${target.iq.toFixed(3)} at ${baselineBudget.toFixed(3)} ${axis === 'compute' ? '×10²⁰ FLOPs' : 'thousand sample presentations'}`));
      annotation.append(crossing);
      // Keep the comparison in a clear lane inside the plot, below all observed scores.
      const labelX = (from + to) / 2;
      const labelGroup = node('g', { 'data-comparison-label': '', 'data-label-x': labelX - 95, 'data-label-y': y(24.5) - 15, 'data-label-width': 190, 'data-label-height': 18 });
      labelGroup.append(node('text', { x: labelX, y: y(24.5), 'text-anchor': 'middle', fill: '#a9cbff', 'font-size': compact ? 14 : 15, 'font-weight': 600 }, `${saving.toFixed(1)}% less ${axis === 'compute' ? 'compute' : 'data'}`));
      annotation.append(labelGroup);
      content.push(annotation);
    }
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.replaceChildren(...content);
  }
  function finishEntrance() {
    playing = false;
    revealed = true;
    host.dataset.convergenceReveal = 'visible';
    animations.forEach(animation => animation.cancel());
    animations = [];
    svg.querySelectorAll('[data-curve="measured"]').forEach(line => {
      line.style.removeProperty('stroke-dasharray');
      line.style.removeProperty('stroke-dashoffset');
    });
    if (observer) observer.disconnect();
  }
  function maybePlayEntrance() {
    if (revealed || playing || !inView || document.hidden || !previousWidth) return;
    if (['pending', 'aligning'].includes(chapter?.dataset.chapterEntry) || document.documentElement.dataset.chapterAligning || document.body.dataset.intro) return;
    playing = true;
    revealed = true;
    host.dataset.convergenceReveal = 'visible';
    const animate = (element, frames, options) => {
      animations.push(element.animate(frames, { fill: 'both', ...options }));
    };
    [0, 1].forEach(index => {
      const delay = index * 700;
      const line = svg.querySelector(`[data-curve="measured"][data-series-index="${index}"]`);
      line.setAttribute('pathLength', '1');
      line.style.strokeDasharray = '1';
      animate(line, [{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }], { delay, duration: 650, easing: 'linear' });
      const dots = [...svg.querySelectorAll(`circle[data-step][data-series-index="${index}"]`)];
      const distances = [0];
      dots.slice(1).forEach((dot, i) => distances.push(distances[i] + Math.hypot(
        Number(dot.getAttribute('cx')) - Number(dots[i].getAttribute('cx')),
        Number(dot.getAttribute('cy')) - Number(dots[i].getAttribute('cy')))));
      const total = distances[distances.length - 1] || 1;
      dots.forEach((dot, i) => animate(dot, [{ opacity: 0 }, { opacity: 1 }], {
        delay: delay + distances[i] / total * 650, duration: 150, easing: 'ease-out'
      }));
    });
    svg.querySelectorAll('[data-curve="fit"]').forEach(line => animate(line,
      [{ opacity: 0 }, { opacity: .45 }], { delay: 1450, duration: 300, easing: 'ease-out' }));
    svg.querySelectorAll('.convergence-comparison-guides, .convergence-comparison').forEach(group => animate(group,
      [{ opacity: 0 }, { opacity: 1 }], { delay: 1650, duration: 300, easing: 'ease-out' }));
    if (observer) observer.disconnect();
    const currentAnimations = animations;
    Promise.allSettled(currentAnimations.map(animation => animation.finished)).then(() => {
      if (playing && animations === currentAnimations) finishEntrance();
    });
  }
  const schedule = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = null; render(); maybePlayEntrance(); });
  };
  buttons.forEach(button => button.addEventListener('click', () => {
    if (!revealed || playing) finishEntrance();
    axis = button.dataset.trainingBudget;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  if ('ResizeObserver' in window) {
    new ResizeObserver(entries => {
      if (Math.round(entries[0].contentRect.width) !== previousWidth) schedule();
    }).observe(host);
  } else window.addEventListener('resize', schedule);
  render();
  if (!revealed) {
    observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      maybePlayEntrance();
    }, { threshold: .25 });
    observer.observe(host);
  }
  document.addEventListener('media-viewer:change', event => {
    if (event.detail.element?.contains(host)) { finishEntrance(); schedule(); }
  });
  window.addEventListener('resize', () => {
    if (host.closest?.('.media-viewer')) schedule();
  });
  document.addEventListener('chapter:ready', maybePlayEntrance);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) finishEntrance();
    else maybePlayEntrance();
  });
  motion.addEventListener('change', () => {
    if (motion.matches) finishEntrance();
  });
})();
