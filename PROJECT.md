# Mirra Band

## Project / Purpose

观已 Mirra 的独立手环伴侣，服务单个用户的阅读与学习场景。用户抬腕即可看懂当前状态，减少为了确认学习进度反复打开手机的需要。

## Users / Device

- 首个目标设备：国行小米手环 9 Pro。
- 用户已确认 Module 02 在目标手环安装与基础操作通过。Module 03 正式 IDLE 双端同步已有真实画面，用户已确认监测学习时手机锁屏、腕端退出重进可同步；其余状态画面与可靠性验收继续进行。
- 目标分辨率为 336 × 480，官方来源见 [平台核查](docs/research/VELA_FEASIBILITY.md)。

## Product Direction

用户已确认 Standalone V1 采用「结束后同步」：未来独立模式由腕端拥有进行中和未同步记录，手机导入完成记录并统一展示；在线只读/控制继续按手机权威模式隔离。当前仅授权 05A 的隔离持久化实验，详见 [合同](docs/plans/MIRRA_BAND_STANDALONE_V1.md)。实际目标固件存储与恢复通过前，不开发真实腕端学习数据、不修改手机数据库。此方向扩展下述伴侣边界，不改写既有成果。

独立原型已通过用户基础测试。Module 03 的真实 IDLE 往返、用户确认的监测学习锁屏重进，以及首次 NO_DEVICE 自动恢复是 Module 04 的已接受基线。Module 04 只扩展学习常用控制：休息 5/10 分钟、提前结束休息，以及确认手机已有 Intent 的实际第一步后请求监测学习。手机仍拥有所有学习事实。

原型应展示未开始、启动准备、专注、休息、恢复、未监测和断连等情形，并提供手动测试入口。真正的学习状态必须来自手机，不能以手环计时或按钮点击替代真实 Session。

## Tech / Architecture

- 手环：Xiaomi Vela JS Quick App，平台 `.ux` UI，RPK 分发。
- 原型采用原生 JavaScript，独立状态、计时与诊断模块；官方 `aiot-toolkit` 作为局部开发依赖，真实 RPK 构建验证兼容性。
- 手机：继承现有 Kotlin / Jetpack Compose / Room / SQLite / DataStore / App-owned Files，不在本仓库迁移。
- 演示构建：明确“演示数据”的本地模型 → 共用呈现模型 → 手环 UI。
- 正式构建：手机 Room 投影与受控业务准入 → 官方 Xiaomi Interconnect SDK → v1 只读 / v2 短授权控制 → 前台快照/计时 → 手环 UI。自动化证据不替代新增操作的真实设备自然使用。

## Constraints / Non-goals

- Local-first、离线、无登录、无云端必需依赖。
- 两仓库独立。手机控制只复用既有业务接口，默认关闭且不随备份迁移；学习算法、数据库结构、备份格式和签名身份不得改变。
- 不在手环选书、创建 Intent、修改页码、写笔记或结束 Session；不增加提醒、账号、云服务或常驻后台承诺。
- 不为了原型新增 SQLite 或复制手机业务模型。
- Mirra Blue 与现有产品语义优先；小屏界面按抬腕任务组织，不缩小整个手机页面。
- 设备支持、构建产物、实际安装和真实通信分别验收；证书私钥与设备凭据不进入仓库。

当前进度、未运行项与下一步只记录在 [CURRENT_STATE](docs/CURRENT_STATE.md)。
