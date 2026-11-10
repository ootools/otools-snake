/**
 * 棋盘渲染（canvas）：淡网格纹、渐进色圆角蛇身、发光食物、死亡闪红。
 * 不持有游戏状态，只吃 state + 渲染附加信息。
 */

const COLOR_BG = '#10131a';
const COLOR_GRID = 'rgba(255,255,255,0.045)';
const COLOR_BORDER = '#2a2f3a';
const COLOR_FOOD = '#ff5d5d';
const COLOR_SNAKE_HEAD = '#9bf6a5';
const COLOR_SNAKE_TAIL = '#1f7a3d';

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  // 兜底：老 webview 没有 roundRect 时手画。
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function createBoard(canvas) {
  const ctx = canvas.getContext('2d');
  let cssWidth = 0;
  let cssHeight = 0;

  function syncSize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w !== cssWidth || h !== cssHeight || canvas.width !== Math.round(w * dpr)) {
      cssWidth = w;
      cssHeight = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(canvas.width / cssWidth, 0, 0, canvas.height / cssHeight, 0, 0);
  }

  /**
   * @param {object} state 引擎状态
   * @param {object} opts { now, flashUntil, dir } now 用于食物脉动与闪红淡出
   */
  function render(state, { now = 0, flashUntil = 0, dir = state.dir } = {}) {
    syncSize();
    const { cols, rows, snake, food } = state;
    const cell = Math.min(cssWidth / cols, cssHeight / rows);
    const offsetX = (cssWidth - cell * cols) / 2;
    const offsetY = (cssHeight - cell * rows) / 2;

    // 背景 + 淡网格
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < cols; i++) {
      const px = Math.round(offsetX + i * cell) + 0.5;
      ctx.moveTo(px, offsetY);
      ctx.lineTo(px, offsetY + rows * cell);
    }
    for (let j = 1; j < rows; j++) {
      const py = Math.round(offsetY + j * cell) + 0.5;
      ctx.moveTo(offsetX, py);
      ctx.lineTo(offsetX + cols * cell, py);
    }
    ctx.stroke();
    ctx.strokeStyle = COLOR_BORDER;
    ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, cols * cell - 1, rows * cell - 1);

    const cellPad = cell * 0.12;

    // 食物：发光 + 呼吸脉动
    if (food) {
      const fx = offsetX + (food.x + 0.5) * cell;
      const fy = offsetY + (food.y + 0.5) * cell;
      const pulse = 0.5 + 0.5 * Math.sin(now / 300);
      const r = cell * (0.26 + 0.05 * pulse);
      ctx.save();
      ctx.shadowColor = COLOR_FOOD;
      ctx.shadowBlur = cell * (0.55 + 0.25 * pulse);
      ctx.fillStyle = COLOR_FOOD;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(fx - r * 0.3, fy - r * 0.3, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // 蛇身：从头到尾渐进变暗，圆角矩形
    const n = snake.length;
    for (let i = n - 1; i >= 0; i--) {
      const seg = snake[i];
      const t = n === 1 ? 0 : i / (n - 1); // 0=头 1=尾
      const c0 = hexToRgb(COLOR_SNAKE_HEAD);
      const c1 = hexToRgb(COLOR_SNAKE_TAIL);
      const r = Math.round(c0.r + (c1.r - c0.r) * t);
      const g = Math.round(c0.g + (c1.g - c0.g) * t);
      const b = Math.round(c0.b + (c1.b - c0.b) * t);
      const inset = i === 0 ? cellPad * 0.4 : cellPad;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      roundedRectPath(
        ctx,
        offsetX + seg.x * cell + inset,
        offsetY + seg.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
        cell * 0.3,
      );
      ctx.fill();
    }

    // 蛇头眼睛：按当前朝向点两个点
    if (n > 0) {
      const headSeg = snake[0];
      const hx = offsetX + (headSeg.x + 0.5) * cell;
      const hy = offsetY + (headSeg.y + 0.5) * cell;
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [1, 0];
      const perp = [-v[1], v[0]];
      const eyeOffsetForward = cell * 0.16;
      const eyeOffsetSide = cell * 0.16;
      ctx.fillStyle = '#0d1117';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(
          hx + v[0] * eyeOffsetForward + perp[0] * eyeOffsetSide * s,
          hy + v[1] * eyeOffsetForward + perp[1] * eyeOffsetSide * s,
          Math.max(1.2, cell * 0.06),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    // 死亡闪红：红罩随时间淡出
    if (flashUntil > now) {
      const alpha = Math.min(0.55, (flashUntil - now) / 500 * 0.55 + 0.08);
      ctx.fillStyle = `rgba(255,72,72,${alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    }
  }

  return { render };
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
