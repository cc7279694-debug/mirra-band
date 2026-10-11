# 当前状态

更新：2026-10-11（Asia/Shanghai）。

## Current Stage / Module

**MODULE_03_DEV_COMPLETE_AWAITING_DEVICE_ACCEPTANCE**。Module 03 — 真实只读伴侣与腕端 UI 产品化的代码、构建与本轮自动化门禁已完成，等待必要真机验收，完整授权见[合同](plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md)。Module 01 独立验收 PASS WITH NOTES；Module 02 真机基础测试已由用户确认通过，原型 UI 不等于正式 UI 验收。

腕端分支 `codex/module-03-readonly-companion` 继承 Module 02 提交 `e450dc1dfb4194dfb755371eddeb740d30cb3700`。手机在隔离工作区 `E:\CODEX\mirra-watch\.local\android-worktree`，分支 `codex/mirra-band-readonly-bridge`，继承实际较新 V1.1 提交 `1338b9a4e41788082f30bf3894a974c2ff652630`；原手机工作区保持原分支和内容。

## Implemented

- 实际官方 Interconnect 1.4 AAR 适配、应用级唯一消息所有者、有限超时/代际隔离；SDK 故障不操作学习业务。
- 严格 v1 只读协议：HELLO / GET_SNAPSHOT、4KiB UTF-8、字段白名单与共享 fixtures，拒绝畸形、重复、乱序、旧流及外来响应。
- 手机一致性快照：活动 Session → 活动 Intent → 当前设备已验证跟随的结束 Session → 主线书籍；失败不伪装 IDLE，维护时排空并退役旧数据库 owner。
- 手机“我的 → 手环伴侣”，默认关闭，主动授权；独立 no-backup 设置，无 Schema、备份格式、学习算法或签名身份变更。
- 正式腕端深色 Mirra Blue、首页单重点、可滚动详情、次级诊断。前台轮询、断连冻结、时钟异常失效、重进重新握手；监测覆盖与新鲜度独立。
- live / demo 分离包名与签名；正式故障不回退模拟，演示每页标记。沿用 Module 02 临时 icon 为视觉遗留，不称为已批准原始 Logo。

## Verified

- 腕端 Node 24.18.1 / aiot-toolkit 2.0.5：30 scripts / 3 pages 检查无错，98/98 测试通过；demo/live RPK 实构建、签名/内容/CRC/篡改检查通过。
- 手机最终 JVM 711/711（80 suites）、lint 0 errors / 20 warnings / 1 hint，APK/test APK 构建通过（3m41s）。编码失败/同步时间/源诊断回归实际 RED 12/3 FAIL → GREEN 12/12；完整 JVM 使用修复后源码。
- 最终源码单次完整未过滤 connected：500 discovered / 491 actual PASS / 9 opt-in assumptions / 0 actual failures/errors/native skipped，14m32s，Gradle 退出 0；所有 500 项唯一。九项条件未满足不算通过。
- 两次完整 connected 失败史保留：首次 500/483 PASS/8 FAIL/9 assumptions，修复专用 AVD 440dpi 宿主不足 411dp；第二次 500/490 PASS/1 FAIL/9 assumptions，修复既有懒加载测试缺少目标行滚动，保留原断言。最终结果来自完整重跑，未拼接定向测试。
- Android API37 AVD 实际设置画面：默认关闭、主动同意、缺小米服务明确报错、关闭后冷启动保持关闭。两次冷启动单次观测 1946/1934ms，非性能基准；三张截图不作为腕端或真机 SDK 证据。
- Room v4 schema Git blob 与基线一致；12 表只读前后完全一致；schema 与 11 fixtures 两端逐字节一致。
- 本机构建 APK/live RPK 公开证书相同；物理手机未核对，三方匹配 Not Run。

## Current Delivery / Evidence

[验证索引](evidence/module-03/README.md)、[产物摘要](evidence/module-03/artifacts.json)、[验证摘要](evidence/module-03/verification.json)、[单一 checkpoint](checkpoints/2026-10-11-module-03-companion.md)。产物清单记录构建对应的实现提交；最终文档提交以真实 Git 为准。

配套 APK `E:\CODEX\mirra-watch\dist\Mirra-1.1.1-band-readonly-debug.apk`；正式 RPK `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.0.rpk`。安装前核对物理手机版本/证书，见[步骤](../README.md#配套安装与验收)。产物/SDK/私钥不进 Git。

## Pending / Not Run

- 用户稍后连接手机。物理已安装版本/证书、国行 9 Pro 官方 SDK 往返/中文与字节预算、手机锁屏后腕端重进真实快照：Not Run。
- 正式腕端六类实际画面、触控/圆角/长文本、息屏/断连/强停、30 分钟延迟与电量：Not Run。Node harness / Android 模拟器不能替代腕端渲染。
- 官方 Windows Vela 模拟器存在 Module 02 已记录的应用加载前启动阻塞，没有用概念图充当运行证据。
- 九个阶段式备份/恢复/数据保留 opt-in 方法在完整 connected 中是 assumptions；本轮多进程安装阶段执行 Not Run。普通备份/恢复与 Reader 维护测试另列。
- 腕端 TypeScript / ESLint：Not Run，授权原生 JS，使用语法/配置/测试/官方编译。手机 OEM / API23–36 / TalkBack / release / Play：Not Run。

## Known Risks / Next Recommended Task

SDK 无公开 dispose/unbind；关闭停止本应用发布/观察并清理自有监听，不能声称释放 SDK 进程级绑定。DISABLED 通知尽力发送，断链时腕端按断连/过期处理。

保留原开发签名身份，不等于生产签名发布设计；lint 比 V1.1 报告多两项既有 serialization 依赖的版本更新与 version catalog 建议，依赖版本未改。腕端工具链开发依赖风险保留 Module 02 记录。

下一步仅为本模块已授权的真机验收：用户连接设备后核对已安装身份，完成配套安装、真实往返、锁屏主场景与正式 UI 验证。不合并 main、不进入 Module 04；无真机证据前不宣布端到端成功。
