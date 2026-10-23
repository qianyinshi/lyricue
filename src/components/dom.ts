export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function text(node: HTMLElement, value: string) { if (node.textContent !== value) node.textContent = value; }
export function attr(node: HTMLElement, name: string, value: string | number | boolean | null) {
  if (value === null) node.removeAttribute(name);
  else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
}
export const icons = {
  enter: '<path d="M20 4v9H4m6-6-6 6 6 6"/>',
  space: '<path d="M4 9v6h16V9"/>',
  backspace: '<path d="M9 5h12v14H9l-7-7 7-7Zm3 4 6 6m0-6-6 6"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  thumb: '<path d="M7 10v11H3V10Zm0 0 5-8c3 0 3 3 2 7h6c2 0 2 2 1 4l-2 7a2 2 0 0 1-2 1H7"/>',
};
export function icon(name: keyof typeof icons) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); svg.classList.add('lyric-editor-icon');
  // Only static, package-owned SVG paths enter innerHTML. Lyrics always use textContent.
  svg.innerHTML = icons[name];
  return svg;
}
export function button(label: string, activate: () => void, primary = false) {
  const node = element('button', 'lyric-editor-button' + (primary ? ' is-primary' : ''), label);
  node.type = 'button'; node.addEventListener('click', activate); return node;
}

export function keycap(label: string, shortcut: string, name: string, activate: () => void, glyph?: keyof typeof icons,
  hold?: { start: () => void; end: () => void; cancel: () => void }) {
  const node = element('button', 'lyric-shortcut-key'); node.type = 'button';
  attr(node, 'aria-label', label); attr(node, 'aria-keyshortcuts', shortcut);
  const kbd = element('kbd'); if (glyph) kbd.append(icon(glyph)); kbd.append(document.createTextNode(name)); node.append(kbd);
  let pointer: number | null = null, heldKey: string | null = null, suppress = false;
  const cancel = () => {
    if (pointer === null && heldKey === null) return;
    pointer = null; heldKey = null; node.classList.remove('is-held'); hold?.cancel();
  };
  node.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (!hold || pointer !== null || heldKey !== null) return;
    pointer = event.pointerId; suppress = true; node.classList.add('is-held'); node.setPointerCapture(event.pointerId); hold.start();
  });
  node.addEventListener('pointerup', event => {
    if (pointer !== event.pointerId) return;
    pointer = null; node.classList.remove('is-held'); hold?.end();
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
  });
  node.addEventListener('pointercancel', cancel); node.addEventListener('lostpointercapture', cancel);
  node.addEventListener('keydown', event => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); if (event.repeat) return;
    if (hold) {
      if (pointer !== null || heldKey !== null) return;
      heldKey = event.key; node.classList.add('is-held'); hold.start();
    } else activate();
  });
  node.addEventListener('keyup', event => {
    if (event.key !== heldKey) return;
    event.preventDefault(); event.stopPropagation(); heldKey = null; node.classList.remove('is-held'); hold?.end();
  });
  node.addEventListener('blur', () => { if (heldKey !== null) cancel(); });
  node.addEventListener('click', event => { if (event.detail > 0 && suppress) { suppress = false; return; } activate(); });
  return node;
}
