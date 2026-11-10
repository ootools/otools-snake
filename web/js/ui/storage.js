/**
 * 最高分存取（localStorage，私有模式等异常场景静默降级为会话内有效）。
 */

const KEY = 'otools-snake-best';

export function loadHighScore() {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score) {
  try {
    window.localStorage.setItem(KEY, String(Math.max(0, Math.floor(score))));
  } catch {
    // 无痕模式/存储被禁：忽略，最高分退化为仅本次会话有效。
  }
}
