# Module 03 验证与交付索引

日期：2026-10-11。**MODULE_03_DEVICE_ACCEPTANCE_BLOCKED**；`0.2.2` 用户实拍显示 `CHANNEL_UNAVAILABLE`，手机重新查询后设备/服务/授权正常但仍无握手或快照。`0.2.3` 同次查询诊断包已实际构建并验签，待用户更新取得具体原生码；诊断修正不证明连接恢复，仅 Module 03。

## 实现与身份

边界见[合同](../../plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md)，继承规则见[单一 checkpoint](../../checkpoints/2026-10-11-module-03-companion.md)。

| 仓库 | 工作分支 | 实际基线 |
| --- | --- | --- |
| Mirra Band | `codex/module-03-readonly-companion` | `e450dc1dfb4194dfb755371eddeb740d30cb3700` |
| Android Mirra | `codex/mirra-band-readonly-bridge` | `1338b9a4e41788082f30bf3894a974c2ff652630` |

手机隔离工作区 `E:\CODEX\mirra-watch\.local\android-worktree`；原工作区 `C:\Users\CDD\Documents\ChatGPT\Mirra` 未切分支/改文件。构建对应的两端实现 SHA 记录在产物清单，最终交付文档另有提交，不能用基线 SHA 冒充实现。

[artifacts.json](artifacts.json) 从实际文件和公开签名生成，包含绝对路径、大小、SHA-256、版本、证书、SDK 和协议摘要。APK 保持 `1.1.1-band-readonly` / code 4；当前 live 查询诊断 RPK `0.2.3` / code 5 / `com.guanyi.mirra`；初版、`0.2.1`、`0.2.2` 与独立 demo 保留溯源。安装步骤见[README](../../../README.md#配套安装与验收)。

初版 live `0.2.0` 与 demo 构建对应代码提交：Band `88bd77b1582f268b2dda3785fd8b46dc2b2e8fec`；Phone `e00be0a5d59f9dad892b8c26128c8c3d17149f70`。live `0.2.1` 诊断包对应 Band 实现提交 `267be9aa69b1e34ac3b98a6629bdbcaa30cdfb22`，当前 live `0.2.2` 兼容包对应 `cdfc77cf44aa1f1fcb1d4fc79326e4ab86b50bcc`。下表保留历史交付，本地文件位于 `E:\CODEX\mirra-watch\dist`。

| 本地文件名 | 字节 | SHA-256 |
| --- | ---: | --- |
| `com.guanyi.mirra.release.0.2.0.rpk` | 31,723 | `36dde0476f55621ca5a162c9dd2efdd1876f36007ce7c8ccdc99b2b5604081bd` |
| `com.guanyi.mirra.release.0.2.1.rpk` | 31,968 | `52cc4bdb66736ed9d5fd48069d6f1b33d8f81059a74cc3db57aba77d3f6dba3f` |
| `com.guanyi.mirra.band.demo.release.0.2.0.rpk` | 35,574 | `cdcaf03deac3e51496f9e154d119afc285c807ae3e662f7de3df548a8360aee3` |
| `Mirra-1.1.1-band-readonly-debug.apk` | 17,094,969 | `5a61f4bc4272b565de1181f3d16ee7b905f41e6482971560558a6cc2178a4437` |

历史同签名兼容版 `0.2.2` / code 4：[RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.2.rpk)，32,194 bytes，SHA-256 `27807efe94915c6ed691bfecfbe809abbc898d76995a3528fd3b5129cd799015`。替代查询、缓存 `onopen` 和 native JSON 对象发送通过本地门禁，随后真机仍 `CHANNEL_UNAVAILABLE`，不是待首次复测或通信通过。

当前同签名查询诊断版 `0.2.3` / code 5：[RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.3.rpk)，32,305 bytes，SHA-256 `cb17cc6cc156623b44fad7c9fd85908f3d5505ef683762def16871b389269d54`，实现提交 `b91de61f89f2d25c97dd11bfe39b401e8cc06cfc`。仅保留同次原生查询 fail 第二参数的数字白名单，以及接口/固定未知类型；不读取正文，不增加查询、不改成功条件或重试。已复制至目标手机 Download，远端摘要一致，待用户更新取得实际数字码。HELLO_ACK 与完整 SNAPSHOT 仍是业务新鲜度依据，手机 APK 未改。

本机构建 APK/live RPK 公开证书 SHA-256 相同：`29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9`。基线本地 V1.1 APK 及两部物理手机原有 `0.2.0` / code 2 APK 均匹配，三方公开证书匹配已实际验证。APK 保留原 debug 身份，RPK 为官方 CLI release，不称为生产签名发布。

用户授权转换仅在本机、Git 忽略且当前用户 ACL 保护的 `sign/live`，构建暂存同样保护；没有私钥/密码/SDK 二进制提交。

## 实际门禁与历史

`0.2.3` fresh 检查 31 scripts / 3 pages / 0 errors，单次未过滤测试 146/146 PASS / 0 fail/cancel/skip/todo；实际定向 RED 53/39 PASS/14 FAIL → GREEN 53/53。构建 15,633ms / exit 0；独立 RSA-SHA256、内容/逐文件 SHA、签名 metadata、CRC32 与三项篡改拒绝通过。公开证书与配套 APK 相同。原始日志实际保存于 Git 忽略目录，摘要和边界记录在 [verification.json](verification.json) 的 `queryDiagnostic023`；本地通过不替代真机连接。

`0.2.2` 兼容增量执行 fresh check-project：31 scripts / 3 pages / 0 errors；单次未过滤测试 134/134 PASS / 0 fail / 0 skip，正式 RPK 实构建与独立 inspect 成功。公开证书仍为 `29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9`，与手机 APK/真机已安装 APK 一致；没有更新后真机握手、完整同步或锁屏证据。

`0.2.1` 诊断增量另行执行 fresh check-project：30 scripts / 3 pages / 0 errors；单次未过滤测试 117/117 PASS / 0 fail / 0 skip，正式 RPK 实构建成功。独立 inspect exit 0，RSA-SHA256、内容/逐文件 SHA-256、签名 metadata、ZIP CRC32 和三项内存篡改拒绝通过；公开证书 `29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9` 与 APK 及真机已安装 APK 一致。更新后真机实际结果为 `INIT_READY_CALL_API_MISSING`，不是通信通过。

以下保留初版的实际门禁与失败历史；98/98 为初版值，117/117 为 `0.2.1` 诊断版历史，本次 `0.2.2` 使用上面的 134/134 结果。

| 门禁 | 实际结果 | 边界 |
| --- | --- | --- |
| 腕端检查 | 30 scripts / 3 pages / 0 errors | 原生 JS 语法/配置，非 TS 或渲染 |
| 腕端测试 | 98/98 PASS | Node runner / 页面 harness，非手环运行 |
| demo + live RPK | 串行构建成功 | Node 24.18.1 / npm 11.16.0 / aiot-toolkit 2.0.5，无全局修改 |
| RPK 验证 | RSA-SHA256、内容/逐文件摘要、CRC、metadata、篡改拒绝通过 | live 无 States 入口/资源；非真机安装 |
| 手机 JVM | 711/711 PASS，80 suites / 0 fail/error/skip | 修复后源码全量，无 class filter |
| 手机 lint | 0 errors / 20 warnings / 1 hint | 比 V1.1 报告多两项既有 serialization 依赖的版本更新/version catalog 建议，版本未改 |
| APK/test APK | 实构建通过 | min23 / target37 / code4，APK v1/v2 签名验证通过 |
| 未过滤 connected | 500 discovered / 491 actual PASS / 9 assumptions / 0 actual fail/error/native skipped；14m32s，退出 0 | 所有 500 项唯一，单次完整执行；专用 API37 AVD，非小米 SDK 真机 |
| Room Reader 定向 | 5/5 PASS | 十二表前后完全一致；畸形输入/维护退役/PENDING/新准备优先 |
| 跨端协议镜像 | 12 份逐字节一致 | schema + 11 fixtures；Android assets 同样 11 份 |

首次完整 connected 用时 14m36s：500 discovered / 483 actual PASS / 8 actual FAIL / 9 assumptions / 0 errors。8 项均为四个页面的正常/双倍字体 411dp 容器断言：新专用模拟器 1080px@440dpi 宿主仅 392.727dp。产品和测试不改；仅该 AVD 改为 420dpi（411.429dp）后完整重跑。失败 XML/HTML/protobuf/日志保留于 `.local/module03-evidence/connected-attempt-1-density440`，不删除失败历史。

第二次完整 connected 用时 15m41s：500 discovered / 490 actual PASS / 1 actual FAIL / 9 assumptions / 0 errors。宽度失败已消除，剩余 TrendsUiTest 仅滚到前一个 LazyColumn item 就读取下一行，目标尚未组合。新增一行明确滚动到 `trend-stable-unconfirmed`，保留“6 次”原断言，不改产品布局或业务。记录保留 `.local/module03-evidence/connected-attempt-2-lazy-row`；最终修复后源码完整未过滤回归用时 14m32s，通过 491 项，另 9 项 assumptions，0 个真实失败，Gradle 退出 0。

最终审查修复了手机快照编码失败误更新同步与跟随记录、第二次采时引起显示不一致、源错误未显示诊断：实际 targeted RED 12 tests / 3 FAIL → GREEN 12/12，再执行新源码 711/711 全量 JVM。只在合法完整 SNAPSHOT 编码及发送后登记同步，复核代际/源/启用状态并使用同次 observedAt；错误保留上次确认时间且显示原因，恢复成功清除错误。腕端迟到发送失败另实际 RED 7/3 FAIL → GREEN 7/7；发送 generation 与 settled 保护新响应，原生 success 不刷新业务新鲜度，最终全量 98/98。

九项 assumptions 均为显式 opt-in 阶段：InstalledBackupJourney (1)、InstalledRestoreBootstrap (2)、RestoreCrashProcess (2)、ModuleThreeDCloseoutCrash (2)、ModuleThreeDDataPreservation (2)。不算 PASS，本轮专门阶段安装/跨进程执行 Not Run。普通备份/恢复/导出/数据完整性与 Reader 维护测试按完整门禁实际结果报告，不拼接定向结果抬高总数。

本轮回归覆盖协议畸形/Unicode/4KiB、重复/旧流、ACK/请求所有权、只读事务、维护代际、默认关闭、SDK 权限/服务错误、关闭清理、计时/过期/重进。曾实际 RED 后修复腕端终止状态被原生关闭/迟到包覆盖、ACTIVE 无合法计时误显示零、手机新准备被旧结束遮挡、服务恢复窗口丢事件。原始日志保留 Git 忽略 `.local`，[verification.json](verification.json) 记录脱敏结果、失败历史、原始日志/报告 SHA 与实际 AVD 截图索引，无业务负载。

## SDK、数据与生命周期

[小米官方文档](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)及[官方 SDK/demo 附件](https://cdn.cnbj3-fusion.fds.api.mi-img.com/quickapp-vela/interconnect_dev_test_demo.zip)为实际来源。附件 SHA `8e3d74eebda558e2bef45e32f0965c5b77ef939a06cdc55136929f9427a95ca7`；AAR 1.4 / 102,453 bytes / SHA `9c40fd1c5409bb948523d503af71e2978ae522c35636afe7d64f474c0f6bc195`。实际 API 编译通过，没有 stub；无明确再分发许可，脚本固定摘要下载、本地忽略二进制。

仅使用 DEVICE_MANAGER 消息；不主动调用通知/健康/定位/麦克风接口。SDK 首次授权可能包含通知能力，设置页已说明。无新增应用 permissions/FGS；仅服务发现 queries。SDK 无公开 dispose/unbind/cancel，关闭只停止本应用发布/观察和清理自有监听，不承诺释放进程级绑定。晚到任务代际隔离；清理不确定时隔离并提示学习结束后重启。

短只读事务在维护门禁内，SDK 等待在锁外；旧源取消/排空/退役，新源重新握手。设置在 noBackupFilesDir AtomicFile，默认关闭，不进 Room/备份。Room v4 schema Git blob 与基线相同；不修改学习/监测/Closeout 算法、Schema/Migration、Full Backup v1/JSON/CSV 格式、用户数据或签名身份，无云服务。

## 实际画面与 Not Run

### 物理手机安装与连接诊断

| 设备 | 实际结果 | 验证边界 |
| --- | --- | --- |
| OnePlus PKX110 / Android 16 / API36 | 原有 `0.2.0` / code 2 签名三方匹配；`install -r` Success 后为 `1.1.1-band-readonly` / code 4，启动与首页正常 | 未安装小米运动健康，用户确认手环未配对此机，未验无线链路 |
| Xiaomi 23127PN0CC / Android 16 / API36 | 原有 `0.2.0` / code 2 签名三方匹配；`install -r` Success 后为 `1.1.1-band-readonly` / code 4；实际已安装 APK SHA-256 与交付 `5a61f4bc4272b565de1181f3d16ee7b905f41e6482971560558a6cc2178a4437` 一致，两个数据目录 inode 升级前后相同，冷启动 598ms | 单次启动观察，非性能基准；inode 相同不替代数据库内容完整性验证 |

两机升级前首页实际显示“开始第一次学习 / 添加第一本书”，没有活动学习界面；核查未读取原始用户数据库。旧 OnePlus 老版创建备份出现无效备份提示，用户明确少数据时跳过备份，本次沿用决定；没有备份成功或备份修复声明。安装未卸载、清数据、降级、重新签名或改 Room 数据库。

当前目标 Xiaomi 已有 `com.mi.health` 3.59.1，XMS 服务可解析；用户确认国行 9 Pro 已配对且连接。初次启用曾出现 `COUNTERPART_APP_MISSING`，该历史分类不能定位失败阶段或哪一侧缺包，现已解除。最新实际手机界面显示“设备：小米手环 9 Pro / 小米手机服务：可用 / 设备授权：已授权”，腕端应用仍等待打开 Mirra Band，最近完整同步尚无；服务/授权成功不等于只读握手或快照成功。

初版正式 RPK 已从既有 dist 复制到手机 Download 并核对 SHA-256，用户随后手动安装并提供两张手环实拍：正式 UI 已运行、无演示标记，Connection 页确切错误为 `INTERCONNECT_UNAVAILABLE`。未读取腕端文件或版本安装元数据，`0.2.0` 身份依据用户指定包与实际 UI，不声称独立核对腕端文件摘要。照片留本地 `.local/module03-evidence/xiaomi-device-20261011/wrist-live-unsupported-user-photo.jpg` 与 `wrist-interconnect-unavailable-user-photo.jpg`，不复制入 Git。

用户随后确认更新 `0.2.1`，第三张新真机实拍实际显示 `INIT_READY_CALL_API_MISSING`，证明新初始化诊断代码已运行。按对应实现的阶段分支，实例取得和回调注册已经越过，当前通信实例的 `getReadyState` 不是函数；这是已定位的失败点，不证明整个平台不支持通信，也不证明消息通道已可用。没有匹配握手或完整快照；新照片同样由本地忽略证据目录保存，版本仍未独立读取腕端安装元数据。

`0.2.2` 更新后的第四张实拍显示 **CHANNEL_UNAVAILABLE**。UTC 14:24 伴侣页实际为 NO_DEVICE，而 XMS 服务仍成功绑定 Mirra；用户手机重新连接后 UTC 14:30、再腕端重试后 UTC 14:33 均显示 9 Pro / 服务可用 / 已授权，仍等待握手且完整同步尚无，用户反馈腕端没反应。NO_DEVICE 是已解除的历史结果。当前适配器将原生 fail 数字码及未知 success 值折叠，尚不能归因于固件、签名、白名单或权限。四张实拍、三个同次 UI 观测及脱敏服务绑定报告的真实文件摘要列在 `verification.json#physical`；没有独立读取腕端安装 metadata/hash。

电脑注入触控因 Xiaomi `INJECT_EVENTS` 安全策略被拒绝，设置与授权采用用户手动操作，不绕过系统权限。本地原始证据仅留 Git 忽略目录 `.local/module03-evidence/preinstall` 与 `.local/module03-evidence/xiaomi-device-20261011`；仓库仅记录脱敏事实和摘要。

### Android 模拟器与腕端画面边界

三张截图为 **Android API37 AVD 的实际运行原图（1080 × 2340），不是腕端画面或目标设备通信证据**：

- [默认关闭](screenshots/android-api37-companion-off.png)：尚无授权、握手或同步记录。
- [主动启用与同意](screenshots/android-api37-consent.png)：只读范围与 SDK 可能包含通知能力说明。
- [缺少小米服务](screenshots/android-api37-service-unavailable.png)：明确错误，未宣称授权或同步成功。

实际操作还验证关闭后强停本模块专用 AVD 内应用、冷启动再进入设置保持关闭。两次冷启动 TotalTime 为 1946/1934ms，仅两次观测，不作为性能基准。此处强停未操作用户手机，既有用户数据未接触。

**已有四张用户提供的正式腕端错误状态真机实拍（初版两张、`0.2.1` 与 `0.2.2` 各一张）；六类业务画面仍未验证。** Windows Vela 模拟器有 Module 02 已记录的应用加载前启动阻塞；无概念图/网页/Node harness 冒充截图。保留 Module 02 临时 icon 为合同允许的视觉遗留，不称为最终批准 Logo。

| 目标证据 | 状态 / 原因 |
| --- | --- |
| 物理手机版本/证书、安全覆盖安装 | 已验证：两机三方证书匹配，`install -r` Success；当前 Xiaomi 实际 APK 摘要与交付一致 |
| 初版正式 RPK 腕端安装/运行 | 用户指定 `0.2.0` 正式包并提供真机实拍，正式 UI 已运行；未独立读取腕端安装元数据/文件摘要 |
| `0.2.1` 初始化诊断增量 | 检查无错、117/117 PASS，实际构建与独立验签通过；用户更新后新实拍显示 `INIT_READY_CALL_API_MISSING`，当前实例缺少 `getReadyState` 函数 |
| `0.2.2` 兼容增量 | 本地 31 scripts / 3 pages 无错、134/134 PASS，构建验签通过；真机已复测且 CHANNEL_UNAVAILABLE / 无握手 |
| `0.2.3` 同次查询诊断 | 本地检查无错、146/146 PASS，构建验签通过；仅提高错误可观察性，待用户更新取得具体码 |
| 国行 9 Pro 三次随机请求与中文/256/1024/2048/4096 bytes 往返 | Not Run：手机服务/设备授权已成功，兼容实现已交付但真机恢复未验，没有匹配握手；编码测试不代替无线传输 |
| 正常学习 → 手机锁屏/后台 → 腕端重开取新快照 | Not Run：主场景须实际手机与手环 |
| 准备/专注/休息/断连/未监测/保存中六类正式腕端画面 | Not Run：已有错误状态实拍，尚未取得六类真实业务画面 |
| 息屏、蓝牙断开、手机强停/重连、关闭即时清理 | Not Run：须真实链路，DISABLED 尽力发送，断链按过期处理 |
| 30 分钟消息数/延迟/计时误差/电量 | Not Run：不预写达标 |
| API23–35 / API36 全面回归 / 多 OEM / TalkBack / release / Play | Not Run：自动化为隔离 API37；API36 两机仅有上述安装、启动与设置诊断 |

已有本机签名转换、安装与必要授权测试同意；手机安全覆盖与设备授权、正式腕端错误实拍已取得证据。下一步为取得 `0.2.3` 同次原生查询码，按实际原因修复和验证往返，再继续锁屏与腕端业务画面。目标未验收，不进入 Module 04、不合并 main。
