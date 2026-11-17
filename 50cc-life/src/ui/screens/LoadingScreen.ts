import { el } from '../dom';

/** Écran de chargement : titre, barre de progression, étape en cours. */
export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly label: HTMLElement;

  constructor(parent: HTMLElement) {
    this.fill = el('div', { className: 'loading__fill' });
    this.label = el('p', { className: 'loading__label' });
    this.root = el('div', { className: 'loading', attrs: { role: 'status', 'aria-live': 'polite' } }, [
      el('h1', { className: 'loading__title' }, [
        document.createTextNode('50cc '),
        el('span', { text: 'LIFE' }),
      ]),
      el('div', { className: 'loading__bar' }, [this.fill]),
      this.label,
    ]);
    parent.appendChild(this.root);
  }

  setProgress(ratio: number, label: string): void {
    this.fill.style.transform = `scaleX(${Math.min(Math.max(ratio, 0), 1)})`;
    this.label.textContent = label;
  }

  /** Fondu de sortie puis retrait du DOM. */
  hide(): Promise<void> {
    this.root.classList.add('is-hidden');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.root.remove();
        resolve();
      }, 450);
    });
  }

  remove(): void {
    this.root.remove();
  }
}
