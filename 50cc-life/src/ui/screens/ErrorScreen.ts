import { t } from '../i18n';
import { el } from '../dom';

/** Écran d'erreur bloquante, avec bouton de rechargement. */
export function showFatalError(parent: HTMLElement, message: string, detail?: string): void {
  parent.querySelector('.fatal')?.remove();
  const children: Node[] = [
    el('h1', { text: t('error.title') }),
    el('p', { text: message }),
  ];
  if (detail) children.push(el('pre', { className: 'fatal__detail', text: detail }));
  const reload = el('button', { className: 'btn', text: t('error.reload'), attrs: { type: 'button' } });
  reload.addEventListener('click', () => window.location.reload());
  children.push(reload);
  parent.appendChild(el('div', { className: 'fatal', attrs: { role: 'alert' } }, children));
}
