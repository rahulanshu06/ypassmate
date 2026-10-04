import { h, clear } from './dom.js';
import { bus } from '../core/EventBus.js';
import { settings } from '../core/Settings.js';

/**
 * Screen stack, toasts, modal dialogs, subtitles and tooltips on top of the 3D canvas.
 */
export class UIManager {
  constructor(root) {
    this.root = root;
    this.screenLayer = h('div.passthrough', { style: { position: 'absolute', inset: '0' } });
    this.hudLayer = h('div.passthrough', { style: { position: 'absolute', inset: '0' } });
    this.overlay = h('div.passthrough', { style: { position: 'absolute', inset: '0' } });
    this.toasts = h('div.toast-wrap');
    this.tooltip = h('div.tooltip', { style: { display: 'none' } });
    root.append(this.hudLayer, this.screenLayer, this.overlay, this.toasts, this.tooltip);
    this.current = null;
    this.stack = [];
    this.applyScale();
    bus.on('settings:changed', ({ key }) => {
      if (key === 'uiScale' || key === '*') this.applyScale();
      if ((key === 'language' || key === '*') && this.current && this.current.rerender) this.current.rerender();
    });
    bus.on('toast', ({ text, ms }) => this.toast(text, ms));
  }

  applyScale() {
    document.documentElement.style.setProperty('--ui-scale', settings.get('uiScale') || 1);
  }

  /** Show a screen object { el, onShow?, onHide?, rerender? } replacing the current one. */
  show(screen, { push = false } = {}) {
    if (this.current) {
      if (push) this.stack.push(this.current);
      else if (this.current.onHide) this.current.onHide();
      this.current.el.remove();
    }
    this.current = screen;
    if (screen) {
      screen.el.style.pointerEvents = 'auto';
      this.screenLayer.appendChild(screen.el);
      if (screen.onShow) screen.onShow();
      const first = screen.el.querySelector('[autofocus], .menu-item, .btn.primary');
      if (first && first.focus) setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
  }

  back() {
    if (!this.stack.length) return false;
    if (this.current) {
      if (this.current.onHide) this.current.onHide();
      this.current.el.remove();
    }
    this.current = this.stack.pop();
    this.screenLayer.appendChild(this.current.el);
    if (this.current.rerender) this.current.rerender();
    return true;
  }

  hideScreens() {
    if (this.current) {
      if (this.current.onHide) this.current.onHide();
      this.current.el.remove();
    }
    for (const s of this.stack) if (s.onHide) s.onHide();
    this.current = null;
    this.stack = [];
  }

  toast(text, ms = 2600) {
    const t = h('div.toast', text);
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  modal(title, body, buttons) {
    return new Promise((resolve) => {
      const back = h('div.modal-back');
      const close = (v) => {
        back.remove();
        resolve(v);
      };
      const box = h('div.modal.glass', h('h3', title), typeof body === 'string' ? h('p.muted', body) : body,
        h('div.row', { style: { justifyContent: 'flex-end', marginTop: '1em' } },
          buttons.map((b) => h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { onclick: () => close(b.value) }, b.label))));
      back.appendChild(box);
      back.style.pointerEvents = 'auto';
      this.overlay.appendChild(back);
    });
  }

  showTooltip(text, x, y) {
    if (!text) {
      this.tooltip.style.display = 'none';
      return;
    }
    this.tooltip.textContent = text;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = x + 14 + 'px';
    this.tooltip.style.top = y + 14 + 'px';
  }

  clearHud() {
    clear(this.hudLayer);
  }
}
