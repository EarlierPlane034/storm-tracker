/** In-app toast banners (also the visible fallback when notifications are denied). */
import { el } from '../utils.js';

const MAX_VISIBLE = 3;

export function showToast(message, { level = 'info', ttlMs = 7000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  while (host.children.length >= MAX_VISIBLE) host.firstChild.remove();
  const toast = el('div', {
    class: `toast ${level === 'danger' ? 'danger' : level === 'warn' ? 'warn' : ''}`,
    text: message,
    onclick: () => toast.remove(),
  });
  host.appendChild(toast);
  setTimeout(() => toast.remove(), ttlMs);
}
