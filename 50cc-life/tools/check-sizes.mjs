#!/usr/bin/env node
/**
 * Contrôle des budgets de taille — garde-fou pour rester 100 % gratuit.
 *
 * 1. Fichiers commitables (suivis ou nouveaux, hors .gitignore) :
 *    refuse tout fichier > 10 Mio. Git garde chaque version pour toujours ;
 *    un gros binaire alourdit le dépôt définitivement.
 * 2. public/assets/ : budget total de 300 Mio (téléchargement mobile).
 * 3. dist/ (si présent) : aucun fichier > 25 Mio (limite Cloudflare Pages),
 *    total < 500 Mio (itch.io : 500 Mo), et rapport de la taille transférée.
 *
 * Usage : node tools/check-sizes.mjs   (code de sortie 1 si un budget est dépassé)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const MiB = 1024 * 1024;
const BUDGET = {
  repoFileMax: 10 * MiB,
  repoFileWarn: 5 * MiB,
  assetsTotalMax: 300 * MiB,
  distFileMax: 25 * MiB,
  distTotalMax: 500 * MiB,
  /** Démarrage : JS + WASM + CSS + HTML (hors assets streamés). */
  bootTransferWarn: 8 * MiB,
};

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const warnings = [];
const fmt = (bytes) => `${(bytes / MiB).toFixed(2)} Mio`;

// 1. Fichiers commitables
let files = [];
try {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '.'], {
    cwd: root,
    encoding: 'utf8',
  });
  files = out.split('\0').filter(Boolean);
} catch {
  warnings.push('git indisponible : contrôle des fichiers du dépôt ignoré.');
}
for (const file of files) {
  const abs = join(root, file);
  if (!existsSync(abs)) continue; // supprimé mais pas encore commité
  const size = statSync(abs).size;
  if (size > BUDGET.repoFileMax) errors.push(`${file} pèse ${fmt(size)} (max ${fmt(BUDGET.repoFileMax)} dans Git).`);
  else if (size > BUDGET.repoFileWarn) warnings.push(`${file} pèse ${fmt(size)} : pensez à le compresser.`);
}

// 2. Assets servis
const assetsDir = join(root, 'public', 'assets');
const assetsTotal = existsSync(assetsDir) ? walk(assetsDir).reduce((sum, f) => sum + f.size, 0) : 0;
if (assetsTotal > BUDGET.assetsTotalMax) {
  errors.push(`public/assets pèse ${fmt(assetsTotal)} (budget ${fmt(BUDGET.assetsTotalMax)}).`);
}

// 3. Build
const distDir = join(root, 'dist');
let report = '';
if (existsSync(distDir)) {
  const distFiles = walk(distDir);
  const total = distFiles.reduce((sum, f) => sum + f.size, 0);
  if (total > BUDGET.distTotalMax) errors.push(`dist/ pèse ${fmt(total)} (budget ${fmt(BUDGET.distTotalMax)}).`);
  let bootRaw = 0;
  let bootGzip = 0;
  for (const f of distFiles) {
    if (f.size > BUDGET.distFileMax) errors.push(`dist/${f.rel} pèse ${fmt(f.size)} (max ${fmt(BUDGET.distFileMax)} par fichier).`);
    if (/\.(js|mjs|wasm|css|html)$/.test(f.rel) && !f.rel.startsWith('assets/world/')) {
      bootRaw += f.size;
      bootGzip += gzipSync(readFileSync(f.abs), { level: 9 }).length;
    }
  }
  if (bootGzip > BUDGET.bootTransferWarn) {
    warnings.push(`Démarrage : ${fmt(bootGzip)} transférés (objectif < ${fmt(BUDGET.bootTransferWarn)}).`);
  }
  const largest = [...distFiles].sort((a, b) => b.size - a.size).slice(0, 5);
  report = [
    `Build : ${distFiles.length} fichiers, ${fmt(total)} au total`,
    `Démarrage (JS/WASM/CSS/HTML) : ${fmt(bootRaw)} bruts → ~${fmt(bootGzip)} transférés (gzip)`,
    'Plus gros fichiers :',
    ...largest.map((f) => `  ${fmt(f.size).padStart(11)}  ${f.rel}`),
  ].join('\n');
}

console.log(`Fichiers commitables : ${files.length}  ·  public/assets : ${fmt(assetsTotal)}`);
if (report) console.log(report);
for (const w of warnings) console.warn(`⚠️  ${w}`);
for (const e of errors) console.error(`❌ ${e}`);
if (errors.length) {
  console.error('\nBudget dépassé : voir docs/ARCHITECTURE.md § « Stockage gratuit ».');
  process.exit(1);
}
console.log('✅ Budgets de taille respectés.');

function walk(dir, base = dir) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(abs, base));
    else result.push({ abs, rel: relative(base, abs).split('\\').join('/'), size: statSync(abs).size });
  }
  return result;
}
