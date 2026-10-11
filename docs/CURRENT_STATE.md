# 当前状态

更新：2026-10-11（Asia/Shanghai）。

## Current Stage / Module

**MODULE_03_DEVICE_ACCEPTANCE_BLOCKED**。Module 03 — 用户更新 `0.2.2` 后的真机照片显示 `CHANNEL_UNAVAILABLE`，重试仍无响应；手机重新连接后已实际识别 9 Pro、服务可用且已授权，但没有握手或完整快照。当前错误折叠了原生查询失败码，具体原因未明；`0.2.3` 只修正同次查询诊断，不宣称修好连接。完整授权见[合同](plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md)。Module 01 独立验收 PASS WITH NOTES；Module 02 真机基础测试已由用户确认通过，原型 UI 不等于正式 UI 验收。

腕端分支 `codex/module-03-readonly-companion` 继承 Module 02 提交 `e450dc1dfb4194dfb755371eddeb740d30cb3700`。手机在隔离工作区 `E:\CODEX\mirra-watch\.local\android-worktree`，分支 `codex/mirra-band-readonly-bridge`，继承实际较新 V1.1 提交 `1338b9a4e41788082f30bf3894a974c2ff652630`；原手机工作区保持原分支和内容。

## Implemented

- 实际官方 Interconnect 1.4 AAR 适配、应用级唯一消息所有者、有限超时/代际隔离；SDK 故障不操作学习业务。
- 严格 v1 只读协议：HELLO / GET_SNAPSHOT、4KiB UTF-8、字段白名单与共享 fixtures，拒绝畸形、重复、乱序、旧流及外来响应。
- 手机一致性快照：活动 Session → 活动 Intent → 当前设备已验证跟随的结束 Session → 主线书籍；失败不伪装 IDLE，维护时排空并退役旧数据库 owner。
- 手机“我的 → 手环伴侣”，默认关闭，主动授权；独立 no-backup 设置，无 Schema、备份格式、学习算法或签名身份变更。
- 正式腕端深色 Mirra Blue、首页单重点、可滚动详情、次级诊断。前台轮询、断连冻结、时钟异常失效、重进重新握手；监测覆盖与新鲜度独立。
- live / demo 分离包名与签名；正式故障不回退模拟，演示每页标记。沿用 Module 02 临时 icon 为视觉遗留，不称为已批准原始 Logo。
- `0.2.2` 腕端接口兼容：缺少 `getReadyState` 时选择 `diagnosis`，再无该接口时仅查询一次旧 `getApkStatus`，严格成功值才确认传输状态；保留回调注册时缓存的 `onopen`，原生 send 传 JSON 对象，内部 v1 wire 不变。HELLO_ACK 与完整 SNAPSHOT 仍是业务新鲜度依据，原生状态/发送成功不替代真实快照。

## Verified

- 初版 `0.2.0` 腕端 Node 24.18.1 / aiot-toolkit 2.0.5：30 scripts / 3 pages 检查无错，98/98 测试通过；demo/live RPK 实构建、签名/内容/CRC/篡改检查通过，保留为初版历史。
- `0.2.1` / code 3 初始化诊断增量：fresh check-project 30 scripts / 3 pages / 0 errors，单次未过滤测试 117/117 PASS / 0 fail / 0 skip；正式 RPK 实构建成功，独立 RSA-SHA256、内容/逐文件摘要、签名 metadata、ZIP CRC32 与三项篡改拒绝检查 exit 0。公开证书与手机 APK 及真机已安装 APK 相同；这些结果不证明腕端初始化故障已修复。
- `0.2.2` / code 4 兼容增量：check-project 31 scripts / 3 pages / 0 errors，单次未过滤测试 134/134 PASS / 0 fail / 0 skip；正式 RPK 实构建与独立 inspect 通过，公开证书与手机 APK/真机已安装 APK 一致。随后真机复测失败，实际错误 `CHANNEL_UNAVAILABLE`；本地门禁不等于真实通道通过，旧 98/117 计数保留为历史。
- 手机最终 JVM 711/711（80 suites）、lint 0 errors / 20 warnings / 1 hint，APK/test APK 构建通过（3m41s）。编码失败/同步时间/源诊断回归实际 RED 12/3 FAIL → GREEN 12/12；完整 JVM 使用修复后源码。
- 最终源码单次完整未过滤 connected：500 discovered / 491 actual PASS / 9 opt-in assumptions / 0 actual failures/errors/native skipped，14m32s，Gradle 退出 0；所有 500 项唯一。九项条件未满足不算通过。
- 两次完整 connected 失败史保留：首次 500/483 PASS/8 FAIL/9 assumptions，修复专用 AVD 440dpi 宿主不足 411dp；第二次 500/490 PASS/1 FAIL/9 assumptions，修复既有懒加载测试缺少目标行滚动，保留原断言。最终结果来自完整重跑，未拼接定向测试。
- Android API37 AVD 实际设置画面：默认关闭、主动同意、缺小米服务明确报错、关闭后冷启动保持关闭。两次冷启动单次观测 1946/1934ms，非性能基准；三张截图不作为腕端或真机 SDK 证据。
- Room v4 schema Git blob 与基线一致；12 表只读前后完全一致；schema 与 11 fixtures 两端逐字节一致。
- 两部 Android 16 / API36 真机（OnePlus PKX110、Xiaomi 23127PN0CC）原装 Mirra 均为 `0.2.0` / code 2，公开证书与交付 APK/live RPK 三方匹配；只读首页显示“开始第一次学习 / 添加第一本书”，没有活动学习界面。两部均以 `install -r` 成功覆盖至 `1.1.1-band-readonly` / code 4，未卸载、清数据、降级、重新签名或读取原始数据库。
- 当前 Xiaomi 已安装 APK 实际 SHA-256 与交付一致；数据目录两个 inode 升级前后相同，冷启动 598ms 为单次观察，首页正常。此项是安装与启动检查，不替代数据库内容完整性或锁屏通信验收。
- 手机最新实际设置页显示“设备：小米手环 9 Pro / 小米手机服务：可用 / 设备授权：已授权”，但腕端应用仍等待打开，最近完整同步尚无。用户两张手环真机照片证明正式界面已运行且没有演示标记；连接页确切错误为 `INTERCONNECT_UNAVAILABLE`，没有匹配握手或完整快照。
- 用户更新 `0.2.1` 后的新真机照片实际显示 `INIT_READY_CALL_API_MISSING`，证明新诊断代码已运行：通信实例取得与回调注册已越过，失败点是当前实例的 `getReadyState` 非函数。没有匹配握手或完整快照；不能由此宣称整个平台不支持通信。
- `0.2.2` 后的第四张用户实拍显示 `CHANNEL_UNAVAILABLE`。UTC 14:24 手机实际为 `NO_DEVICE`，小米 XMS 服务仍被 Mirra 成功绑定；用户手机重新连接后 UTC 14:30 与腕端再重试后 14:33 页面均显示设备/服务/授权正常，但握手和完整同步仍无。`NO_DEVICE` 是已解除的历史查询结果，不是当前持续错误；没有证据将腕端失败归因为白名单、签名或固件。
- `0.2.3` / code 5 观测增量：31 scripts / 3 pages / 0 errors，单次未过滤测试 146/146 PASS / 0 fail / 0 skip；定向实际 RED 53/39 PASS/14 FAIL → GREEN 53/53。正式 RPK 实构建 15,633ms / exit 0，独立 RSA/内容/逐文件/metadata/CRC32/三项篡改拒绝通过；仅保留同次回调第二参数白名单数字及接口/固定类型，未改变成功条件或重试策略。

## Current Delivery / Evidence

[验证索引](evidence/module-03/README.md)、[产物摘要](evidence/module-03/artifacts.json)、[验证摘要](evidence/module-03/verification.json)、[单一 checkpoint](checkpoints/2026-10-11-module-03-companion.md)。产物清单记录构建对应的实现提交；最终文档提交以真实 Git 为准。

已验证初版配套 APK `E:\CODEX\mirra-watch\dist\Mirra-1.1.1-band-readonly-debug.apk`；正式 RPK `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.0.rpk`。用户按该包安装后提供正式腕端运行照片；未读取腕端安装文件或版本元数据，`0.2.0` 身份依据用户指定包与实际 UI。安装前核对物理手机版本/证书，见[步骤](../README.md#配套安装与验收)。产物/SDK/私钥不进 Git。

当前验收目标为 Xiaomi 23127PN0CC：已有 `com.mi.health` 3.59.1，XMS 服务可解析，用户确认国行 9 Pro 与其配对且连接。初次 `COUNTERPART_APP_MISSING` 已解除，该历史分类不能定位失败阶段或哪一侧缺包；最新手机服务/设备授权已显示正常。初版腕端 `INTERCONNECT_UNAVAILABLE` 现被 `0.2.1` 真机诊断细化为 `INIT_READY_CALL_API_MISSING`，当前实例缺少函数形式的 `getReadyState`；`0.2.2` 已提供兼容实现，真机恢复通信尚未验证。Xiaomi 拒绝电脑注入触控（`INJECT_EVENTS`），设置与授权采用用户手动操作，不绕过系统安全策略。

历史诊断版 `0.2.1` / code 3：[诊断 RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.1.rpk)，31,968 bytes，SHA-256 `52cc4bdb66736ed9d5fd48069d6f1b33d8f81059a74cc3db57aba77d3f6dba3f`，对应实现提交 `267be9aa69b1e34ac3b98a6629bdbcaa30cdfb22`。用户已更新并提供失败点运行照片；版本依据用户指定包与新代码实际画面，未独立读取腕端安装元数据。

历史同签名兼容版 `0.2.2` / code 4：[RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.2.rpk)，32,194 bytes，SHA-256 `27807efe94915c6ed691bfecfbe809abbc898d76995a3528fd3b5129cd799015`，对应实现提交 `cdfc77cf44aa1f1fcb1d4fc79326e4ab86b50bcc`。本地门禁通过，真机复测仍失败，不能标记待首次复测或已恢复通信。

当前同签名查询诊断版 `0.2.3` / code 5：[RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.3.rpk)，32,305 bytes，SHA-256 `cb17cc6cc156623b44fad7c9fd85908f3d5505ef683762def16871b389269d54`，实现 `b91de61f89f2d25c97dd11bfe39b401e8cc06cfc`。已复制到目标手机 Download，远端 SHA 与本地一致；待用户更新后读取具体原生码。手机源码/APK 未改，未重新安装或重复 Android 门禁。

## Pending / Not Run

- 国行 9 Pro 通道已实际尝试且未通过，最新实拍诊断为 `CHANNEL_UNAVAILABLE`；匹配 HELLO/完整快照、中文与字节预算、手机锁屏后腕端重进真实快照：Not Run。需先取得 `0.2.3` 同次原生查询的接口/数字码再针对实际原因修复。
- 正式腕端六类业务画面、触控/圆角/长文本、息屏/断连/强停、30 分钟延迟与电量：Not Run。已有四张错误状态真机实拍，不能替代这些场景；Node harness / Android 模拟器不能替代腕端渲染。
- 官方 Windows Vela 模拟器存在 Module 02 已记录的应用加载前启动阻塞，没有用概念图充当运行证据。
- 九个阶段式备份/恢复/数据保留 opt-in 方法在完整 connected 中是 assumptions；本轮多进程安装阶段执行 Not Run。普通备份/恢复与 Reader 维护测试另列。
- 腕端 TypeScript / ESLint：Not Run，授权原生 JS，使用语法/配置/测试/官方编译。手机 API23–35 / API36 全面回归 / 多 OEM / TalkBack / release / Play：Not Run；API36 真机目前仅完成上述安装、启动和设置诊断。

## Known Risks / Next Recommended Task

SDK 无公开 dispose/unbind；关闭停止本应用发布/观察并清理自有监听，不能声称释放 SDK 进程级绑定。DISABLED 通知尽力发送，断链时腕端按断连/过期处理。

保留原开发签名身份，不等于生产签名发布设计；lint 比 V1.1 报告多两项既有 serialization 依赖的版本更新与 version catalog 建议，依赖版本未改。腕端工具链开发依赖风险保留 Module 02 记录。

旧 OnePlus 未安装小米运动健康，手环未与其配对。该机老版创建备份出现无效备份提示，用户明确因数据很少跳过备份，本次验收沿用其决定；没有宣称备份成功或已修复该问题。

下一步仅为本模块已授权的真机验收：取得 `0.2.3` 同次查询的具体诊断码，再按实际失败原因修复和验证真实往返，随后验证锁屏主场景与正式 UI。不合并 main、不进入 Module 04；无真机证据前不宣布端到端成功。
