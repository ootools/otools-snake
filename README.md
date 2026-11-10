# OTools 插件 · 贪吃蛇（`otools-snake`）

经典贪吃蛇 OTools 独立插件：**键盘、触摸滑动 + 摄像头手势隔空操控**。纯静态实现——
原生 HTML/CSS/JS（ES modules），无 npm / 框架 / 打包器；游戏引擎为纯函数，
`node --test` 可直接测。

![logo](logo.svg)

## 功能

- **经典玩法**：20×20 网格（可切 16 / 24），固定步进随得分三档提速（悠闲 → 轻快 → 疾速）。
- **方向队列**：最多缓存 2 条指令、禁止 180° 掉头、同一 tick 只取一个方向，快速连招不丢指令。
- **计分**：吃食增长 +1 分；食物随机生成且绝不落蛇身；撞墙 / 咬到自己即结束。
- **死亡闪红 + 结算面板**：本局得分 / 最高分（localStorage 持久化）/ 一键重开。
- **canvas 渲染**：圆角蛇身渐进色、蛇头眼睛、食物发光呼吸、淡网格纹；深色主题中文 UI。
- **摄像头手势（核心卖点）**：食指隔空指方向、捏合暂停、左下角画中画预览，
  全部推理在本地完成（不上传任何画面）。

## 三种控制模式

| 模式 | 操作 | 说明 |
| --- | --- | --- |
| 键盘 | 方向键 / WASD 转向，空格暂停，Enter 重开 | 默认可用，与其它模式并存 |
| 触摸 | 在棋盘上滑动（阈值约 24px，可不抬手连续转向） | 移动端 / 触控板友好 |
| 手势 | 食指指向控制方向，捏合拇指与食指暂停/继续 | 需摄像头，点右上「开启手势」 |

### 手势模式说明

- **懒加载**：点「开启手势」才动态 `import` vendor 里的 MediaPipe tasks-vision，
  wasm 推理引擎与 float16 手部关键点模型均为**本地文件**（`vendor/`），无外网请求。
- **方向判定**：食指尖（关键点 8）相对手掌中心（关键点 0 与 9 的中点）的归一化矢量，
  主轴判向，死区 0.08；触发后 220ms 冷却防抖；判定在镜像坐标系里做，
  「手往哪边指，蛇就往哪边走」。
- **暂停**：拇指尖（4）与食指尖（8）距离 < 0.06 持续约 400ms 切换一次暂停（松开重 arm）。
- **画中画**：左下角镜像视频 + 指尖十字标记 + 当前识别方向箭头；未检测到手时提示
  「请将手举到摄像头前」。
- **失败降级**（无摄像头 / 拒绝授权 / wasm 或模型加载失败）：toast 给出清晰中文原因
  与引导，游戏仍可用键盘 / 触摸继续；OTools 宿主 webview 若未开放相机权限，会提示
  「可在浏览器中打开本插件目录的 dist/index.html 体验手势模式」。
- **关闭手势**：再点一次按钮即停掉相机轨并释放识别器，恢复纯键盘。

### 手势模式手动验证步骤

摄像头无法自动化测试，请按以下步骤人工验证（`node scripts/build-web.mjs` 后）：

1. `node scripts/serve-dist.mjs`，用 Chrome/Edge 打开 `http://127.0.0.1:<端口>/`。
2. 点「开启手势」→ 浏览器弹出摄像头授权 → 允许。
3. 左下角出现镜像画中画；把手举到镜头前，状态栏出现「手势识别中…」。
4. 食指向上下左右平移（越过死区）：蛇应即时转向；画中画出现方向箭头与十字标记。
5. 拇指与食指捏合约半秒：游戏暂停，再捏合一次恢复。
6. 手移出画面：状态栏提示「请将手举到摄像头前」。
7. 拒绝授权（或禁用摄像头）再点「开启手势」：应出现中文降级提示，键盘仍可玩。
8. 点「关闭手势」：摄像头灯灭（轨道已停），键盘照常。

## 开发

```bash
node --test tests/            # 跑测试（引擎 + 手势判定纯函数，24 例）
node scripts/build-web.mjs    # 构建：拷 web/ → dist/，并整体拷 vendor/ → dist/vendor/
node scripts/serve-dist.mjs   # 本地预览 dist/
node scripts/pack-plugin.mjs --out dist-pack --version 0.1.0   # 打包 .oplg（可选）
node scripts/verify-plugin.mjs dist-pack                       # 校验包（可选）
```

目录结构：

```
├── plugin.json             # 插件清单（packid otools-snake，entry dist/index.html）
├── logo.svg                # 蛇主题自绘 SVG 图标
├── web/                    # 前端源码（纯静态 ES modules）
│   ├── index.html          # 入口（保留 OTools 宿主桥 window.otoolsPlugin）
│   ├── style.css           # 深色主题样式
│   └── js/
│       ├── engine/
│       │   ├── snake.js         # 游戏引擎（纯函数，无 DOM，node 可测）
│       │   └── gesture-input.js # 手势映射/冷却/捏合闸（纯函数，node 可测）
│       ├── gesture-vision.js    # 摄像头 + MediaPipe 桥（懒加载 vendor）
│       └── ui/                  # 渲染、输入、画中画、存储、主入口
├── tests/                  # node --test（tests/index.js 为聚合入口）
├── scripts/
│   ├── build-web.mjs       # 构建（web 模式额外拷贝 vendor/ → dist/vendor/）
│   └── serve-dist.mjs      # 本地预览（已按 ES 模块要求修正 .mjs MIME）
└── vendor/                 # 手势依赖（本地内置，勿改动）
    ├── tasks-vision/vision_bundle.mjs
    ├── tasks-vision/wasm/vision_wasm_internal{,_nosimd}.{js,wasm}
    └── models/hand_landmarker.task
```

## vendor 与许可声明

`vendor/` 内置 [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe)
v0.10.35（`vision_bundle.mjs` + wasm 推理引擎）与 HandLandmarker **float16**
模型（`hand_landmarker.task`），均来自 Google MediaPipe 项目，遵循
**Apache License 2.0** 许可；本插件整体逻辑部分按仓库许可分发，推理全程本地运行、
不采集不上传任何摄像头画面。

## 宿主桥说明

`web/index.html` 保留模板的 OTools 宿主桥（`window.otoolsPlugin`：宿主包装 API 与
Tauri IPC 双通道自动探测）。贪吃蛇只用 `available()` 判断是否在宿主中（用于手势失败时
给出针对性提示）；最高分存 `localStorage`，无需宿主文件能力。
