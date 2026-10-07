# 因数探险家

一个寻找全部正因数的中文数学游戏。顺序闯关、金币钻石奖励、道具商店和随机挑战都在浏览器内完成。

- [直接在线玩](https://factor-quest-fu.cool-book-0149.chatgpt.site)
- [下载 Windows / Mac 通用运行包](https://github.com/JokerFuFu/watermelon-tennis-resort/releases/tag/factor-quest-v1.0.0)

## 直接玩

Windows、macOS、手机均可在现代浏览器中打开在线版，不需要安装 Node.js 或启动服务。进度自动保存在当前浏览器；换电脑、浏览器或网址使用另一份存档。在线版不能自动读取原 localhost 版本的进度。

## 下载后运行

安装 [Node.js 22 或更高版本](https://nodejs.org/)，完整解压运行包：

- Windows：双击 `启动游戏.bat`。
- Mac：双击 `启动游戏.command`。

运行包内已经包含构建后的网页，无需 npm 或安装开发依赖。保持启动窗口运行，关闭服务按 Ctrl+C。默认打开 `http://127.0.0.1:5174/`。

## 从源码运行

以下命令在 Windows PowerShell/CMD 和 Mac 终端相同：

```sh
npm ci
npm run build
npm start -- --open
```

源码目录也提供两种系统的启动文件，自动安装依赖并构建。开发时使用 `npm run dev`。端口被占用可使用 `npm start -- --port 5180 --open`。

## 怎么玩

从第 1 关开始，每关数字就是关卡序号。空格数等于该数字的正因数个数，包含 1 和数字本身，每个因数填一次、顺序不限；全部正确才能进入下一关。主线支持 1～100000。填错不扣钱，可以继续修改。

主线每关奖励 `10 + 2 × 因数数量` 枚金币和 1 颗钻石；每到 10 的倍数关，多获得 2 颗钻石。奖励只领取一次，通关后可以继续，也可以退出到营地。

| 道具 | 价格 | 效果 |
| --- | --- | --- |
| 单格提示 | 10 金币 | 补上一格缺失因数，优先空白格。 |
| 配对提示 | 20 金币 | 补上乘积等于目标数字的一对因数。 |
| 随机挑战券 | 30 金币 | 开启随机数字挑战，保留主线进度。 |
| 双倍金币券 | 3 钻石 | 当前关金币奖励翻倍，不能叠加。 |

道具购买后放入背包，使用才消耗。随机挑战不跳过主线，未完成挑战可继续，不重复消耗券。随机挑战奖励为对应主线金币的 75% 向下取整（至少 8），钻石固定为 1。

## 开发与验证

```sh
npm test
npm run test:server
npm run build
npm run test:browser
npm run package
```

GitHub Actions 在 Windows、macOS、Linux 的 Node.js 22 上验证核心规则、Web 服务、构建与运行包；在线版由 Sites 托管，无需玩家启动服务。

本项目不需要数据库、账号、云端密钥或独立业务后端。Node.js 服务只负责提供静态网页，在线版连这一服务也无需玩家启动。金币和钻石为游戏内虚拟奖励。第三方组件许可见 `THIRD_PARTY_NOTICES.txt`。
