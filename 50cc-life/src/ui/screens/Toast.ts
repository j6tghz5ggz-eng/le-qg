import { el } from '../dom';

/** Message temporaire en bas de l'écran. Retourne une fonction pour le fermer. */
export function showToast(parent: HTMLElement, message: string, durationMs = 3000): () => void {
  const node = el('div', { className: 'toast', text: message, attrs: { role: 'status' } });
  parent.appendChild(node);
  const close = (): void => node.remove();
  if (durationMs > 0) window.setTimeout(close, durationMs);
  return close;
}
