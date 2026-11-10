/**
 * 摄像头手势桥：懒加载 vendor 里的 MediaPipe tasks-vision，驱动 HandLandmarker，
 * 把「食指指向」翻译成方向指令、「拇指食指捏合」翻译成暂停切换。
 * ------------------------------------------------------------------
 * - vendor 路径：bundle 用相对本模块的 ../../vendor/...（web/js/ 与 dist/js/ 到
 *   vendor/ 的相对层级构建前后一致）；wasm 与模型用入口 HTML（dist/index.html）的
 *   文档相对路径 vendor/...。
 * - 所有失败路径（无摄像头 / 拒绝授权 / wasm 或模型加载失败）都通过 onError
 *   给出清晰的中文原因，游戏仍可用键盘/触摸继续玩。
 * - 关闭时停掉相机轨并释放 landmarker。
 */

import {
  GESTURE_TUNING,
  createDirectionGate,
  createPinchGate,
  pinchDistance,
  pointingDirectionFromLandmarks,
} from './engine/gesture-input.js';

const VISION_BUNDLE_URL = '../../vendor/tasks-vision/vision_bundle.mjs';
const WASM_DIR = 'vendor/tasks-vision/wasm';
const MODEL_PATH = 'vendor/models/hand_landmarker.task';

/**
 * 动态 import vendor bundle。部分宿主把 .mjs 标成 application/octet-stream，
 * 浏览器会以 MIME 校验为由拒绝模块导入；此时兜底用 fetch 拉文本、blob URL 再导入。
 */
async function importVisionBundle() {
  try {
    return await import(VISION_BUNDLE_URL);
  } catch (err) {
    console.warn('[gesture] 直接 import 失败，改用 fetch+blob 兜底：', err);
    const res = await fetch(VISION_BUNDLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const source = await res.text();
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const ERR_MESSAGES = {
  bundle: '手势模型脚本（vendor/tasks-vision/vision_bundle.mjs）加载失败，文件可能缺失。',
  wasm: '手势推理引擎（WASM）加载失败，浏览器可能不支持或文件缺失。',
  landmarker: '手势识别器初始化失败（GPU/CPU 均不可用）。',
  camera: '无法打开摄像头。',
};

/** 生成面向用户的错误文案；在 OTools 宿主 webview 里补充浏览器体验提示。 */
function cameraErrorText(error) {
  let reason = ERR_MESSAGES.camera;
  if (error && error.name === 'NotAllowedError') reason = '摄像头授权被拒绝，请在浏览器设置里允许后重试。';
  else if (error && error.name === 'NotFoundError') reason = '未检测到摄像头设备。';
  else if (error && error.name === 'NotReadableError') reason = '摄像头被其它应用占用，请关闭后重试。';
  let hint = '';
  try {
    if (window.otoolsPlugin && typeof window.otoolsPlugin.available === 'function' && window.otoolsPlugin.available()) {
      hint = '宿主内置浏览器可能未开放相机权限，可在浏览器中打开本插件目录的 dist/index.html 体验手势模式。';
    }
  } catch {
    // 忽略宿主桥探测失败
  }
  return { message: reason, hint };
}

export function createGestureVision({ video, onCommand, onPinch, onFrame, onStatus, onError } = {}) {
  let running = false;
  let stream = null;
  let landmarker = null;
  let rafId = 0;
  let vfcHandle = 0;
  let lastTs = -1;
  let detectFailures = 0;
  const dirGate = createDirectionGate();
  const pinchGate = createPinchGate();

  const emitStatus = (message) => { if (onStatus) onStatus(message); };
  const emitError = (err) => {
    if (onError) onError(err);
  };

  async function createLandmarker(vision) {
    const { FilesetResolver, HandLandmarker } = vision;
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    try {
      return await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch (gpuErr) {
      // GPU 不可用（驱动/兼容性）→ 自动退回 CPU 推理。
      console.warn('[gesture] GPU delegate 不可用，退回 CPU：', gpuErr);
      return await HandLandmarker.createFromOptions(fileset, options('CPU'));
    }
  }

  async function openCamera() {
    emitStatus('正在请求摄像头授权…');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    await video.play().catch(() => { /* 某些 webview 不返回 play promise，忽略 */ });
    // 等首帧就绪，避免 detectForVideo 拿到 0×0 帧。
    await new Promise((resolve) => {
      if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
      video.addEventListener('loadeddata', resolve, { once: true });
    });
  }

  function detectLoop() {
    if (!running) return;
    scheduleNext();
    const now = performance.now();
    const ts = Math.max(lastTs + 1, now); // MediaPipe 要求时间戳单调递增
    lastTs = ts;
    let result;
    try {
      result = landmarker.detectForVideo(video, ts);
      detectFailures = 0;
    } catch (err) {
      detectFailures += 1;
      console.warn('[gesture] detectForVideo 失败：', err);
      if (detectFailures >= 8) {
        stop();
        emitError({ message: '手势识别连续失败，已自动关闭手势模式。', hint: '可尝试刷新页面后重新开启。' });
      }
      return;
    }

    const landmarks = result && result.landmarks && result.landmarks[0];
    if (!landmarks || landmarks.length < 9) {
      // 手不在画面里：给闸门喂一帧「未捏合」，避免手离开时捏合状态卡死。
      pinchGate.feed(1, now);
      if (onFrame) onFrame({ hand: false, now });
      emitStatus('请将手举到摄像头前');
      return;
    }
    const tip = landmarks[8];
    const dir = pointingDirectionFromLandmarks(tip, landmarks[0], landmarks[9], GESTURE_TUNING.deadzone);
    const acceptedDir = dirGate.feed(dir, now);
    if (acceptedDir && onCommand) onCommand(acceptedDir);
    const pinch = pinchDistance(landmarks[4], landmarks[8]);
    const pinched = pinch < GESTURE_TUNING.pinchDist;
    const toggled = pinchGate.feed(pinch, now);
    if (toggled && onPinch) onPinch();
    if (onFrame) onFrame({ hand: true, tip, dir, pinched, now });
    emitStatus(acceptedDir ? `识别方向：${dirLabel(acceptedDir)}` : '手势识别中…');
  }

  function scheduleNext() {
    if (!running) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      vfcHandle = video.requestVideoFrameCallback(() => detectLoop());
    } else {
      rafId = requestAnimationFrame(() => detectLoop());
    }
  }

  function dirLabel(dir) {
    return { up: '上', down: '下', left: '左', right: '右' }[dir] || dir;
  }

  async function start() {
    if (running) return;
    running = true;
    dirGate.reset();
    pinchGate.reset();
    try {
      emitStatus('正在加载手势模型…');
      let vision;
      try {
        vision = await importVisionBundle();
      } catch (err) {
        console.error('[gesture] vision bundle 加载失败：', err);
        throw { message: ERR_MESSAGES.bundle, hint: '请确认构建产物 dist/vendor/ 已完整生成。' };
      }
      try {
        landmarker = await createLandmarker(vision);
      } catch (err) {
        console.error('[gesture] HandLandmarker 初始化失败：', err);
        throw { message: ERR_MESSAGES.wasm, hint: '请确认 dist/vendor/tasks-vision/wasm/ 已完整生成。' };
      }
      if (!landmarker) throw { message: ERR_MESSAGES.landmarker, hint: '' };
      try {
        await openCamera();
      } catch (err) {
        console.error('[gesture] 摄像头打开失败：', err);
        const { message, hint } = cameraErrorText(err);
        throw { message, hint };
      }
      lastTs = -1;
      detectFailures = 0;
      emitStatus('手势模式已开启：食指指向控制方向，捏合拇指与食指暂停');
      scheduleNext();
    } catch (err) {
      const failure = err && typeof err === 'object' && 'message' in err ? err : { message: ERR_MESSAGES.landmarker, hint: '' };
      stop();
      emitError(failure);
    }
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    vfcHandle = 0;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    video.srcObject = null;
    if (landmarker) {
      try {
        if (typeof landmarker.close === 'function') landmarker.close();
      } catch (err) {
        console.warn('[gesture] 释放 landmarker 失败：', err);
      }
      landmarker = null;
    }
    emitStatus('');
  }

  return {
    start,
    stop,
    isRunning: () => running,
  };
}
