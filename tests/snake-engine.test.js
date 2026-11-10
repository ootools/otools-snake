import test from 'node:test';
import assert from 'node:assert/strict';
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
  spawnFood,
  togglePause,
} from '../web/js/engine/snake.js';

/** 可复现的伪随机数（LCG），用于食物生成的确定性测试。 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function headOf(state) {
  return state.snake[0];
}

test('createGame：默认 20×20，蛇长 3 居中向右，食物在棋盘内且不落蛇身', () => {
  const state = createGame({ rng: makeRng(42) });
  assert.equal(state.cols, DEFAULT_GRID);
  assert.equal(state.rows, DEFAULT_GRID);
  assert.equal(state.snake.length, 3);
  assert.equal(state.dir, 'right');
  assert.equal(state.status, 'idle');
  assert.ok(state.food);
  assert.ok(state.food.x >= 0 && state.food.x < state.cols);
  assert.ok(state.food.y >= 0 && state.food.y < state.rows);
  for (const seg of state.snake) {
    assert.ok(!(seg.x === state.food.x && seg.y === state.food.y));
  }
});

test('createGame：支持 16 / 24 棋盘（规格允许的尺寸）', () => {
  for (const size of GRID_SIZES) {
    const state = createGame({ cols: size, rng: makeRng(7) });
    assert.equal(state.cols, size);
    assert.equal(state.rows, size);
    assert.ok(state.food);
  }
});

test('方向队列：180° 掉头被拒绝', () => {
  let state = createGame({ rng: makeRng(1) });
  assert.equal(state.dir, 'right');
  const r = queueDirection(state, 'left');
  assert.equal(r.accepted, false);
  assert.equal(r.reason, 'reverse');
  assert.equal(r.state, state); // 拒绝时状态原样返回
});

test('方向队列：队首转向后，再反向也被拒绝（相对生效方向判 180°）', () => {
  let state = createGame({ rng: makeRng(2) });
  state = queueDirection(state, 'up').state; // 生效方向 = up
  const r = queueDirection(state, 'down'); // 相对 up 是 180°
  assert.equal(r.accepted, false);
  assert.equal(r.reason, 'reverse');
});

test('方向队列：两段合法转向依序生效（每 tick 只取一个方向）', () => {
  let state = createGame({ rng: makeRng(3), status: 'running' });
  const head0 = headOf(state);
  state = queueDirection(state, 'up').state;
  state = queueDirection(state, 'left').state;
  assert.equal(state.dirQueue.length, 2);

  // 第一 tick：取 up
  const s1 = stepGame(state).state;
  assert.equal(s1.dir, 'up');
  assert.deepEqual(headOf(s1), { x: head0.x, y: head0.y - 1 });
  // 第二 tick：取 left
  const s2 = stepGame(s1).state;
  assert.equal(s2.dir, 'left');
  assert.deepEqual(headOf(s2), { x: head0.x - 1, y: head0.y - 1 });
});

test('方向队列：最多缓存 2 条，第 3 条被拒绝；同向重复与未知方向也被拒绝', () => {
  let state = createGame({ rng: makeRng(4) });
  state = queueDirection(state, 'up').state;
  state = queueDirection(state, 'left').state;
  const full = queueDirection(state, 'up');
  assert.equal(full.accepted, false);
  assert.equal(full.reason, 'full');

  const dup = queueDirection(state, 'right'); // 与生效方向（队尾 left 前的 right？）——
  // 生效方向是队尾 'left'，'right' 是它的 180°，会先按 reverse 拒绝
  assert.equal(dup.accepted, false);
  assert.equal(dup.reason, 'reverse');

  const unknown = queueDirection(state, 'diagonal');
  assert.equal(unknown.accepted, false);
  assert.equal(unknown.reason, 'unknown');
});

test('食物：大量随机生成都不落蛇身且都在棋盘内', () => {
  const rng = makeRng(2024);
  const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  for (let i = 0; i < 500; i++) {
    const food = spawnFood(16, 16, snake, rng);
    assert.ok(food);
    assert.ok(food.x >= 0 && food.x < 16);
    assert.ok(food.y >= 0 && food.y < 16);
    for (const seg of snake) {
      assert.ok(!(food.x === seg.x && food.y === seg.y), `食物落在蛇身 ${food.x},${food.y}`);
    }
  }
});

test('吃食：蛇增长一格且得分 +1，新食物不落蛇身', () => {
  const rng = makeRng(5);
  let state = createGame({ cols: 12, rows: 12, status: 'running', rng });
  // 把食物摆到蛇头前方一格，强制本 tick 吃到
  const head = headOf(state);
  state = { ...state, food: { x: head.x + 1, y: head.y } };
  const lengthBefore = state.snake.length;
  const { state: next, events } = stepGame(state, { rng });
  assert.equal(events.ate, true);
  assert.equal(events.died, false);
  assert.equal(next.score, 1);
  assert.equal(next.snake.length, lengthBefore + 1);
  for (const seg of next.snake) {
    assert.ok(!(next.food.x === seg.x && next.food.y === seg.y));
  }
});

test('穿行：普通前进一格不判死，蛇尾挪走、长度不变', () => {
  let state = createGame({ rng: makeRng(6), status: 'running' });
  // 固定食物在远处，避免随机食物恰好落在前进路径上干扰断言
  state = { ...state, food: { x: 0, y: 0 } };
  const head = headOf(state);
  const oldTail = state.snake[state.snake.length - 1];
  const { state: next, events } = stepGame(state);
  assert.equal(events.moved, true);
  assert.equal(events.died, false);
  assert.equal(next.snake.length, 3);
  assert.deepEqual(headOf(next), { x: head.x + 1, y: head.y });
  // 尾巴那格已挪走：新蛇身不再包含旧尾格
  assert.ok(!next.snake.some((c) => c.x === oldTail.x && c.y === oldTail.y));
});

test('撞墙：蛇头出界即死亡（死因 wall，蛇不移动）', () => {
  let state = createGame({ rng: makeRng(7) });
  // 摆到右边缘向右走
  state = {
    ...state,
    status: 'running',
    dir: 'right',
    dirQueue: [],
    snake: [{ x: 19, y: 5 }, { x: 18, y: 5 }, { x: 17, y: 5 }],
    food: { x: 1, y: 1 },
  };
  const { state: next, events } = stepGame(state);
  assert.equal(events.died, true);
  assert.equal(events.cause, 'wall');
  assert.equal(next.status, 'over');
  assert.equal(next.cause, 'wall');
  assert.deepEqual(headOf(next), { x: 19, y: 5 }); // 蛇未移动
});

test('撞身：蛇头撞上自身身体即死亡（死因 self）', () => {
  let state = createGame({ cols: 10, rows: 10, rng: makeRng(8) });
  // U 形蛇：头 (3,1) 向下走会撞到身体 (3,2)；尾巴 (4,2) 本 tick 挪走也不够
  state = {
    ...state,
    status: 'running',
    dir: 'down',
    dirQueue: [],
    snake: [{ x: 3, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }],
    food: { x: 0, y: 9 },
  };
  const { state: next, events } = stepGame(state);
  assert.equal(events.died, true);
  assert.equal(events.cause, 'self');
  assert.equal(next.status, 'over');
});

test('贴身「追尾」合法：撞向即将挪走的尾巴那格不算死（无生长时）', () => {
  let state = createGame({ cols: 10, rows: 10, rng: makeRng(9) });
  // 头 (3,1)，尾巴 (3,2)：向下走恰好追尾，尾巴会挪走 → 合法
  state = {
    ...state,
    status: 'running',
    dir: 'down',
    dirQueue: [],
    snake: [{ x: 3, y: 1 }, { x: 3, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 2 }],
    food: { x: 9, y: 9 },
  };
  const { state: next, events } = stepGame(state);
  assert.equal(events.died, false);
  assert.deepEqual(headOf(next), { x: 3, y: 2 });
});

test('速度分档：边界 4/5 与 14/15 正确换档', () => {
  assert.equal(speedTierIndexForScore(0), 0);
  assert.equal(speedTierIndexForScore(4), 0);
  assert.equal(speedTierIndexForScore(5), 1);
  assert.equal(speedTierIndexForScore(14), 1);
  assert.equal(speedTierIndexForScore(15), 2);
  assert.equal(speedTierIndexForScore(99), 2);
  // 档位间隔与配置一致
  assert.equal(stepIntervalMs({ score: 0 }), SPEED_TIERS[0].intervalMs);
  assert.equal(stepIntervalMs({ score: 5 }), SPEED_TIERS[1].intervalMs);
  assert.equal(stepIntervalMs({ score: 15 }), SPEED_TIERS[2].intervalMs);
});

test('暂停：非 running 状态步进是空操作；togglePause 在 running/paused 间切换', () => {
  let state = createGame({ rng: makeRng(10), status: 'running' });
  state = togglePause(state).state;
  assert.equal(state.status, 'paused');
  const { state: same, events } = stepGame(state);
  assert.equal(same, state);
  assert.equal(events.moved, false);
  const back = togglePause(state);
  assert.equal(back.state.status, 'running');
  assert.equal(back.paused, false);
});

test('开始与重开：startGame 仅从 idle 进入 running；resetGame 保持棋盘尺寸', () => {
  let state = createGame({ cols: 16, rows: 16, rng: makeRng(11) });
  state = startGame(state);
  assert.equal(state.status, 'running');
  // 走几步拉开与初始布局的距离
  state = stepGame(state).state;
  state = stepGame(state).state;
  const reset = resetGame(state, { rng: makeRng(12) });
  assert.equal(reset.cols, 16);
  assert.equal(reset.rows, 16);
  assert.equal(reset.status, 'running');
  assert.equal(reset.score, 0);
  assert.equal(reset.snake.length, 3);
});
