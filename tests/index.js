/**
 * 测试聚合入口。
 * ------------------------------------------------------------------
 * Node 22 的 `node --test` 位置参数按 glob 处理，`node --test tests/` 这种
 * 目录写法会把目录本身当模块解析（目录 → index.js），所以这里统一 import
 * 全部测试文件，保证 SPEC 要求的 `node --test tests/` 能跑全量用例。
 * 注意：`node --test tests/*.test.js` 会把本入口也跑一遍（用例重复执行），
 * 推荐用 `node --test tests/` 或直接 `node --test`。
 */
import './snake-engine.test.js';
import './gesture-input.test.js';
import './gesture-paths.test.js';
