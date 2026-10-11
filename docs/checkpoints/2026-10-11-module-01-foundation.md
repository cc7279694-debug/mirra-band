# Module 01 — 项目基础与技术核查

日期：2026-10-11。状态：基础交付与文档检查完成，待用户验收；不代表整个 Mirra Band 应用已完成。

## Goal / Scope

把用户指定的独立 GitHub 仓库变成可继续维护的手环项目：恢复需求、核实平台与工具条件、建立最小长期记忆并给出下个模块的可验证合同。

本模块只变更本仓库文档和 Git 忽略规则；不安装依赖、编写产品、修改手机、操作真机或生成 RPK。

## Acceptance Criteria

1. 正确连接用户仓库，保留 main 初始历史，使用独立功能分支。
2. PROJECT / AGENTS / CURRENT_STATE / ROADMAP / DECISIONS 各有明确职责，事实与未知分开。
3. 官方尺寸、Vela 格式、构建路径、通信身份和平台限制有来源；社区材料不当作设备验证。
4. 独立原型范围、状态真实性、工具条件、开发与真机验收均明确。
5. 文档链接、差异与秘密检查通过；Conventional Commit 并只 push 功能分支。

## Changes / Inherited Decisions

- HR-Codex 路由为 Bootstrap → 本模块验证后的 Checkpoint；下次事实源可靠时 Resume。
- 继承用户 Local-first / Offline / No-login、最小实现、模块暂停验收与秘密保护要求。
- 手机拥有真实学习事实；原型永久标记模拟来源。
- `.ux` / RPK 是设备路径，不改手机 Kotlin / Compose / Room，不引入云端。
- 演示身份和正式通信身份分离；不导出或更换手机正式签名。

## Known Limitations

产品代码、RPK、模拟器运行、手环安装/触控/中文、真实通信和后台能力均 Not Run。Node 与系统工具版本已查询，但 Vela 兼容性未验证。手机现有未提交工作只读保留。

## Verification

- 9 份 Markdown / 18 个本地链接：缺失 0。
- 10 个拟提交文件的秘密模式检查与人工内容审阅：未发现凭据；7 类代表路径忽略检查通过。
- `git diff --check`：通过；最终提交与远端 SHA 由交付报告记录，真实 Git 是权威，不把本文件自身 SHA 预写入正文。
- 独立文档审阅发现 1 项诊断原因证据不足及 1 项事实/计划措辞混用，已修正；不是 ChatGPT 独立源码审阅。
- 工具版本命令、npm 元数据查询、仓库克隆及来源/许可证读取已实际执行。
- TypeScript、ESLint、产品 Unit Test、RPK Build、模拟器、Android Build、手环真机：Not Run；本模块没有应用工程，不将文档检查冒充产品测试。

## Next Step

用户验收 Module 01 后，仅执行独立原型 Module 02；不得直接进入手机 SDK、真实 Session 控制或发布。
