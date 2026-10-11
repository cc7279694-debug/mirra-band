# 当前状态

更新：2026-10-11（Asia/Shanghai）。

## Current Stage / Module

Module 01 已由用户报告通过 ChatGPT 独立验收：PASS WITH NOTES。Module 02 — Standalone Prototype 的应用、debug/release RPK 与自动化证据已形成开发交付，等待用户真机安装验收。官方 Windows 模拟器在加载应用前启动受阻，没有运行截图。

分支：`codex/module-02-standalone-prototype`。准确继承已验证提交 `3805f542596c24a7a8c71590971ef78d794a4d54`，没有从旧 main 重新开发。

## Verified

- 原生 Vela `.ux` + JavaScript 应用，七种状态、明确测试/模拟标识、Mirra Blue、状态列表与只读连接页。
- 锚点演示计时、休息倒计时归零保持、准备转演示专注、重置、长书名降级；页面隐藏清理任务、返回重算、新进程恢复未开始。
- Interconnect 只读模块加载、连接状态/事件、三秒超时、旧回调隔离、已有回调所有权保护；没有发送消息或真实学习控制。
- 局部 `aiot-toolkit@2.0.5` 与 lockfile；Node 24.18.1 实际构建 debug/release 成功，无全局环境更改。
- 两种实际 RPK 均通过 RSA-SHA256、内容摘要、ZIP CRC32、manifest/资源/公共主题/测试标识检查；负载与签名篡改被拒绝。
- 62 项模型/计时/诊断/实际页面脚本/构建交付边界测试通过。16 个脚本与三个页面的语法/配置检查通过；页面 harness 不是 Vela 渲染证据。
- 演示签名独立，私钥在忽略目录；应用不含开发工具依赖。没有修改手机代码/数据库/APK/正式签名或引入云服务。

## Current Delivery / Evidence

实际大小、SHA-256、公开证书指纹与原始构建输出见 [验证记录](evidence/module-02/VERIFICATION.md)。安装步骤见 [README](../README.md#安装与体验)，当前架构见 [ARCHITECTURE](ARCHITECTURE.md)。

推荐安装：`E:\CODEX\mirra-watch\dist\com.guanyi.mirra.band.demo.release.0.1.0.rpk`。开发诊断备选同目录 debug 包；RPK 不进入 Git。

## Pending / Not Run

- 模拟器：局部 SDK、镜像和 336 × 480 配置准备通过；原生启动受阻，应用加载/截图/触控 Not Run。实际尝试见 [模拟器报告](evidence/module-02/EMULATOR.md)。
- 国行 9 Pro 实际安装、固件/APILevel、中文/触控、息屏/退出/重进、性能和耗电：等待用户设备验收。
- 正式手机 SDK、同身份签名、授权、真实双向消息与学习数据：未实施，后续另行授权。
- TypeScript / ESLint：Not Run；当前为授权 JS，以语法、配置、单元测试与官方编译验证。
- Android Build：Not Run；本轮无手机变更。

## Known Risks / Technical Debt

- 独立演示身份不匹配正式 Mirra，因此原型不会得到真实学习数据。真实传输回调也不等于业务数据已验证。
- 工具链开发依赖审计 22 个受影响节点（3 Critical / 16 High / 3 Low），生产依赖审计零；没有自动升级/回退。不是 RPK 内 22 个运行时漏洞。
- 官方 CLI 全目录扫描局部 SDK 导致复制/EPERM，已用隔离输入修复构建路径；工作区外生成目录清理被自动策略拒绝，保留临时复制文件。
- 模拟器不能证明量产固件兼容；不承诺后台常驻、消息/振动或耗电表现。
- Module 02 尚没有 ChatGPT 独立验收；本地代码审查不能代替该验收。

## Git / Next Recommended Task

模块提交与功能分支 push 的 SHA/远端一致性以真实 Git 与最终交付报告为准；不预写自引用提交哈希。不创建 PR、不合并 main。

下一步仅为用户安装并执行 [真机清单](PRODUCT_SPEC.md#真机检查清单尚未执行)。反馈固件和安装/操作结果后再决定修复或验收；未授权前停止，不自行实施 Module 03。
