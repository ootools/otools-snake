import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GESTURE_TUNING,
  createDirectionGate,
  createPinchGate,
  mirrorX,
  palmCenter,
  pinchDistance,
  pointingDirection,
  pointingDirectionFromLandmarks,
  pointingVector,
} from '../web/js/engine/gesture-input.js';

test('主轴判向：四个方向与死区', () => {
  assert.equal(pointingDirection(0.3, 0.01), 'right');
  assert.equal(pointingDirection(-0.3, 0.01), 'left');
  assert.equal(pointingDirection(0.01, 0.3), 'down');
  assert.equal(pointingDirection(0.01, -0.3), 'up');
  // 两轴都落在死区内 → 不判向
  assert.equal(pointingDirection(0.05, 0.05), null);
  assert.equal(pointingDirection(0.079, -0.079), null);
  // 恰好等于死区阈值：视为越界判向
  assert.equal(pointingDirection(GESTURE_TUNING.deadzone, 0), 'right');
  // 两轴相等时偏向水平轴（稳定可复现的约定）
  assert.equal(pointingDirection(0.3, 0.3), 'right');
  assert.equal(pointingDirection(-0.3, 0.3), 'left');
});

test('镜像坐标：mirrorX 与「手往身体哪边指」一致', () => {
  // 前置摄像头原始画面里，用户往自己右边指 → 指尖在画面偏左（x 更小）。
  // 镜像后 x 反转，判为 right，与用户直觉一致。
  const wrist = { x: 0.5, y: 0.5 };
  const middleMcp = { x: 0.5, y: 0.4 };
  const center = palmCenter(wrist, middleMcp);
  const tip = { x: 0.35, y: 0.45 }; // 原始画面偏左
  const v = pointingVector(tip, center);
  assert.equal(mirrorX(0.35), 0.65); // mirrorX 镜像的是坐标（0..1），不是位移增量
  assert.equal(pointingDirectionFromLandmarks(tip, wrist, middleMcp), 'right');

  // 往上指：y 更小 → up（y 不镜像）
  assert.equal(pointingDirectionFromLandmarks({ x: 0.5, y: 0.25 }, wrist, middleMcp), 'up');
  // 往下指
  assert.equal(pointingDirectionFromLandmarks({ x: 0.5, y: 0.7 }, wrist, middleMcp), 'down');
  // 往自己左边指（原始画面偏右）
  assert.equal(pointingDirectionFromLandmarks({ x: 0.65, y: 0.45 }, wrist, middleMcp), 'left');
});

test('关键点判向：指尖贴着掌心（死区内）不判向', () => {
  const wrist = { x: 0.5, y: 0.5 };
  const middleMcp = { x: 0.5, y: 0.4 };
  const center = palmCenter(wrist, middleMcp);
  const tip = { x: center.x + 0.03, y: center.y + 0.02 };
  assert.equal(pointingDirectionFromLandmarks(tip, wrist, middleMcp), null);
});

test('捏合距离：欧氏距离', () => {
  assert.equal(pinchDistance({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }), 0.5);
  assert.equal(pinchDistance({ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }), 0);
});

test('方向冷却闸：触发后 220ms 内的新方向被忽略', () => {
  const gate = createDirectionGate();
  assert.equal(gate.feed('up', 0), 'up');
  assert.equal(gate.feed('down', 100), null); // 冷却中换向也被吞掉
  assert.equal(gate.feed('down', 219), null); // 冷却最后一刻
  assert.equal(gate.feed('down', 220), 'down'); // 冷却结束立即放行
  assert.equal(gate.feed('left', 221), null);
  assert.equal(gate.feed('left', 440), 'left');
});

test('方向冷却闸：空方向与 reset', () => {
  const gate = createDirectionGate();
  assert.equal(gate.feed(null, 0), null);
  assert.equal(gate.feed('up', 0), 'up');
  gate.reset();
  assert.equal(gate.feed('down', 1), 'down'); // 重置后立即放行
});

test('捏合暂停闸：持续 400ms 才触发一次，松开后重新待命', () => {
  const gate = createPinchGate();
  const d = 0.05; // < pinchDist(0.06) 视为捏合
  assert.equal(gate.feed(d, 0), false); // 刚捏上
  assert.equal(gate.feed(d, 200), false); // 还没到 400ms
  assert.equal(gate.feed(d, 399), false);
  assert.equal(gate.feed(d, 400), true); // 到期，触发一次
  assert.equal(gate.feed(d, 500), false); // 持续捏合不再触发
  assert.equal(gate.feed(0.3, 600), false); // 松开
  assert.equal(gate.feed(d, 700), false); // 重新捏合，重新计时
  assert.equal(gate.feed(d, 1099), false);
  assert.equal(gate.feed(d, 1100), true); // 再次触发
});

test('捏合暂停闸：距离未到阈值永不触发；快速点捏不误触', () => {
  const gate = createPinchGate();
  assert.equal(gate.feed(0.07, 0), false);
  assert.equal(gate.feed(0.07, 1000), false); // 一直没捏合
  // 短促捏合（<400ms）反复点，不应触发
  for (let t = 0; t < 20; t++) {
    assert.equal(gate.feed(0.05, t * 20), false);
    assert.equal(gate.feed(0.2, t * 20 + 10), false);
  }
});

test('调参常量与规格一致：死区 0.08 / 冷却 220ms / 捏合 0.06 / 防抖 400ms', () => {
  assert.equal(GESTURE_TUNING.deadzone, 0.08);
  assert.equal(GESTURE_TUNING.cooldownMs, 220);
  assert.equal(GESTURE_TUNING.pinchDist, 0.06);
  assert.equal(GESTURE_TUNING.pinchHoldMs, 400);
});
