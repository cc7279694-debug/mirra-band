# Module 03 — 只读伴侣与腕端 UI 滚动 checkpoint

日期：2026-10-11（Asia/Shanghai）。

状态：**MODULE_03_DEV_COMPLETE_AWAITING_DEVICE_ACCEPTANCE**。本文件是本模块唯一滚动 checkpoint。代码、配套构建与本轮自动化门禁已通过；必要真机验收未执行，不能宣布 Module 03 端到端完成，也不能进入 Module 04。

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

Node 24.18.1 与固定 `aiot-toolkit@2.0.5` 实际完成最后一轮 live/demo 构建。RPK 的 RSA-SHA256、内容/文件摘要、签名元数据、ZIP CRC32 与篡改拒绝检查通过；APK 的 apksigner 验证通过。两种 RPK 串行构建，未修改全局工具链。

本次构建 APK 与 live RPK 的公开证书指纹相同：`29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9`。**包含已安装物理手机 APK 的三方指纹匹配尚未核对**；构建匹配不能证明可覆盖用户手机或目标固件认证。

## Why / Key Decisions

1. 手机继续拥有 Intent、Session、监测与学习记录，腕端只展示手机已确认事实；本轮不加入远程控制、云服务或新账号。
2. 复用真实官方 SDK 实现，固定官方附件/AAR 摘要；附件没有明确再分发许可，因此 SDK 二进制留在 Git 忽略的本地目录，源码提供固定摘要取得方式，不提交 AAR。
3. 沿用既有手机身份。签名格式转换仅使用用户明确授权的本机材料，秘密留在忽略目录；不重新生成正式身份，也不卸载、清数据或降级手机应用。
4. 采用已批准的深色颜色与小屏信息顺序；不重新设计 Logo、不改变手机技术栈、不添加 TypeScript 预编译层。
5. 新鲜度属于腕端接收上下文，不拿两台设备 wall clock 相减。工程初值为请求超时 3 秒、活动查询 5 秒、空闲查询 15 秒、活动/空闲过期 15/30 秒；一次一个在途请求，可见时有界退避。终止拒绝保留到显式重试或新的前台周期。
6. 未证明 Vela 单调时钟，使用 Date 连续性检查的保守路径；插值只改善展示，不生成学习事实。正式失联、SOURCE_BUSY/DISABLED 与监测中断不能显示健康专注。
7. 两个仓库使用各自功能分支。原手机工作区与未提交工作保留，Android 增量放已授权隔离 worktree；不合并 main、不创建 PR、不开始 Module 04。

## Verification / 原始结果

以下结果来自本轮现有构建日志和报告；本 checkpoint 编写没有再次测试、构建或操作模拟器。

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
- 物理手机尚未连接：已安装 Mirra 版本与公开证书核对、安装 APK/live RPK 后数据保留与“三方签名一致”均 **Not Run**。
- 国行小米手环 9 Pro 真实官方 SDK 消息往返、至少三次随机 requestId、256/1024/2048/4096 字节与中文/emoji 消息预算均 **Not Run**。
- 正常监测学习 → 手机锁屏/后台 → 腕端重开取最新状态的主场景，以及真实断连、结束重连、强停、撤权和重新授权均 **Not Run**。没有将 AVD 或 mock transport 当作成功证据。
- 正式腕端专注、准备、休息、断连、未监测、保存中六类实际运行画面 **Not Run**；中文截断、触控、圆角、安全边距、留白与 336 × 480 可读性仍待真实 Vela/目标设备验证。浏览器设计预览不能代替截图。
- 用户已批准 Logo 的可直接复用 raster 适配素材尚缺，继续保留 Module 02 临时 icon，属于明确视觉遗留；未自画替换，也未宣称 Logo 已最终产品化。
- 至少 30 分钟真实阅读的查询数量、延迟、重进恢复、断连和两端电量观察 **Not Run**；不承诺后台常驻、息屏连续通信、振动或续航表现。
- OEM 差异、其他 Android API、TalkBack、release/Play 分发尚未验证；Node 页面 harness、同签名本地构建、官方 SDK 存在均不能替代上述证据。

## Git / Next Stage Should Inherit

| 仓库 | 分支与基线 | 本 checkpoint 编写时状态 |
| --- | --- | --- |
| Band | `codex/module-03-readonly-companion`，基线 `e450dc1dfb4194dfb755371eddeb740d30cb3700` | 构建对应代码提交 `88bd77b1582f268b2dda3785fd8b46dc2b2e8fec`；交付文档另有提交，最终 HEAD/远端以 Git 为准 |
| Phone | `codex/mirra-band-readonly-bridge`，隔离工作区 `E:\CODEX\mirra-watch\.local\android-worktree`，实际基线 `1338b9a4e41788082f30bf3894a974c2ff652630` | 构建对应代码提交 `e00be0a5d59f9dad892b8c26128c8c3d17149f70`；交付文档另有提交，最终 HEAD/远端以 Git 为准 |

下一步仍属于 **Module 03**：用户连接真实手机/手环后，核对已安装身份并完成配套覆盖安装、锁屏主场景、六类 UI 实拍与 30 分钟观察。遵守现有安装/权限授权，签名或版本冲突时保留用户数据并停止对应安装。自动化与构建已通过，失败历史和最终结果保留在统一证据索引；本模块两个功能分支分别提交与普通 Push，禁止覆盖 main 或强推。

若自动化与构建均通过而必要真机项目仍未执行，停止点只能写 `MODULE_03_DEV_COMPLETE_AWAITING_DEVICE_ACCEPTANCE`。只有真实只读链路、手机锁屏主场景、正式 UI 与适用回归均有证据，才可写 `MODULE_03_COMPLETE_AWAITING_REVIEW`。未获用户验收与下一模块授权，不进入 Module 04。
