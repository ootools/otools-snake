/**
 * 手势资源路径解析（纯函数、无 DOM 依赖，node --test 可测）。
 * ------------------------------------------------------------------
 * 插件包里 vendor 只随 dist/ 一起发布（dist/vendor/），但不同加载环境的
 * 「站点根」不一样，bundle 不能写死单一相对路径：
 *   - OTools 宿主：文档 otools-plugin://localhost/<uuid>/dist/index.html，
 *     文件按插件根返回（<uuid>/dist/vendor/... 可达，<uuid>/vendor/... 不存在）；
 *   - serve-dist / dist 直开：dist 即站点根（<root>/vendor/... 可达）；
 *   - 仓库 file:// 预览：dist/index.html + 根级 vendor/（开发布局）。
 * 因此按「文档相对 + 模块相对」生成候选绝对 URL，加载器逐个尝试。
 * wasm 与模型用文档相对路径，在以上三种布局里都落在 vendor 实际所在处。
 */

const BUNDLE_RELPATH = 'vendor/tasks-vision/vision_bundle.mjs';
const WASM_RELPATH = 'vendor/tasks-vision/wasm';
const MODEL_RELPATH = 'vendor/models/hand_landmarker.task';

/** 生成 bundle 的候选绝对 URL（去重、稳定顺序；非法输入产出被跳过）。 */
export function resolveVisionBundleCandidates(documentUrl, moduleUrl) {
  const seen = new Set();
  const candidates = [];
  const push = (value) => {
    if (value && !seen.has(value)) {
      seen.add(value);
      candidates.push(value);
    }
  };
  const safe = (fn) => {
    try {
      push(fn());
    } catch {
      // 无效的 baseURL（如 about: 空白页）只影响该候选，不影响其它候选
    }
  };
  safe(() => new URL(BUNDLE_RELPATH, new URL('.', documentUrl)).href);
  safe(() => new URL(`../${BUNDLE_RELPATH}`, moduleUrl).href);
  safe(() => new URL(`../../${BUNDLE_RELPATH}`, moduleUrl).href);
  return candidates;
}

/** wasm 目录与模型文件的文档相对绝对 URL。 */
export function visionAssetUrls(documentUrl) {
  const docBase = new URL('.', documentUrl);
  const wasmDir = new URL(`${WASM_RELPATH}/`, docBase).href.replace(/\/$/, '');
  const modelPath = new URL(MODEL_RELPATH, docBase).href;
  return { wasmDir, modelPath };
}
