/**
 * 键盘 + 触摸输入。回调风格，方便与引擎/UI 解耦。
 * 键盘：方向键 / WASD 转向，空格暂停切换，Enter 在结算时重开。
 * 触摸：在棋盘上滑动，累计位移超过阈值即判向（无需抬手，可连续滑动）。
 */

export const SWIPE_THRESHOLD_PX = 24;

const KEY_DIRS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

/** 绑定键盘：返回解绑函数。 */
export function attachKeyboard({ onDirection, onPause, onRestart } = {}) {
  function handleKeydown(e) {
    const dir = KEY_DIRS[e.code];
    if (dir) {
      e.preventDefault();
      if (onDirection) onDirection(dir);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (onPause) onPause();
      return;
    }
    if (e.code === 'Enter') {
      if (onRestart) onRestart();
    }
  }
  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}

/**
 * 绑定触摸滑动（touch 事件，passive:false 才能阻止页面滚动）。
 * 每次超过阈值即发出方向，并把锚点重置到当前触点，支持不抬手连续转向。
 * 返回解绑函数。
 */
export function attachTouchSwipe(el, { onDirection, threshold = SWIPE_THRESHOLD_PX } = {}) {
  let anchor = null;

  function onTouchStart(e) {
    const t = e.changedTouches && e.changedTouches[0];
    anchor = t ? { x: t.clientX, y: t.clientY } : null;
  }

  function onTouchMove(e) {
    if (!anchor) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - anchor.x;
    const dy = t.clientY - anchor.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < threshold) return;
    e.preventDefault(); // 已判定为滑动，阻止页面滚动
    const dir = ax >= ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    anchor = { x: t.clientX, y: t.clientY };
    if (onDirection) onDirection(dir);
  }

  function onTouchEnd() {
    anchor = null;
  }

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
  el.addEventListener('touchcancel', onTouchEnd, { passive: true });
  return () => {
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
  };
}
