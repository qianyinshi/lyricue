/** Native SVG adaptation of the Musician timing-mode illustration, with no app imports. */
export function renderModeIllustration(container: HTMLElement, mode: 'tap' | 'hold', locale: 'zh-CN' | 'en') {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const root = svg('svg', { viewBox: '0 0 320 180', class: 'timing-illustration is-' + mode, 'aria-hidden': 'true' });
  const cues = mode === 'tap' ? [[.1, .3], [.3, .5], [.5, .7], [.7, .9]] : [[.1, .24], [.34, .48], [.58, .72], [.82, .9]];
  const keyTimes = [0, ...cues.flatMap(([start, end]) => [start, mode === 'tap' ? start + .04 : end]), 1].join(';');
  const colors = (up: string, down: string) => [up, ...cues.flatMap(() => [down, up]), up].join(';');
  const animate = (node: SVGElement, attributes: Record<string, string | number>, transform = false) => {
    if (!reduced) node.append(svg(transform ? 'animateTransform' : 'animate', { dur: '8s', repeatCount: 'indefinite', ...attributes }));
  };
  const hand = svg('g', { class: 'demo-hand', fill: 'white', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const finger = svg('g', { transform: 'translate(137 -1) rotate(180 24 27)' });
  finger.append(svg('path', { d: 'M16 37 9 28c-2-3 1-6 4-4l3 3V7c0-4 6-4 6 0v15c0-4 6-4 6 0v2c0-4 6-4 6 0v2c0-4 6-4 6 0v10c0 10-5 15-13 15-5 0-8-6-11-14Z' }), svg('path', { d: 'M22 22v8m6-6v7m6-5v6' })); hand.append(finger);
  const key = svg('g', { class: 'demo-key', color: '#303030' });
  animate(key, { attributeName: 'color', values: colors('#303030', '#fff'), keyTimes, calcMode: 'discrete' });
  const face = svg('rect', { x: 114, y: 62, width: 92, height: 25, rx: 5, fill: '#fff', stroke: '#c9cdca' });
  animate(face, { attributeName: 'fill', values: colors('#fff', '#a4312d'), keyTimes, calcMode: 'discrete' });
  animate(face, { attributeName: 'stroke', values: colors('#c9cdca', '#a4312d'), keyTimes, calcMode: 'discrete' });
  const keyText = svg('text', { x: 169, y: 78, 'text-anchor': 'middle', 'font-size': 11, fill: 'currentColor' }); keyText.textContent = locale === 'en' ? 'Space' : '空格';
  key.append(svg('rect', { x: 114, y: 65, width: 92, height: 25, rx: 5, fill: '#dededa' }), face, svg('path', { d: 'M132 70v7h13v-7', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }), keyText);
  const wave = Array.from({ length: 97 }, (_, index) => { const height = 3 + Math.abs(Math.sin(index * 1.8) * Math.sin(index * .19)) * 27; return 'M' + (index * 3 + 16) + ' ' + (112 - height / 2) + 'v' + height; }).join(' ');
  root.append(hand, key, svg('path', { d: 'M16 112h288', stroke: '#e0e5df' }), svg('path', { d: wave, stroke: '#688276', 'stroke-width': 1.8 }));
  const at = (time: number) => 16 + (time - .06) / .84 * 288;
  cues.forEach(([start, end], index) => {
    const x = at(start), width = at(end) - x, times = '0;' + start + ';' + end + ';1';
    const clip = svg('rect', { x, y: 144, width: reduced ? width : 0, height: 25, rx: 3, fill: '#e8ece8', stroke: '#c9cdca' });
    animate(clip, { attributeName: 'width', values: '0;0;' + width + ';' + width, keyTimes: times });
    animate(clip, { attributeName: 'fill', values: '#f6e2df;#f6e2df;#e8ece8;#e8ece8', keyTimes: times, calcMode: 'discrete' });
    animate(clip, { attributeName: 'stroke', values: '#a4312d;#a4312d;#c9cdca;#c9cdca', keyTimes: times, calcMode: 'discrete' });
    const label = svg('text', { x: x + 5, y: 160, 'font-size': 10, fill: '#58675d', opacity: reduced ? 1 : 0 }); label.textContent = locale === 'en' ? 'Line ' + (index + 1) : ['第一句', '第二句', '第三句', '第四句'][index];
    animate(label, { attributeName: 'opacity', values: '0;0;1;1', keyTimes: '0;' + start + ';' + (start + .04) + ';1' });
    const group = svg('g', { class: 'demo-cue' }); group.append(clip, label); root.append(group);
  });
  const cursor = svg('g', { class: 'demo-playhead', transform: 'translate(' + (reduced ? 304 : 16) + ' 0)' });
  animate(cursor, { attributeName: 'transform', type: 'translate', values: '16 0;16 0;304 0;304 0', keyTimes: '0;.06;.9;1' }, true);
  cursor.append(svg('path', { d: 'M0 96v78M-3 94h6l-3 5Z', fill: '#a4312d', stroke: '#a4312d', 'stroke-width': 1 })); root.append(cursor);
  container.replaceChildren(root);
}
