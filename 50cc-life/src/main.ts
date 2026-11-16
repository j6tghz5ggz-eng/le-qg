/**
 * Point d'entrée de 50cc LIFE.
 */
import './ui/styles/main.css';
import { Game } from './app/Game';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
  throw new Error('index.html doit contenir #game-canvas et #ui-root.');
}

void new Game(canvas, uiRoot).start();
