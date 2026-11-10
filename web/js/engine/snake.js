/**
 * 贪吃蛇游戏引擎（纯逻辑，无 DOM 依赖，node --test 可直接 import）。
 * ------------------------------------------------------------------
 * 约定：
 *   - 状态是一个普通对象，所有变换函数都返回**新状态**（不可变风格），不碰 DOM。
 *   - 坐标系：col ∈ [0, cols)，row ∈ [0, rows)，{x, y} 表示列/行；蛇数组 head 在前。
 *   - 方向用字符串 'up' | 'down' | 'left' | 'right'。
 */

export const DIRECTIONS = ['up', 'down', 'left', 'right'];

export const DIR_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const GRID_SIZES = [16, 20, 24];
export const DEFAULT_GRID = 20;

// 速度分档：随得分分档提速。minScore 即分档边界（4→悠闲，5→轻快，15→疾速）。
export const SPEED_TIERS = [
  { key: 'calm', label: '悠闲', minScore: 0, intervalMs: 160 },
  { key: 'brisk', label: '轻快', minScore: 5, intervalMs: 110 },
  { key: 'swift', label: '疾速', minScore: 15, intervalMs: 75 },
];

/** 得分所在的速度档位下标（0/1/2）。 */
export function speedTierIndexForScore(score) {
  let index = 0;
  for (let i = 0; i < SPEED_TIERS.length; i++) {
    if (score >= SPEED_TIERS[i].minScore) index = i;
  }
  return index;
}

/** 当前状态对应的固定步进间隔（毫秒）。 */
export function stepIntervalMs(state) {
  return SPEED_TIERS[speedTierIndexForScore(state.score)].intervalMs;
}

/** 新建一局：蛇长 3 居中向右，食物随机（不落蛇身）。 */
export function createGame({ cols = DEFAULT_GRID, rows = cols, status = 'idle', rng = Math.random } = {}) {
  const safeCols = Math.max(6, Math.floor(cols));
  const safeRows = Math.max(6, Math.floor(rows));
  const cx = Math.floor(safeCols / 2);
  const cy = Math.floor(safeRows / 2);
  const state = {
    cols: safeCols,
    rows: safeRows,
    snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
    dir: 'right',
    dirQueue: [],
    food: spawnFood(safeCols, safeRows, null, rng),
    score: 0,
    grow: 0,
    tick: 0,
    status, // 'idle' | 'running' | 'paused' | 'over'
    cause: null, // 死因/结束原因：'wall' | 'self' | 'win' | null
  };
  if (state.food && isSameCell(state.food, state.snake[0])) {
    state.food = spawnFood(safeCols, safeRows, state.snake, rng);
  }
  return state;
}

function isSameCell(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

/**
 * 随机生成一个不落在 occupied（蛇身）上的食物格。
 * occupied 传 null 表示没有占用；没有空格时返回 null（棋盘被吃满 → 通关）。
 */
export function spawnFood(cols, rows, occupied, rng = Math.random) {
  const taken = occupied || [];
  const freeCount = cols * rows - taken.length;
  if (freeCount <= 0) return null;
  // 收集空格再按 rng 取一个：保证分布均匀且对纯函数测试可复现。
  const takenKeys = new Set(taken.map((c) => `${c.x},${c.y}`));
  const free = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!takenKeys.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  return free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
}

/**
 * 把方向指令压入方向队列（≤2 缓存，先到先走）。
 * 拒绝：180° 掉头（相对「当前生效方向」= 队尾方向或 state.dir）、与生效方向重复、队列已满、未知方向。
 * 返回 { state, accepted, reason }；reason ∈ 'reverse' | 'duplicate' | 'full' | 'unknown' | null。
 */
export function queueDirection(state, dir, { maxQueue = 2 } = {}) {
  const reject = (reason) => ({ state, accepted: false, reason });
  if (!DIRECTIONS.includes(dir)) return reject('unknown');
  const effective = state.dirQueue.length > 0 ? state.dirQueue[state.dirQueue.length - 1] : state.dir;
  if (dir === OPPOSITE[effective]) return reject('reverse');
  if (dir === effective) return reject('duplicate');
  if (state.dirQueue.length >= maxQueue) return reject('full');
  return { state: { ...state, dirQueue: [...state.dirQueue, dir] }, accepted: true, reason: null };
}

/**
 * 推进一步（固定步进，一个 tick 只取一个方向）。
 * 返回 { state, events: { moved, ate, died, won, cause } }。
 * status 不是 'running' 时不动作（暂停/待机/结算中的空转）。
 */
export function stepGame(state, { rng = Math.random } = {}) {
  const idle = { moved: false, ate: false, died: false, won: false, cause: null };
  if (state.status !== 'running') return { state, events: idle };

  const next = { ...state, snake: state.snake.slice(), dirQueue: state.dirQueue.slice(), food: state.food ? { ...state.food } : null };
  if (next.dirQueue.length > 0) next.dir = next.dirQueue.shift(); // 一个 tick 只取一个方向
  next.tick = state.tick + 1;

  const step = DIR_VECTORS[next.dir];
  const head = next.snake[0];
  const nx = head.x + step.x;
  const ny = head.y + step.y;

  // 撞墙：蛇不动，直接判负。
  if (nx < 0 || ny < 0 || nx >= next.cols || ny >= next.rows) {
    return finish(next, { ...idle, died: true, cause: 'wall' }, 'wall');
  }

  const ate = isSameCell(next.food, { x: nx, y: ny });
  // 撞自身：尾巴本 tick 会挪走（不生长时），所以尾巴那格不算障碍；要生长（含吃到食物）则算。
  const tailVacates = next.grow === 0 && !ate;
  const body = tailVacates ? next.snake.slice(0, -1) : next.snake;
  const hitSelf = body.some((c) => c.x === nx && c.y === ny);
  if (hitSelf) {
    return finish(next, { ...idle, died: true, cause: 'self' }, 'self');
  }

  next.snake.unshift({ x: nx, y: ny });
  if (ate) {
    next.score = state.score + 1;
    next.grow = state.grow + 1; // 本 tick 就不挪尾，实现「增长一格」
    next.food = spawnFood(next.cols, next.rows, next.snake, rng);
    if (!next.food) {
      // 棋盘吃满：通关结算。
      return finish(next, { moved: true, ate: true, died: false, won: true, cause: 'win' }, 'win');
    }
  } else if (next.grow > 0) {
    next.grow -= 1;
  } else {
    next.snake.pop();
  }

  return { state: next, events: { moved: true, ate, died: false, won: false, cause: null } };
}

function finish(state, events, cause) {
  return { state: { ...state, status: 'over', cause }, events };
}

/** 待机 → 开始。其它状态原样返回。 */
export function startGame(state) {
  if (state.status !== 'idle') return state;
  return { ...state, status: 'running', cause: null };
}

/** 暂停/继续切换。只在 running/paused 间切换，其它状态原样返回。 */
export function togglePause(state) {
  if (state.status === 'running') return { state: { ...state, status: 'paused' }, paused: true };
  if (state.status === 'paused') return { state: { ...state, status: 'running' }, paused: false };
  return { state, paused: state.status === 'paused' };
}

/** 重开一局：沿用棋盘尺寸，默认回到 running。 */
export function resetGame(state, { status = 'running', rng = Math.random } = {}) {
  return createGame({ cols: state.cols, rows: state.rows, status, rng });
}
