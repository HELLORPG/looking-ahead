#!/usr/bin/env python3
"""Rebuild the IQ vs estimated training compute figure from supplied source data.

Requires pygal. Measured points plus constrained exponential trend overlays.
"""
import csv
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pygal
from pygal.style import Style

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'assets/data/convergence'
OUTPUT = ROOT / 'assets/figures'



def fit_saturating_exponential(points):
    """Same unweighted profiled saturation model as the research plot.py.

    Normalize x to [0,1], constrain gain >= 0, search 129 log-tau values
    in [1e-4,1e4], then refine the best bracket. Golden-section refinement
    keeps this standalone exporter free of NumPy/SciPy dependencies.
    Only render inside the measured domain; saturation is a model assumption.
    """
    x = [point['training_flops'] / 1e20 for point in points]
    y = [point['iq'] for point in points]
    assert len(x) >= 3 and all(b > a for a, b in zip(x, x[1:]))
    span = x[-1] - x[0]
    t = [(value - x[0]) / span for value in x]
    mean_y = math.fsum(y) / len(y)
    def parameters(log_tau):
        tau = math.exp(log_tau)
        basis = [-math.expm1(-value / tau) / -math.expm1(-1 / tau) for value in t]
        mean_basis = math.fsum(basis) / len(basis)
        centered = [value - mean_basis for value in basis]
        gain = max(0., math.fsum(a * (b - mean_y) for a, b in zip(centered, y)) /
                   math.fsum(a * a for a in centered))
        intercept = mean_y - gain * mean_basis
        error = math.fsum((intercept + gain * a - b) ** 2 for a, b in zip(basis, y))
        return error, intercept, gain, tau
    grid = [math.log(1e-4) + i * (math.log(1e4) - math.log(1e-4)) / 128 for i in range(129)]
    best = min(range(129), key=lambda i: parameters(grid[i])[0])
    lo, hi = grid[max(0, best - 1)], grid[min(128, best + 1)]
    ratio = (math.sqrt(5) - 1) / 2
    left, right = hi - ratio * (hi - lo), lo + ratio * (hi - lo)
    for _ in range(200):
        if hi - lo < 1e-10:
            break
        if parameters(left)[0] < parameters(right)[0]:
            hi, right = right, left
            left = hi - ratio * (hi - lo)
        else:
            lo, left = left, right
            right = lo + ratio * (hi - lo)
    optimum = min([grid[best], (lo + hi) / 2], key=lambda v: parameters(v)[0])
    error, intercept, gain, tau = parameters(optimum)
    fit = []
    for i in range(200):
        normalized = i / 199
        value = intercept + gain * (-math.expm1(-normalized / tau) / -math.expm1(-1 / tau))
        fit.append((x[0] + normalized * span, value))
    return fit, {'intercept': intercept, 'gain': gain, 'tau_over_span': tau,
                 'x_min_1e20_flops': x[0], 'x_max_1e20_flops': x[-1],
                 'sum_squared_error': error}


def main():
    published = json.loads((DATA / 'plotted_points.json').read_text())
    per_step = {entry['method']: entry['estimated_flops_per_global_step']
                for entry in published['series']}
    with (DATA / 'evaluation_scores.csv').open(newline='') as source:
        rows = list(csv.DictReader(source))
    series = []
    for method, label in [('TF baseline', 'Teacher forcing'), ('Ours', '+ FCP')]:
        points = sorted(({'step': int(row['step']),
                          'training_flops': int(row['step']) * per_step[method],
                          'iq': float(row['mean']),
                          'sample_presentations': int(row['step']) * published['global_batch_size']}
                         for row in rows if row['method'] == method), key=lambda row: row['step'])
        assert len(points) == 7
        series.append({'method': method, 'label': label,
                       'estimated_flops_per_global_step': per_step[method], 'points': points})
    result = {'model': 'Wan2.1-1.3B', 'compute_method': published['compute_method'],
              'x': 'Cumulative estimated training FLOPs', 'y': 'Physics-IQ mean',
              'series': series, 'global_batch_size': published['global_batch_size'],
              'color_depth': 'Light to dark encodes cumulative sample presentations (including repeats), 40000 to 160000', 'fit_model': 'Monotone exponential saturation, unweighted least squares; measured domain only'}
    style = Style(background='#0c111b', plot_background='#0c111b',
                  foreground='#b6c2d2', foreground_strong='#d1d9e5',
                  foreground_subtle='#27364a', guide_stroke_color='#27364a',
                  major_guide_stroke_color='#27364a', guide_stroke_dasharray='0',
                  major_guide_stroke_dasharray='0', colors=('#e6a46a', '#86b5ff', '#e6a46a', '#86b5ff', '#a7b4c7'),
                  font_family='Arial, sans-serif', label_font_size=14,
                  major_label_font_size=14, legend_font_size=15,
                  title_font_size=15, stroke_width=2.6,
                  opacity=1, opacity_hover=1)
    def make_chart(axis):
        chart = pygal.XY(width=1020, height=390, explicit_size=True,
                         style=style, show_dots=True, dots_size=4,
                         x_title='Training samples processed (×10³)' if axis == 'data' else 'Estimated training FLOPs (×10²⁰)',
                         y_title='Physics-IQ ↑',
                         xrange=(30, 170) if axis == 'data' else (.4, 2.5), range=(24.5, 32),
                         x_labels=[40, 80, 120, 160] if axis == 'data' else [.5, 1, 1.5, 2, 2.5], y_labels=[25, 27, 29, 31],
                         x_value_formatter=lambda value: f'{value:.0f}' if axis == 'data' else f'{value:.1f}',
                         value_formatter=lambda value: f'{value:.2f}',
                         legend_at_bottom=True, legend_at_bottom_columns=3, legend_box_size=12,
                         show_x_guides=True, show_y_guides=True,
                         truncate_legend=-1, margin=18, spacing=12,
                         interpolate=None, js=[], pretty_print=True)
        for data in series:
            points = [{'value': (point['sample_presentations'] / 1000 if axis == 'data' else point['training_flops'] / 1e20, point['iq']),
                       'label': f"{data['label']} · {point['step']:,} steps · IQ {point['iq']:.3f}"}
                      for point in data['points']]
            chart.add(data['label'], points)
        for data in series:
            fit, parameters = fit_saturating_exponential(data['points'])
            data['fit_parameters'] = parameters
            if axis == 'data':
                fit = [(x * 1e20 / data['estimated_flops_per_global_step'] * published['global_batch_size'] / 1000, y) for x, y in fit]
            chart.add(None, fit, show_dots=False,
                      stroke_style={'dasharray': '7, 5', 'width': 1.8, 'opacity': .45})
        chart.add('Fit', [], show_dots=False)
        return chart
    OUTPUT.mkdir(parents=True, exist_ok=True)
    def save_svg(chart, name):
        svg = chart.render().decode('utf-8')
        svg = re.sub(r'<script\b[^>]*>.*?</script>', '', svg, flags=re.S)
        svg = svg.replace('<svg ', '<svg font-weight="500" ', 1)
        svg = svg.replace('</defs>', '<style>.series.serie-2 .line,.series.serie-3 .line{stroke-opacity:.45;stroke-width:1.8}</style></defs>', 1)
        svg = svg.replace('×10²⁰', '×10<tspan baseline-shift="super" font-size="70%">20</tspan>')
        svg = svg.replace('×10³', '×10<tspan baseline-shift="super" font-size="70%">3</tspan>')
        # Each method maps identical training-step/sample counts to the same
        # relative depth, despite having different FLOPs per step.
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
        ns = '{http://www.w3.org/2000/svg}'
        root = ET.fromstring(svg)
        defs = root.find(ns + 'defs')
        palettes = [('#f9d8b8', '#d98a47'), ('#c3dcff', '#4d93ff')]
        chart_id = root.attrib['id']
        rules = []
        for method_index, (light, dark) in enumerate(palettes):
            gradient_id = f'sample-depth-{method_index}'
            gradient = ET.SubElement(defs, ns + 'linearGradient', {
                'id': gradient_id, 'x1': '0%', 'y1': '0%', 'x2': '100%', 'y2': '0%'})
            ET.SubElement(gradient, ns + 'stop', {'offset': '0%', 'stop-color': light})
            ET.SubElement(gradient, ns + 'stop', {'offset': '100%', 'stop-color': dark})
            for series_index in [method_index, method_index + 2]:
                opacity = '1' if series_index < 2 else '.45'
                rules.append(f'#{chart_id} .series.serie-{series_index} .line'
                             + '{stroke:url(#' + gradient_id + ');stroke-opacity:' + opacity + '}')
            light_rgb = [int(light[i:i+2], 16) for i in (1, 3, 5)]
            dark_rgb = [int(dark[i:i+2], 16) for i in (1, 3, 5)]
            dots = []
            for group in root.iter(ns + 'g'):
                if f'serie-{method_index}' in group.attrib.get('class', '').split():
                    dots.extend(node for node in group.iter(ns + 'circle')
                                if 'dot' in node.attrib.get('class', '').split())
            assert len(dots) == len(series[method_index]['points'])
            for dot, point in zip(dots, series[method_index]['points']):
                depth = (point['sample_presentations'] - 40000) / 120000
                color = '#' + ''.join(f'{round(a + (b-a)*depth):02x}'
                                       for a, b in zip(light_rgb, dark_rgb))
                dot.set('style', f'fill:{color};stroke:{color}')
        # One neutral dashed key explains fits for both method colors.
        fit_legend = next(node for node in root.iter(ns + 'g')
                          if node.attrib.get('id') == 'activate-serie-4')
        box = fit_legend.find(ns + 'rect')
        x, y = float(box.attrib['x']), float(box.attrib['y'])
        width, height = float(box.attrib['width']), float(box.attrib['height'])
        box.tag = ns + 'line'
        box.attrib.clear()
        box.attrib.update({'x1': str(x), 'x2': str(x + 32),
                           'y1': str(y + height / 2), 'y2': str(y + height / 2),
                           'style': 'stroke:#a7b4c7;stroke-width:2;stroke-dasharray:4,3;fill:none'})
        fit_legend.find(ns + 'text').set('x', str(x + 44))
        for legend_id in ['activate-serie-0', 'activate-serie-1']:
            legend = next(node for node in root.iter(ns + 'g')
                          if node.attrib.get('id') == legend_id)
            marker = legend.find(ns + 'rect')
            legend.find(ns + 'text').set('x', str(float(marker.attrib['x']) + 24))
        ET.SubElement(defs, ns + 'style').text = '\n'.join(rules)
        (OUTPUT / name).write_text(ET.tostring(root, encoding='unicode'))
    for axis in ['compute', 'data']:
        chart = make_chart(axis)
        save_svg(chart, f'{axis}-convergence.svg')
        chart.config.width = 640
        chart.config.height = 410
        save_svg(chart, f'{axis}-convergence-mobile.svg')
    (DATA / 'plotted_points.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Plotted 14 measured IQ points against cumulative method-specific training FLOPs.')


if __name__ == '__main__':
    main()
