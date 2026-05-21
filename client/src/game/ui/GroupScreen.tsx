/**
 * GroupScreen — page « GROUPE ».
 * -------------------------------
 * Sobre + élégant, accents casino animés. Pas de logique multi pour l'instant —
 * juste le shell visuel + une transition d'entrée dramatique.
 *
 * Transition d'entrée (joue automatiquement au mount) :
 *   1. RIDEAU rouge velvet : descend du haut, recouvre tout l'écran en 350 ms
 *   2. Pendant les 200 ms suivants (rideau opaque), le contenu se prépare
 *   3. Le rideau remonte vers le bas en 600 ms avec un easing dramatique,
 *      révélant la page progressivement
 *   4. EN MÊME TEMPS, une cascade de 14 jetons casino tombe depuis le haut,
 *      tourne sur eux-mêmes, et s'empile en bas avec un léger angle
 *   5. Le titre "GROUPE" apparaît en fade + scale-up depuis 0.92 → 1
 *
 * Composantes animées en permanence :
 *   - Néon "OPEN" qui clignote dans le coin
 *   - Roulette miniature qui tourne lentement en arrière-plan (parallax)
 *   - Spotlights croisés (CSS conic-gradients)
 *   - Particules de poussière dorée flottantes
 */

import { useEffect, useRef, useState } from 'react';
import {
  createLobby,
  joinLobby,
  LobbyStateView,
  StartPayload,
  LobbyRoom,
} from '../../network/lobby';
import { loadProfile } from '../../local/profile';

interface Props {
  onBack: () => void;
  /** Démarre une partie multi : appelé sur réception du signal 'start'
   *  envoyé par le host. Le payload contient la config et la liste des
   *  joueurs. Chaque client lance ensuite sa propre partie locale avec
   *  ces options (transport P2P du gameplay : phase suivante). */
  onStartMultiplayer?: (payload: StartPayload, mySessionId: string) => void;
}

const STYLE_ID = '__group_screen_style__';

const GROUP_CSS = `
.group-screen {
  position: fixed; inset: 0; overflow: hidden;
  background:
    radial-gradient(ellipse 60% 50% at 50% 35%, rgba(70, 8, 18, 0.55) 0%, transparent 70%),
    radial-gradient(ellipse 80% 100% at 50% 100%, rgba(30, 4, 9, 0.85) 0%, transparent 75%),
    linear-gradient(180deg, #0a0407 0%, #1a0408 60%, #0a0407 100%);
  color: #fff5d4;
  font-family: 'Cinzel', var(--font-display-2);
  z-index: 1;
}

/* — Décor : grille subtile en relief — */
.group-screen::before {
  content: ""; position: fixed; inset: 0; pointer-events: none;
  background:
    linear-gradient(rgba(244,197,66,0.025) 1px, transparent 1px) 0 0/48px 48px,
    linear-gradient(90deg, rgba(244,197,66,0.025) 1px, transparent 1px) 0 0/48px 48px;
  mask: radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent 85%);
  -webkit-mask: radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent 85%);
}

/* — Roulette en parallax — */
.group-roulette {
  position: absolute; top: 50%; left: 50%;
  width: 880px; height: 880px;
  margin: -440px 0 0 -440px;
  border-radius: 50%;
  background: conic-gradient(from 0deg,
    #c5142a 0deg, #1a0408 18deg,
    #c5142a 36deg, #1a0408 54deg,
    #c5142a 72deg, #1a0408 90deg,
    #c5142a 108deg, #1a0408 126deg,
    #c5142a 144deg, #1a0408 162deg,
    #c5142a 180deg, #1a0408 198deg,
    #c5142a 216deg, #1a0408 234deg,
    #c5142a 252deg, #1a0408 270deg,
    #c5142a 288deg, #1a0408 306deg,
    #c5142a 324deg, #1a0408 342deg, #c5142a 360deg);
  opacity: 0.06;
  filter: blur(2px);
  animation: group-spin 80s linear infinite;
  pointer-events: none;
}
@keyframes group-spin { to { transform: rotate(360deg); } }

/* — Spotlights croisés — */
.group-spot {
  position: absolute; top: -10%; left: 50%;
  width: 700px; height: 130vh;
  transform: translate(-50%, 0);
  background: linear-gradient(180deg,
    rgba(255, 200, 210, 0.10) 0%,
    rgba(232, 66, 82, 0.04) 40%,
    transparent 80%);
  filter: blur(40px);
  opacity: 0.8;
  pointer-events: none;
}
.group-spot.s1 { transform: translate(-50%, 0) rotate(-12deg); animation: group-spot-sway 9s ease-in-out infinite; }
.group-spot.s2 { transform: translate(-50%, 0) rotate( 14deg); animation: group-spot-sway 11s ease-in-out -3s infinite; opacity: 0.55; }
@keyframes group-spot-sway {
  0%, 100% { filter: blur(40px) hue-rotate(0deg); }
  50%      { filter: blur(60px) hue-rotate(8deg); }
}

/* — Particules de poussière dorée — */
.group-dust {
  position: absolute;
  width: 3px; height: 3px;
  background: radial-gradient(circle, #ffd247 0%, transparent 70%);
  border-radius: 50%;
  opacity: 0;
  animation: group-dust-rise 14s linear infinite;
}
@keyframes group-dust-rise {
  0%   { transform: translateY(110vh) translateX(0); opacity: 0; }
  10%  { opacity: 0.6; }
  90%  { opacity: 0.4; }
  100% { transform: translateY(-10vh) translateX(40px); opacity: 0; }
}

/* — Néon OPEN qui clignote dans le coin — */
.group-neon {
  position: absolute; top: 28px; right: 36px;
  font-family: 'Limelight', serif;
  font-size: 18px;
  color: #ff6478;
  letter-spacing: 0.4em;
  text-shadow:
    0 0 6px rgba(232, 66, 82, 0.95),
    0 0 14px rgba(255, 80, 100, 0.7),
    0 0 28px rgba(232, 66, 82, 0.4),
    0 0 50px rgba(232, 66, 82, 0.25);
  animation: group-neon-flicker 4.5s steps(20, end) infinite;
}
@keyframes group-neon-flicker {
  0%, 3%, 6%, 100% { opacity: 1; }
  4%               { opacity: 0.2; }
  7%               { opacity: 0.4; }
  8%               { opacity: 1; }
  50%              { opacity: 0.9; }
}

/* — Shell central — */
.group-shell {
  position: relative; z-index: 4;
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 60px 40px;
}

.group-back {
  /* z-index 6 : au-dessus de .group-shell (z-4) qui couvre tout l'écran
   *  et bloquait les clics sur le bouton. */
  position: absolute; top: 28px; left: 36px; z-index: 6;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(244, 197, 66, 0.3);
  color: var(--gold);
  font-family: 'Cinzel', var(--font-display-2);
  font-weight: 700;
  font-size: 11px; letter-spacing: 0.32em;
  padding: 10px 18px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s var(--ease-premium);
}
.group-back:hover {
  border-color: var(--gold-bright);
  color: var(--gold-bright);
  background: rgba(244, 197, 66, 0.12);
  box-shadow: 0 0 14px rgba(244, 197, 66, 0.4);
}

.group-title {
  font-family: 'Limelight', serif;
  font-size: 86px;
  letter-spacing: 0.32em;
  color: #fff0f2;
  text-shadow:
    0 0 14px rgba(232, 66, 82, 0.7),
    0 0 30px rgba(255, 80, 100, 0.4),
    0 4px 0 rgba(47, 5, 10, 0.8);
  margin: 0;
  animation: group-title-in 0.9s 0.4s ease-out both;
}
@keyframes group-title-in {
  0%   { opacity: 0; transform: scale(0.92) translateY(8px); filter: blur(3px); }
  100% { opacity: 1; transform: scale(1)    translateY(0);   filter: blur(0); }
}

.group-subtitle {
  margin-top: 6px;
  font-family: 'Cinzel', var(--font-display-2);
  font-size: 11px;
  letter-spacing: 0.5em;
  color: rgba(244, 197, 66, 0.7);
  text-transform: uppercase;
  animation: group-fade-in 0.7s 0.7s ease-out both;
}

/* — Le grand panneau central — */
.group-panel {
  margin-top: 56px;
  position: relative;
  width: min(720px, 88vw);
  padding: 40px 44px 36px;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(232, 66, 82, 0.12) 0%, transparent 70%),
    linear-gradient(180deg, rgba(28, 6, 12, 0.92), rgba(12, 4, 8, 0.96));
  border: 1px solid rgba(232, 66, 82, 0.45);
  border-radius: 18px;
  box-shadow:
    0 30px 90px rgba(0, 0, 0, 0.6),
    0 0 60px rgba(232, 66, 82, 0.2),
    inset 0 1px 0 rgba(255, 180, 190, 0.12);
  animation: group-panel-in 0.7s 0.55s cubic-bezier(0.2, 1, 0.3, 1) both;
}
@keyframes group-panel-in {
  0%   { opacity: 0; transform: translateY(40px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    }
}

/* — Liseré chip d'or qui court autour du panneau — */
.group-panel::before {
  content: ""; position: absolute; inset: -1px;
  border-radius: 18px;
  background: linear-gradient(120deg,
    transparent 0%, transparent 35%,
    rgba(244, 197, 66, 0.55) 47%,
    rgba(255, 245, 212, 0.85) 50%,
    rgba(244, 197, 66, 0.55) 53%,
    transparent 65%, transparent 100%);
  background-size: 300% 100%;
  background-position: 0 0;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  padding: 1px;
  pointer-events: none;
  animation: group-shine 4s linear infinite;
  opacity: 0.7;
}
@keyframes group-shine { 0% { background-position: 0 0; } 100% { background-position: 300% 0; } }

.group-panel-label {
  text-align: center;
  font-family: 'Cinzel', var(--font-display-2);
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.55em;
  color: var(--gold);
  margin-bottom: 18px;
  text-transform: uppercase;
}

.group-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.group-action {
  display: flex; flex-direction: column;
  align-items: center; gap: 10px;
  padding: 26px 16px 22px;
  background: linear-gradient(180deg, rgba(40, 8, 14, 0.6), rgba(16, 4, 8, 0.85));
  border: 1px solid rgba(232, 66, 82, 0.35);
  border-radius: 10px;
  color: var(--gold-light);
  cursor: pointer;
  font-family: 'Cinzel', var(--font-display-2);
  transition: all 0.22s var(--ease-premium);
}
.group-action:hover {
  border-color: var(--gold-bright);
  box-shadow: 0 0 22px rgba(232, 66, 82, 0.45);
  transform: translateY(-2px);
  background: linear-gradient(180deg, rgba(60, 12, 22, 0.7), rgba(20, 5, 10, 0.95));
}
.group-action-glyph {
  font-family: 'Bungee', sans-serif;
  font-size: 32px;
  color: #ff8a99;
  text-shadow: 0 0 12px rgba(232, 66, 82, 0.6);
}
.group-action-title {
  font-family: 'Limelight', serif;
  font-size: 17px;
  letter-spacing: 0.28em;
  color: var(--gold-light);
}
.group-action-hint {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.18em;
  color: rgba(244, 197, 66, 0.55);
  text-align: center;
  max-width: 220px;
}

.group-divider {
  margin: 22px auto 18px;
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(244, 197, 66, 0.4), transparent);
}

.group-code-row {
  display: flex; gap: 10px;
  align-items: center; justify-content: center;
  margin-top: 4px;
}
.group-code-input {
  flex: 1; max-width: 260px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(244, 197, 66, 0.35);
  color: var(--gold-light);
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px; letter-spacing: 0.3em;
  text-align: center;
  padding: 12px 14px;
  border-radius: 6px;
  outline: none;
  transition: all 0.2s var(--ease-premium);
}
.group-code-input::placeholder { color: rgba(244, 197, 66, 0.35); letter-spacing: 0.28em; }
.group-code-input:focus {
  border-color: var(--gold-bright);
  box-shadow: 0 0 14px rgba(244, 197, 66, 0.4);
}
.group-code-btn {
  background: linear-gradient(180deg, #c5142a, #6f0a14);
  border: 1px solid rgba(255, 138, 153, 0.5);
  color: #fff0f2;
  font-family: 'Cinzel', var(--font-display-2);
  font-weight: 700;
  font-size: 11px; letter-spacing: 0.32em;
  padding: 12px 22px;
  border-radius: 6px;
  cursor: pointer;
  text-transform: uppercase;
  box-shadow: 0 0 14px rgba(232, 66, 82, 0.5), inset 0 1px 0 rgba(255, 200, 210, 0.2);
  transition: all 0.2s var(--ease-premium);
}
.group-code-btn:hover {
  box-shadow: 0 0 22px rgba(232, 66, 82, 0.85), inset 0 1px 0 rgba(255, 200, 210, 0.3);
  transform: translateY(-1px);
}

/* — Note bas — */
.group-footnote {
  margin-top: 36px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.32em;
  color: rgba(244, 197, 66, 0.5);
  text-transform: uppercase;
  animation: group-fade-in 0.6s 1.0s ease-out both;
}
@keyframes group-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }

/* ═════════════ Transition d'entrée ═════════════ */

.group-curtain {
  position: fixed; inset: 0; z-index: 10;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(74, 12, 22, 0.92) 0%, rgba(20, 4, 8, 0.98) 100%);
}

/* ENTREE : rideau tombe du haut puis sort par le bas */
.group-curtain.enter {
  transform: translateY(-100%);
  animation:
    group-curtain-down 0.42s cubic-bezier(0.4, 0.0, 0.2, 1) forwards,
    group-curtain-up-out 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.6s forwards;
}
@keyframes group-curtain-down { to { transform: translateY(0); } }
@keyframes group-curtain-up-out { to { transform: translateY(100%); } }

/* Frange de jetons qui suit le rideau quand il descend (entrée seulement) */
.group-curtain.enter::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -6px;
  height: 12px;
  background: repeating-linear-gradient(90deg,
    #f4c542 0 14px, #ffd247 14px 18px, #c5142a 18px 32px, #ffd247 32px 36px);
  filter: drop-shadow(0 0 8px rgba(244, 197, 66, 0.6));
}

/* ─── RETOUR vers le menu ─── Curtain attachée à document.body
 * (créée en vanilla JS dans handleBack) → survit à l'unmount de GroupScreen
 * et continue son animation pendant que MainMenu prend le relais.
 *
 * Phases :
 *   - 'cover' : translateY(100% → 0) sur 0.5s — couvre l'écran depuis le bas
 *   - swap GroupScreen → MainMenu pendant que la curtain est opaque
 *   - 'lift' : translateY(0 → -100%) sur 0.7s — remonte hors-écran par le haut
 * La curtain est removeChild du body après animation totale (~1.3s).         */
.group-back-curtain {
  position: fixed; inset: 0; z-index: 2147483647;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(74, 12, 22, 0.95) 0%, rgba(15, 4, 8, 0.99) 100%);
  pointer-events: none;
  transform: translateY(100%);
  transition: transform 0.5s cubic-bezier(0.4, 0.0, 0.2, 1);
}
.group-back-curtain.cover { transform: translateY(0); }
.group-back-curtain.lift {
  transform: translateY(-100%);
  transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
}
/* Frange dorée sur le bord d'attaque selon la phase. */
.group-back-curtain.cover::before {
  content: ""; position: absolute; left: 0; right: 0; top: -6px;
  height: 12px;
  background: repeating-linear-gradient(90deg,
    #f4c542 0 14px, #ffd247 14px 18px, #c5142a 18px 32px, #ffd247 32px 36px);
  filter: drop-shadow(0 0 8px rgba(244, 197, 66, 0.55));
}
.group-back-curtain.lift::before {
  content: ""; position: absolute; left: 0; right: 0; bottom: -6px;
  height: 12px;
  background: repeating-linear-gradient(90deg,
    #f4c542 0 14px, #ffd247 14px 18px, #c5142a 18px 32px, #ffd247 32px 36px);
  filter: drop-shadow(0 0 8px rgba(244, 197, 66, 0.55));
}

/* Cascade de jetons casino — créés en JS, animés via class .chip-fall */
.group-falling-chip {
  position: fixed;
  width: 38px; height: 38px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff5d4, var(--gold-bright) 35%, var(--gold-dark) 75%, var(--gold-deep) 100%);
  border: 2px dashed rgba(90, 58, 10, 0.85);
  box-shadow:
    0 0 14px rgba(244, 197, 66, 0.45),
    0 6px 12px rgba(0, 0, 0, 0.6),
    inset 0 -4px 8px rgba(0, 0, 0, 0.3),
    inset 0 4px 6px rgba(255, 245, 212, 0.4);
  pointer-events: none;
  z-index: 11;
  top: -60px;
  opacity: 0;
  animation:
    group-chip-fall 1.6s cubic-bezier(0.35, 0.0, 0.45, 1.0) forwards,
    group-chip-spin 1.1s linear infinite;
}
.group-falling-chip.red {
  background: radial-gradient(circle at 30% 30%, #ffd5d8, #e84252 35%, #c5142a 75%, #6f0a14 100%);
  border-color: rgba(47, 5, 10, 0.85);
  box-shadow:
    0 0 14px rgba(232, 66, 82, 0.5),
    0 6px 12px rgba(0, 0, 0, 0.6),
    inset 0 -4px 8px rgba(0, 0, 0, 0.3),
    inset 0 4px 6px rgba(255, 200, 210, 0.4);
}
@keyframes group-chip-fall {
  0%   { transform: translateY(0) rotate(0deg); opacity: 0; }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}
@keyframes group-chip-spin { to { transform: rotate(360deg); } }

/* ─── Lobby multijoueur ───────────────────────────────────────────── */
.group-action[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(0.4);
}
.group-action[disabled]:hover { transform: none; }

/* Shake feedback quand on clique REJOINDRE avec champ vide */
@keyframes group-code-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-6px); }
  40%      { transform: translateX(6px); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX(4px); }
}
.group-code-row.is-shake {
  animation: group-code-shake 380ms ease-in-out;
}
.group-code-row.is-shake .group-code-input {
  box-shadow: 0 0 14px rgba(241,196,15,0.7);
  border-color: #ffd247;
}

.group-p2p-hint {
  margin-top: 14px;
  padding: 8px 12px;
  background: rgba(154,217,179,0.08);
  border: 1px solid rgba(154,217,179,0.3);
  border-radius: 4px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 11px; line-height: 1.5;
  color: #9ad9b3;
  text-align: center;
  letter-spacing: 0.5px;
}
.group-p2p-hint strong { color: #fff; }

.group-code-btn[disabled],
.group-code-input { color: #f1c40f; }
.group-code-btn[disabled] { opacity: 0.4; cursor: not-allowed; }

/* Bouton paramètres serveur (sous les actions) */
.group-settings-btn {
  margin-top: 14px;
  width: 100%;
  padding: 8px 12px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(241,196,15,0.3);
  border-radius: 6px;
  color: #d6e0d8;
  font-family: 'Rajdhani', sans-serif;
  font-size: 11px; letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 120ms;
}
.group-settings-btn:hover { background: rgba(241,196,15,0.1); }
.group-settings-btn span { color: #f1c40f; font-family: 'JetBrains Mono', monospace; margin-left: 6px; }
.group-settings-pop {
  margin-top: 8px;
  padding: 12px;
  background: rgba(0,0,0,0.55);
  border: 1px solid #f1c40f;
  border-radius: 6px;
  display: flex; flex-direction: column; gap: 6px;
  animation: group-pop-in 200ms ease-out;
}
@keyframes group-pop-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.group-settings-pop label {
  font-family: 'Rajdhani', sans-serif;
  font-size: 10px; letter-spacing: 1.5px;
  color: #f1c40f; text-transform: uppercase;
}
.group-settings-pop input {
  padding: 8px 10px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(241,196,15,0.4);
  border-radius: 4px;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.group-settings-hint {
  font-family: 'Rajdhani', sans-serif;
  font-size: 10px; color: #888; line-height: 1.4;
}
.group-settings-hint code {
  background: rgba(241,196,15,0.12);
  color: #f1c40f;
  padding: 1px 5px; border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
}

/* Chargement (spinner) */
.group-loading {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px;
  padding: 40px 20px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 14px; letter-spacing: 2px;
  color: #f1c40f;
  text-transform: uppercase;
}
.group-spinner {
  width: 44px; height: 44px;
  border: 3px solid rgba(241,196,15,0.2);
  border-top-color: #f1c40f;
  border-radius: 50%;
  animation: group-spin 800ms linear infinite;
}
.group-spinner.gold {
  border-width: 4px;
  width: 56px; height: 56px;
  box-shadow: 0 0 20px rgba(241,196,15,0.5);
}
@keyframes group-spin {
  to { transform: rotate(360deg); }
}

/* Lobby — header avec code */
.group-lobby-head {
  display: flex; flex-direction: column; align-items: center;
  margin-bottom: 4px;
}
.group-lobby-code-label {
  font-family: 'Rajdhani', sans-serif;
  font-size: 11px; letter-spacing: 2px;
  color: #d6e0d8; text-transform: uppercase;
  margin-bottom: 4px;
}
.group-lobby-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 30px; font-weight: 800; letter-spacing: 5px;
  color: #f1c40f;
  text-shadow: 0 0 14px rgba(241,196,15,0.55), 0 2px 4px rgba(0,0,0,0.7);
  background: rgba(0,0,0,0.45);
  padding: 8px 18px;
  border: 2px solid #f1c40f;
  border-radius: 8px;
}
.group-lobby-code-hint {
  font-family: 'Rajdhani', sans-serif;
  font-size: 10px; color: #888;
  letter-spacing: 1px; margin-top: 6px; font-style: italic;
}

/* Liste des membres */
.group-members {
  list-style: none;
  padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.group-member {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(241,196,15,0.15);
  border-radius: 5px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px; font-weight: 600;
  color: #fff;
}
.group-member.is-host {
  background: rgba(241,196,15,0.12);
  border-color: #f1c40f;
}
.group-member-bullet { color: #f1c40f; font-size: 14px; }
.group-member-name { flex: 1; letter-spacing: 0.5px; }
.group-member-tag {
  background: #f1c40f;
  color: #1a0408;
  font-size: 9px; font-weight: 800; letter-spacing: 1px;
  padding: 2px 6px; border-radius: 3px;
}
.group-member-ready {
  background: rgba(154,217,179,0.2);
  color: #9ad9b3;
  font-size: 9px; font-weight: 700; letter-spacing: 1px;
  padding: 2px 6px; border-radius: 3px;
  border: 1px solid #9ad9b3;
}

/* Configuration */
.group-config {
  display: flex; gap: 14px;
  margin: 4px 0;
}
.group-config label {
  flex: 1;
  display: flex; flex-direction: column;
  font-family: 'Rajdhani', sans-serif;
  font-size: 10px; letter-spacing: 1.5px;
  color: #d6e0d8; text-transform: uppercase;
  gap: 4px;
}
.group-config select,
.group-config input {
  padding: 7px 10px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(241,196,15,0.4);
  border-radius: 4px;
  color: #f1c40f;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; font-weight: 700;
}
.group-config select:disabled,
.group-config input:disabled {
  opacity: 0.5; cursor: not-allowed;
  color: #888;
}

/* Actions du lobby (quitter/prêt/lancer) */
.group-lobby-actions {
  display: flex; gap: 10px;
  margin-top: 6px;
}
.group-lobby-leave,
.group-lobby-ready,
.group-lobby-start {
  flex: 1;
  padding: 11px 14px;
  font-family: 'Cinzel', serif;
  font-size: 12px; font-weight: 800; letter-spacing: 2px;
  border-radius: 6px;
  cursor: pointer;
  text-transform: uppercase;
  transition: all 120ms ease;
}
.group-lobby-leave {
  background: rgba(0,0,0,0.4);
  border: 1.5px solid #888;
  color: #aaa;
}
.group-lobby-leave:hover { background: rgba(100,100,100,0.3); color: #fff; }

.group-lobby-ready {
  background: linear-gradient(180deg, #2a4a2a 0%, #0f2010 100%);
  border: 1.5px solid #9ad9b3;
  color: #9ad9b3;
}
.group-lobby-ready:hover { box-shadow: 0 0 14px rgba(154,217,179,0.4); }
.group-lobby-ready.is-ready {
  background: linear-gradient(180deg, #1e7d3a 0%, #0e3a1a 100%);
  color: #fff;
  border-color: #9ad9b3;
}

.group-lobby-start {
  background: linear-gradient(180deg, #c9a338 0%, #5a3a0a 100%);
  border: 2px solid #f1c40f;
  color: #1a0408;
  box-shadow: 0 4px 14px rgba(241,196,15,0.35);
}
.group-lobby-start:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(241,196,15,0.5);
}
.group-lobby-start:disabled {
  opacity: 0.4; cursor: not-allowed; filter: grayscale(0.4);
}

.group-lobby-note {
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(192,57,43,0.12);
  border: 1px solid rgba(192,57,43,0.4);
  border-radius: 4px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 10px; line-height: 1.4;
  color: #ffa898;
  letter-spacing: 0.5px;
}

/* Panneau d'erreur */
.group-error {
  display: flex; flex-direction: column;
  align-items: center; gap: 14px;
  padding: 24px;
}
.group-error-glyph {
  width: 50px; height: 50px;
  border-radius: 50%;
  background: rgba(192,57,43,0.2);
  border: 2px solid #c0392b;
  display: flex; align-items: center; justify-content: center;
  color: #ff5a4d;
  font-size: 28px;
}
.group-error-msg {
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px; color: #ffa898;
  text-align: center; line-height: 1.4;
  letter-spacing: 0.5px;
}
.group-error button {
  padding: 9px 22px;
  background: rgba(0,0,0,0.5);
  border: 1.5px solid #f1c40f;
  border-radius: 5px;
  color: #f1c40f;
  font-family: 'Cinzel', serif;
  font-size: 12px; font-weight: 700; letter-spacing: 2px;
  cursor: pointer;
  text-transform: uppercase;
}
.group-error button:hover { background: rgba(241,196,15,0.15); }

`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = GROUP_CSS;
  document.head.appendChild(el);
}

const DUST_POSITIONS = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 17 + 3) % 100}%`,
  delay: `${(i * 0.83) % 14}s`,
  duration: `${10 + (i % 5) * 1.4}s`,
}));

/** Génère les jetons qui tombent en cascade — staggered horizontaux,
 *  alternance or/rouge, tailles et vitesses variées. Toujours du HAUT vers
 *  le bas (anim d'entrée uniquement). L'anim retour utilise la body-curtain
 *  pure, sans jetons. */
function spawnFallingChips() {
  if (typeof document === 'undefined') return [] as HTMLElement[];
  const nodes: HTMLElement[] = [];
  const COUNT = 14;
  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div');
    el.className = `group-falling-chip${i % 2 === 0 ? '' : ' red'}`;
    el.style.left = `${5 + (i * 92) / COUNT}vw`;
    el.style.animationDelay = `${i * 0.07}s, ${i * 0.13}s`;
    const size = 28 + Math.round(Math.random() * 22);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    document.body.appendChild(el);
    nodes.push(el);
  }
  return nodes;
}

export function GroupScreen({ onBack, onStartMultiplayer }: Props) {
  // 'enter' au mount ; 'idle' une fois l'animation d'entrée terminée. Plus
  // d'état 'exit' ici : le retour se gère via une curtain attachée au body
  // qui survit à l'unmount de ce composant.
  const [curtainState, setCurtainState] = useState<'enter' | 'idle'>('enter');
  /** Évite double-clic sur RETOUR pendant l'animation de sortie. */
  const exitingRef = useRef(false);

  // ─── État multijoueur ────────────────────────────────────────────────
  const [phase, setPhase] = useState<'menu' | 'joining' | 'creating' | 'in_lobby' | 'starting' | 'error'>('menu');
  const [codeInput, setCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lobby, setLobby] = useState<LobbyStateView | null>(null);
  const roomRef = useRef<LobbyRoom | null>(null);
  const mySessionIdRef = useRef<string>('');

  // Cleanup auto si on quitte la page en cours de lobby.
  useEffect(() => {
    return () => {
      try { roomRef.current?.leave(); } catch { /* noop */ }
      roomRef.current = null;
    };
  }, []);

  /** Attache les listeners standards à une LobbyRoom fraîchement obtenue. */
  const attachRoom = (room: LobbyRoom) => {
    roomRef.current = room;
    mySessionIdRef.current = room.sessionId;
    setLobby(room.getState());
    room.onStateChange((s) => setLobby(s));
    room.onStart((payload) => {
      setPhase('starting');
      window.setTimeout(() => {
        onStartMultiplayer?.(payload, mySessionIdRef.current);
      }, 600);
    });
    room.onError((msg) => {
      setPhase('error');
      setErrorMsg(msg);
    });
    setPhase('in_lobby');
  };

  const handleCreate = async () => {
    setErrorMsg('');
    setPhase('creating');
    try {
      const profile = loadProfile();
      const { room } = await createLobby(profile.name || 'Commandant', profile.skinId || 'default');
      attachRoom(room);
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message ?? 'Impossible de créer le salon — broker PeerJS injoignable ?');
    }
  };

  const handleJoin = async () => {
    if (codeInput.trim().length < 4) return;
    setErrorMsg('');
    setPhase('joining');
    try {
      const profile = loadProfile();
      const room = await joinLobby(codeInput, profile.name || 'Commandant', profile.skinId || 'default');
      attachRoom(room);
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message ?? 'Code invalide ou salon introuvable.');
    }
  };

  const handleLeaveLobby = () => {
    try { roomRef.current?.leave(); } catch { /* noop */ }
    roomRef.current = null;
    setLobby(null);
    setPhase('menu');
  };

  const handleToggleReady = () => {
    roomRef.current?.toggleReady();
  };

  const handleStartGame = () => {
    roomRef.current?.start();
  };

  const handleConfigChange = (patch: { mapSize?: 'small' | 'medium' | 'large'; botCount?: number }) => {
    roomRef.current?.updateConfig(patch);
  };

  const isHost = !!lobby && lobby.hostSessionId === mySessionIdRef.current;
  const allReady = !!lobby && lobby.members.length > 0 && lobby.members.every((m) => m.ready || m.isHost);

  /** Ref vers l'input code pour focus auto + shake quand on clique
   *  REJOINDRE alors que le champ est vide. */
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const [shakeCode, setShakeCode] = useState(false);
  const onClickJoin = () => {
    if (codeInput.trim().length < 4) {
      // Champ vide → focus + flash visuel pour indiquer quoi faire.
      codeInputRef.current?.focus();
      setShakeCode(true);
      window.setTimeout(() => setShakeCode(false), 500);
      return;
    }
    handleJoin();
  };

  useEffect(() => {
    injectStyle();
    const chips = spawnFallingChips();
    const curtainT = window.setTimeout(() => setCurtainState('idle'), 1400);
    const chipsT = window.setTimeout(() => {
      for (const c of chips) c.parentNode?.removeChild(c);
    }, 3500);
    return () => {
      clearTimeout(curtainT); clearTimeout(chipsT);
      for (const c of chips) c.parentNode?.removeChild(c);
    };
  }, []);

  /** Retour menu — pattern body-curtain (cf. LaunchButton.lbtn-curtain) :
   *   1. On crée le rideau sur document.body (vit indépendamment de React)
   *   2. classe 'cover' → CSS transition translateY(100%) → 0 (0.5s)
   *   3. Au bout de 0.5s, on appelle onBack() : MainMenu prend la place de
   *      GroupScreen, mais la curtain reste sur body → couvre le swap
   *   4. ~1 frame plus tard, classe 'lift' → translateY(0) → -100% (0.7s)
   *   5. removeChild du body après ~1.3s total. */
  const handleBack = () => {
    if (exitingRef.current) return;
    if (curtainState !== 'idle') return; // attend la fin de l'anim d'entrée
    exitingRef.current = true;

    const c = document.createElement('div');
    c.className = 'group-back-curtain';
    document.body.appendChild(c);

    // Frame double pour garantir que le browser a peint l'état initial
    // avant qu'on applique la classe 'cover' (sinon pas de transition).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => c.classList.add('cover'));
    });

    // Swap vers le menu pendant que la curtain est opaque.
    window.setTimeout(() => {
      onBack();
      // Ensuite, on programme la phase 'lift' depuis l'extérieur du
      // composant (setTimeout vit indépendamment de l'unmount React).
      window.setTimeout(() => {
        c.classList.remove('cover');
        c.classList.add('lift');
      }, 60);
      window.setTimeout(() => {
        if (c.parentNode) c.parentNode.removeChild(c);
      }, 60 + 750);
    }, 530);
  };

  return (
    <div className="group-screen">
      <div className="group-roulette" aria-hidden />
      <div className="group-spot s1" aria-hidden />
      <div className="group-spot s2" aria-hidden />
      {DUST_POSITIONS.map((d, i) => (
        <span
          key={i}
          className="group-dust"
          style={{ left: d.left, animationDelay: d.delay, animationDuration: d.duration }}
          aria-hidden
        />
      ))}

      <div className="group-neon">★ OPEN ★</div>

      <button className="group-back" onClick={handleBack}>← RETOUR</button>

      <div className="group-shell">
        <h1 className="group-title">GROUPE</h1>
        <div className="group-subtitle">Salons privés · Joue avec tes potes</div>

        {/* ── Phase MENU : choix créer/rejoindre ─────────────────────── */}
        {phase === 'menu' && (
          <div className="group-panel">
            <div className="group-panel-label">Rejoindre une table</div>
            <div className="group-actions">
              <button className="group-action" type="button" onClick={handleCreate}>
                <div className="group-action-glyph">♣</div>
                <div className="group-action-title">CRÉER</div>
                <div className="group-action-hint">Ouvre un salon, invite tes alliés</div>
              </button>
              <button
                className="group-action"
                type="button"
                onClick={onClickJoin}
              >
                <div className="group-action-glyph">♥</div>
                <div className="group-action-title">REJOINDRE</div>
                <div className="group-action-hint">
                  {codeInput.trim().length < 4
                    ? '↓ Tape le code de ton ami ↓'
                    : `Code prêt : ${codeInput} · clique pour rejoindre`}
                </div>
              </button>
            </div>

            <div className="group-divider" />

            <div className={`group-code-row ${shakeCode ? 'is-shake' : ''}`}>
              <input
                ref={codeInputRef}
                className="group-code-input"
                placeholder="CODE SALON"
                maxLength={6}
                autoComplete="off"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter' && codeInput.trim().length >= 4) handleJoin(); }}
              />
              <button
                className="group-code-btn"
                type="button"
                onClick={handleJoin}
                disabled={codeInput.trim().length < 4}
              >Entrer</button>
            </div>

            <div className="group-p2p-hint">
              ⚡ Connexion <strong>directe entre navigateurs</strong> via PeerJS — aucun serveur à lancer.
            </div>
          </div>
        )}

        {/* ── Phase CONNEXION ────────────────────────────────────────── */}
        {(phase === 'creating' || phase === 'joining') && (
          <div className="group-panel">
            <div className="group-loading">
              <div className="group-spinner" />
              <div>{phase === 'creating' ? 'Ouverture du salon…' : 'Connexion au salon…'}</div>
            </div>
          </div>
        )}

        {/* ── Phase IN LOBBY : liste des joueurs + config + start ──── */}
        {phase === 'in_lobby' && lobby && (
          <div className="group-panel">
            <div className="group-lobby-head">
              <div className="group-lobby-code-label">Code du salon</div>
              <div className="group-lobby-code">{lobby.code}</div>
              <div className="group-lobby-code-hint">Partage ce code à tes potes</div>
            </div>

            <div className="group-divider" />

            <div className="group-panel-label">Joueurs ({lobby.members.length})</div>
            <ul className="group-members">
              {lobby.members.map((m) => (
                <li key={m.sessionId} className={`group-member ${m.isHost ? 'is-host' : ''}`}>
                  <span className="group-member-bullet">{m.isHost ? '★' : '•'}</span>
                  <span className="group-member-name">{m.name}</span>
                  {m.isHost && <span className="group-member-tag">HOST</span>}
                  {m.ready && !m.isHost && <span className="group-member-ready">PRÊT</span>}
                </li>
              ))}
            </ul>

            <div className="group-divider" />

            <div className="group-panel-label">Configuration</div>
            <div className="group-config">
              <label>
                Carte
                <select
                  value={lobby.mapSize}
                  onChange={(e) => handleConfigChange({ mapSize: e.target.value as any })}
                  disabled={!isHost}
                >
                  <option value="small">Petite</option>
                  <option value="medium">Moyenne</option>
                  <option value="large">Grande</option>
                </select>
              </label>
              <label>
                Bots
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={lobby.botCount}
                  onChange={(e) => handleConfigChange({ botCount: Number(e.target.value) })}
                  disabled={!isHost}
                />
              </label>
            </div>

            <div className="group-lobby-actions">
              <button className="group-lobby-leave" onClick={handleLeaveLobby} type="button">
                Quitter
              </button>
              {!isHost && (
                <button
                  className={`group-lobby-ready ${lobby.members.find((m) => m.sessionId === mySessionIdRef.current)?.ready ? 'is-ready' : ''}`}
                  onClick={handleToggleReady}
                  type="button"
                >
                  {lobby.members.find((m) => m.sessionId === mySessionIdRef.current)?.ready ? '✓ Prêt' : 'Se déclarer prêt'}
                </button>
              )}
              {isHost && (
                <button
                  className="group-lobby-start"
                  onClick={handleStartGame}
                  type="button"
                  disabled={!allReady}
                  title={!allReady ? 'En attente que tout le monde soit prêt' : ''}
                >
                  🎯 Lancer la partie
                </button>
              )}
            </div>

            <div className="group-lobby-note">
              ⚠ Mode multi (Phase 1) — territoires, or, armée, bots.
              Les features locales (casino, blackjack, cratères) restent solo pour l'instant.
            </div>
          </div>
        )}

        {/* ── Phase STARTING : transition vers le jeu ────────────────── */}
        {phase === 'starting' && (
          <div className="group-panel">
            <div className="group-loading">
              <div className="group-spinner gold" />
              <div>Lancement de la partie…</div>
            </div>
          </div>
        )}

        {/* ── Phase ERROR ────────────────────────────────────────────── */}
        {phase === 'error' && (
          <div className="group-panel">
            <div className="group-error">
              <div className="group-error-glyph">✕</div>
              <div className="group-error-msg">{errorMsg}</div>
              <button onClick={() => { setPhase('menu'); setErrorMsg(''); }} type="button">
                Retour
              </button>
            </div>
          </div>
        )}

        <div className="group-footnote">★ Joue avec tes potes via code de salon ★</div>
      </div>

      {curtainState === 'enter' && (
        <div className="group-curtain enter" aria-hidden />
      )}
    </div>
  );
}
