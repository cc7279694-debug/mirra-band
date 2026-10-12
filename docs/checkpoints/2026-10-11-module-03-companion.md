# Module 03 — 只读伴侣与腕端 UI 滚动 checkpoint

建立日期：2026-10-11；最新增量：2026-10-12（Asia/Shanghai）。

状态：**MODULE_03_DEVICE_ACCEPTANCE_IN_PROGRESS / IDLE_ROUNDTRIP_PASSED_LOCKSCREEN_USER_PASS_OTHER_SCENARIOS_PENDING**。本文件是本模块唯一滚动 checkpoint，保留下方各版本历史验证。当前手机 1.1.2/code5 与腕端 0.2.5/code7 已取得真实 IDLE 往返接收证据；用户随后明确完整监测学习锁屏重进正常，主场景记为 **USER_REPORTED_PASS**，没有独立配套 Session/锁屏画面/原始消息采集。前七张失败历史保留，首查恢复缺口尚未修复。其他业务画面与 30 分钟观察未验收；不能宣布整个模块完成或进入 Module 04。最新事实见末尾追加，前文计数与产物属于明确历史版本。

范围合同：[MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md](../plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md)。产物、公开证书与协议镜像摘要：[artifacts.json](../evidence/module-03/artifacts.json)。

## What Was Built

### 腕端

- Xiaomi Vela 原生 `.ux` + JavaScript 正式应用，Home / Detail / Connection 共用结构化 presentation；深墨背景与 Mirra Blue 强调色，首页聚焦状态、时间或动作，详情滚动展示书名、页码、监测及同步信息。
- 正式模式通过单例 Interconnect transport 接收手机事实。业务阶段、Segment、监测覆盖、通道连接和新鲜度分开；无有效快照时不显示样例书或推断空闲，正式错误不降级为演示数据。
- 协议 v1 严格校验 UTF-8 字节预算、字段/空值、Unicode、页码、请求与流归属；只发送 HELLO / GET_SNAPSHOT，不控制学习。
- 可见页面租约共同管理 store，页面订阅和显示 ticker 各自释放。隐藏停止请求；重新进入握手，旧客户端/请求/流不能恢复实时状态。
- 手机确认值的前台保守插值；时钟回退、异常跳跃、调度空档、断连和过期立即冻结。休息或临时用途倒计时归零保持手机阶段；保存/结束不继续累计。
- 正式 live 与独立 demo 两种构建。demo 共用 presentation，每页持续标识“演示数据”；正式包移除 States 路由和该页面资源。
- 本轮实际修复过的边界包括：合法 ACTIVE 无时间不能留下空白或制造 00:00；终止授权/身份/不支持/关闭错误不能被原生 close/open 或迟到消息覆盖并重启自动轮询。
- 最后发送回调回归实际 RED 7/3 FAIL → GREEN 7/7；每次发送的 generation/settled 拒绝被取代或已结算发送的晚到失败，原生 success 不代表业务新鲜度。最终全量 98/98、两种 RPK 重构建并验签。

### 手机

- 在既有 Kotlin / Compose / Room 架构内增加官方 SDK transport、只读快照 reader、协议 codec、协调器和“我的 → 手环伴侣”设置入口。
- 用户主动启用，默认关闭；SDK 监听和发送独立受控，权限、设备归属、代际切换和维护生命周期有明确边界。SDK 等待放在数据库事务之外，维护期间拒绝旧 owner 读取，恢复后使用新流。
- 开启偏好放本设备 no-backup AtomicFile，不进入既有四项 portable preferences 或 Full Backup v1。未新增腕端业务数据库或快照持久化。
- 学习算法、Room v4 Schema、备份格式、既有手机签名身份与用户数据不变；Room Schema 的基线/current Git blob 一致，摘要见产物清单。
- 最终审查回归实际 RED 12/3 FAIL → GREEN 12/12：编码失败不更新同步或跟随记录，同步时间复用一次采样，源忙碌/不可用诊断保持上次确认时间并在成功恢复后清除。新源码完整 JVM 711/711 和配套 APK/test APK 构建通过。

### 配套构建

| 产物 | 包名 / 版本 | 本地文件 |
| --- | --- | --- |
| 正式 RPK | `com.guanyi.mirra` / 0.2.0 / code 2 | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.0.rpk` |
| 演示 RPK | `com.guanyi.mirra.band.demo` / 0.2.0 / code 2 | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.band.demo.release.0.2.0.rpk` |
| 配套 debug APK | `com.guanyi.mirra` / 1.1.1-band-readonly / code 4 | `E:\CODEX\mirra-watch\dist\Mirra-1.1.1-band-readonly-debug.apk` |
| 正式诊断 RPK | `com.guanyi.mirra` / 0.2.1 / code 3 | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.1.rpk` |
| 历史正式兼容 RPK | `com.guanyi.mirra` / 0.2.2 / code 4 | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.2.rpk` |
| 历史查询诊断 RPK | `com.guanyi.mirra` / 0.2.3 / code 5 | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.3.rpk` |
| 历史旧 CONNECTING 兼容 RPK | `com.guanyi.mirra` / 0.2.4 / code 6 | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.4.rpk` |
| 当前状态 token 诊断 RPK | `com.guanyi.mirra` / 0.2.5 / code 7 | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.5.rpk` |
| 当前配套诊断 APK | `com.guanyi.mirra` / 1.1.2-band-readonly / code 5 | `E:\CODEX\mirra-watch\dist\Mirra-1.1.2-band-readonly-debug.apk` |

Node 24.18.1 与固定 `aiot-toolkit@2.0.5` 实际完成最后一轮 live/demo 构建。RPK 的 RSA-SHA256、内容/文件摘要、签名元数据、ZIP CRC32 与篡改拒绝检查通过；APK 的 apksigner 验证通过。两种 RPK 串行构建，未修改全局工具链。

本次构建 APK 与 live RPK 的公开证书指纹相同：`29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9`。初次开发交付时物理三方核对未执行；同日后续对两台用户授权手机已核对并安全覆盖，见下方真机增量。证书匹配不证明目标固件通信或认证成功。

## Why / Key Decisions

1. 手机继续拥有 Intent、Session、监测与学习记录，腕端只展示手机已确认事实；本轮不加入远程控制、云服务或新账号。
2. 复用真实官方 SDK 实现，固定官方附件/AAR 摘要；附件没有明确再分发许可，因此 SDK 二进制留在 Git 忽略的本地目录，源码提供固定摘要取得方式，不提交 AAR。
3. 沿用既有手机身份。签名格式转换仅使用用户明确授权的本机材料，秘密留在忽略目录；不重新生成正式身份，也不卸载、清数据或降级手机应用。
4. 采用已批准的深色颜色与小屏信息顺序；不重新设计 Logo、不改变手机技术栈、不添加 TypeScript 预编译层。
5. 新鲜度属于腕端接收上下文，不拿两台设备 wall clock 相减。工程初值为请求超时 3 秒、活动查询 5 秒、空闲查询 15 秒、活动/空闲过期 15/30 秒；一次一个在途请求，可见时有界退避。终止拒绝保留到显式重试或新的前台周期。
6. 未证明 Vela 单调时钟，使用 Date 连续性检查的保守路径；插值只改善展示，不生成学习事实。正式失联、SOURCE_BUSY/DISABLED 与监测中断不能显示健康专注。
7. 两个仓库使用各自功能分支。原手机工作区与未提交工作保留，Android 增量放已授权隔离 worktree；不合并 main、不创建 PR、不开始 Module 04。

## Verification / 原始结果

以下表格保留原开发交付的门禁；真机安装与 0.2.1 诊断修改的新门禁单列于末尾，不混写为同一源码或同一次验证。后续未操作 Android 模拟器。

| 检查 | 实际结果 | 证据边界 |
| --- | --- | --- |
| 腕端 `npm.cmd run check` | 30 scripts、3 pages、0 errors | 语法/配置检查，不能证明 Vela 渲染 |
| 腕端 `npm.cmd test` | 98 discovered / 98 pass / 0 fail / 0 skipped | 模型、协议、store、transport、页面脚本与构建边界 |
| 最终 live / demo RPK 构建与检查 | 两包实际生成，独立签名/摘要与篡改检查通过 | 不能证明目标固件安装、通信或 UI 可读性 |
| Android `testDebugUnitTest` | 711 / 711 pass，0 failures | 手机全量 JVM 回归 |
| Android `lintDebug` | 0 errors / 20 warnings / 1 hint | 比 V1.1 报告多两项既有 serialization 依赖的版本更新/version catalog 建议，依赖版本未改 |
| Android `assembleDebug` / `assembleDebugAndroidTest` | 实际构建成功 | debug APK 与测试 APK；不是商店发布 |
| 首轮完整 unfiltered connected，专用 API37 AVD / 440dpi | 500 discovered / 483 pass / 8 fail / 0 error / 9 assumptions | 原始 Gradle 任务失败，不能记为通过 |
| 第二轮完整 unfiltered connected，420dpi | 500 discovered / 490 pass / 1 fail / 0 error / 9 assumptions，15m41s | 相邻 Lazy item 尚未组合；测试补精确滚动保留原“6 次”断言，无产品改动 |
| 修复后源码完整 unfiltered connected，420dpi | 500 discovered / 491 actual pass / 9 assumptions / 0 actual fail/error/native skipped，14m32s，Gradle 退出 0 | 所有 500 项唯一，单次完整未过滤执行；未拼接定向成功数 |
| 手机设置实际画面 | 默认关闭、主动同意、缺服务明确报错、关闭后冷启动保持关闭 | 三张 API37 AVD 运行原图，非腕端或目标 SDK 证据 |

首轮报告将 17 项汇总到 failures；按 XML 内 `AssumptionViolatedException` 分类，其中 9 项为条件未满足，另 8 项为真实失败。8 项失败已定位到专用 1080px / 440dpi AVD 的实际宿主宽度约 392.7dp，无法容纳要求 411dp 的 UI 测试。仅把本模块专用 AVD 调为 420dpi 后重跑全套，未删除、过滤或放宽失败测试。修正环境不等于重跑已通过；首轮原始失败历史必须保留。

本地原始记录位于 `E:\CODEX\mirra-watch\.local\module03-evidence`：`band-check.log`、`band-test.log`、`rpk-live-final-build.log`、`rpk-demo-final-build.log`、`android-final-build.log`、`android-final-connected.log`；两次完整失败的 HTML/XML/日志分别保存在 `connected-attempt-1-density440` / `connected-attempt-2-lazy-row`。最终脱敏结果、报告/日志 SHA 与截图索引见 [verification.json](../evidence/module-03/verification.json)；不提交 SDK、私钥、AVD 或原始敏感设备日志。

隔离模拟器为 API37 / `emulator-5580`，目录、用户 home 与日志位于本仓库 `.local/module03-avd`；使用本机既有 SDK/JDK，未升级全局环境、未清除旧 AVD 或用户手机数据。完成启动与至少 60 秒稳定健康采样后才用于回归。API37 模拟器仅证明对应 Android 环境，不提供专有小米设备链路证据。

## Known Limitations / Not Run

- 九个显式 opt-in 备份/恢复/数据保留阶段测试为 assumptions，不计入 PASS；本轮多进程安装阶段执行 Not Run。完整普通备份/恢复与 Reader 维护测试已执行，见统一验证索引。
- 物理手机已完成版本/公开证书核对、三方身份匹配与安全 APK 覆盖；用户更新正式 RPK 并提供实际运行照片，手机 SDK 节点/服务/授权已确认。腕端初始化状态查询失败，无线握手与完整快照仍未成功。没有独立读取腕端安装 metadata/hash；安装目录 metadata 保持原位不能代替数据库内容校验，本轮没有读取用户数据库。
- 国行小米手环 9 Pro 真实官方 SDK 消息往返、至少三次随机 requestId、256/1024/2048/4096 字节与中文/emoji 消息预算均 **Not Run**。
- 初版交付时正常监测学习锁屏重进主场景为 **Not Run**；现由后文最新用户执行确认更新为 **USER_REPORTED_PASS**。真实断连、结束重连、强停、撤权和重新授权仍 Not Run，没有将 AVD 或 mock transport 当作成功证据。
- 正式腕端专注、准备、休息、断连、未监测、保存中六类实际运行画面 **Not Run**；中文截断、触控、圆角、安全边距、留白与 336 × 480 可读性仍待真实 Vela/目标设备验证。浏览器设计预览不能代替截图。
- 用户已批准 Logo 的可直接复用 raster 适配素材尚缺，继续保留 Module 02 临时 icon，属于明确视觉遗留；未自画替换，也未宣称 Logo 已最终产品化。
- 至少 30 分钟真实阅读的查询数量、延迟、重进恢复、断连和两端电量观察 **Not Run**；不承诺后台常驻、息屏连续通信、振动或续航表现。
- OEM 差异、其他 Android API、TalkBack、release/Play 分发尚未验证；Node 页面 harness、同签名本地构建、官方 SDK 存在均不能替代上述证据。

## Git / Next Stage Should Inherit

| 仓库 | 分支与基线 | 本 checkpoint 编写时状态 |
| --- | --- | --- |
| Band | `codex/module-03-readonly-companion`，基线 `e450dc1dfb4194dfb755371eddeb740d30cb3700` | 构建对应代码提交 `88bd77b1582f268b2dda3785fd8b46dc2b2e8fec`；交付文档另有提交，最终 HEAD/远端以 Git 为准 |
| Phone | `codex/mirra-band-readonly-bridge`，隔离工作区 `E:\CODEX\mirra-watch\.local\android-worktree`，实际基线 `1338b9a4e41788082f30bf3894a974c2ff652630` | 构建对应代码提交 `e00be0a5d59f9dad892b8c26128c8c3d17149f70`；交付文档另有提交，最终 HEAD/远端以 Git 为准 |

下一步仍属于 **Module 03**：在真实 IDLE 接收及用户确认锁屏主场景基础上，补齐其他状态、六类 UI 实拍、断连/关闭和 30 分钟观察。保留 USER_REPORTED_PASS 与独立采集的区别，首查恢复缺口与手动恢复机制继续诚实记录，不将已通过部分当成整体完成。签名或版本冲突时保留用户数据并停止对应安装。两个功能分支仅普通 Push，禁止覆盖 main 或强推。

若自动化与构建均通过而必要真机项目仍未执行，停止点只能写 `MODULE_03_DEV_COMPLETE_AWAITING_DEVICE_ACCEPTANCE`。只有真实只读链路、手机锁屏主场景、正式 UI 与适用回归均有证据，才可写 `MODULE_03_COMPLETE_AWAITING_REVIEW`。未获用户验收与下一模块授权，不进入 Module 04。

## 同日真机验收增量 — 安全安装与手机授权通过，腕端初始化阻塞

- 首先核对 OnePlus PKX110 / Android 16、API36：已安装 `com.guanyi.mirra` 0.2.0/code2 的公开 APK 签名、交付 APK/live RPK 三方一致；加载的首页显示“开始第一次学习 / 添加第一本书”，没有活动会话指示。用户确认后 `install -r` 实际 Success，升级至 1.1.1-band-readonly/code4，安装 APK 摘要与交付一致、应用数据目录 metadata 保持原位，冷启动正常。没有小米配套服务，用户确认手环未配对这台手机，随后要求暂停。
- 用户换接 Xiaomi 23127PN0CC / Android 16、API36 后，重新进行独立只读核查。已安装旧 APK SHA-256 为 `76ca0ba8d03d44a22bae03d49131d7a97f3a55e9274e8402a06dbe4af7ca14c9`；实际提取公开证书并验签通过，三方一致。首页再次显示空书库状态，核查结论 SAFE_TO_INSTALL。沿用用户明确安装授权和少数据跳过备份的决定，实际 `install -r` Success 后 code4；手机已安装 APK SHA-256 与交付的 `5a61f4bc4272b565de1181f3d16ee7b905f41e6482971560558a6cc2178a4437` 相同。CE/DE 目录 inode 前后相同，单次冷启动 Status ok、598ms，首页正常；不能据此声称数据库内容已逐项核对或性能达标。
- 新目标手机已有小米运动健康 `com.mi.health` 3.59.1/code359001，服务 `com.mi.health/com.xiaomi.xms.wearable.WearableXmsService` 可解析。用户确认国行 9 Pro 已与本机配对且连接。随后实际 Mirra 设置画面确认“小米手环9 Pro / 手机服务可用 / 设备已授权 / 最近完整同步尚无”。SDK 节点与授权通过，不代表腕端握手或业务快照成功。
- 手机初启用曾显示 `COUNTERPART_APP_MISSING` 对应文案；这是已经被后续节点/服务/授权成功覆盖的历史设置结果，单凭文案未定位其当时失败阶段，不继续当作当前状态。
- 小米安全策略拒绝电脑注入点击（INJECT_EVENTS），采用用户手动进入设置与授权，不绕过系统限制。正式 0.2.0 RPK 放入手机 Download 并实际 SHA-256 核对一致，同时按用户要求提供电脑原件。用户安装并打开后提供两张未经修改的真机照片，显示正式错误 UI 与 `INTERCONNECT_UNAVAILABLE`，不能由此独立确认腕端安装 metadata/hash。
- OnePlus 的旧版本创建完整备份曾显示无效备份错误、没有进入保存页面；用户明确跳过备份，未创建成功的备份，也未修复或恢复。没有卸载、清数据、降级、重新签名、读取或修改真实用户数据库、改变原手环配对。
- 对旧版本统一 catch 的初始化错误增加固定步骤/错误类别诊断，并使失败后的原生回调失效；不读取原生 error text、payload 或设备标识。RED 定向 25 项中 17 FAIL、额外迟到回调 1 FAIL，修改后 transport 26/26 GREEN；全量未过滤 117/117 PASS、0 failure/cancel/skip/todo，30 scripts/3 pages/0 errors。手机源码/APK 未改，本次不重复 Android 构建或测试。
- 诊断 0.2.1/code3 在 Node24.18.1/toolkit2.0.5 下实际构建；31,968 bytes、SHA-256 `52cc4bdb66736ed9d5fd48069d6f1b33d8f81059a74cc3db57aba77d3f6dba3f`。独立 RSA、内容/文件摘要、元数据、CRC32/篡改拒绝检查通过，公开证书与手机一致；实现提交 `267be9aa69b1e34ac3b98a6629bdbcaa30cdfb22`。旧 0.2.0 和演示产物保留原构建/提交溯源。
- 用户随后更新 0.2.1 并提供第三张实际照片，诊断为 **INIT_READY_CALL_API_MISSING**：实例与回调注册后 `getReadyState` 不是函数。照片未独立显示版本 metadata，关联来自用户按交付步骤更新后的反馈。
- 同日最小兼容修复 0.2.2：有 `getReadyState` 保留原路径，否则使用官方 `diagnosis`、再否则一次同步 `getApkStatus`；严格成功值才确认通道，不增加轮询或假成功。原生 setter 缓存的实际 `onopen` 不被后续初始化覆盖。内部协议字符串在 native 边界转为非空/非数组 JSON 对象，按官方对象编码契约直接发送，不加包装、不开 listen，也不改手机协议。协议请求/流归属、旧回调与完整快照新鲜度保持原有验证。
- 兼容 transport 定向实际 RED 41 项中 27 PASS/14 FAIL → GREEN 41/41，证据在子 agent 工具输出（没有独立日志文件）；root fresh 未过滤全量 **134/134 PASS、0 fail/cancel/skip/todo**、检查 **31 scripts/3 pages/0 errors**。新增两条真实 transport + store 的对象/JSON边界 fixture 联测，明确仅模拟原生边界，不当作目标 SDK 实测。
- 0.2.2/code4 实际构建与独立验签通过：**32,194 bytes**，SHA-256 `27807efe94915c6ed691bfecfbe809abbc898d76995a3528fd3b5129cd799015`；同手机公开证书，RSA/内容/逐文件/metadata/CRC32/篡改拒绝均通过。实现 `cdfc77cf44aa1f1fcb1d4fc79326e4ab86b50bcc`，原交付及 0.2.1 文件保留溯源。当时等待用户更新结果，后续实际失败记录见下方；不能据自动化宣布连接恢复。手机源码/APK 未改，没有重复 Android 构建或门禁。

## 追加：0.2.2 真机重试与 0.2.3 同次查询诊断

- 用户更新后第四张未经修改的真机照片显示 **CHANNEL_UNAVAILABLE**。UTC 14:24 手机同次 UI 为 NO_DEVICE，XMS 服务实际已绑定 Mirra；用户手机点重新连接后 UTC 14:30 恢复识别 9 Pro、服务可用、已授权。再让腕端重试，用户反馈没反应，UTC 14:33 手机仍无握手/完整同步。前述 NO_DEVICE 已解除，不是当前持续错误。
- 对当前代码和官方 `fail(data, code)` 契约核对，发现查询 fail 第二参数数字及未知 success 值均被折叠。具体底层原因尚未定位，没有 primary 或真机证据支持当前故障一定来自白名单、签名或固件。0.2.3 仅修正这个已确认的观察缺口，不宣称通道修复。
- 最小实现 `b91de61f89f2d25c97dd11bfe39b401e8cc06cfc`：仅取同次 fail 第二参数的严格数字白名单，其他值显示 UNKNOWN；未知 status 只显示接口与固定 typeof 类别，不输出正文、任意对象或私人负载。连接严格成功值、3 秒超时、重试、回调归属和完整快照新鲜度均不改。
- 实际定向 RED **53 discovered / 39 PASS / 14 FAIL** → GREEN **53/53**；最终单次未过滤 **146/146 PASS / 0 fail/cancel/skip/todo**，31 scripts / 3 pages / 0 errors。Node 24.18.1 / aiot 2.0.5 实构建 **15,633ms / exit 0**，独立 RSA/内容/逐文件/metadata/CRC32/三项篡改拒绝通过。日志已实际落入忽略目录，摘要见 `verification.json#queryDiagnostic023`。
- RPK **0.2.3 / code 5 / 32,305 bytes**，SHA-256 `cb17cc6cc156623b44fad7c9fd85908f3d5505ef683762def16871b389269d54`，同手机公开证书。路径 `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.2.3.rpk`；已复制至当前目标手机 Download，远端 SHA 核对一致，待用户安装后的具体诊断码。手机源码/APK 未改，不重新安装或重复 Android 门禁。
- 完整通信、六类正式业务画面、锁屏主场景及 30 分钟测试仍未通过。两个功能分支继续本模块，不合并 main、不进入 Module 04；设备必须给出真实消息与匹配快照后才能改变验收状态。
- API依据为[官方状态查询建议](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/start.html)、[官方接口](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)与固定 `e20440fe7d970609bd3f02e9335b1a85e4fcb148` 公开 native JIDL/CPP 与 QJS JSON编码源码，链接见统一 verification；公开源码不证明目标固件等于该 commit。
- 证据保留 Git 忽略 `.local/module03-evidence/preinstall`、`xiaomi-device-20261011`、`resume-artifacts`；公开摘要与结果更新到统一 artifacts/verification。无线、随机请求/精确字节预算、锁屏主场景、六类正式腕端 UI 与 30 分钟观察继续待验。

## 追加：0.2.3 / 0.2.4 复测失败、0.2.5 原生 TIMEOUT 与手机只读安装诊断

- 本增量更新于 Asia/Shanghai 2026-10-12；UTC 15:09、15:39、15:41、15:44、15:45 均为 2026-10-11，不把时区换日改写为另一天的设备观测。
- 用户随后两张未经修改的实拍均为 **APK_STATUS_UNKNOWN_STRING**，对应 0.2.3 / 0.2.4 交付后的实际反馈；它们未显示安装版本元数据或文件摘要。前段“待用户更新”保留为当时历史，不作为当前状态。
- [旧官方 native 源码](https://github.com/open-vela/frameworks_runtimes_feature/blob/26e8785bd16896fd748a2db05933d03abe809406/modules/interconnect_impl.cpp#L1146-L1170) 确有第四种 CONNECTING；[后续官方修改](https://github.com/open-vela/frameworks_runtimes_feature/commit/2086a05d076ddf0a1255157c27703136c7cf3dd9) 将默认值改为 DISCONNECTED。0.2.4 仅为精确 CONNECTING 保留既有 3 秒期限内等待真实 onopen，不增加轮询或成功别名。未在目标固件观察到 CONNECTING，不能将公开历史源码当作真机返回值证据；该修补未解决故障。
- 0.2.4/code6 实现 **`2d54d43c8f8514255c198c3d9a42a117c54a21c2`**：实际 **151/151 PASS、31 scripts / 3 pages / 0 errors**，构建 **70,978ms / exit 0**，独立签名/内容/逐文件/metadata/CRC32/三项篡改拒绝均通过。RPK 32,347 bytes，SHA-256 `50bc9273b02643cb83d4d97f68e2aa650c938674a70708fd7c5763e43302e5ee`；所有结果只对应这一源码版本。
- 0.2.5/code7 实现 **`2be4297feb06ad42cea0a5ab1d891594866317bc`**：连接帮助 always 显示版本/code，仅对同步 getApkStatus 的有限 ASCII 状态 token 增加诊断，不输出任意正文、对象或业务 payload。精确值、大小写/包装类别可区分，未知 token 仍断连，不发送假 HELLO、不回退模拟；现代接口成功条件与业务 ACK/完整快照新鲜度规则不变。
- 0.2.5 实际 **154/154 PASS、31 scripts / 3 pages / 0 errors**，构建 **10,521ms / exit 0**，独立 RSA-SHA256、内容/逐文件摘要、metadata、CRC32/三项篡改拒绝均通过。RPK **32,549 bytes**，SHA-256 `1f7dad9c611e2b3b39e3803226626d7d7667f1cd3f878429b134cee4fe046566`，与既有手机公开证书相同；目标 Download 远端摘要一致。
- 第七张用户实拍实际可见 **Mirra 0.2.5 / 7、APK_RAW_TIMEOUT**。这确立当前运行诊断版本与原生同步 getApkStatus 的精确字符串 TIMEOUT，**不是**本应用握手请求计时器超时；仍未读出腕端安装文件摘要/完整平台 metadata，底层根因尚未知。0.2.5 已复测失败，不继续标为待首次复测或连接恢复。
- 手机 1.1.2-band-readonly/code5 实现 **`fcfac1d5e5a40d823598e8894ef649d4d499b215`**：官方 SDK `isWearAppInstalled` 手动只读查询拥有独立 job/generation/state 与 3 秒期限，节点/授权/owner 前后核验；SDK 等待不占监听所有权。页面 Stop/Dispose 仅取消诊断，迟到结果不恢复旧状态；并发 state 更新使用原子 update，诊断不修改 handshake/lastSnapshotAt，不启动腕端应用，不操作学习、数据库、备份或签名配置。
- 新手机源码单次 **testDebugUnitTest / lintDebug / assembleDebug** 完成 **10m47s / exit 0**；全量 JVM **722/722 PASS、80 suites、0 failure/error/skip**；lint **0 errors / 20 warnings / 1 hint** 与初版相同。定向第一次因测试导入错误编译失败，不计为行为 RED；随后真实行为 RED 42 项/9 FAIL、GREEN 42/42，最终并发回归后使用上述全量结果。初版 711/711 与 connected 491 actual PASS 保留旧源码历史，本轮没有重复 connected 或操作其他 Android 设备。
- 新 APK **16,852,477 bytes**，SHA-256 `6872cda1e755b8810244c6af763abc5126de983b2b5c3511e486e4d002f4cf9f`。UTC 15:44 实际提取目标 Xiaomi 当前 code4 APK 的公开证书，与新 code5 APK / 0.2.5 RPK 三方匹配，版本递增且 minSdk 兼容，SAFE_TO_INSTALL。用户当前确认“首页空闲”；实际抓取是设置页，不声称独立观察空闲首页。沿用已有覆盖授权和用户跳过备份决定，UTC 15:45 `install -r` Success，实际安装版本与 APK 摘要匹配；没有卸载、清数据、降级或读取原始用户数据库。
- 旧 APK UTC 15:09 / 15:39 曾 NO_DEVICE，15:41 用户手动重连后设备/服务/授权正常但无握手/完整同步。新 APK 安装后焦点 NotificationShade 时拒绝页面抓取，随后 ADB 列表为空；新只读查询尚无实际结果，当前手机状态未知。需恢复同一目标 USB 连接再读取，不操作先前 OnePlus 或其他 Android 设备。
- 代码核查确定首查恢复缺口：数据源绑定时一次自动 connect；NO_DEVICE 后移除服务 observer，onResume/进入设置不重查，自动可用事件只恢复已有节点的 SERVICE_UNAVAILABLE。UI 任意连接失败统一置 serviceAvailable=false，不证明 AIDL 未绑定。后来“尚未选择”可能与新进程有关，缺少 PID/生命周期对应证据，仍属推断。15:41 手动重连已解除该次首查失败；它不能解释当前腕端 TIMEOUT，不据此随机扩展自动重连。
- 现有七张实拍只能证明对应错误 UI；完整消息、六类真实业务画面、手机锁屏主场景与 30 分钟观察仍未验证。安装查询 Boolean 不证明证书、腕端版本或业务握手。保持 **WRIST025_NATIVE_TIMEOUT**，继续本模块的已授权定位，不进入 Module 04，不合并 main，不创建重复冻结文档。

## 追加：同 PID 手动恢复与首次真实 IDLE 往返通过

- 2026-10-12 UTC **01:53:46** 新 APK 的节点查询仍为 NO_DEVICE；UTC **01:55:03.108** 用户完成手机“重新连接设备 + 检查腕端应用”后实际 UI 显示 **9 Pro / 服务可用 / 已授权 / 已完成只读握手 / 最近完整同步09:54:44 / 小米服务报告腕端已安装**。前后均 PID **32135**，不能再把本次恢复解释为必须重启进程。实际 XML/PNG 为忽略目录 `status-025-after-phone-query.*`。
- 手机 handshaken 来自实际收到合法 HELLO 后 ACK 发送，lastSnapshotAt 来自合法完整 SNAPSHOT 发送；发送完成并非腕端 ACK，单凭这些字段不证明腕端接收。用户随后第八张原图 **`wrist-025-idle-synced-user-photo.jpg`** 实际 Home 显示 **等待开始 / 已同步·13秒前 / 请在手机开始 / 手环会同步当前阅读 / 详情**，无演示标识；两端同次证据共同证明 **首次真实 IDLE 往返与完整快照接收 PASS**。
- 此结果替代前段 WRIST025_NATIVE_TIMEOUT 作为当前状态，但保留第七张精确原生 TIMEOUT 和其他失败历史。手动重连与 SDK 安装检查共同触发，未隔离哪一步促成通道恢复；不把安装查询 Boolean 当证书/版本/消息握手证明，不声称底层 TIMEOUT 根因已经定位或首查恢复缺口已经修复。
- 当时仅 **MODULE_03_DEVICE_ACCEPTANCE_IN_PROGRESS / IDLE_ROUNDTRIP_PASSED_OTHER_SCENARIOS_PENDING**，尚待用户真实 Session 锁屏主场景；后续主场景状态已由下一节明确更新。其他业务状态、断连/关闭、六类 UI 与 30 分钟观察仍待验收，不进入 Module 04，不宣称全部端到端通过。

## 追加：真实监测学习锁屏重进主场景获用户确认

- 用户先反馈“刚刚我测试了，没问题”，再针对完整“手机正在监测学习 → 锁屏 → 手环退出重开 → 最新学习状态”明确回答 **“包含，锁屏重进正常”**。这是用户实际执行确认，主场景更新为 **USER_REPORTED_PASS**，替代前文待首次执行 / Not Run 的当前状态。
- 本次没有工具独立采集对应 active Session、锁屏画面或原始消息，不能写成独立工具验证。UTC 2026-10-12 **02:02:43** 实际手机回到首页，无正在 Session / 未观察到 focus service，是测试后观察；不由此反推用户此前没有进行监测学习。
- 保留前七张故障与 IDLE 通过历史。首查恢复缺口未修复，其他状态完整画面、断连/关闭、30 分钟计时/消息/延迟/电量仍待验收；当前整体 **MODULE_03_DEVICE_ACCEPTANCE_IN_PROGRESS / IDLE_ROUNDTRIP_PASSED_LOCKSCREEN_USER_PASS_OTHER_SCENARIOS_PENDING**，不进入 Module 04、不宣称整个模块完成。

## 追加：1.1.3 首查自动恢复与永久错误保护

本段是安装前的本地工程交付记录，以下“尚未安装/待确认”描述当时状态；后续实际安全安装、同进程恢复及使用方式变更见下一追加段，不改写历史为当时已安装。

恢复实现提交 **`322fbfd0288a26ba56c7b0b02d0598ab680d5dd7`**，本机 APK **1.1.3-band-readonly / code6**，**16,852,478 bytes**，SHA-256 `a7f20c1c38b416a6ece12db5f5e07db7852b2848ab7ad58a0fe91610609bac75`。最终定向 **62/62**；未过滤 JVM **741/741 / 81 suites / 0 failure/error/skip**，Lint **0 errors / 20 warnings / 1 hint** 与 1.1.2 逐项完全一致；单次 testDebugUnitTest / lintDebug / assembleDebug **14m30s / exit0**。APK 实际二进制版本、v1/v2 签名和 SHA 已核对，公开证书与既有 1.1.2 及正式 RPK 0.2.5 相同。1.1.3 尚未安装，当前目标手机最后核验版本仍为 1.1.2/code5。

首次 NO_DEVICE / 暂时 SERVICE_UNAVAILABLE / TIMEOUT 失败后，由同一个应用连接 job 按 2/5/10/30/60 秒延迟恢复，之后保持 60 秒上限；成功即停止。自动尝试 requestAuthorization=false，不新增权限弹窗、FGS、alarm 或 wake lock；系统休眠可能延迟执行，不承诺准点。身份、授权、多设备或监听清理不确定等非暂时错误停止并锁存；晚到事件/发送成功不能覆盖停止状态。关闭伴侣、维护 pause、source 退役、close 与进程 scope 取消所属重试，合法新 source owner 重新接线。SDK ready 不代表 HELLO 或 SNAPSHOT 成功。

实际 TDD：39 项/12 FAIL（原缺口）→57/57；审查追加 60 项/2 FAIL、62 项/4 FAIL→62/62。包括真实 Coordinator+OwnedTransport 集成空节点恢复、退避/并发、自动授权隔离、owner 清理/旧事件、永久拒绝及晚到 HELLO/SDK-ready 发布。原 OwnedWearTransport 的不确定清理 quarantine 保持；只改协调器、三处相关测试及版本号，共五个手机实现文件，无删除。Room v4、12 个协议 JSON 镜像、业务算法/备份/权限/依赖与签名配置保持。

本轮 RPK 0.2.5 原字节重新验签/内容/CRC/三项篡改拒绝及154/154检查通过，未重建。独立代码审查无阻断，root 再解析 XML、比较21项Lint、核对88个冻结文件及新APK二进制/签名。此代码审查不冒充 ChatGPT 的最终模块独立验收。

新版真机安全核查、覆盖安装和自动恢复尚待用户在对应步骤确认；不点“重新连接设备”或“检查腕端应用”进行恢复观察，避免掩盖缺口。原 1.1.2 + 0.2.5 的真实 IDLE PASS 与锁屏重进 USER_REPORTED_PASS 保留，不重复定义为待首次测试；其他状态、长文本/过期/重连与 30 分钟正常使用仍待验收。Module 03 整体未最终验收，不进入 Module 04。

## 追加：1.1.3安全安装、初始空节点自动恢复与自主试用

1.1.3 已按当前同意安全覆盖：实际首页空闲、code5→6、已安装 APK 摘要与交付完全一致；无卸载/清数据/降级/重签/原始数据库访问。

首次 NO_DEVICE 真机自动恢复已通过：用户同意在首页空闲时关闭蓝牙，并仅重启 Mirra 一次。冷启动 PID1642 实际 NO_DEVICE/无握手/无快照；恢复蓝牙后同 PID 自行发现9Pro并恢复服务/授权。正常腕端退出重进后用户确认“已同步”，实际手机捕获新握手与11:51:21完整发送，安装检查仍“尚未检查”。未点手机重连/安装查询依用户明确确认；SDK ready 与业务成功分段记录，旧1.1.2 IDLE/锁屏验收继续保留。

用户随后明确认为逐项手动验收效率过低，要求自主开发、自然使用遇到问题再反馈；自述约5分钟体验正常，未逐项确认覆盖或回复版本，不扩大为全部状态通过。不再逐项指挥或要求重复同样流程。30分钟改为低频只读观察，缺失指标/腕端画面如实注明；安装/签名/系统权限仍保持明确授权边界，不进入 Module04。

已实际采集手机“启动准备”与“正在阅读/阅读中”的正常状态；腕端第一步文本用户确认与准备页一致。正常使用观察开始UTC03:57:28，预计至少04:27:28，手机基线100%、系统报告AC充电；当前低频采样仅保存固定状态/时间、电量和PID，跳过非Mirra前台，不抓通知、书名/笔记正文、不注入触控或访问数据库。未称30分钟已完成、消息总数/精确RTT/全连接失败计数均无现成计数器。

### 观察结束与交付分级

观察窗口已实际结束：UTC2026-10-12T03:57:28.0770927Z→2026-10-12T04:27:28.934Z，墙钟30.01分钟。自动低频采样从2026-10-12T04:09:51.854Z开始，实际5次，ADB读取失败0次；仅1次在Mirra前台取得固定状态（正在阅读、阅读时长8分钟、阅读中），其他前台不读UI。所有样本PID1642；手机100%→100%，系统报告AC充电。同步总数/精确RTT/全连接失败/腕端电量/放电耗电不可取得，诊断页同步时间样本为0不等于无线消息为0。此项是有缺口的被动观察窗口，不能写连续30分钟阅读或通信稳定性全PASS。

当前工程交付完成、核心安全安装及自动恢复真机通过；用户约5分钟正常体验反馈保留。完整Module03独立最终验收尚未完成，不把本机代码审查替代ChatGPT独立review，不把未取得的状态画面/无线字节预算/指标扩大为PASS。用户改自主试用，后续按实际问题修复，不逐项追验，不进入Module04。
