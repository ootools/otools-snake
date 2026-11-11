import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisionBundleCandidates, visionAssetUrls } from '../web/js/engine/gesture-paths.js';

const BUNDLE = 'vendor/tasks-vision/vision_bundle.mjs';

test('宿主布局（entry=dist/index.html，协议根=插件根）解析出 dist/vendor 下的 bundle', () => {
  // 宿主: otools-plugin://localhost/<uuid>/<entry>，文件以插件根为基准返回；
  // 安装包只带 dist/vendor（无根级 vendor），bundle 必须能从文档/模块解析到它。
  const doc = 'otools-plugin://localhost/otools-snake/dist/index.html';
  const module = 'otools-plugin://localhost/otools-snake/dist/js/gesture-vision.js';
  const candidates = resolveVisionBundleCandidates(doc, module);
  assert.ok(
    candidates.includes('otools-plugin://localhost/otools-snake/dist/vendor/tasks-vision/vision_bundle.mjs'),
    `候选列表必须包含 dist/vendor 的绝对 URL，实际: ${JSON.stringify(candidates)}`,
  );
  for (const url of candidates) assert.match(url, /^otools-plugin:\/\/localhost\//, '候选必须是绝对 URL');
});

test('dist 作为协议根的布局（entry 位于根）解析出根级 vendor', () => {
  const doc = 'otools-plugin://localhost/otools-snake/index.html';
  const module = 'otools-plugin://localhost/otools-snake/js/gesture-vision.js';
  const candidates = resolveVisionBundleCandidates(doc, module);
  assert.ok(
    candidates.includes('otools-plugin://localhost/otools-snake/vendor/tasks-vision/vision_bundle.mjs'),
    `dist 作根时必须解析到根级 vendor，实际: ${JSON.stringify(candidates)}`,
  );
});

test('仓库布局（file:// 打开 dist/index.html）同时覆盖根级 vendor 与 dist/vendor', () => {
  const doc = 'file:///Users/demo/snake/dist/index.html';
  const module = 'file:///Users/demo/snake/dist/js/gesture-vision.js';
  const candidates = resolveVisionBundleCandidates(doc, module);
  assert.ok(candidates.includes('file:///Users/demo/snake/vendor/tasks-vision/vision_bundle.mjs'));
  assert.ok(candidates.includes('file:///Users/demo/snake/dist/vendor/tasks-vision/vision_bundle.mjs'));
});

test('候选列表去重且保持稳定顺序', () => {
  const doc = 'otools-plugin://localhost/otools-snake/dist/index.html';
  const module = 'otools-plugin://localhost/otools-snake/dist/js/gesture-vision.js';
  const first = resolveVisionBundleCandidates(doc, module);
  const second = resolveVisionBundleCandidates(doc, module);
  assert.deepEqual(second, first, '同一输入必须得到同一候选序列');
  assert.equal(new Set(first).size, first.length, '候选不得重复');
});

test('wasm 与模型用文档相对路径，三种布局都落在 vendor 实际所在处', () => {
  const cases = [
    ['otools-plugin://localhost/otools-snake/dist/index.html', 'otools-plugin://localhost/otools-snake/dist/vendor/tasks-vision/wasm', 'otools-plugin://localhost/otools-snake/dist/vendor/models/hand_landmarker.task'],
    ['otools-plugin://localhost/otools-snake/index.html', 'otools-plugin://localhost/otools-snake/vendor/tasks-vision/wasm', 'otools-plugin://localhost/otools-snake/vendor/models/hand_landmarker.task'],
    ['file:///Users/demo/snake/dist/index.html', 'file:///Users/demo/snake/dist/vendor/tasks-vision/wasm', 'file:///Users/demo/snake/dist/vendor/models/hand_landmarker.task'],
  ];
  for (const [doc, wasmDir, model] of cases) {
    const urls = visionAssetUrls(doc);
    assert.equal(urls.wasmDir, wasmDir);
    assert.equal(urls.modelPath, model);
  }
});
