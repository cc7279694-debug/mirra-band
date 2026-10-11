# Module 02 — Standalone Prototype

日期：2026-10-11。开发交付 checkpoint；真机验收尚未执行。

## Goal / Authorization

用户报告 Module 01 的 ChatGPT 独立结论为 PASS WITH NOTES，并正式授权本模块。分支准确从 `3805f542596c24a7a8c71590971ef78d794a4d54` 创建，继承同一 Mirra Band 仓库。

## Verified Completed

- 实际 Vela 工程、三个页面、七种演示状态、永久测试标识与 Mirra Blue。
- 锚点演示计时、休息归零/重置、准备转模拟专注、长书名降级、返回重进任务清理与新进程初始状态。
- 只读 Interconnect 适配，超时、错误码安全展示、事件所有权与旧回调隔离；无消息发送与真实 Session 控制。
- Node 24.18.1 与局部官方 2.0.5 工具真实 debug/release 构建；独立演示签名、资源配置与完整性检查通过。
- 62 项模型/刷新/诊断/页面脚本/构建交付边界测试；16 个脚本与三个页面的语法/配置检查通过。构建、产物、未执行项和运行记录见 [验证记录](../evidence/module-02/VERIFICATION.md)。

## Changes / Why

新增 `src/`、`tests/`、局部依赖/lockfile、构建与独立产物检查脚本。`ARCHITECTURE` 描述实际原型；PROJECT、AGENTS、SPEC、DECISIONS、CURRENT_STATE、ROADMAP 与 README 同步。

此前 TS 预编译计划按本轮用户明确授权改为原生 JS，保持一份源码，不增加生成同步层。`.ux` 页面与状态、时间和诊断分离；输入与边界可重复验证。没有 SQLite、Migration、Repository、业务文件、备份或手机改动。

实际审查定位并修复：CLI 不读取空 style 的 src，改单块 @import；首页高度预算超屏，调整至 232/240；连接页用三个 text 替换字面换行并扩大详情区。官方 CLI 扫描 SDK 导致复制/EPERM，用隔离应用输入而不是修改依赖解决。

## Inherited Decisions

手机拥有真实学习事实。测试模式不能变成真实 Session；演示签名不得覆盖正式签名。无需服务器/云服务/账号；真实通信与后台可靠性另行验收。产物及秘密不提交 Git；只推功能分支，不合并旧 main，不自动扩展下一模块。

## Known Limitations

国行 9 Pro 固件接受、实际中文/触控/息屏/重进和耗电未验证。模拟器结果独立记录；Node 页面 harness 不等于 Vela 渲染。正式 Mirra 没有连接，也没有要求本模块连通。

开发工具审计存在上游风险（22 个受影响开发依赖节点，生产依赖零）；未自动升级。工作区外生成临时目录清理被自动策略拒绝，保留而不纳入 Git。TypeScript、ESLint、Android Build 为 Not Run，理由见验证记录。

本模块没有 ChatGPT 独立源码验收；本地分工和审查不是其替代。

## Next Step

用户按 README 安装 release RPK，执行产品规格真机清单并验收。收到结果前暂停；只有另行授权才进入正式只读 Companion。
