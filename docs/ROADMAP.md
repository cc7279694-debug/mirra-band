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
| 05B.3 — 业务延迟优化 | 一次确认提交、立即忙碌反馈、轻量计时、可控耗时诊断 | DEV_COMPLETE_AWAITING_DEVICE_NATURAL_USE；0.1.4/607项Node/构建验签，真机流畅度待反馈；不进入05C |
| 05C — 离线目录 | 主线自动加入、其他进行中书籍由手机选择 | Planned；未授权代码实施 |
| 05D — 结束后同步 | 持久化 ACK、分片、有界批次、数据库去重 | Planned；未授权代码实施 |
| 05E — 统一历史与统计 | 独立来源记录、迁移/备份、可信区间并集 | Planned；迁移风险需明确授权，未实施 |

用户已授权05B并提供file必要准入反馈，继承Module03/04全部代码与待自然使用范围。普通开发连续执行，05B新包安装另取当前同意；不合并main、不修改手机数据库、不进入05C–05E或安排重复冻结与冗长人工矩阵。
