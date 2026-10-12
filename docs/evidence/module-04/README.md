# Module 04 — 学习常用控制交付

状态：**DEV_COMPLETE_AWAITING_NATURAL_USE**。本轮按[完整合同](../../plans/MIRRA_BAND_MODULE_04_WRIST_CONTROLS.md)连续实施，代码、自动化、配套构建与二进制检查完成；新增真机操作及 ChatGPT 独立审查尚未执行，不进入 Module 05。

## 1. 完成功能

- 从腕端选择休息 5/10 分钟；提前结束休息后按手机原规则进入 RECOVERY。恢复成功由原监测规则决定。
- 展示手机已有有效 Intent 的真实书籍、页码和完整第一步，明确确认后请求严格监测启动。过期、暂停/完成书籍、动作或页码改变时不签发可用操作。
- 开始前必须满足监测准入、FGS 和 READY；不因腕端启动受限创建 UNMONITORED。事务内复核 Intent、书籍、动作、页码及授权。提交后监测异常保留真实 Session，反馈降级。
- v2 协商 SESSION_CONTROL，兼容 v1 只读。手机独立控制许可默认关闭，显式同意，仅在 no-backup 本地保存。
- 20 秒短授权绑定设备节点、流、存储 owner 和业务对象；休息和开始在最终事务首次写入前再次检查。单个在途命令，有界去重，超时不重发，重新读取权威状态。
- 腕端深墨/Mirra Blue、独立控制页面、长动作滚动、等待和未知结果反馈；恢复、保存、结束、断连和模拟数据不执行控制。真实小屏画面与触控仍待自然使用。

## 2. 修改文件

Band 新增 `protocol/v2/schema.json`、17 个共享 fixtures、`src/pages/Control/index.ux` 和控制/协议测试；修改协议、Store、Presentation、Home/Detail、路由、版本配置及检查脚本。未删除产品文件，未修改 Logo。

Android 新增 `WearableCommandExecutor.kt`、控制/协议 JVM 测试、严格开始与休息事务测试、本地设置 Android 测试及共享 fixtures。修改 `WearableCoordinator`、投影、`SessionStartCoordinator`、原工作流/休息业务的可选授权准入、Gate 接线、AppContainer/Application、手环设置页和版本。没有另建并行业务服务。完整变更可在两功能分支对比接受基线。

## 3. 数据层与配置

Room v4 Schema、Migration、Full Backup v1、portable preferences、学习转换/监测/Closeout 规则及签名身份不变。数据库仍只由手机既有 Repository 写入；增加事务内预期事实与外部授权 guard，原手机调用不传 guard、保持原规则。控制开关新增独立 AtomicFile `noBackupFilesDir/wearable-control-enabled`，损坏、缺失或不确定时关闭，不随备份迁移。无新依赖、云端或额外权限。原手机工作区未修改。

## 4. 实际验证

最终源码未过滤 JVM：**798/798 PASS / 86 suites / 0 failure/error/skip**。手环 Node：**184/184 PASS**；语法/配置检查 **34 scripts / 4 pages / 0 errors**。Lint **0 errors / 20 warnings / 1 hint**，与 Module 03 基线的 severity/id/message 逐项一致；未新增警告或升级依赖。手机四任务单次构建 **exit0 / 4m17s**；正式 RPK 实际官方构建 **35,898ms / exit0**。Node 24.18.1 与 aiot-toolkit 2.0.5 实际兼容，无全局工具改动。[完整验证摘要](verification.json)保留各测试类/方法、实际计数及原始本地日志摘要。

已有实际 RED 证据：严格开始和协议 33 项中 10 失败；撤权至事务提交竞态 143 JVM 项中 2 失败、真实 Room 5 项中 4 失败；取消与 JSON 原始类型 121 项中 2 失败；准备资格 23 项中 2 失败。最终 GREEN 以完整门禁为准，未把编译失败当行为 RED。

最终配套 APK/test APK 在自有 `MirraBand_Module03_API37 / emulator-5580` 上单次执行 9 个相关 Android 类：**78/78 实际 PASS / 0 failure/assumption/ignored，78 个唯一方法完整结束，58.558s**。包含真实 Room、Reader、控制设置、原监测开始/休息工作流和备份边界。此为相关回归，未声称 Module 04 未过滤全量 connected；同电脑其他项目的模拟器未操作。

手机设置原生 UI 在同一自有 API37 模拟器实际检查：控制默认关闭；伴侣未启用时禁用；尝试开启弹出明确范围；点「保持只读」后仍关闭。截图为实际 Android 模拟器画面：[默认关闭](screenshots/android-api37-control-default.png)、[控制确认](screenshots/android-api37-control-consent.png)。没有将它们标成腕端或真实通信截图，也没有用概念图。

Module 03 已接受事实继续保留：正式 IDLE 双端同步有手机和腕端证据；监测学习锁屏后腕端重进为 USER_REPORTED_PASS；首次 NO_DEVICE 自动恢复同进程已通过。约 5 分钟自然使用正常是用户反馈；30 分钟被动观察保留测量缺口，不变成连续学习/耗电基准。旧 [Module 03 证据](../module-03/README.md) 与原产物未覆盖。

## 5. 未验证项与限制

**Module 04 真机安装与三项新控制操作 Not Run**，需要这轮安装同意及目标手机公开版本/证书/空闲首页核查。实际原生 Vela UI 截图、圆角/长文本/触控、新控制锁屏 FGS/OEM 行为、其他 API/OEM、完整未过滤 connected、9 个需专用阶段 fixture 的备份方法、release APK/生产发布、ChatGPT 独立审查均 Not Run。Node 页面 harness 是实际脚本测试，不能当腕端像素截图。

系统拒绝后台启动时须回手机操作；模拟器的依赖 fake 只用于验证准入，不证明真机后台必然成功。SDK 发送回调、手机业务 APPLIED 和腕端新状态分开处理；控制结果未知不会自动重发。无线服务及正常进程存活仍取决于系统，无后台常驻承诺。

## 6. Git 与配套产物

Band：`codex/module-04-wrist-controls`，接受基线 `8b14819f15682fd22752dbdf2b05e8d465e255ee`；实现提交 `c9d3f7cd4953a5f866548cc91be1b1b22b074eb9`。

Android：`codex/mirra-band-control-bridge`，接受基线 `3fecf50a208ddb145a67986749420b490193e903`；实现提交 `9662164bbffe9ebafdb72b7c4f99ac8d538876d3`。两条实现提交均已推送并逐一核对远端 SHA；交付记录另作当前同分支文档提交，最终 HEAD 在本轮回复记录，不合并 main、不创建 PR/发布。

实际产物绝对路径：`E:\CODEX\mirra-watch\dist\Mirra-1.2.0-band-control-debug.apk`（1.2.0/code7）和 `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.3.0.rpk`（0.3.0/code8）。均为 `com.guanyi.mirra`。

| 产物 | 实际 bytes | SHA-256 |
| --- | ---: | --- |
| APK | 17,377,802 | `80ae3ae58f8263a803094c39f21b8e8e54c1d38625c47f212a7af3cc502d5077` |
| RPK | 43,147 | `a0228f9a8bbd5180bbd120b52f7c5704173acedc0f298e8eddbe0725f81c369c` |

公开证书两包一致，沿用原身份：`29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9`。APK v1/v2 单签名核验通过；RPK RSA-SHA256、全部内容/逐文件摘要/签名元数据/CRC 和三类篡改拒绝检查通过。完整元数据在 [artifacts.json](artifacts.json)。APK/RPK、SDK、签名材料和原始设备日志仅在本机忽略目录。

## 7. 下一步与安装方式

停在 Module 04。门禁完成后先取得本轮安装同意，再只读核对原配对手机包名、版本、公开签名和空闲首页；匹配且单调升级才覆盖安装 APK，不卸载/清数据。RPK 用已成功使用的「表盘自定义工具」安装配套正式包，保留原包身份。

安装后在手机「我的 → 手环伴侣」保持原只读设置，主动开启「允许手环控制学习」并阅读范围。自然使用一次准备动作确认、选择休息及提前结束即可反馈实际成功或限制，不要求重复人工矩阵/长期被动观察。系统权限变更仍由用户确认。等待自然使用和 ChatGPT 独立审查，不进入下一模块。
