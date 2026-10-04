import { bus } from '../core/EventBus.js';

/** Tiny hyperscript helper: h('div.cls#id', { onclick, style, ... }, children) */
export function h(sel, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs !== undefined && attrs !== null) children.unshift(attrs);
    attrs = {};
  }
  const m = sel.match(/^([a-z0-9]+)?([#.][^]*)?$/i);
  const el = document.createElement((m && m[1]) || 'div');
  const rest = (m && m[2]) || '';
  for (const part of rest.match(/[#.][^#.]+/g) || []) {
    if (part[0] === '#') el.id = part.slice(1);
    else el.classList.add(part.slice(1));
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      const ev = k.slice(2).toLowerCase();
      el.addEventListener(ev, (e) => {
        if (ev === 'click') bus.emit('ui:click', {});
        v(e);
      });
    } else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function stars(n, max = 3) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}

/** Segmented control */
export function seg(options, value, onChange) {
  const wrap = h('div.seg');
  const render = () => {
    clear(wrap);
    for (const o of options) {
      const b = h('button', { class: o.value === value ? 'on' : '', disabled: o.disabled, title: o.title || '', onclick: () => {
        if (o.disabled) return;
        value = o.value;
        render();
        onChange(o.value);
      } }, o.label);
      wrap.appendChild(b);
    }
  };
  render();
  return wrap;
}

export function range(min, max, step, value, onInput, fmt = (v) => v) {
  const out = h('span.muted.small', fmt(value));
  const input = h('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => {
    out.textContent = fmt(+input.value);
    onInput(+input.value);
  });
  return h('div.row', input, h('span', { style: { minWidth: '4.5em', textAlign: 'right' } }, out));
}
