/**
 * UI 主入口：把引擎、渲染、输入（键盘/触摸/手势）、面板与存储串起来。
 * 手势桥（gesture-vision.js）在点击「开启手势」时才动态 import，实现懒加载。
 */

import {
  DEFAULT_GRID,
  GRID_SIZES,
  SPEED_TIERS,
  createGame,
  queueDirection,
  resetGame,
  speedTierIndexForScore,
  startGame,
  stepGame,
  stepIntervalMs,
  togglePause,
} from '../engine/snake.js';
import { createBoard } from './board.js';
import { attachKeyboard, attachTouchSwipe } from './input.js';
import { createGesturePanel } from './gesture-panel.js';
import { loadHighScore, saveHighScore } from './storage.js';

const $ = (id) => document.getElementById(id);

const els = {
  board: $('board'),
  score: $('score'),
  best: $('best'),
  tier: $('tier'),
  gridSelect: $('grid-select'),
  btnStart: $('btn-start'),
  btnPause: $('btn-pause'),
  btnRestart: $('btn-restart'),
  btnGesture: $('btn-gesture'),
  panelStart: $('panel-start'),
  panelPause: $('panel-pause'),
  panelOver: $('panel-over'),
  overTitle: $('over-title'),
  overScore: $('over-score'),
  overBest: $('over-best'),
  btnAgain: $('btn-again'),
  pip: $('gesture-pip'),
  cam: $('cam'),
  camOverlay: $('cam-overlay'),
  gestureStatus: $('gesture-status'),
  toast: $('toast'),
  toastText: $('toast-text'),
  toastClose: $('toast-close'),
};

const board = createBoard(els.board);
const gesturePanel = createGesturePanel({
  video: els.cam,
  overlay: els.camOverlay,
  statusEl: els.gestureStatus,
});

let gridSize = DEFAULT_GRID;
let state = createGame({ cols: gridSize });
let best = loadHighScore();
let lastTick = 0;
let flashUntil = 0;
let overPanelTimer = 0;
let vision = null; // 手势桥实例（懒加载后才有）
let toastTimer = 0;

// ---------------------------------------------------------------- 基础渲染

function showPanel(name) {
  els.panelStart.hidden = name !== 'start';
  els.panelPause.hidden = name !== 'pause';
  els.panelOver.hidden = name !== 'over';
}

function updateStats() {
  els.score.textContent = String(state.score);
  els.best.textContent = String(best);
  els.tier.textContent = SPEED_TIERS[speedTierIndexForScore(state.score)].label;
}

function updateButtons() {
  els.btnStart.disabled = state.status !== 'idle';
  if (state.status === 'paused') {
    els.btnPause.textContent = '继续';
    els.btnPause.disabled = false;
  } else {
    els.btnPause.textContent = '暂停';
    els.btnPause.disabled = state.status !== 'running';
  }
  els.btnGesture.textContent = vision && vision.isRunning() ? '关闭手势' : '开启手势';
}

function render(now) {
  board.render(state, { now, flashUntil });
}

function loop(now) {
  requestAnimationFrame(loop);
  if (state.status === 'running' && now - lastTick >= stepIntervalMs(state)) {
    lastTick = now;
    doStep(now);
  }
  render(now);
}

// ---------------------------------------------------------------- 游戏流转

function newGame(status) {
  clearTimeout(overPanelTimer);
  overPanelTimer = 0;
  flashUntil = 0;
  state = createGame({ cols: gridSize, status });
  lastTick = performance.now();
  showPanel(status === 'idle' ? 'start' : null);
  updateStats();
  updateButtons();
}

function doStep(now) {
  const { state: next, events } = stepGame(state);
  state = next;
  if (events.ate) {
    if (state.score > best) {
      best = state.score;
      saveHighScore(best);
    }
    updateStats();
  }
  if (events.died || events.won) {
    finishGame(now, events);
  }
}

function finishGame(now, events) {
  flashUntil = now + 500; // 死亡闪红
  if (state.score > best) {
    best = state.score;
    saveHighScore(best);
  }
  updateStats();
  updateButtons();
  clearTimeout(overPanelTimer);
  overPanelTimer = setTimeout(() => {
    els.overTitle.textContent = events.won ? '通关！棋盘都被你吃满了' : (state.cause === 'wall' ? '撞墙了' : '咬到自己了');
    els.overScore.textContent = `本局得分：${state.score}`;
    els.overBest.textContent = `最高分：${best}${state.score >= best && state.score > 0 ? '（新纪录）' : ''}`;
    showPanel('over');
  }, 500);
}

function handleDirection(dir) {
  if (state.status === 'over') return;
  if (state.status === 'idle') {
    state = startGame(state);
    lastTick = performance.now();
    showPanel(null);
    updateButtons();
  }
  state = queueDirection(state, dir).state;
}

function handlePauseToggle() {
  if (state.status !== 'running' && state.status !== 'paused') return;
  const { state: next, paused } = togglePause(state);
  state = next;
  lastTick = performance.now(); // 恢复时重置步进时钟，避免连跳两步
  showPanel(paused ? 'pause' : null);
  updateButtons();
}

function handleRestart() {
  newGame('running');
}

// ---------------------------------------------------------------- 输入接入

attachKeyboard({
  onDirection: handleDirection,
  onPause: handlePauseToggle,
  onRestart: handleRestart,
});

attachTouchSwipe(els.board, { onDirection: handleDirection });

// ---------------------------------------------------------------- 通用提示

function showToast(text, { sticky = false } = {}) {
  clearTimeout(toastTimer);
  els.toastText.textContent = text;
  els.toast.hidden = false;
  if (!sticky) {
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 5000);
  }
}

els.toastClose.addEventListener('click', () => { els.toast.hidden = true; });

// ---------------------------------------------------------------- 手势模式

async function toggleGesture() {
  if (vision && vision.isRunning()) {
    vision.stop();
    els.pip.hidden = true;
    updateButtons();
    return;
  }
  els.btnGesture.disabled = true;
  els.btnGesture.textContent = '手势加载中…';
  try {
    if (!vision) {
      const mod = await import('../gesture-vision.js');
      vision = mod.createGestureVision({
        video: els.cam,
        onCommand: handleDirection,
        onPinch: handlePauseToggle,
        onFrame: (frame) => gesturePanel.renderFrame(frame),
        onStatus: (text) => gesturePanel.setStatus(text),
        onError: (err) => onGestureError(err),
      });
    }
    await vision.start();
    if (vision.isRunning()) {
      els.pip.hidden = false;
      showToast('手势模式已开启：食指指向控制方向，捏合拇指与食指暂停', { sticky: false });
    }
  } catch (err) {
    console.error('[gesture] 开启失败：', err);
    onGestureError({ message: '手势模式开启失败。', hint: '' });
  } finally {
    els.btnGesture.disabled = false;
    updateButtons();
  }
}

function onGestureError(err) {
  vision && vision.isRunning() && vision.stop();
  els.pip.hidden = true;
  const parts = ['手势模式不可用：', err && err.message ? err.message : '未知错误'];
  if (err && err.hint) parts.push(err.hint);
  parts.push('游戏仍可用键盘 / 触摸继续。');
  showToast(parts.join(''), { sticky: true });
  updateButtons();
}

els.btnGesture.addEventListener('click', () => { toggleGesture(); });

// ---------------------------------------------------------------- 控件事件

els.btnStart.addEventListener('click', () => {
  if (state.status === 'idle') {
    state = startGame(state);
    lastTick = performance.now();
    showPanel(null);
    updateButtons();
  }
});

els.btnPause.addEventListener('click', handlePauseToggle);
els.btnRestart.addEventListener('click', handleRestart);
els.btnAgain.addEventListener('click', handleRestart);
document.getElementById('btn-start-panel').addEventListener('click', () => els.btnStart.click());
document.getElementById('btn-resume').addEventListener('click', () => {
  if (state.status === 'paused') handlePauseToggle();
});

for (const size of GRID_SIZES) {
  const opt = document.createElement('option');
  opt.value = String(size);
  opt.textContent = `${size} × ${size}`;
  if (size === DEFAULT_GRID) opt.selected = true;
  els.gridSelect.appendChild(opt);
}

els.gridSelect.addEventListener('change', () => {
  gridSize = Number(els.gridSelect.value) || DEFAULT_GRID;
  newGame('idle');
});

// 切到后台自动暂停，避免回来时蛇已经撞死。
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.status === 'running') handlePauseToggle();
});

// ---------------------------------------------------------------- 启动

updateStats();
updateButtons();
showPanel('start');
requestAnimationFrame((now) => {
  lastTick = now;
  requestAnimationFrame(loop);
});
