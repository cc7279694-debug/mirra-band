# Mirra Band

## Project / Purpose

观已 Mirra 的独立手环伴侣，服务单个用户的阅读与学习场景。用户抬腕即可看懂当前状态，减少为了确认学习进度反复打开手机的需要。

## Users / Device

- 首个目标设备：国行小米手环 9 Pro。
- 用户已确认 Module 02 在目标手环安装与基础操作通过。Module 03 正式 IDLE 双端同步已有真实画面，用户已确认监测学习时手机锁屏、腕端退出重进可同步；其余状态画面与可靠性验收继续进行。
- 目标分辨率为 336 × 480，官方来源见 [平台核查](docs/research/VELA_FEASIBILITY.md)。

## Product Direction

独立原型已通过用户基础测试。Module 03 实现手机真实状态的只读伴侣与深墨色 Mirra Blue UI；以真实目标设备消息往返、手机锁屏时重新打开腕端与画面验收证明可用性。遥控学习与提醒属于后续独立决策。

原型应展示未开始、启动准备、专注、休息、恢复、未监测和断连等情形，并提供手动测试入口。真正的学习状态必须来自手机，不能以手环计时或按钮点击替代真实 Session。

## Tech / Architecture

- 手环：Xiaomi Vela JS Quick App，平台 `.ux` UI，RPK 分发。
- 原型采用原生 JavaScript，独立状态、计时与诊断模块；官方 `aiot-toolkit` 作为局部开发依赖，真实 RPK 构建验证兼容性。
- 手机：继承现有 Kotlin / Jetpack Compose / Room / SQLite / DataStore / App-owned Files，不在本仓库迁移。
- 演示构建：明确“演示数据”的本地模型 → 共用呈现模型 → 手环 UI。
- 正式构建：手机 Room 只读投影 → 官方 Xiaomi Interconnect SDK → 严格协议 v1 → 前台快照/计时 → 手环 UI。实现与自动化证据不替代量产固件链路验收。

## Constraints / Non-goals

- Local-first、离线、无登录、无云端必需依赖。
- 两仓库独立。手机仅增加已授权只读桥、设置与生命周期接线；学习算法、数据库结构、备份格式、签名身份和用户数据不得改变。
- 首版不远程启动/暂停/结束真实 Session，不提供复杂图表、账号、同步系统或常驻后台承诺。
- 不为了原型新增 SQLite 或复制手机业务模型。
- Mirra Blue 与现有产品语义优先；小屏界面按抬腕任务组织，不缩小整个手机页面。
- 设备支持、构建产物、实际安装和真实通信分别验收；证书私钥与设备凭据不进入仓库。

当前进度、未运行项与下一步只记录在 [CURRENT_STATE](docs/CURRENT_STATE.md)。
