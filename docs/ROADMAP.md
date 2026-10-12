# 模块路线图

| 模块 | 交付 | 状态 |
| --- | --- | --- |
| Module 01 — Foundation | 独立仓库、长期记忆、平台核查与范围 | Accepted；用户报告 ChatGPT PASS WITH NOTES |
| Module 02 — Standalone Prototype | 七状态演示、计时、诊断、实际 RPK | 技术原型真机基础测试通过（用户反馈）；视觉未作为正式产品接受 |
| Module 03 — Read-only Companion + UI | 官方 SDK、只读协议、手机设置/生命周期、配套 APK/RPK | 用户已接受为 Module 04 基线；成功证据与测量限制保留 |
| Module 04 — 学习常用控制 | 5/10 分钟休息、提前结束、真实恢复、已有 Intent 第一动作确认开始 | DEV_COMPLETE_AWAITING_NATURAL_USE；代码/自动化/构建完成，新控制真机与 ChatGPT 独立审查待执行 |
| 05A — 持久化与重进恢复实验 | 独立隔离实验 RPK、双槽与存取边界、真机证明 | DEV_COMPLETE_AWAITING_DEVICE_PROOF；代码/自动化/构建完成，真机前提未验证 |
| 05B — 独立学习闭环 | 第一动作、学习/休息、主动继续、结束保存 | Planned；依赖 05A 真机通过，未授权代码实施 |
| 05C — 离线目录 | 主线自动加入、其他进行中书籍由手机选择 | Planned；未授权代码实施 |
| 05D — 结束后同步 | 持久化 ACK、分片、有界批次、数据库去重 | Planned；未授权代码实施 |
| 05E — 统一历史与统计 | 独立来源记录、迁移/备份、可信区间并集 | Planned；迁移风险需明确授权，未实施 |

用户随后明确授权 05A，继承 Module 04 全部代码与待自然使用范围。05A 内部普通开发连续执行；交付后等待目标手环存储证明，不合并 main，不越过真实用户数据门槛，不安排重复冻结或冗长人工矩阵。
