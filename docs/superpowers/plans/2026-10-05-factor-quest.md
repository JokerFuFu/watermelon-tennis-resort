# 因数探险家 Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the game engine, and implement the interface in this session. Keep file ownership separate; verify core behavior and browser flows before completion.

**Goal:** 交付可游玩的独立因数游戏，包括顺序闯关、货币奖励、商店、道具与自动保存。

**Architecture:** 纯函数引擎负责数学、答案验证与不可重复结算。React 页面消费状态转换并保存独立存档；主入口按 `/factors` 加载游戏。

**Tech Stack:** 已安装 React 19、TypeScript、Vite、lucide-react、tsx/node:test。

## Global Constraints

- 仅新增 `src/factors/` 与必要的入口、脚本及文档；不改酒店模型。
- 主线严格递增，任意顺序提交完整正因数集合。
- 奖励仅一次，道具购买/使用有余额与目标检查。
- 独立存档，保存成功与刷新回读分别验收。
- 不安装依赖，不提交 Git；目录目前不是 Git 仓库。

## Task 1: 引擎、存档与核心测试

Create `src/factors/engine.ts`, `src/factors/storage.ts`, `src/factors/engine.test.ts`.

- [x] 先写测试：`getFactors(1)=[1]`、`getFactors(36)=[1,2,3,4,6,9,12,18,36]`、第1关填1提交得12金币1钻石，再提交余额不变；用 `./node_modules/.bin/tsx --test src/factors/engine.test.ts` 查看预期失败。
- [x] 实现平方根成对枚举，验证集合完整、无重复与正整数字符串；纯状态转换处理答案、提交、下一关、购买、道具、随机关与回主线。
- [x] 加入存档结构校验及读写错误反馈，独立键 `factor-quest-save-v1`。
- [x] 测试全部边界、商店交易、提示、挑战、双倍、错误存档与序列化恢复，运行同一命令确认通过。

## Task 2: 页面与独立入口

Create `src/factors/FactorGame.tsx`, `src/factors/factor-game.css`; modify `src/main.tsx` and `package.json`.

- [x] 先建立浏览器验收脚本，访问 `/factors` 并断言“因数探险家”与第1关输入框，确认未开发时失败。
- [x] 接入纯引擎，显示余额、关卡轨道、因数空格、奖励、道具背包、商店与营地；所有按钮必须产生实际状态转换或导航。
- [x] 输入框允许键盘与回车提交，使用 `aria-live` 反馈；道具锁定格可读，窄屏纵排与键盘焦点可见。
- [x] 入口只给 `/factors` 挂载独立页面，其余路由沿用原行为。添加 `test:factors`、`test:factors:browser` 脚本。

## Task 3: 验证、文档与交付

Create `docs/factor-quest.md`; update `README.md` with direct entry.

- [x] 运行 `npm run test:factors`、`npm run build`、`npm test`，任何失败定位后再修改。
- [x] 浏览器按1～8逐关填写，错误答案不能通关，正确答案结算一次。
- [x] 实际购买单格提示、配对、随机与双倍，使用道具并确认余额/背包；退出返回和reload后进度、货币、答案保持。
- [x] 检查手机布局与无控制台错误；对酒店和大厅入口做加载回归。
- [x] 独立只读审核需求实现与文档一致性，修复实质问题后展示可玩入口。

## 验收记录（2026-10-05）

- 因数核心测试：32/32，退出码0；含1～100000逐数独立校验。
- 既有项目测试：361/361，退出码0。
- TypeScript及Vite构建：退出码0。
- 浏览器：9个验收组全部通过，无页面运行错误；顺序1～8、四道具、随机进度隔离、退出恢复、两次reload、390px无溢出、启动10秒稳定、酒店与大厅加载。
- 独立审核的提示空格优先问题已修复，补充失败用例后32项全通过，复验通过。
- 真实预览浏览器实际操作第1关、下一关与reload，关卡与余额读回正确。
- 一键启动文件存在且可执行，zsh语法检查退出码0；当前本机服务已运行。
- 浏览器验收原始记录：`test-results/factors-browser.json`；截图：`factors-desktop.png`、`factors-mobile.png`。
