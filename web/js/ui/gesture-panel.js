/**
 * 手势画中画（左下角）：镜像视频 + 指尖十字标记 + 当前识别方向指示 + 状态文案。
 * 只负责呈现，识别逻辑在 gesture-vision.js。
 */

const DIR_ARROWS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function createGesturePanel({ video, overlay, statusEl } = {}) {
  const ctx = overlay ? overlay.getContext('2d') : null;

  function syncOverlaySize() {
    if (!overlay || !ctx) return;
    const rect = overlay.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
    }
    ctx.setTransform(overlay.width / w, 0, 0, overlay.height / h, 0, 0);
    return { w, h };
  }

  /** frame: { hand, tip, dir, pinched } —— tip 为原始归一化坐标（绘制时自行镜像）。 */
  function renderFrame(frame = {}) {
    const size = syncOverlaySize();
    if (!ctx || !size) return;
    const { w, h } = size;
    ctx.clearRect(0, 0, w, h);

    if (!frame.hand) return;

    // 十字标记：视频是镜像显示的，标记也画在镜像位置（x 取反）。
    const px = (1 - frame.tip.x) * w;
    const py = frame.tip.y * h;
    ctx.strokeStyle = 'rgba(126,231,135,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 9, py);
    ctx.lineTo(px + 9, py);
    ctx.moveTo(px, py - 9);
    ctx.lineTo(px, py + 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.stroke();

    // 方向指示箭头（识别到的指向；没有越过死区则不画）
    const arrow = DIR_ARROWS[frame.dir];
    if (arrow) {
      const cx = w / 2;
      const cy = h / 2;
      const len = 16;
      ctx.strokeStyle = 'rgba(255,209,102,0.95)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - arrow.x * len, cy - arrow.y * len);
      ctx.lineTo(cx + arrow.x * len, cy + arrow.y * len);
      ctx.stroke();
      // 箭头头部
      const tipX = cx + arrow.x * (len + 5);
      const tipY = cy + arrow.y * (len + 5);
      const perp = { x: -arrow.y, y: arrow.x };
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - arrow.x * 7 + perp.x * 5, tipY - arrow.y * 7 + perp.y * 5);
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - arrow.x * 7 - perp.x * 5, tipY - arrow.y * 7 - perp.y * 5);
      ctx.stroke();
    }

    // 捏合提示：食指位置画一个高亮圈
    if (frame.pinched) {
      ctx.strokeStyle = 'rgba(255,120,120,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  return { renderFrame, setStatus };
}
