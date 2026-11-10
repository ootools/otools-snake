/**
 * 手势判定（纯逻辑，无 DOM 依赖，node --test 可直接 import）。
 * ------------------------------------------------------------------
 * 输入是 MediaPipe HandLandmarker 输出的归一化关键点（x/y ∈ [0,1]，x 向右、y 向下）。
 * 视频预览按自拍习惯做了镜像，方向判定也在**镜像坐标系**里做：
 * 手往身体的哪边指，蛇就往哪边走，与用户直觉一致。
 */

export const GESTURE_TUNING = {
  deadzone: 0.08, // 食指尖相对掌心位移的死区（归一化坐标），小于它不判向
  cooldownMs: 220, // 方向触发后的冷却，冷却期内忽略新的方向
  pinchDist: 0.06, // 拇指尖(4)与食指尖(8)距离 < 该值视为捏合
  pinchHoldMs: 400, // 捏合需持续的时间（防抖），到期切换一次暂停
};

/** 镜像 x 坐标（自拍视角）。 */
export function mirrorX(x) {
  return 1 - x;
}

/** 手掌中心 = 手腕(0) 与 中指根部(9) 的中点。 */
export function palmCenter(wrist, middleMcp) {
  return {
    x: (wrist.x + middleMcp.x) / 2,
    y: (wrist.y + middleMcp.y) / 2,
  };
}

/** 食指尖(8) 相对手掌中心的位移矢量（未镜像）。 */
export function pointingVector(fingerTip, center) {
  return { x: fingerTip.x - center.x, y: fingerTip.y - center.y };
}

/**
 * 主轴判向：位移绝对值最大的一轴决定方向；两轴分量都落在死区内返回 null。
 * 两轴相等时偏向水平轴（左/右），保证判定稳定可复现。
 */
export function pointingDirection(vx, vy, deadzone = GESTURE_TUNING.deadzone) {
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (Math.max(ax, ay) < deadzone) return null;
  if (ax >= ay) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}

/** 从关键点一步算出镜像后的方向：食指尖(8) 相对手掌中心（0 与 9 的中点）。 */
export function pointingDirectionFromLandmarks(fingerTip, wrist, middleMcp, deadzone = GESTURE_TUNING.deadzone) {
  const center = palmCenter(wrist, middleMcp);
  const v = pointingVector(fingerTip, center);
  // 镜像系里 x 取反、y 不变。
  return pointingDirection(-v.x, v.y, deadzone);
}

/** 两点归一化欧氏距离（捏合判定用）。 */
export function pinchDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 方向冷却闸：一次触发后 cooldownMs 内的新方向一律忽略（防手势抖动连发）。
 * feed(dir, nowMs) → 接受时返回 dir，否则返回 null。
 */
export function createDirectionGate({ cooldownMs = GESTURE_TUNING.cooldownMs } = {}) {
  let lastAcceptedAt = -Infinity;
  return {
    feed(dir, nowMs) {
      if (!dir) return null;
      if (nowMs - lastAcceptedAt < cooldownMs) return null;
      lastAcceptedAt = nowMs;
      return dir;
    },
    reset() {
      lastAcceptedAt = -Infinity;
    },
  };
}

/**
 * 捏合暂停闸：捏合（距离 < pinchDist）需持续 holdMs 才触发一次「切换暂停」；
 * 触发后必须先松开再捏合才会再次触发（防抖）。
 * feed(dist, nowMs) → 返回 true 表示这一帧恰好触发切换。
 */
export function createPinchGate({ pinchDist = GESTURE_TUNING.pinchDist, holdMs = GESTURE_TUNING.pinchHoldMs } = {}) {
  let pinching = false;
  let startAt = null;
  let armed = true;
  return {
    feed(dist, nowMs) {
      const isPinching = dist < pinchDist;
      if (!isPinching) {
        pinching = false;
        startAt = null;
        armed = true;
        return false;
      }
      if (!pinching) {
        pinching = true;
        startAt = nowMs;
      }
      if (armed && nowMs - startAt >= holdMs) {
        armed = false;
        return true;
      }
      return false;
    },
    reset() {
      pinching = false;
      startAt = null;
      armed = true;
    },
  };
}
