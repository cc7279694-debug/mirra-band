# Mirra Band 协作规范

## 产品与边界

- 本仓库是观已 Mirra 的独立小米手环伴侣项目，目标设备为国行小米手环 9 Pro。
- 当前产品范围与验收条件见 [产品规格](docs/PRODUCT_SPEC.md)；当前模块见 [当前状态](docs/CURRENT_STATE.md)。
- 手机端已有 Kotlin / Compose / Room 架构。Module 03 已授权在独立手机功能分支新增只读桥、设置与必要生命周期接线；不得修改学习算法、Room Schema、备份格式、签名身份或用户数据。
- Local-first、Offline-ready、No-login-first；无需服务器、云服务、Supabase、Vercel、账号或公共隧道。
- 手环承担快速查看与有限交互；手机仍拥有真实 Intent、Session、监测和学习记录。手环演示计时不生成真实学习事实。

## 事实源与新会话协议

优先级：用户当前明确要求 → 本文件 → PROJECT.md → 真实代码 / Schema / Git → CURRENT_STATE → DECISIONS → 产品规格与研究材料 → ROADMAP → README → Chat。

开始中大型任务先读：

1. 本文件与 [PROJECT.md](PROJECT.md)。
2. [CURRENT_STATE.md](docs/CURRENT_STATE.md)。
3. [DECISIONS.md](docs/DECISIONS.md) 与产品规格相关部分。
4. 相关代码、配置、测试、Git 状态与最近提交。
5. 涉及平台能力时复核官方文档，不能仅凭过去对话继续。

采用 HR-Codex Project Memory System，按实际状态自动选择：

- 缺少可靠项目记忆：`bootstrapping-project-memory`。
- 文档、代码、Git 有实质冲突：`recovering-project-context`。
- 事实源可靠、继续已授权工作：`resuming-project-work`。
- 模块达到经验证的停止点：`checkpointing-project-state`。

最少必要 Skill 组合；使用前阅读对应 SKILL.md。Skill 不得覆盖用户的授权范围和本仓库的模块边界。

## 技术原则

- 手环使用 Xiaomi Vela JS Quick App，UI 为平台 `.ux` 模板、样式与脚本，交付为 RPK。
- React / Capacitor / shadcn 是通用应用默认栈，不强行套到 Vela 设备。手机技术栈继续继承现状。
- Module 02 经用户明确授权采用原生 JavaScript，状态、计时和平台诊断与 `.ux` 页面分开，并用可重复测试与语法检查验证。后续若增加 TypeScript，须有明确收益与独立范围，不为了补齐默认栈增加预编译层。
- 不引入没有当前用途的数据库、Repository、同步字段、依赖或抽象。原型不保存真实业务数据。
- 后续真实业务数据仍以手机 Room / SQLite 为准；任何数据层变更都需独立范围、Migration、完整性与恢复验证。
- 主题等小偏好与核心业务数据分开；不用 localStorage 保存学习事实。
- 先检查官方样例和现有实现，再采用最小方案；第三方代码须核查许可证与适配条件。

## 状态真实性

- 所有模拟数据、时间和状态始终显示“测试模式 / 模拟数据”。
- 模拟切换不可以显示无标识的“手机已连接”，不得发出真实 Session 控制命令。
- 业务状态、监测覆盖、连接状态、数据新鲜度分别建模。断连或未监测不等于专注；休息或恢复不累计有效专注。
- 文档存在 `system.interconnect` 不等于用户设备已验证支持。真实连接须有设备回调与双向测试证据。
- 不把传输发送成功当成手机业务操作成功；后续指令必须由手机确认。
- 不承诺后台常驻、息屏连续通信、振动提醒或耗电表现，除非完成目标真机验证。

## 实施与验收

- 中大型任务先明确 Goal、Scope、Out of Scope、Constraints、Dependencies、Acceptance Criteria、Verification。
- 低风险实现细节自行采用简单、稳定、可维护的方案，不频繁确认文件名、轻微 UI 或普通实现选择。
- 每完成一个独立 Module 后暂停验收；未经用户接受，不自动开始下一模块。
- 必须暂停的其他情况：不可逆 / 生产 / 数据破坏操作，或无法推断且会改变产品方向的关键选择。
- Bug 先复现与定位根因，再最小修复与回归；禁止清库、删除功能或绕过验证隐藏问题。
- 不做无关重构、全项目格式化、依赖升级或架构迁移。
- 测试匹配风险：状态与时间边界、真实/模拟隔离、输入校验、数据完整性、生命周期和核心设备操作优先。
- 完成前检查实际结果、差异、临时文件、秘密、文档和移动/设备适用条件。未执行项写 `Not Run` 及原因。
- 只有能指出实现位置、实际验证和未覆盖范围，才能声称对应能力完成。

## Git 与秘密

- 独立模块用 `codex/` 功能分支，不直接开发 main / master。
- 保存用户未提交工作；不用 reset / checkout 覆盖未知变更，不清理相邻手机项目。
- 本次用户规范允许模块结束后 Conventional Commit 并 push 当前功能分支。
- 提交前检查 diff、状态及敏感信息。私钥、AuthKey、Cookie、Token、密码、Android Keystore、设备原始敏感日志不得进入 Git。
- 演示包使用独立签名；正式包复用手机现有身份。用户已明确同意仅在本机、受保护且 Git 忽略的 `sign/live` 转换现有签名材料，并同意配套安装与必要授权测试；不得更换手机签名、输出或上传私钥。物理设备未连接时不宣称安装和三方指纹匹配成功。
- 不自动创建 PR、合并 main、Force Push、重置远端、删历史或发布生产环境。
- Windows 删除/移动必须使用同一 PowerShell 会话和 LiteralPath，先验证绝对目标；禁止为修 Bug 删除用户数据库或备份。

## 模块完成报告

按七项汇报并暂停：完成功能；新增/修改/删除文件；SQLite / Migration / Repository / File / Backup / Config 变化；实际测试与 Not Run；Known Issue / 风险 / 未处理；Branch / Commit / Push；下一模块。

通知协议：只有全部用户目标与适用验收已完成、无待处理时输出完成标记；存在待验收、需要选择/授权或未解决阻塞时输出阻塞标记。标记仅用于最终回复的独立一行，不用于标题、进度或工具调用内容。
