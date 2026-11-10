# otools-snake 实现规格（贪吃蛇 · 摄像头手势）

OTools 独立插件：贪吃蛇——键盘、触摸滑动 + **摄像头手势控制**。纯静态实现（原生 HTML/CSS/JS ES modules，无 npm/打包器）。

## plugin.json

```json
{
  "uuid": "otools-snake", "packid": "otools-snake",
  "displayName": "Snake", "displayNameCN": "贪吃蛇",
  "developerName": "OTools", "summary": "经典贪吃蛇，键盘、触摸滑动，还可用摄像头手势隔空操控。",
  "version": "0.1.0", "entry": "dist/index.html",
  "devUrl": "http://127.0.0.1:6544", "quickDev": true, "hasAd": false,
  "inPluginPurchase": false, "openInBrowser": false,
  "logo": "logo.svg", "icon": "🐍", "screenshots": [],
  "key": ["贪吃蛇", "手势", "摄像头", "体感", "snake"]
}
```

## 目录与公共约定

- `web/index.html`：入口，**保留模板 OTools 宿主桥脚本**（含 "otools" 字样）。深色主题。
- `web/js/engine/snake.js`：纯逻辑无 DOM（node --test 可 import）。
- `web/js/ui/`、`tests/`（仓库根）：`node --test tests/` 全绿。
- `node scripts/build-web.mjs` → dist/（构建产物按模板惯例 gitignore 不入库，CI 出 artifact）。
- **vendor 已内置（勿改动）**：`vendor/tasks-vision/vision_bundle.mjs`、`vendor/tasks-vision/wasm/{vision_wasm_internal,nosimd}.{js,wasm}`、`vendor/models/hand_landmarker.task`（MediaPipe tasks-vision 0.10.35 + HandLandmarker float16 模型，许可 Apache-2.0，README 注明）。

## 游戏引擎

- 网格默认 20×20（可切 16 / 24）；固定步进（速度三档，或随得分分档提速）。
- 方向指令进**方向队列**（≤2 缓存）：禁止 180° 掉头；同一 tick 只取一个方向；撞墙或撞自身死亡；吃到食物增长 + 得分（食物随机且不落蛇身）；死亡闪红 + 结算面板（得分 / 最高分 localStorage / 重开）。
- 渲染：canvas，圆角蛇身渐进色、食物发光、网格淡纹；开始/暂停/重开按钮；空格暂停。

## 控制模式

1. 键盘：方向键 / WASD。
2. 触摸滑动：swipe 判定方向（阈值 ~24px）。
3. **手势模式（核心卖点）**：
   - 懒加载：开启时才 `await import('../../vendor/tasks-vision/vision_bundle.mjs')`（注意相对路径以 web/ 为基准构建后不变，vendor 与 web 同级拷进 dist）。
   - `FilesetResolver.forVisionTasks('vendor/tasks-vision/wasm')` → `HandLandmarker.createFromOptions({ baseOptions: { modelAssetPath: 'vendor/models/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1 })`；GPU 失败自动退 `CPU`。
   - `getUserMedia({video: {width: 640, height: 480, facingMode: 'user'}})`；`detectForVideo` 逐帧（requestVideoFrameCallback 或 rAF）。
   - **方向**：食指指尖（landmark 8）相对手掌中心（landmark 0 与 9 中点）的归一化矢量，主轴判向，死区 0.08；触发后 220ms 冷却；进方向队列。
   - **暂停**：拇指尖（4）与食指尖（8）距离 < 0.06 持续 ~400ms 切换暂停（防抖）。
   - 左下角画中画：视频镜像 + 指尖十字标记 + 当前识别方向指示；未检测到手时提示「请将手举到摄像头前」。
   - **失败降级**（无摄像头 / 拒绝授权 / wasm 或模型加载失败）：清晰中文原因提示 + 引导，游戏仍可键盘/触摸玩。宿主 webview 里相机权限可能不可用，提示「可在浏览器中打开本插件目录的 dist/index.html 体验手势模式」。
   - 关闭手势模式：停掉相机轨、关闭 landmarker，恢复纯键盘。

## 测试清单（node --test）

1. 方向队列：180° 拒绝、两段合法转向依序生效。
2. 食物不落蛇身；吃食增长与得分；撞墙/撞身/穿行判定。
3. 速度分档边界。摄像头链路无法自动化——README 写明手动验证步骤。
