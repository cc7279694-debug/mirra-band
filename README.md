# Mirra Band

观已 Mirra 的独立小米手环 9 Pro 伴侣项目。本地优先、离线可用、无需账号或服务器。

目前交付为 **Module 01：项目记忆与技术核查**。应用代码、RPK、界面截图和目标真机运行仍待下一模块，不能将本仓库的规划视为已运行应用。

## 项目入口

- [PROJECT.md](PROJECT.md)：产品定位、技术与边界。
- [AGENTS.md](AGENTS.md)：协作、Skill 路由、数据安全和 Git 规则。
- [当前状态](docs/CURRENT_STATE.md)：已验证内容、未完成事项和下一模块。
- [产品规格](docs/PRODUCT_SPEC.md)：首版原型状态、界面与验收要求。
- [路线图](docs/ROADMAP.md) / [决策](docs/DECISIONS.md)。
- [Vela 技术与通信核查](docs/research/VELA_FEASIBILITY.md)。
- [Module 01 检查点](docs/checkpoints/2026-10-11-module-01-foundation.md)。

## 开发边界

手环使用 Xiaomi Vela JS 快应用，交付为 `.rpk`。现有 Mirra Android 项目保持独立，真实学习数据仍由手机负责。

使用 HR-Codex Project Memory System：首次初始化选择 Bootstrap；已有可靠记忆选择 Resume；出现冲突选择 Recovery；模块验证后选择 Checkpoint。每个独立模块完成后暂停验收。

构建与安装说明将在实际工具链与 RPK 验证后增加；当前没有可执行的应用构建命令。
