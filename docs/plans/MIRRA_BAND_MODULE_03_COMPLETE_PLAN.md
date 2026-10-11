# Mirra Band Module 03 — 真实只读伴侣与 UI 产品化完整方案

> For agentic workers：执行时使用项目已安装的 executing-plans 或等价工作流，按本文件的内部任务推进；内部测试、审查与提交不是用户审批节点。用户要求完整功能交付，不再逐项进行文档冻结。本文是规划与实施合同，不代表代码已实现，也不代表已获手机真机操作或私钥导出授权。

**日期：** 2026-10-11  
**目标版本：** Mirra Band 0.2.0（承接 0.1.0 演示原型）  
**Goal：** 用户在手机开始学习、将手机放到一旁，打开手环 Mirra 后能看懂真实学习状态、时间和书籍；断连、未监测、保存中不会伪装为持续专注，同时界面达到可日常使用的品质。  
**Architecture：** Android 是唯一业务事实源。腕端通过官方穿戴 SDK / 小米配套服务 / Vela Interconnect 请求完整、只读、版本化快照，不直接访问数据库，不重新推断学习状态。  
**Tech stack：** 沿用 Kotlin / Compose / Room v4；腕端沿用 Vela .ux / 原生 JavaScript、已锁定的项目工具链。新增 SDK 必须来自可核实的官方来源。  
**Spec：** 本文件第 1–12 节为产品与架构合同；第 13–16 节为实施和验收计划。

## 0. 一次性交付与授权边界

用户已报告 Module 02 真机安装和测试均无问题，并明确指出 UI 不够好看。将其记录为“技术原型真机测试通过（用户反馈）；视觉尚未接受为正式产品”，无需再制造一次纯文档冻结任务。

本轮从演示程序走向真实只读伴侣，整体完成后独立验收。SDK 可用性、签名安全和真机消息往返是实际工程检查点，不是另起三个文档模块。工具条件满足时连续实施；需要用户安装、点权限时只提出真实必要的操作。

本文可交给 Codex 执行，但开始修改手机仓库前必须获得该工作区访问权限，并明确把“手机只读桥接与配套设置”纳入本轮授权。原“手环原型禁止修改手机”的约束仅对这个新增范围局部放开，绝不扩展为修改学习算法、数据库、签名身份或个人数据。

## 1. 已知事实、工程假设和未知项

### 1.1 已知基线

- 手环仓库：`cc7279694-debug/mirra-band`。
- Module 02 远端分支：`codex/module-02-standalone-prototype`。
- 已核对基线：`e450dc1dfb4194dfb755371eddeb740d30cb3700`。
- 现有原型身份：`com.guanyi.mirra.band.demo`，独立演示证书，版本 0.1.0。
- 现有代码为 .ux + JavaScript，页面脚本与模型/计时/诊断分离。当前通信诊断不收发正式业务消息。
- 用户设备：国行小米手环 9 Pro，可安装第三方 RPK；用户提供了运行照片及测试正常反馈。
- 官方目标尺寸为 336 × 480；本仓库已使用 `designWidth: 168`。样式中的设计单位不等于 Android dp。[S1]
- 手机仓库：`cc7279694-debug/Self-discipline`。本次只读核查锚点为 `b005ed1d85afd8f7abef15d6be65d39898f637fc`，不是命令用户回退到该提交。
- 手机已有 Session/Intent/Segment、监测覆盖、Closeout、Room v4 和备份恢复的存储代际门禁。[S6][S7][S8]

### 1.2 尚未得到证明

实际 SDK 分发包及许可、手机现用小米配套 App/服务版本、用户固件 APILevel、手机已安装 APK 的签名与本地可用签名材料是否一致、真机应用消息往返、手机锁屏/后台可达性、息屏后腕端生命周期，均需本轮验证。

官方文档提供接口不等于目标设备已连通。本次已读官方 Interconnect 及其链接的 Android SDK v1.4 PDF；PDF 不是已解包、编译和真机验证过的 AAR。[S2][S3]

Node 24 / 2.0.5 在 Module 02 的构建成功可沿用，但不要扩展成所有后续 SDK 工具均兼容。保留 lockfile，不顺手升级整个工具链。

## 2. 产品范围

### 2.1 必交付

1. 正式只读 RPK，默认连接真实手机，不自动落入模拟数据。
2. 当前学习/准备状态、书籍、当前页码、真实语义的时间显示。
3. 休息、临时用途、分心、恢复、未监测、保存中、结束结果的正确呈现。
4. 断连、数据过期、初次连接、权限不足与同步中的明确界面。
5. 手机“我的 → 手环伴侣”设置页，具备开启、关闭、连接检查和结果说明。
6. 一套深色、低干扰的小屏正式视觉，而不是给旧测试页换色。
7. 兼容现有手机安装签名的新 APK、正式 RPK、配套版本与协议说明、自动化证据及真机验收说明。

### 2.2 本轮不做

远程创建 Intent、确认开始、休息/继续/结束命令、修改页码、编辑笔记、手环独立记录、手环完整历史库、趋势图、手环后台常驻、主动分心震动、健康传感器分析、手环独立 HTTP、云账号/服务器、桌面 Codex 监控、手机大改版。

协议可以预留版本字段，但不实现空壳命令队列、离线写指令、万能插件层或双向数据库同步。双向消息仅用于握手、请求和响应；不是双向业务控制。

## 3. 路线选择

**采用：原手机 Mirra 内置只读通信桥。** 不额外要求用户安装第三个自研桥接 APK；腕端与手机分别构建，数据仍只归手机管理。

**暂不采用：额外独立 Bridge App。** 它会增加安装、权限、跨 App 数据访问和故障面；仅当正式签名无法安全使用时，才另行讨论，不默认改造为该路线。

**通知同步只作后续提醒通道。** 它不能替代可查询的学习状态，也不能证明腕端快应用在后台常驻。SDK 文档明确区分应用消息与通知，通知送达时腕端应用未必感知。[S3]

不使用通用 BLE/GATT 或手环 fetch 作为绕路方案；当前官方支持表没有把手环 9/9 Pro 列为这些 API 的支持设备。[S4][S5]

## 4. UI 产品化设计合同

### 4.1 视觉方向：深墨色 + Mirra Blue

这是本轮提出的腕端设计修改，不是声称旧规格本来如此；只调整腕端，不改变手机主题。

建议首版 tokens：

| 用途 | 值 |
| --- | --- |
| 页面背景 | `#0B0F14` |
| 次级表面 | `#151C25` |
| 主文字 | `#EEF3F8` |
| 次级文字 | `#A6B2C3` |
| 核心强调 | `#6598E8`，延续现有 Mirra Blue |
| 弱提示 | `#D7B77A`，须搭配文字，不用于能力评价 |

一屏一个视觉重点。正常学习以大时间为核心；准备以第一步动作为核心；断连以原因和恢复入口为核心。正常状态不堆按钮，不用大块品牌标题占据顶端，不放连续段落解释。

禁止用无目标的环形百分比装饰成“专注完成度”。本轮不做复杂 Canvas/图表；阅读进度条若采用，只可表示真实页码/总页数，并明确是书籍进度。它是可删减的次级元素，不得挤压主要内容。

### 4.2 版式与可达性

沿用 168 × 240 设计坐标，实际屏幕 336 × 480。左右起始安全边距 12 设计单位；顶部/底部至少 10，结合真机圆角调整。

首页内容顺序：小状态/连接标记 → 主时间或动作 → 时间标签 → 书名与当前页 → 一个弱化的“详情”入口。连接有问题时，主动作改为“重新连接/重试”。健康连接不展示开发者术语。

时间采用平台可用的清晰数字字体，不下载外部字体。短计时建议 36–40 设计单位；长时间采用 `1小时25分` 或减小字号，不能挤出边界。状态约 14–16、书名 12–13、辅助文字 10–11。尺寸是验收起点，不得以数值满足代替真机可读。

可点击区域起点至少约 32 × 32 设计单位，主按钮高度约 32；不得宣称这等于 Android 48dp。重要操作不能依赖长按猜测或小图标命中。保留系统返回，详情页可滚动。

书名最多两行；第一步动作最多三行，超长内容可到详情查看。处理中文、数字、英文、emoji、空值；不能拆断 Unicode 代理对。普通短文案不得再出现照片中“句号单独占一行”。不使用跑马灯和持续呼吸闪烁来制造高级感。

### 4.3 首页状态呈现

| 手机事实/投影 | 首页表达 | 时间与动作 |
| --- | --- | --- |
| 尚未收到真实快照 | 正在连接 / 等待手机 | 不显示“未开始”或示例书 |
| 确认无活动 Intent/Session | 等待开始 + 主线书籍（若有） | 文本“请在手机开始”；不能假装有远程开始按钮 |
| 活动 Intent | 先完成这一步 + 手机解析出的 First Action | 可在详情显示准备经过时间，不用催促式红色计时 |
| 活动 FOCUS | 专注中 | 大时间标签为“本次已进行”，不是“有效专注” |
| DEEP_FOCUS | 深度专注 | 只在手机已提供该 Segment 时出现 |
| BREAK | 休息中 | 剩余时间；到零显示“休息时间已到”，等手机确认下个状态 |
| TEMPORARY_ALLOWANCE | 临时处理事情 | 剩余时间；不把它显示为分心惩罚 |
| DISTRACTION | 暂时离开了学习 | 中性引导；不传播当前风险 App 名称 |
| RECOVERY | 正在回到学习 | 不擅自倒数 90 秒或宣布已稳定恢复 |
| NONE/UNMONITORED | 阅读中 · 未监测 | 会话经过时间可显示，不显示“已确认专注” |
| PARTIAL/监测中断 | 阅读中 · 监测已中断 | 不把旧 FULL 继续显示为当前健康监测 |
| durable PENDING | 正在保存本次阅读 | 停止延长阅读时间，使用现有 closeout 边界；无新学习按钮 |
| 本次已结束 | 阅读已结束 / 记录已保存（仅已结算正常结果） | 定格手机结算值；异常结果明确说“本次学习已中断” |
| 备份/恢复维护或存储未就绪 | 手机正在处理数据 | 暂停快照读写，不能显示旧快照为实时 |
| 断连/过期 | 连接已中断 / 状态待更新 | 冻结最后确认值，说明“上次同步”；提供重试 |

真正的新数据与旧的结束记录不能混淆。结束小结只展示本次腕端已跟随的 Session 结果：请求中携带 lastSeenSessionId，手机只读校验该 ID；冷启动没有跟随记录时不把久远结束记录显示为“刚刚结束”。无需新增持久学习历史。

首页不是全部状态模板同时显示。UI 渲染必须由有效的结构化状态驱动，不能解析中文句子决定业务逻辑。

### 4.4 详情与帮助

主界面最多两个可见导航目标：“详情”“连接与帮助”，允许合并成一个详情入口再分区。详情可展示当前书名、页码、时间类型、监测情况及上次同步时间。完整诊断仅放二级页。

正式 RPK 首页去掉“测试模式”“选择测试状态”“切换状态”“未接入手机 Mirra”的固定占位。演示模式继续存在于独立 demo 构建，任何模拟页面必须带明显“演示数据”，断连时不得自动切到演示。

不新画或替换用户已选 Logo。腕端正式 Logo 复用必须有确切素材；若没有，保留现有临时资源并写明视觉遗留，不阻断其余产品化，也不宣称 Logo 已最终确认。

### 4.5 UI 验收不是编译通过

交付至少包括专注、准备、休息、断连、未监测、保存中六类实际运行画面。模拟器能跑则使用真实 Vela 截图；不能跑则记录，并安排目标手环实拍。浏览器预览只能标注为设计预览。

必须回答：一眼能否看到当前状态/核心信息？字体和触控是否可用？屏幕下方是否仍有失衡的大空白？重要文案是否被截断？正式首页是否仍像调试页？

## 5. 手机端用户体验

新增平面入口“我的 → 手环伴侣”，不放进“监测诊断（开发版）”。

首次用户主动点击“启用手环伴侣”后，解释仅同步当前书籍、动作、页码、状态与时间；不读取笔记正文，不上传我们的服务器。请求真实 SDK 必需的授权，不把其权限叫作“分心监测权限”。

正常页显示：已选择设备、手机服务可用性、腕端应用是否握手成功、最后一次完整快照时间、已知后台能力，以及关闭入口。不能用一个“已连接”掩盖不同层级的问题。

开启偏好长期保留，不要求每场学习重新开启。它只是用户选择，不是后台永久在线的承诺。若新增持久设置，使用独立的 device-local、no-backup 配置存储，不修改四项原有 portable preferences，不进入 Full Backup v1，不创建 Room 表。

只在用户明确启用且 SDK/设备授权成立后发送快照。关闭时取消发布与订阅，尽力发出 DISABLED；接收端收到后清空内存数据，未收到则在过期阈值内退为未知。选择新设备时旧流失效。

本轮不把腕端开关与勿扰、分心监测、跨应用干预开关绑定；不能开启手环功能就替用户开启或关闭监测。

## 6. SDK、签名与平台前提

### 6.1 官方链路

手机 Mirra → 官方 Android 穿戴 SDK → 小米配套服务/运动健康链路 → 腕端 `system.interconnect` → Mirra Band。

不需要自建云；但依赖现有小米配套 App 和服务，不能宣传为完全不依赖第三方组件或绝对没有第三方网络活动。对本产品数据是否离线传输必须进行真实离线验证。[S2][S3]

官方 PDF 描述 NodeApi、AuthApi、MessageApi、ServiceApi。接入时以实际官方 AAR/API 为准，不把 PDF 的历史版本当成现代 Android 兼容证明。不要使用含 SDK stub 的社区 demo 来假装链路成功。

权限仅申请实现消息所需最小集合；v1.4 文档提到首次授权可能默认含 NOTIFY，若实际 SDK 如此应如实披露，但本轮仍禁止主动通知调用。不主动申请健康/位置/麦克风权限。SDK 如需额外权限、账户或网络，列出确切要求和替代路径，不能静默添加。[S3]

### 6.2 签名处理

Interconnect 官方要求 APK 与 RPK 包名和签名一致。[S2]

正式目标：腕端 `package = com.guanyi.mirra`；Android `applicationId` 保持原值。分别位于两个运行平台，仓库继续独立。

现有 `com.guanyi.mirra.band.demo` 仍只用于演示，不改签名伪装正式手机。升级正式腕端时优先保留旧 demo；确需移除，只能针对腕端演示应用并经用户明确操作，不涉及手机。

开始前在本地核对：已安装 Mirra APK 的公开证书指纹、所选 Android 构建的证书指纹、RPK 证书指纹三者相同。证书 subject 名相同不代表签名相同。

不得重新生成 Android debug keystore 来“解决匹配”，不得更换现用 APK 签名、卸载手机或清除应用数据。若 keystore 只存于旧环境，必须找到用户已有可用签名流程；找不到则正式覆盖升级阻塞，不假设平台能迁移签名。

若 RPK 构建需要本地导出私钥格式，这属于安全敏感操作：单独得到明确许可，限定本地受保护且 Git 忽略的目录，不打印秘密、不发送聊天、不进入证据截图、不上传在线工具。构建代码先审查，签名步骤最后执行。归档仅公开证书指纹及产物摘要。

### 6.3 后台能力

Vela 官方说明普通应用退后台可能停止；Interconnect 不在该文档列出的常驻后台能力中。[S9]

本轮承诺重点是：腕端应用打开时查询；腕端息屏/退出时暂停本地刷新；回到前台重新握手和取快照。不把“抬腕亮屏”与“系统自动回到 Mirra”当作同一行为。

Android 桥接不要绑定在 Compose 页面生命周期内；页面离开不应人为停止服务监听。采用受控应用级 scope + SupervisorJob，异常不向学习主流程传播。手机锁屏可达性优先借助已正常运行的现有学习服务和 SDK 合法机制实测，不新增虚假类型 FGS、静音音频、定位保活、唤醒锁或通知轰炸。

不能仅凭“手环已经与小米运动健康配对”就假定 Mirra 获得 CompanionDeviceManager 的后台豁免。Android 的后台启动前台服务有约束；未来远程启动需另行验证。[S10]

前台→前台是链路证明，不是最终使用成功。主要验收必须包含手机锁屏/后台、正在学习时腕端重新打开。如果只能手机亮屏运行，报告 `FOREGROUND_ONLY_PARTIAL`，不得称可日常用的目标闭环完成。

## 7. 手机只读投影与存储安全

### 7.1 读取职责

新增窄职责 `WearableSnapshotReader`，一次短的只读 Room 事务取得：主线书籍/活动 Intent/活动 Session/相应 FocusContext/ActiveSegment，以及必要的本次已结束 Session。

活动 Session 的页码优先使用 `StudySessionEntity.currentPage`，不是可能尚未归并的 LearningItem.currentPage。空闲与准备阶段使用对应书籍页码。动作由手机复用 `FirstActionResolver` 解析；腕端不自行生成另一个默认动作。[S6]

Session + context + segment 必须为同一 ID/资源代际。不能仅把若干独立 Flow `combine` 成一个瞬时混合状态。Flow/事件可用作触发器，最终输出仍从短事务读取一致投影。

不得调用有过期回写、startup recovery 或 FTS 修复副作用的“读取”路径。协议请求绝不创建/放弃 Intent、修改 heartbeat、补齐 Stable、写入 FocusEvent。必要的新 DAO 只读查询可加，实体/索引/Schema/Migration 不改。

完整 JSON/CSV/Full Backup 不是腕端快照接口，不能直接复用其全量数据库导出。

### 7.2 显示真相

分别输出：业务阶段、当前 Segment、整场 MonitoringCoverage、当前监测可用性、Closeout 状态、时间类型及数据新鲜度。不能把 FULL 等同于“此刻一定专注”，也不能让蓝牙断连改变手机监测结果。[S7]

本轮大时间默认是会话经过时间，明确包括休息/临时用途/分心等经过的墙钟时段，不冒充有效专注。有效时长若没有现成可信只读接口，本轮不增加该数字，更不在手环根据状态自行累计。

从手机现有计时/边界规则形成 elapsed/remaining 快照；PENDING 使用已确定结束边界，已结束使用结算时间。非法时间、不可信时钟或关联缺失时返回 unavailable，而非零。

### 7.3 资源代际与恢复

当前 Android 已有 `StorageMaintenanceGate`，每个容器绑定自己的资源代际。只读桥不得绕过这一层。[S8]

每次读取只短时持有当前 owner 的门禁许可/既有读保护；SDK 发送、网络等待、重试不在 Room 事务或门禁内。恢复前停止接收业务快照请求，取消在途读取并排空 publisher；退役 owner 的回调不可取得新数据库实例。

恢复开始、资源重新绑定、手机桥重启、用户切换设备/关闭功能，均使协议 streamId 失效。新资源 OPEN 且 startup 完成后重新握手并取完整快照。不得因恢复后的数字变小把合法新数据当作旧数据丢弃。

备份/恢复期间返回不带旧个人内容的 `SOURCE_BUSY`；允许安全地暂停整个穿戴接口。未知安全状态宁可停止展示，不得影响恢复 Journal 的原子性或原数据保护。

## 8. 协议 v1：小而完整

### 8.1 初版采用请求/响应，不做复杂推送系统

腕端打开立即 HELLO / GET_SNAPSHOT，之后仅在可见时定时请求完整快照。这样先保证新鲜度和断连判定，不需要消息队列、增量合并、ACK 历史表或后台推送 worker。

协议消息：

| 类型 | 方向 | 含义 |
| --- | --- | --- |
| HELLO | 腕→手机 | 协议能力、腕端本次 clientInstanceId、随机 requestId |
| HELLO_ACK | 手机→腕 | 回显 requestId/clientInstanceId、版本、只读能力及新 streamId |
| GET_SNAPSHOT | 腕→手机 | 在当前 stream 请求完整快照，携带可选 lastSeenSessionId |
| SNAPSHOT | 手机→腕 | 回显本次 requestId，给出新读取的完整状态 |
| STATUS_ERROR | 手机→腕 | BUSY、DISABLED、UNSUPPORTED_PROTOCOL、SOURCE_UNAVAILABLE 等 |

不存在 START、FINISH、SET_PAGE、GRANT_ALLOWANCE 等业务写命令；一律拒绝，不默默进入未来分支。

### 8.2 消息封装与字段

所有消息有 `protocolVersion`、`type`、`clientInstanceId`、`requestId`。握手后增加 `streamId`。SNAPSHOT 另有严格递增 `sequence`、`sourceObservedAtUnixMs` 和 `body`。

快照 body 的白名单：

- `phase`: IDLE / PREPARING / ACTIVE / SAVING / ENDED；未知枚举拒绝。
- `intentId`, `sessionId`, `learningItemId`: nullable，明确标识合法归属。
- `bookTitle`, `currentPage`, `totalPages`, `firstAction`: nullable + 展示截断标记。
- `segmentType`: FOCUS / DEEP_FOCUS / BREAK / TEMPORARY_ALLOWANCE / DISTRACTION / RECOVERY / UNMONITORED / null。
- `coverage`: FULL / PARTIAL / NONE / null。
- `monitorAvailability`: AVAILABLE / UNAVAILABLE / UNKNOWN。
- `elapsedMs`, `remainingMs`: nullable、有限、非负、安全整数。
- `timerKind`: NONE / PREPARATION_ELAPSED / SESSION_ELAPSED / BREAK_REMAINING / ALLOWANCE_REMAINING / FINAL_SESSION_DURATION。
- `endType`: 手机原值或 null；未知值不能解释为 NORMAL。

不发送笔记正文、JPEG、风险 App 清单/当前包名、DND ruleId、token、AuthKey、内部路径、完整数据库、用户账户或健康数据。

`sourceObservedAtUnixMs` 只用于人类诊断，不用两台设备的 wall clock 相减判断新鲜度。其值是快照采样时间，不表示健康的连续监测证据。

### 8.3 新鲜度和请求归属

以下均为本项目初始工程参数，不是小米官方承诺：

- HELLO / 单次 GET 超时：3 秒。
- 活动/准备/保存状态查询间隔：5 秒。
- 已确认空闲时查询间隔：15 秒；手动刷新立即查询。
- 活动快照可展示为近期同步的期限：15 秒；空闲快照：30 秒。
- 明确 onclose / 服务断开 / 权限丢失：立即变为断连，不等待期限。
- 每端最多一个在途请求；新请求取代旧请求时旧 requestId 作废。
- 断连后仅在腕端可见时按 2/5/10/30 秒上限退避重试，隐藏即停；手动重试重置退避但不并发。明确“不支持/未授权/身份错误”不持续自动重试，显示对应操作入口。
- 仅匹配当前 clientInstanceId、requestId、streamId 且在期限内完成的请求响应，才更新新鲜度。
- requestId 每次唯一，不能在 timeout 后复用；同一 stream 的 sequence 必须大于已接受值。迟到/重复响应忽略，不延长实时期限。
- 超时期间显示“更新中”，到期冻结最后确认值并标过期；不得无限维持绿色“专注中”。
- 底层通道恢复不直接变为实时，必须新握手及全量快照。

sequence 仅在本次 stream 内有意义；进程/存储代际变化重建 stream。心跳或裸发送成功不能替代快照，也不能单独刷新学习数据新鲜度。

### 8.4 包大小、安全输入与恢复

JSON 使用 UTF-8；校验的是实际编码字节。项目初始上限 4 KiB，每次一份紧凑快照，目标通常不超过 2 KiB。这个上限必须用真实 SDK 和目标设备测试；若平台限制更小，缩小预算并缩短展示字段，不先引入分片系统。

书名 wire 上限 120 个 Unicode code point、动作上限 180；仅截断展示副本并标记，手机原文不变。ID 长度设定界限；非法 JSON、超大消息、深层对象、危险原型键、无穷值/负时长、越界页码、外来设备/node、过期响应都拒绝。不得使用 eval 或对象任意合并。

正式 transport 单例拥有 onmessage/onopen/onclose/onerror，页面只订阅 store。现有 Connection 诊断页不能再覆盖相同 singleton 回调。

### 8.5 腕端计时

手机每次返回已确认的 elapsedMs / remainingMs，腕端刷新不产生学习事实。

若目标运行时有已验证的单调时钟，可在前台做短区间插值：收到快照值 + 本地经过时间，最多展示至当前新鲜度期限；休息归零不自动转换状态。插值仅改善展示，不写回手机，不计为有效专注。

不假设浏览器 `performance.now()` 在 Vela 可用。若没有可靠单调时钟，用前台 Date.now 锚点的保守路径：每次刷新检查回退或异常跳跃；异常立即冻结并重新请求。任何 hide/show、新进程、长时间调度空档都使插值与旧新鲜度失效。无法证明时钟连续时宁可只显示每次手机确认值，不展示伪精确逐秒变化。

连接中断时恢复到最后一次手机确认的数字并冻结，不把先前插值当成真实结束时间。允许看到明确的修正，不能为了数字只增不减显示错误事实。

## 9. 手机锁屏、关进程与电量

实际主场景：手机已开始正常监测学习 → 手机锁屏 → 腕端打开 Mirra 请求状态。必须在目标组合上完成，不能只做两边前台 demo。

手机无监测服务的 Session、手机应用被强停、小米服务被停止、用户关闭蓝牙等场景单列。没有合法可达机制时显示未知并指导用户打开手机；不伪造重连成功，不自动启动或恢复 Session。

腕端隐藏时立即清除 interval/timeout/请求，退出释放自己持有的订阅；手机超时取消请求作用域和旧 listener。不得每秒发送完整快照，也不得全天轮询。未启用手环功能时无扫描、无循环消息、无新的常驻服务。

记录至少 30 分钟现实使用观察中的查询数量、延迟、断连、重开恢复与两端电量变化。短测电量只作观测，不能外推“续航 N 天”。

## 10. 隐私与构建配置

本轮只需当前学习信息；不持久化腕端业务快照，不增学习数据库。退出/关闭时清理内存，避免跨用户或跨手机遗留书名。无需读取微信消息内容、截图、传感器或全部 App 清单。

新增手机连接偏好/SDK设备授权只留本设备，保持 Android 系统备份排除策略。SDK新增清单项、传输依赖及权限逐项审阅；新增依赖不能绕过既有备份策略。

已有工具链审计风险继续记录。不要为追求“零告警”运行 npm audit fix --force 或全栈升级；不对不可信仓库/ZIP 执行任意脚本。应用构建与持钥签名尽可能分离。日志保留时间、消息类型、大小、版本、错误类别即可，默认不记录书名/原始 payload/设备永久标识。

签名摘要验证不代表小米固件认证或官方商店资格；正式 RPK 的 release 字样也只是构建模式，不代表商店发布。

## 11. 两仓库工程组织

不新建第三个业务仓库。继续在 `E:\CODEX\mirra-watch` 的 Codex 工作会话推进；把实际 Android 仓库/worktree 加为明确授权工作区。另一目录实际位置必须核实，不从聊天中的旧路径猜测，更不能扫描全盘寻找密钥。

手环建议新分支：`codex/module-03-readonly-companion`，从已验证 e450dc1 完整 SHA 创建，不从只有 README 的旧 main 开始。

手机建议新分支：`codex/mirra-band-readonly-bridge`。启动时只读核对实际 HEAD、未提交改动、当前可安装构建来源。b005ed1 是本次已读的 V1 锚点；若本地已有更新，保留更新，记录实际集成基线。不能 reset、强制 checkout、覆盖用户未提交改动或偷取旁边会话的工作。

若存在相关未提交修改不能安全隔离，说明具体冲突；无关改动原样保留，在新 worktree 实施。两个仓库分别提交与 Push，不自动 merge main/release。

### 11.1 现有可复用文件

腕端：`src/app.ux`、`src/pages/Home/index.ux`、`src/pages/Connection/index.ux`、`src/common/theme.css`、`src/lib/demo.js`、`src/lib/ticker.js`、`src/lib/interconnect-diagnostic.js`、构建/包校验脚本与既有测试。

`demo.js` 保留为独立演示数据源。live 首页改依赖 presentation store，不继续默认调用 getDemo。diagnostic 改为观察正式 transport，不能两处争抢回调。`check-project.cjs` 与 `inspect-rpk.cjs` 当前硬编码 demo 身份；改成按构建 profile 严格核验预期包名/证书/能力，不是删除身份检查。

手机：`AppContainer.kt`、`MirraApplication.kt`、`StorageMaintenanceGate.kt`、`Entities.kt`、`FocusEntities.kt`、相关 DAO、`ProfileScreen.kt`、现有应用启动与备份生命周期。只接入必要 hook，不重写现有核心状态机。[S6][S7][S8]

### 11.2 建议新增文件（路径为本轮设计，不声称已存在）

腕端：

- `src/lib/companion-protocol.js`：严格编码/解析、字段检查。
- `src/lib/companion-store.js`：握手、请求归属、快照/连接/新鲜度状态。
- `src/platform/interconnect-transport.js`：唯一平台回调所有者。
- `src/lib/companion-timer.js`：有界显示插值与生命周期失效。
- `src/pages/Detail/index.ux`：信息与连接帮助。
- `protocol/v1/schema.json` 与 `protocol/v1/fixtures/`：协议事实源和跨端 golden fixtures。
- 对应 `tests/companion-*.test.cjs`，沿用 Node test runner。

手机建议收拢在 `app/src/main/java/com/guanyi/mirra/wearable/`：

- `WearableSnapshot.kt`、`WearableSnapshotReader.kt`、`WearableProtocolCodec.kt`。
- `XiaomiWearTransport.kt`：仅适配真实已核实 SDK。
- `WearableCompanionCoordinator.kt`：独立故障域、启停、授权与资源代际。
- `WearableLocalSettings.kt`：独立 no-backup 配置。
- `WearableSettingsScreen.kt`：用户入口。
- 对应 `app/src/test/.../wearable/` 和 `app/src/androidTest/.../wearable/`。

手机/手环不共享数据库模型代码；共享协议样例。协议主文件放手环仓库，Android 测试带固定版本镜像，交付记录写明两侧文件摘要一致，不新建第三个 npm 包或服务器。

## 12. 关键接口设计

建议接口，仅约束职责，具体 SDK 方法必须通过 AAR 编译确认：

- Android `WearableSnapshotReader.read(request: SnapshotRequest): SnapshotReadResult`：返回 Ready(snapshot) / Busy / Unavailable，不含任何写副作用。
- Android `WearableCompanionCoordinator.enable()`、`disable()`、`onStorageUnavailable()`、`onStorageReady(owner)`：监听/取消受控；不会调用学习控制接口。
- Transport `send(peer, utf8Payload)`、`observeMessages()`、`observeConnection()`、`close()`：仅 SDK 边界，不访问 Room。
- 腕端 store `start()`、`stop()`、`requestRefresh()`、`snapshot()`：维护单个请求与当前展示事实。
- 腕端 `decodeMessage(payload, expectedContext)`：拒绝无关/过期/错误版本消息。

协议服务以白名单路由；单个请求超时后取消自己，不取消父学习 scope。手机 reader 执行应远离主线程，且数据库锁外发送响应。

## 13. 实施计划：一个完整 Module，五个内部任务

每个任务使用 RED → 最小实现 → GREEN → 范围审查 → 提交。不要每个任务结束让用户回 ChatGPT 盖章，不单独创建 freeze commit。新增文档只保留本方案、一个滚动 checkpoint 和脱敏证据索引。

### Task A — 安全打通真实链路

**产出：** 明确签名匹配、真实 SDK、前台双向 challenge/response、锁屏初步可达性；同时做正式 UI 的组件骨架，不再交付单独调研模块。

- [ ] 核对两个工作区、构建版本及手机已安装公开证书指纹，保护现有数据与未提交工作。
- [ ] 从官方 Interconnect 附录取得 SDK/demo，在本地检查 AAR 真正包含实现、许可证、版本、依赖与权限；禁止 stub。
- [ ] 先为 transport 的超时/掉线/重复回调写测试，运行确认失败，再实现唯一回调所有者。
- [ ] 按实际本地签名安全流程构建最小匹配身份的 APK/RPK；不替换手机 signer。
- [ ] 真机消息回显至少三次随机 requestId；检查 256/1024/2048/4096-byte 字符串及中文实际编解码可行预算。
- [ ] 提前测试手机锁屏、切后台和腕端重新打开；识别链路硬限制，避免最后才发现产品主场景不成立。
- [ ] 提交 `feat(wearable): establish verified local transport`（两个仓库分别提交）。

没有设备控制权限时交付最小诊断构建让用户安装，标明 `AWAITING_DEVICE_LINK_TEST`；其余协议与 UI 实现可继续，不能用 fake 把这一步勾为通过。

### Task B — 跨端协议与手机只读快照

**文件：** 上述协议/reader/codec、必要只读 DAO、双端协议 fixtures。

- [ ] RED：无快照不是 IDLE；非法/外来 requestId 拒绝；UNKNOWN/FULL/PARTIAL 分开；ACTIVE Session 页码优先；PENDING 时间停止；session/context/segment 不匹配拒绝；读取故障不能静默 EMPTY。
- [ ] RED：JSON round-trip、中文/emoji、安全整数/空值、4KiB 上限、未知版本/命令、重复/乱序、source epoch 切换、真实与模拟模式隔离。
- [ ] 实现一次有界、受门禁保护的只读事务与最小快照投影，完成协议 v1。
- [ ] 在真实 Room 集成测试中核对请求前后 12 表业务事实完全不变；外来/畸形输入也不能产生变化。
- [ ] 运行两端 golden fixtures、一致性与 targeted 测试；提交 `feat(wearable): expose coherent read-only study snapshots`。

### Task C — 腕端正式 UI 与新鲜度

**文件：** Home/Detail/Connection、theme、companion-store/timer、demo/live build profile。

- [ ] RED：3秒超时、5秒轮询、不重叠请求、15/30秒过期、迟到响应不能重获实时、明确断连立即冻结、重开前台必须重新请求。
- [ ] RED：时钟倒退/大跳、无单调时钟降级、长计时、倒计时零点、结束/PENDING 不继续累计、hide/show 不叠加定时器。
- [ ] 实现深色版式与产品状态表；正式首页不出现测试按钮、不自动填示例书。
- [ ] 实现完整演示 profile 使用同一 presentation UI 验证边界，但持续标注演示。
- [ ] 实际 Vela/手环画面审阅六种重点情形，修复截断/圆角/触控/不均衡留白；不把网页示意当运行证据。
- [ ] 提交 `feat(band): ship product UI with honest connection states`。

### Task D — 手机设置、生命周期与既有功能保护

**文件：** WearableSettingsScreen、独立 LocalSettings、AppContainer/MirraApplication 必要 hook、维护生命周期测试。

- [ ] RED：默认关闭、主动启用、持久选择、权限拒绝/撤销、关闭后不发数据、旧 node/stream 失效、SDK错误不使手机崩溃。
- [ ] RED：恢复中拒绝读取、退役 owner 不重开数据库、无锁等待SDK、restore后旧回调无效，新流允许合法更小数字；原 Full Backup 仍成功。
- [ ] 实现平面设置入口，最少权限说明；与分心监测/勿扰设置保持独立。
- [ ] 真机测试手机正常学习→锁屏→腕端重进获取真实状态，并验证关闭伴侣不影响 Session。
- [ ] 提交 `feat(wearable): integrate opt-in settings and safe lifecycle`。

### Task E — 全量回归与交付

- [ ] 腕端运行 `npm.cmd run check`、`npm.cmd test`、已定义的 demo/live build 命令、产物/签名/秘密检查；如改 build script 则同步命令文档。
- [ ] Android 执行 `testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleDebugAndroidTest`，在健康隔离 AVD 上执行完整 unfiltered connected；专有链路真机测试单列，AVD 不替代。
- [ ] 复验 Intent→Session、监测与撤权、Closeout、笔记、备份恢复、JSON/CSV、冷启动、已有权限与数据保留。读取协议不触发这些业务变化。
- [ ] 完成下方目标手环验收矩阵、记录 UI 与链路实际证据。
- [ ] 更新一次 checkpoint/README，分别 Commit/Push；给出两端 SHA、版本、证书指纹、文件大小、摘要及共同协议版本。

## 14. 验收矩阵与成功标准

| 场景 | 要求 | 证据类型 |
| --- | --- | --- |
| 首次安装 live 两端 | 兼容覆盖手机安装，身份匹配、数据保留 | 实际设备；仅公开证书与摘要 |
| 手机前台 + 腕端前台 | HELLO/完整快照往返，非模拟 | 真机消息计数 + UI |
| 正常监测学习→手机锁屏→腕端重开 | 能取得新 Session 快照，计时/页码对应 | 目标手机/手环实际操作 |
| 手机进入休息/Allowance/Recovery/PENDING/结束 | 在有效查询周期更新，语义正确 | UI + 同时手机记录 |
| 无监测或撤权 | 保留会话、显示未监测/中断 | 真机与自动化 |
| 蓝牙断开/手机远离 | 明确回调立即断连；否则到期过时 | 真机，时间记录 |
| 迟到、重复、乱序、旧stream | 不覆盖较新内容、不刷新过期时间 | 双端确定性测试 |
| 手机结束后断连/重连 | 不继续旧 Session，重新取完整状态 | 真机 |
| 手机应用被强停 | 不自动伪造在线或重启学习 | 用户授权的安全测试 |
| 备份/恢复中 | 暂停并清理旧owner，恢复后新流 | 专用fixture，保护实际用户数据 |
| 腕端息屏/退出/重开 | 无后台常驻假设，不信任旧新鲜度 | 真机 |
| 一次30分钟日常阅读观察 | 重进/锁屏可用，消息有界，无明显崩溃 | 延迟/消息数量/电量观察 |
| 正式UI | 清晰重点、无测试面板、中文/长文本/触控 | 实拍/真实Vela截图 + 用户反馈 |

初始工程目标（不是已测结果）：健康链路下首次/手动刷新≤3秒，活动状态变化通常≤6秒；与手机核对会话时长误差目标≤2秒，无法满足须给实际分布与解释。只显示确认值的降级模式需注明刷新精度。不得为达指标隐瞒过期状态。

不按 62/607 等旧数字承诺新的测试总数；报告实际 discovered/pass/fail/error/assumptions/not-run。不得拼接多次局部结果假装单次完整通过。

## 15. 完成、待真机与真实阻塞

- `MODULE_03_COMPLETE_AWAITING_REVIEW`：真实只读链路、手机锁屏主场景、UI、回归和交付均具备证据，等待独立审阅。
- `MODULE_03_DEV_COMPLETE_AWAITING_DEVICE_ACCEPTANCE`：代码/构建完成，但用户设备必要测试尚未执行。不得写目标真机完整成功。
- `FOREGROUND_ONLY_PARTIAL`：双前台能通，但锁屏主场景不成立，不能升级为完整只读伴侣。
- `SDK_ACCESS_BLOCKED` / `SIGNING_IDENTITY_BLOCKED` / `WORKSPACE_ACCESS_BLOCKED` / `DATA_SAFETY_BLOCKED`：只在真实前提无法解决时停止对应危险集成，并报告已完成内容、确切错误与所需一项操作。

普通编译错误、界面问题、可复现实现缺陷自行定位并修复；不要把它们变成新的审计/冻结回合。模拟器不通不无限修环境，在已能安装真实手环的条件下转真机反馈，但不得伪造截图。

安全边界：不卸载/清空手机 Mirra、不换手机签名、不修改 Room Schema/BackupFormat、不删除用户数据、不强推、不合并main、不自行实施远程控制/提醒/Module04。

## 16. 后续完整伴侣路线

Module 03：真实只读状态 + UI，先让现有数据在手腕上可靠可用。手机 First Action 必填、启动困难主动帮助、趋势可视化与原版 Logo 纠偏并未因为本模块而自动完成；只镜像当前手机实际实现，相关手机体验改造仍需明确范围。

Module 04：有限、低风险交互。优先评估现有 Session 的休息/返回请求，再评估第一动作确认与远程启动。每条命令必须带 requestId、目标 Session/Intent、当前 source epoch、预期状态，手机校验且返回执行结果后腕端才显示成功；过期写命令不得离线重放。Android 后台启动限制另测，不能把 transport 成功当业务成功。

Module 05：主动提醒。先验证系统通知与前台振动两种能力、提醒去重/节流、勿扰与权限兼容。不能靠后台音频/定位保活保证到达；通知出现在手环不证明快应用收到回调。[S3][S9]

之后：轻量回顾、快捷入口/表盘按实际平台能力再评估。健康数据/心理状态推断、复杂趋势和笔记编辑不因手环有传感器就默认加入。

## 17. 给 Codex 的执行入口

将本文件放入手环项目 `docs/plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md`。执行时以它为本轮新增范围合同：允许两个已授权仓库内新增只读通信桥、用户设置和腕端正式 UI；不再按内部 Task 暂停冻结。首先核对工作区、SDK与签名，不重新组织一轮产品调研。

开始执行前做一个真实必要的确认：手机工作区是否在 Codex 当前允许范围内。目录不可访问时只请求该目录的授权，不设法绕开权限。实际手机/手环安装、系统授权和签名材料转换由用户明确同意后执行。

腕端正式包版本采用 0.2.0，versionCode 明确递增；手机 versionCode 必须大于实际已安装/当前开发版本，versionName 能辨认包含手环桥接，不能盲目照搬旧 V1 的版本号。

最终交付：正式 live RPK + 同签名可覆盖安装的 Mirra APK + 两端版本/SHA/协议清单 + 实际画面 + 一份真实验证报告；不以“又新增几份文档”算完成。

## 18. 来源与证据范围

所有新轮询时间、尺寸、颜色、协议字段、任务和验收门槛均为本方案提出的工程决定，并非小米官方承诺或已实现能力。

[S1] 小米 Vela 官方多屏适配，目标分辨率与 DP 列表：
`https://iot.mi.com/vela/quickapp/zh/guide/multi-screens/`

[S2] 小米 Vela Interconnect，单例、消息、连接及包名/签名条件：
`https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html`

[S3] S2 官方附录链接《小米穿戴第三方APP能力开放接口文档_v1.4》，已读 PDF；SDK二进制与实际设备尚未验证。本轮无法通过网页工具读取官方 demo ZIP，也未在当前运行环境完成下载/解包，不宣称 SDK 已就绪。

[S4] 小米 Vela fetch 支持表：
`https://iot.mi.com/vela/quickapp/zh/features/network/fetch.html`

[S5] 小米 Vela 通用 BLE 支持表：
`https://iot.mi.com/vela/quickapp/zh/features/system/bluetooth.html`

[S6] Mirra Android `Entities.kt`（已读固定版本）：
`https://github.com/cc7279694-debug/Self-discipline/blob/b005ed1d85afd8f7abef15d6be65d39898f637fc/app/src/main/java/com/guanyi/mirra/data/local/entity/Entities.kt`

[S7] Mirra Android `FocusEntities.kt`（已读固定版本）：
`https://github.com/cc7279694-debug/Self-discipline/blob/b005ed1d85afd8f7abef15d6be65d39898f637fc/app/src/main/java/com/guanyi/mirra/data/local/entity/FocusEntities.kt`

[S8] Mirra Android `AppContainer.kt` / `StorageMaintenanceGate.kt`（已读固定版本）：
`https://github.com/cc7279694-debug/Self-discipline/tree/b005ed1d85afd8f7abef15d6be65d39898f637fc/app/src/main/java/com/guanyi/mirra`

[S9] 小米 Vela 后台运行限制：
`https://iot.mi.com/vela/quickapp/zh/guide/framework/other/background-running.html`

[S10] Android 官方后台启动前台服务限制：
`https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start`

[S11] Mirra Band Module02规格与只读诊断（已读固定版本）：
`https://github.com/cc7279694-debug/mirra-band/tree/e450dc1dfb4194dfb755371eddeb740d30cb3700`

用户照片与“测试都没有问题”的反馈是目标真机技术原型验收依据；没有将其升级为未执行的手机通信、后台续航或正式UI验收。本文没有修改远端仓库、安装SDK、操作手机或读取任何私钥。

[S12] 已再读 Halo-Signal 的 README（`mu-zi-lee/Halo-Signal`），其三端结构可作为消息交互参考；没有把作者说明当作 Mirra 目标固件的链路证据，也没有复制代码、引入桌面服务或对未读许可证作判断。
