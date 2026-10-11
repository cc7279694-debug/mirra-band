# Mirra Band

## Project / Purpose

观已 Mirra 的独立手环伴侣，服务单个用户的阅读与学习场景。用户抬腕即可看懂当前状态，减少为了确认学习进度反复打开手机的需要。

## Users / Device

- 首个目标设备：国行小米手环 9 Pro。
- 用户已报告可以通过“表盘自定义工具”安装第三方 RPK；这不代表 Mirra Band 已安装或通信已验证。
- 目标分辨率为 336 × 480，官方来源见 [平台核查](docs/research/VELA_FEASIBILITY.md)。

## Product Direction

先形成可以安装、明确标注模拟数据的独立手环原型；真机界面验收后再验证与现有 Mirra Android 的只读通信。遥控学习与提醒属于后续独立决策。

原型应展示未开始、启动准备、专注、休息、恢复、未监测和断连等情形，并提供手动测试入口。真正的学习状态必须来自手机，不能以手环计时或按钮点击替代真实 Session。

## Tech / Architecture

- 手环：Xiaomi Vela JS Quick App，平台 `.ux` UI，RPK 分发。
- 原型采用原生 JavaScript，独立状态、计时与诊断模块；官方 `aiot-toolkit` 作为局部开发依赖，真实 RPK 构建验证兼容性。
- 手机：继承现有 Kotlin / Jetpack Compose / Room / SQLite / DataStore / App-owned Files，不在本仓库迁移。
- 原型：本地模拟状态 → 呈现模型 → 手环 UI；不保存真实学习数据。
- 未来只读通信：手机真实状态 → 经验证的 Interconnect 通道 → 校验后的手环展示。该路径是方向，尚非实现。

## Constraints / Non-goals

- Local-first、离线、无登录、无云端必需依赖。
- 两仓库独立；不改手机数据库、业务逻辑、APK、签名或用户数据。
- 首版不远程启动/暂停/结束真实 Session，不提供复杂图表、账号、同步系统或常驻后台承诺。
- 不为了原型新增 SQLite 或复制手机业务模型。
- Mirra Blue 与现有产品语义优先；小屏界面按抬腕任务组织，不缩小整个手机页面。
- 设备支持、构建产物、实际安装和真实通信分别验收；证书私钥与设备凭据不进入仓库。

当前进度、未运行项与下一步只记录在 [CURRENT_STATE](docs/CURRENT_STATE.md)。
