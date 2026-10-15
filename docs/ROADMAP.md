# 模块路线图

| 模块 | 交付 | 状态 |
| --- | --- | --- |
| Module 01 — Foundation | 独立仓库、长期记忆、平台核查与范围 | Accepted；用户报告 ChatGPT PASS WITH NOTES |
| Module 02 — Standalone Prototype | 七状态演示、计时、诊断、实际 RPK | 技术原型真机基础测试通过（用户反馈）；视觉未作为正式产品接受 |
| Module 03 — Read-only Companion + UI | 官方 SDK、只读协议、手机设置/生命周期、配套 APK/RPK | 用户已接受为 Module 04 基线；成功证据与测量限制保留 |
| Module 04 — 学习常用控制 | 5/10 分钟休息、提前结束、真实恢复、已有 Intent 第一动作确认开始 | DEV_COMPLETE_AWAITING_NATURAL_USE；代码/自动化/构建完成，新控制真机与 ChatGPT 独立审查待执行 |
| 05A — 持久化与重进恢复实验 | 独立隔离实验 RPK、双槽与存取边界、真机证明 | 选定file路径的损坏/升级/重启保留 USER_REPORTED_PASS；其余测量边界保留 |
| 05B — 独立学习闭环 | 第一动作、学习/休息、主动继续、结束保存 | 隔离开发交付；用户在05B.1合同中报告基本体验正常，USER_REPORTED_PASS，其他测量边界保留 |
| 05B.1 — 腕端UI/UX | 任务首屏、零点击恢复、按需页码、诚实反馈 | Node/构建交付；用户自然验收FAIL，计时与点击回归需05B.2修复 |
| 05B.2 — 真机功能修复与浅色UI | 隔离点击探针、平面原生绑定、诚实诊断、白底Mirra Blue | 交互及0.1.3参考计时重进USER_REPORTED_PASS；保留其他测量限制/LOGO_PENDING |
| 05B.3 — 业务延迟优化 | 一次确认提交、立即忙碌反馈、轻量计时、可控耗时诊断 | DEV_COMPLETE_AWAITING_DEVICE_NATURAL_USE；0.1.4/607项Node/构建验签，真机流畅度仍待明确反馈；用户另已授权05C，不推定性能验收通过 |
| 05C — 离线目录与正式整合 | 正式同身份双模式、主线自动加入、其他进行中书籍由手机选择、完整目录离线使用 | 功能获得用户正常反馈，视觉验收FAIL；不标整体PASS |
| 05C.1 — 正式浅色主题修复 | 六页一致白底深字、蓝按钮白字、灰按钮清楚文字、正式构建可读性保护 | USER_REPORTED_PASS — PASS WITH NOTES；用户确认0.4.1/code10真机视觉正常；其他固件/时间/耐久边界保留 |
| 05D — 结束后同步 | 持久化 ACK、有界分片、不可变记录去重、双份档案、Room5/Full Backup2与旧备份恢复 | DEV_COMPLETE_AWAITING_DEVICE_NATURAL_USE；740 Node/849 JVM/70原生隔离PASS，配套原签名APK/RPK实际构建；正式安装、真实DB升级/恢复和自然使用尚未执行 |
| 05E — Product Baseline V1 | 只读统一历史/单书详情、合法页码推进、参考阅读与合格区间并集；旧有效专注不变 | 产品ACCEPTED/FROZEN；05E-0 ChatGPT架构PASS WITH NOTES，33/33 MODEL_ONLY；05E-1～5未实施，05D必要真机反馈仍待补充 |

用户已授权05D连续设计、隔离编码与自动化，以及后续先备份后自行覆盖配套包的窄设备验收；实际结果待反馈。2026-10-15另授权05E-0设计、代码核查/模型推演/ChatGPT架构审查，冻结方案A。05E实施与高风险Schema/真实数据/设备替换仍需相应授权；不合并main，不安排重复冻结或冗长人工矩阵。
