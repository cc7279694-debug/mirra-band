# Mirra Band

当前交付 **05B.3 业务操作延迟优化 0.1.4/code5**。用户确认0.1.3跨应用重进参考计时正常，保留USER_REPORTED_PASS；本版将开始的3/4次串行保存改为一次确认提交，保留全部存储校验，减少计时与等待期间重复刷新，按钮先给忙碌反馈。607/607 Node、实际构建及同证书验签通过；Node受控耗时与真实9 Pro流畅度分开，新版安装/自然使用待确认。见[05B.3交付](docs/evidence/module-05b-3/README.md)和[当前状态](docs/CURRENT_STATE.md)。Logo仍LOGO_PENDING，不进入05C、不改手机。下方为Module03历史伴侣安装与证据说明，不能作为当前独立包操作指南。

国行小米手环 9 Pro（336 × 480）的 Xiaomi Vela 只读伴侣。正式模式只展示手机已确认的当前阅读信息；不控制学习、不保存腕端业务快照、无需账号或服务器。演示构建与正式构建使用不同身份，正式连接失败不会切换成模拟数据。

Module 02 技术原型真机基础测试已由用户确认通过。Module 03 当前为 **MODULE_03_DEVICE_ACCEPTANCE_IN_PROGRESS / IDLE_ROUNDTRIP_PASSED_LOCKSCREEN_USER_PASS_OTHER_SCENARIOS_PENDING**：配套手机 `1.1.2-band-readonly` / code 5 已安全覆盖，2026-10-12 UTC 01:55 实际握手与完整快照发送；第八张腕端实拍显示“等待开始 / 已同步·13秒前”，无演示标记，共同证明真实 IDLE 往返通过。用户随后明确确认“手机正在监测学习 → 锁屏 → 手环退出重开 → 最新学习状态”完整主场景“包含，锁屏重进正常”，记为 **USER_REPORTED_PASS**，此次没有独立采集对应 Session、锁屏画面或原始消息。此前第七张 TIMEOUT 保留失败历史，首查自动恢复已完成 1.1.3 源码/自动化修正，首次NO_DEVICE真机复验通过，其他状态保留验证边界。其他业务画面及 30 分钟使用测试仍待验收，不能宣布整个模块通过。事实见[当前状态](docs/CURRENT_STATE.md)和[验证索引](docs/evidence/module-03/README.md)。

## 项目入口

- [PROJECT](PROJECT.md)、[AGENTS](AGENTS.md)：产品、架构约束与协作规范。
- [Module 03 完整合同](docs/plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md)：本轮授权与验收。
- [当前架构](docs/ARCHITECTURE.md)、[决策](docs/DECISIONS.md)、[路线图](docs/ROADMAP.md)。
- [Module 03 checkpoint](docs/checkpoints/2026-10-11-module-03-companion.md)：实现、继承规则与剩余验证。
- [Module 02 历史记录](docs/evidence/module-02/VERIFICATION.md)：原型构建与模拟器受阻证据。

## 配套安装与验收

本机交付文件在 `E:\CODEX\mirra-watch\dist`；准确大小、SHA-256、两端版本和公开证书见[产物清单](docs/evidence/module-03/artifacts.json)。当前本机配套 APK 为 `1.1.3-band-readonly` / code 6，已安全安装且版本/摘要核对一致，正式诊断 RPK 为 `0.2.5` / code 7。旧 APK、正式 RPK `0.2.0` 至 `0.2.4` 保留构建与失败溯源；独立演示包不参与正式通信验收。

当前同签名腕端诊断版：[RPK 0.2.5](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.5.rpk)，32,549 bytes，SHA-256 `1f7dad9c611e2b3b39e3803226626d7d7667f1cd3f878429b134cee4fe046566`，实现提交 `2be4297feb06ad42cea0a5ab1d891594866317bc`。154/154 测试、31 scripts / 3 pages / 0 errors、实际构建及独立签名/内容/CRC/篡改检查通过。仅展示有限 ASCII 原生状态 token 与包版本，未知值仍断连；不把 `TIMEOUT` 或其他未知值当成功。已复制目标手机 Download 并核对摘要一致；首次实拍失败、随后真实 IDLE 接收均保留。可见版本标签不等于独立提取腕端安装文件摘要。

配套手机：[Mirra-1.1.3-band-readonly-debug.apk](E:/CODEX/mirra-watch/dist/Mirra-1.1.3-band-readonly-debug.apk)。恢复实现提交 **`322fbfd0288a26ba56c7b0b02d0598ab680d5dd7`**，本机 APK **1.1.3-band-readonly / code6**，**16,852,478 bytes**，SHA-256 `a7f20c1c38b416a6ece12db5f5e07db7852b2848ab7ad58a0fe91610609bac75`。最终定向 **62/62**；未过滤 JVM **741/741 / 81 suites / 0 failure/error/skip**，Lint **0 errors / 20 warnings / 1 hint** 与 1.1.2 逐项完全一致；单次 testDebugUnitTest / lintDebug / assembleDebug **14m30s / exit0**。APK 实际二进制版本、v1/v2 签名和 SHA 已核对，公开证书与既有 1.1.2 及正式 RPK 0.2.5 相同。当前目标已核验安装1.1.3/code6，版本/摘要匹配；原1.1.2成功证据保留。 旧 1.1.2 已安装与通信通过记录见统一证据，未重新定义为未完成。

1. Mirra 与小米运动健康须在同一台 Android 手机，手环与该手机配对。USB 调试连接后，只读核对已安装 Mirra 版本、公开证书与首页活动状态，并建议保存完整备份。本轮用户明确因数据很少跳过备份；两部手机原有 `0.2.0` / code 2 的证书与交付三方匹配，首页没有活动学习界面，已完成覆盖升级。
2. 本轮安装前先取得用户当前确认，重新只读核对目标手机已安装版本、公开证书和无活动学习状态。仅在证书匹配、versionCode <6 时安全覆盖；已匹配 1.1.3/code6 且实际 APK 摘要一致则跳过。高于 code6 或身份不符停止。保留用户此前少数据跳过备份的决定，但不宣称已创建备份；不卸载、清数据、降级或改签名。
3. 通过已经验证可用的 RPK 安装工具选择正式 `0.2.5` 诊断 RPK。正式包与旧演示包身份不同。在“连接与帮助”记录版本与诊断码；恢复前已实际记录 `Mirra 0.2.5 / 7`、`APK_RAW_TIMEOUT`，后续已收到 IDLE。该错误码是同步原生状态 token，不是手机业务请求超时或连接成功证明。
4. 手机 Mirra → 我的 → 手环伴侣 → 启用。阅读只读范围说明，在小米授权页确认设备消息权限。首次 SDK 授权可能同时包含通知能力；Mirra 不主动调用通知、健康、定位或麦克风接口。
5. 在既有授权下先打开手机/腕端 Mirra，观察自动发现设备、实际 HELLO 与完整 SNAPSHOT；自动恢复验收期间不点“重新连接设备”或“检查腕端应用”。SDK ready、安装 Boolean 均不等于业务同步。若自动恢复失败，先保存真实结果，再使用这两个手动动作作后备诊断。授权拒绝或身份/监听问题停止，不能自动绕过。旧真实 IDLE 和用户锁屏重进已通过，新版复验另记。
6. 检查手机准备动作、正常学习、休息、恢复、未监测/监测中断与保存结果。腕端退出后暂停请求，再进入重新握手；断连冻结手机最后确认数字。关闭手机伴侣应清除腕端私有内容，并保持手机学习功能正常。
7. 必测主场景：手机正在监测学习且锁屏，退出并重新打开腕端，确认得到最新真实数据；本次用户明确确认已完整执行、锁屏重进正常，状态为 USER_REPORTED_PASS，未取得配套独立 Session/锁屏画面/原始消息。继续保留专注、准备、休息、断连、未监测、保存中六类手环实拍或真实 Vela 运行截图，再记录 30 分钟同步次数、延迟、断连与耗电；这些剩余项目仍为 Not Run。

SDK 若只发现多个设备，本版会要求先在小米配套应用中明确目标，避免自动选择其他设备。没有成功握手时，请保留错误分类、手机服务版本与手环固件；不要将用户书名、笔记或原始敏感日志公开上传。

当前验收目标 Xiaomi 的小米运动健康为 `com.mi.health` 3.59.1，用户确认 9 Pro 已配对且连接。UTC 2026-10-11 15:09 / 15:39 曾 NO_DEVICE，15:41 手动重连后设备/服务/授权正常但无握手；当晚 USB 暂断、NotificationShade 焦点拒绝抓取均保留历史。2026-10-12 UTC 01:53:46 NO_DEVICE 与 01:55:03 手动重连+安装检查后的成功属于同 PID 32135，证明本次恢复不依赖进程重启；两动作未隔离，不能断言安装检查单独促成恢复。八张腕端实拍保留前七张失败及第八张真实 IDLE 接收。旧 getReadyState 非函数已有兼容路径，首查缺口已有 1.1.3 源码/回归修正、首次NO_DEVICE真机恢复已通过、完整腕端画面有未覆盖项，底层 TIMEOUT 触发原因尚未隔离；不归因于白名单、签名或固件。电脑注入触控被 Xiaomi 安全策略拒绝，设置与系统授权使用手机手动操作，不绕过权限。

## 本地构建

实际 Node 24.18.1 / npm 11.16.0 / `aiot-toolkit@2.0.5` 已构建 `0.2.5`，10,521ms / exit 0；31 scripts / 3 pages / 0 errors，未过滤测试 154/154 PASS / 0 fail / 0 skip。初版 98/98、`0.2.1` 117/117、`0.2.2` 134/134、`0.2.3` 146/146、`0.2.4` 151/151 保留为历史。`0.2.4` 按旧官方实现补上 CONNECTING 的有界等待，但真机未证明返回该 token，复测未解决故障。无 TypeScript 预编译、全局运行时修改或新依赖。

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build:demo
npm.cmd run build:live
npm.cmd run inspect:rpk -- dist/com.guanyi.mirra.release.0.2.5.rpk sign/live/certificate.pem live
```

两种构建必须串行。演示使用已有 `sign/private.pem` 与 `sign/certificate.pem`；正式使用用户明确授权的本机转换材料 `sign/live`。构建会校验固定公开指纹，缺少匹配密钥时明确失败，不自动生成新正式身份。私钥、构建暂存、SDK 二进制、模拟器与产物全部 Git 忽略；不得提交或上传。

Android 工作区当前为 `E:\CODEX\mirra-watch\.local\android-worktree`，分支 `codex/mirra-band-readonly-bridge`，基于实际较新 V1.1 提交 `1338b9a4e41788082f30bf3894a974c2ff652630`。原手机工作区没有被切分支或覆盖。首次源码构建运行其 `scripts/fetch-wearable-sdk.ps1`，仅下载小米官方 SDK 并核对固定 SHA-256；官方附件没有明确再分发许可，因此 AAR 不进 Git。构建继承原手机 Kotlin/Compose/Room 与签名配置。

Node 页面测试不能证明 Vela 渲染；Android API37 回归不能证明小米手环消息、锁屏可达性或 OEM 行为。Module 03 保持当前模块，完成设备验收之前不进入 Module 04。

## 当前1.1.3真实交付结果与使用方式

1.1.3 已按当前同意安全覆盖：实际首页空闲、code5→6、已安装 APK 摘要与交付完全一致；无卸载/清数据/降级/重签/原始数据库访问。

首次 NO_DEVICE 真机自动恢复已通过：用户同意在首页空闲时关闭蓝牙，并仅重启 Mirra 一次。冷启动 PID1642 实际 NO_DEVICE/无握手/无快照；恢复蓝牙后同 PID 自行发现9Pro并恢复服务/授权。正常腕端退出重进后用户确认“已同步”，实际手机捕获新握手与11:51:21完整发送，安装检查仍“尚未检查”。未点手机重连/安装查询依用户明确确认；SDK ready 与业务成功分段记录，旧1.1.2 IDLE/锁屏验收继续保留。

用户随后明确认为逐项手动验收效率过低，要求自主开发、自然使用遇到问题再反馈；自述约5分钟体验正常，未逐项确认覆盖或回复版本，不扩大为全部状态通过。不再逐项指挥或要求重复同样流程。30分钟采用低频只读观察并已结束，缺失指标/腕端画面如实注明；安装/签名/系统权限仍保持明确授权边界，不进入 Module04。

观察窗口已实际结束：UTC2026-10-12T03:57:28.0770927Z→2026-10-12T04:27:28.934Z，墙钟30.01分钟。自动低频采样从2026-10-12T04:09:51.854Z开始，实际5次，ADB读取失败0次；仅1次在Mirra前台取得固定状态（正在阅读、阅读时长8分钟、阅读中），其他前台不读UI。所有样本PID1642；手机100%→100%，系统报告AC充电。同步总数/精确RTT/全连接失败/腕端电量/放电耗电不可取得，诊断页同步时间样本为0不等于无线消息为0。此项是有缺口的被动观察窗口，不能写连续30分钟阅读或通信稳定性全PASS。
