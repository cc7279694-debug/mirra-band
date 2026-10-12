# 当前状态

更新：2026-10-12（Asia/Shanghai）；下述 UTC 15:xx 观测发生于 2026-10-11。

## Current Stage / Module

**MODULE_03_DEVICE_ACCEPTANCE_IN_PROGRESS / IDLE_ROUNDTRIP_PASSED_LOCKSCREEN_USER_PASS_OTHER_SCENARIOS_PENDING**。2026-10-12 UTC 01:55 实际手机握手/完整发送与第八张真实腕端同步首页共同证明 IDLE 往返通过，安装查询报告已安装。用户随后明确确认“手机正在监测学习 → 锁屏 → 手环退出重开 → 最新学习状态”完整主场景“包含，锁屏重进正常”，记为 **USER_REPORTED_PASS**；本次没有独立采集对应 Session/锁屏画面/原始消息。此前 TIMEOUT 保留失败历史，首查恢复缺口仍未修复；其他真实状态画面与 30 分钟观察仍待验收，整个模块未通过。完整授权见[合同](plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md)。Module 01 独立验收 PASS WITH NOTES；Module 02 真机基础测试已由用户确认通过，原型 UI 不等于完整正式 UI 验收。

腕端分支 `codex/module-03-readonly-companion` 继承 Module 02 提交 `e450dc1dfb4194dfb755371eddeb740d30cb3700`。手机在隔离工作区 `E:\CODEX\mirra-watch\.local\android-worktree`，分支 `codex/mirra-band-readonly-bridge`，继承实际较新 V1.1 提交 `1338b9a4e41788082f30bf3894a974c2ff652630`；原手机工作区保持原分支和内容。

## Implemented

- 实际官方 Interconnect 1.4 AAR 适配、应用级唯一消息所有者、有限超时/代际隔离；SDK 故障不操作学习业务。
- 严格 v1 只读协议：HELLO / GET_SNAPSHOT、4KiB UTF-8、字段白名单与共享 fixtures，拒绝畸形、重复、乱序、旧流及外来响应。
- 手机一致性快照：活动 Session → 活动 Intent → 当前设备已验证跟随的结束 Session → 主线书籍；失败不伪装 IDLE，维护时排空并退役旧数据库 owner。
- 手机“我的 → 手环伴侣”，默认关闭，主动授权；独立 no-backup 设置，无 Schema、备份格式、学习算法或签名身份变更。
- 正式腕端深色 Mirra Blue、首页单重点、可滚动详情、次级诊断。前台轮询、断连冻结、时钟异常失效、重进重新握手；监测覆盖与新鲜度独立。
- live / demo 分离包名与签名；正式故障不回退模拟，演示每页标记。沿用 Module 02 临时 icon 为视觉遗留，不称为已批准原始 Logo。
- `0.2.2` 腕端接口兼容：缺少 `getReadyState` 时选择 `diagnosis`，再无该接口时仅查询一次旧 `getApkStatus`，严格成功值才确认传输状态；保留回调注册时缓存的 `onopen`，原生 send 传 JSON 对象，内部 v1 wire 不变。HELLO_ACK 与完整 SNAPSHOT 仍是业务新鲜度依据，原生状态/发送成功不替代真实快照。
- `0.2.4` 支持旧官方 CONNECTING 的有界等待，沿用 3 秒期限与实际 `onopen` 回调；没有将其当成功或增加轮询。公开历史接口证据不证明目标固件返回此 token，随后真机仍失败。
- `0.2.5` 连接帮助页始终显示本包版本/code；仅对同步 `getApkStatus` 的有限 ASCII 状态 token 增加可观察性，保留大小写、引号/空格类别，拒绝任意正文/对象/控制字符。未知 token 仍失败，不发出假握手，不回退模拟。
- 手机 `1.1.2` 新增官方 SDK 只读 `isWearAppInstalled` 手动检查，独立 job/generation/state，3 秒期限；页退出只取消诊断，不替换应用级消息 owner。诊断并发 state 更新使用原子 update，查询结果不修改握手或完整同步时间。

## Verified

- 初版 `0.2.0` 腕端 Node 24.18.1 / aiot-toolkit 2.0.5：30 scripts / 3 pages 检查无错，98/98 测试通过；demo/live RPK 实构建、签名/内容/CRC/篡改检查通过，保留为初版历史。
- `0.2.1` / code 3 初始化诊断增量：fresh check-project 30 scripts / 3 pages / 0 errors，单次未过滤测试 117/117 PASS / 0 fail / 0 skip；正式 RPK 实构建成功，独立 RSA-SHA256、内容/逐文件摘要、签名 metadata、ZIP CRC32 与三项篡改拒绝检查 exit 0。公开证书与手机 APK 及真机已安装 APK 相同；这些结果不证明腕端初始化故障已修复。
- `0.2.2` / code 4 兼容增量：check-project 31 scripts / 3 pages / 0 errors，单次未过滤测试 134/134 PASS / 0 fail / 0 skip；正式 RPK 实构建与独立 inspect 通过，公开证书与手机 APK/真机已安装 APK 一致。随后真机复测失败，实际错误 `CHANNEL_UNAVAILABLE`；本地门禁不等于真实通道通过，旧 98/117 计数保留为历史。
- 初版手机 JVM 711/711（80 suites）、lint 0 errors / 20 warnings / 1 hint，APK/test APK 构建通过（3m41s）。编码失败/同步时间/源诊断回归实际 RED 12/3 FAIL → GREEN 12/12；这些计数保留为初版源码历史。
- 初版修复后源码单次完整未过滤 connected：500 discovered / 491 actual PASS / 9 opt-in assumptions / 0 actual failures/errors/native skipped，14m32s，Gradle 退出 0；所有 500 项唯一。九项条件未满足不算通过；`1.1.2` 未重复该设备门禁，不称为新源码 connected 结果。
- 两次完整 connected 失败史保留：首次 500/483 PASS/8 FAIL/9 assumptions，修复专用 AVD 440dpi 宿主不足 411dp；第二次 500/490 PASS/1 FAIL/9 assumptions，修复既有懒加载测试缺少目标行滚动，保留原断言。最终结果来自完整重跑，未拼接定向测试。
- Android API37 AVD 实际设置画面：默认关闭、主动同意、缺小米服务明确报错、关闭后冷启动保持关闭。两次冷启动单次观测 1946/1934ms，非性能基准；三张截图不作为腕端或真机 SDK 证据。
- Room v4 schema Git blob 与基线一致；12 表只读前后完全一致；schema 与 11 fixtures 两端逐字节一致。
- 两部 Android 16 / API36 真机（OnePlus PKX110、Xiaomi 23127PN0CC）原装 Mirra 均为 `0.2.0` / code 2，公开证书与交付 APK/live RPK 三方匹配；只读首页显示“开始第一次学习 / 添加第一本书”，没有活动学习界面。两部均以 `install -r` 成功覆盖至 `1.1.1-band-readonly` / code 4，未卸载、清数据、降级、重新签名或读取原始数据库。
- Xiaomi 首次升级至 code 4 时实际 APK SHA-256 与交付一致；数据目录两个 inode 升级前后相同，冷启动 598ms 为单次观察，首页正常。此项是当次安装与启动检查，不替代数据库内容完整性或锁屏通信验收，也不重复算为 code 5 的 inode/冷启动检查。
- 初次手机设置页曾显示“设备：小米手环 9 Pro / 小米手机服务：可用 / 设备授权：已授权”，但腕端应用仍等待打开，最近完整同步尚无。用户两张初版手环真机照片证明正式界面已运行且没有演示标记；连接页确切错误为 `INTERCONNECT_UNAVAILABLE`，没有匹配握手或完整快照。
- 用户更新 `0.2.1` 后的新真机照片实际显示 `INIT_READY_CALL_API_MISSING`，证明新诊断代码已运行：通信实例取得与回调注册已越过，失败点是当前实例的 `getReadyState` 非函数。没有匹配握手或完整快照；不能由此宣称整个平台不支持通信。
- `0.2.2` 后的第四张用户实拍显示 `CHANNEL_UNAVAILABLE`。UTC 14:24 手机实际为 `NO_DEVICE`，小米 XMS 服务仍被 Mirra 成功绑定；用户手机重新连接后 UTC 14:30 与腕端再重试后 14:33 页面均显示设备/服务/授权正常，但握手和完整同步仍无。`NO_DEVICE` 是已解除的历史查询结果，不是当前持续错误；没有证据将腕端失败归因为白名单、签名或固件。
- `0.2.3` / code 5 观测增量：31 scripts / 3 pages / 0 errors，单次未过滤测试 146/146 PASS / 0 fail / 0 skip；定向实际 RED 53/39 PASS/14 FAIL → GREEN 53/53。正式 RPK 实构建 15,633ms / exit 0，独立 RSA/内容/逐文件/metadata/CRC32/三项篡改拒绝通过；仅保留同次回调第二参数白名单数字及接口/固定类型，未改变成功条件或重试策略。
- `0.2.3` / `0.2.4` 后续两张实拍均为 `APK_STATUS_UNKNOWN_STRING`，不是待首次复测；没有独立提取腕端版本元数据/安装摘要。`0.2.4` / code 6（实现 `2d54d43c8f8514255c198c3d9a42a117c54a21c2`）31 scripts / 3 pages / 0 errors、151/151 PASS、实际构建 70,978ms、独立 inspect 全项通过。CONNECTING 的兼容修补没有解决真机失败。
- `0.2.5` / code 7（实现 `2be4297feb06ad42cea0a5ab1d891594866317bc`）31 scripts / 3 pages / 0 errors、154/154 PASS、实际构建 10,521ms / exit 0、独立 RSA/内容/逐文件/metadata/CRC32/三项篡改拒绝通过。第七张实拍明确显示 `0.2.5 / 7` 与 `APK_RAW_TIMEOUT`，已复测失败；精确 TIMEOUT 是原生返回 token，不是 Mirra 3 秒握手计时器结论。
- 新手机源码（实现 `fcfac1d5e5a40d823598e8894ef649d4d499b215`）全量 JVM 722/722 PASS、80 suites、0 failure/error/skip；lint 0 errors / 20 warnings / 1 hint 与初版相同，单次 `testDebugUnitTest lintDebug assembleDebug` 构建 10m47s / exit 0。本轮未重复 Android connected 或操作其他设备。
- UTC 15:44 安装前实际提取当前 Xiaomi code 4 APK 的公开证书，与新 code 5 APK/正式 0.2.5 RPK 三方匹配，版本递增且 minSdk 兼容，结论 SAFE_TO_INSTALL。用户当前确认“首页空闲”；实际只读画面为设置页，没有独立观察到空闲首页。沿用用户跳过备份与覆盖安装授权，UTC 15:45 `install -r` Success；实际已安装 `1.1.2-band-readonly` / code 5 及 SHA-256 与新交付一致，未卸载、清数据、降级或访问原始数据库。
- UTC 15:09 / 15:39 旧 APK 页面曾为 NO_DEVICE；15:41 用户手动重连后设备/服务/授权正常，仍无握手/完整同步。新 APK 安装后因 NotificationShade 焦点拒绝抓取页面，随后 ADB 设备列表为空；新只读安装检查结果与当前手机连接状态仍未知。
- 上一条是 2026-10-11 的历史观察。2026-10-12 UTC 01:53:46 NO_DEVICE 与 01:55:03 手动重新连接+检查腕端应用后的恢复为同 PID 32135，排除本次恢复依赖进程重启。实际手机页显示 9 Pro、服务可用、已授权、只读握手完成、最近完整同步 09:54:44、腕端“小米服务报告已安装”。lastSnapshotAt 仅证明手机合法完整快照发送，不独立代表腕端收到。
- 第八张用户实拍实际 Home 显示“等待开始 / 已同步·13秒前 / 请在手机开始 / 手环会同步当前阅读 / 详情”，无 demo 标记；与同次手机握手/完整发送共同证明真实 IDLE 接收通过。前七张失败保留历史，0.2.5 初次 TIMEOUT 不再写作当前持续故障；手动重连与安装检查共同执行，尚未隔离恢复机制。
- 用户先反馈“刚刚我测试了，没问题”，再明确确认完整主场景包含“手机正在监测学习 → 锁屏 → 手环退出重开 → 最新学习状态”，回答“包含，锁屏重进正常”：实际用户执行记为 USER_REPORTED_PASS，不再标为待首次执行。没有独立采集本次 active Session、锁屏截图或原始消息。UTC 02:02:43 实际手机已回首页、未观察到正在 Session / focus service，这是测试后观察，不能据此推断此前学习没有进行，也不拿它代替主场景证据。

## Current Delivery / Evidence

[验证索引](evidence/module-03/README.md)、[产物摘要](evidence/module-03/artifacts.json)、[验证摘要](evidence/module-03/verification.json)、[单一 checkpoint](checkpoints/2026-10-11-module-03-companion.md)。产物清单记录构建对应的实现提交；最终文档提交以真实 Git 为准。

当前配套 APK [Mirra-1.1.2-band-readonly-debug.apk](E:/CODEX/mirra-watch/dist/Mirra-1.1.2-band-readonly-debug.apk)：16,852,477 bytes，SHA-256 `6872cda1e755b8810244c6af763abc5126de983b2b5c3511e486e4d002f4cf9f`，code 5。当前正式 [RPK 0.2.5](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.5.rpk)：32,549 bytes，SHA-256 `1f7dad9c611e2b3b39e3803226626d7d7667f1cd3f878429b134cee4fe046566`，code 7。两端公开证书沿用 `29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9`。手机实际安装版本/摘要已核对；RPK 已复制目标 Download 并核对远端摘要，用户照片证明可见 0.2.5/7 诊断画面，不证明腕端安装文件摘要。见[步骤](../README.md#配套安装与验收)。产物/SDK/私钥不进 Git。

当前验收目标仅为 Xiaomi 23127PN0CC / serial `3b02c005`：已有 `com.mi.health` 3.59.1，用户确认国行 9 Pro 与其配对且连接。USB 已恢复，同次设备/服务/授权、安装检查、真实 IDLE 往返已取得证据，不操作其他 Android 设备。旧 getReadyState 非函数失败点已确认并有兼容实现；历史原生 TIMEOUT 后恢复的触发原因尚未隔离，首查恢复缺口尚未修复。Xiaomi 拒绝电脑注入触控（INJECT_EVENTS），设置与授权采用用户手动操作，不绕过系统安全策略。

历史诊断版 `0.2.1` / code 3：[诊断 RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.1.rpk)，31,968 bytes，SHA-256 `52cc4bdb66736ed9d5fd48069d6f1b33d8f81059a74cc3db57aba77d3f6dba3f`，对应实现提交 `267be9aa69b1e34ac3b98a6629bdbcaa30cdfb22`。用户已更新并提供失败点运行照片；版本依据用户指定包与新代码实际画面，未独立读取腕端安装元数据。

历史同签名兼容版 `0.2.2` / code 4：[RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.2.rpk)，32,194 bytes，SHA-256 `27807efe94915c6ed691bfecfbe809abbc898d76995a3528fd3b5129cd799015`，对应实现提交 `cdfc77cf44aa1f1fcb1d4fc79326e4ab86b50bcc`。本地门禁通过，真机复测仍失败，不能标记待首次复测或已恢复通信。

历史同签名查询诊断版 `0.2.3` / code 5：[RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.3.rpk)，32,305 bytes，SHA-256 `cb17cc6cc156623b44fad7c9fd85908f3d5505ef683762def16871b389269d54`，实现 `b91de61f89f2d25c97dd11bfe39b401e8cc06cfc`。当次手机源码/APK 未改；后续用户实拍为 APK_STATUS_UNKNOWN_STRING，不能继续标为待首次复测。

## Pending / Not Run

- 国行 9 Pro 一次真实 IDLE 的握手、完整快照发送与腕端接收已通过，官方安装检查实际报告已安装。真实监测学习锁屏后腕端重进最新状态为 USER_REPORTED_PASS，独立配套 Session/画面/消息采集尚缺；至少三次随机请求、中文与多级字节预算仍 Not Run。
- 正式腕端六类业务画面、触控/圆角/长文本、息屏/断连/强停、30 分钟延迟与电量：Not Run。已有七张错误状态实拍及第八张真实 IDLE 首页，不能替代这些场景；Node harness / Android 模拟器不能替代腕端渲染。
- 官方 Windows Vela 模拟器存在 Module 02 已记录的应用加载前启动阻塞，没有用概念图充当运行证据。
- 九个阶段式备份/恢复/数据保留 opt-in 方法在完整 connected 中是 assumptions；本轮多进程安装阶段执行 Not Run。普通备份/恢复与 Reader 维护测试另列。
- 腕端 TypeScript / ESLint：Not Run，授权原生 JS，使用语法/配置/测试/官方编译。手机 API23–35 / API36 全面回归 / 多 OEM / TalkBack / release / Play：Not Run；API36 真机目前仅完成上述安装、启动和设置诊断。

## Known Risks / Next Recommended Task

SDK 无公开 dispose/unbind；关闭停止本应用发布/观察并清理自有监听，不能声称释放 SDK 进程级绑定。DISABLED 通知尽力发送，断链时腕端按断连/过期处理。

手机首查恢复缺口已从代码确认：数据源绑定时自动查询一次，NO_DEVICE 后移除服务 observer，进入设置或回到前台不自动重查；UI 的“服务尚不可用”在任意连接失败时统一置 false，不证明 AIDL 未绑定。早期“尚未选择”可能来自新进程的解释仅属旧推断；本次 01:53:46→01:55:03 同 PID 32135 空节点→手动恢复排除了该解释。手动重连+安装检查未隔离，不能声称安装检查单独修复 TIMEOUT，或首查恢复缺口已经修复；不据此增加无证据的成功别名或随机重连。

保留原开发签名身份，不等于生产签名发布设计；lint 比 V1.1 报告多两项既有 serialization 依赖的版本更新与 version catalog 建议，依赖版本未改。腕端工具链开发依赖风险保留 Module 02 记录。

旧 OnePlus 未安装小米运动健康，手环未与其配对。该机老版创建备份出现无效备份提示，用户明确因数据很少跳过备份，本次验收沿用其决定；没有宣称备份成功或已修复该问题。

下一步仅为本模块已授权的继续验收：补齐其他业务状态、断连/关闭、六类正式画面与 30 分钟观察，并保留锁屏主场景为 USER_REPORTED_PASS 的证据边界。单次 IDLE 和用户主场景确认不等于全部端到端验收，安装查询不证明签名/腕端版本/消息握手；不合并 main、不进入 Module 04。
