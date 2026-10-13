# 架构与产品决定

## 2026-10-13 — 跨实例墙钟差用于参考展示，可信计时门槛不降低

### Decision

用户已报告05B.2详情和休息入口恢复，但重进后累计时间未知。新ownerId是应用实例变化，不独自证明墙钟差不可用；完整端点、非负且单区间不超过既有6h预算时允许参考展示。保留OWNER_CHANGED/WALL_ONLY、UNVERIFIED与时间未验证状态；跨owner单调数值不比较，trustedFocusMs不由该参考增加。

### Context / Alternatives

旧duration在检查回退/跳跃前直接因OWNER_CHANGED返回null。继续全显示未知无法满足日常重进；新增可信boot时钟或修改schema超出最小修复范围。选择现有原始墙钟边界重新投影，不修改任何学习事实。FOCUS/BREAK分开累计；任何已知硬异常使整个参考时间链未知，休息到时不自动继续。

### Reason / Consequences

Owner仅在内存记住同Session已观察的硬时钟异常，避免一次回退后下一正常tick恢复成干净参考。该记忆不写文件，不能证明跨新实例保留未保存异常。完成记录只依赖闭合端点，不被无关当前时钟污染。schema、Session转换、历史/双槽/写入/容量和既有浅色页面保持；小于阈值的未被观察到的时钟调整和跨重启连续性仍不能证明。用户已通过的交互证据保留；新0.1.3参考恢复另需自然使用反馈。不进入05C。

## 2026-10-13 — 05B.2先观察全局交互，再采用平面原生绑定

### Decision

按照用户真机失败反馈进行05B.2，不把阅读/详情无反应直接归因存储失败。独立点击探针只有平面private字段、原生div/text与前台刷新，无Owner、存储或通信；主页面保留11种任务视图，采用旧05B平面绑定形态，完整投影留在非响应式`_projection`。白底Mirra Blue主题只属于实验profile。

### Context / Alternatives

真实RPK保留onclick调用；受控Owner/file边界复现读取锁阻止只读详情，而计时仍可更新。注入刷新异常可复现flow已跳转但画面停住，旧订阅吞异常。这些是软件层证据，尚不能证明此次目标固件根因。Vela公开runtime核心为预编译库；公开页面数据文档未将vm列为保留字，参考HAP observer也没有支持“冻结对象必然崩溃”的证据。不能把这些猜测写成确定根因。

### Reason / Consequences

只放开只读详情/返回，业务锁、逐条读回、时间可信度和数据保护保持。页面异常以固定代码可观察，刷新失败不从旧展示分派写命令；恢复完整投影后再由下一次明确点击操作。原图已收到但当前合同保留LOGO_PENDING，不裁剪、重绘或集成。探针的编译点击验证也不等于原生触控或像素；新版停止在05B.2自然反馈，不进入05C或改手机。

## 2026-10-13 — 05B.1按腕端任务重组界面，数据规则保持05B

### Decision

采用用户完整05B.1合同：无活动Session直接展示默认测试书籍与第一步；预览不写入，明确完成时才串行执行既有开始命令。FOCUS重进无需RESUME；BREAK只能主动继续。结束保持两次点击，页码默认null，键盘按需出现。Mirra Blue深墨布局突出计时与一个主动作，存储阻断和未知时间保持可见。

### Context / Alternatives

用户在当前合同确认旧05B基本体验正常，但希望减少长列表和冗余步骤。可以重写核心或新增原子开始事务；选择UI草稿与逐条核对编排，保留已有单owner与可靠保存规则。链条不是新原子事务，中断可能留下PREPARING，重进须再次明确完成确认。

### Reason / Consequences

不新增持久字段、偏好数据库、同步或时间算法。Done仅导航，所有pending保留；RECOVERED核对只确认用户看见当前恢复状态，不证明最近变化完整。原Logo未收到，local专用临时文字图标明确LOGO_PENDING；不能冒充用户原版。新版本同实验包/证书单调升级，真机安装另取当前同意。旧反馈为USER_REPORTED_PASS，新版像素/触控不能据此PASS；不进入05C。

## 2026-10-12 — 05B选定file准入与独立Session事实

### Decision

用户授权05B普通实施，并明确反馈file损坏恢复、覆盖升级0.1.1与正常重启保留全部正常。仅将这条路径记作USER_REPORTED_PASS，选择file；不要求storage同时通过，不扩展为原生时钟、容量或掉电已证明。05B使用新独立测试包/schema/命名空间，单owner持久化状态转换与pending队列，手机仍不修改。

### Context / Alternatives

此前05A只有默认storage保存/重进反馈，因此开发起初gate关闭；后来明确的file必要结果允许选定路径准入。可等待两后端全面通过或直接相信Date.now跨重启；选择已有一条路径且保守保留时间可信度，减少无效人工矩阵。

### Reason / Consequences

本地Session采用稳定installationId/counter、自包含书籍与动作快照、先读回再采纳，完成记录不自动删。双槽序列本身不证明历史延续，因此同时校验安装身份、counter、不可变pending和活动Session/旧关闭区间。CRC只检测意外损坏；原生跨进程IO、掉电、全部固件耐久性不由Node证明。运行时墙钟不贡献已验证时长，跨owner保留同Session与原始端点并提示不确定。05B自己的自然使用待新RPK安装许可；05C–05E未实施。本条取代旧“05B未授权”范围，旧05A实验及Module03/04证据保留。

## 2026-10-12 — 独立学习采用结束后同步，先验证隔离持久化

### Decision

用户已确认 Standalone V1 方案 A：未来腕端独立学习及未同步完成记录由手环保存，手机持久化导入后整合历史；在线控制继续拥有手机自己的 Session，两个模式不混合。当前仅授权 05A 存储实验，不修改手机数据库或开发真实腕端记录。

### Context / Alternatives

Module 03 通信已真实通过，Module 04 已构建并通过自动化但新增控制待自然使用。实时手机所有权无法满足手机关机时独立阅读。可直接扩展真实记录、覆盖正式包验证，或先用独立实验包证明目标固件存取；选择隔离实验包。

### Reason

官方 storage/file 与 Files 分区文档提供候选接口，不承诺具体固件原子写、掉电或升级保留。小型双槽、序号、严格输入、CRC32 与精确读回能验证应用的恢复策略；CRC 不是认证。返回表盘/应用重进/结束整个 JS 应用/设备重启是不同证据，墙钟差不当成可信学习时长。

### Consequences

`com.guanyi.mirra.band.storageprobe` 使用专用合成测试槽与既有实验证书；两版 0.1.0/code1 → 0.1.1/code2 用于后续升级证明。没有手机通信、Session、云端、额外权限或正式数据操作。任何未取得国行 9 Pro 实测的耐久性均为 Not Run；未证明之前不得进入真实用户记录或 Room/备份迁移。此条扩展产品方向，既有手机业务与在线控制决定仍在原模式范围内有效。

## 2026-10-12 — Module 04 手机权威的短授权控制

### Decision

按用户确认的方案 B，只开放 5/10 分钟休息、提前结束休息和手机已有 Intent 的第一步明确确认。协议 v1 保持只读与字节不变；新 v2 协商 SESSION_CONTROL，控制默认关闭、许可不随备份迁移。每次控制绑定节点、流、资源 owner、具体业务事实和短期限，关闭、维护、旧流或超时不重放。

### Context

用户已接受 Module 03 基线，正式 IDLE 往返、监测学习锁屏重进与首次 NO_DEVICE 自动恢复成功继续保留。范围以完整 Module 04 合同为准，用户要求自主开发与必要自动化，真机安装仍单独确认。

### Alternatives

腕端自行创建事实、使用普通手机启动的 UNMONITORED fallback、内存去重替代事务、无限控制重传或迁移数据库权限。

### Reason

手机已有唯一 Intent/Session/Segment 和转换规则，复用这些业务与事务保留数据含义。腕端开始严格要求监测 READY，事务内复核动作与页码；提交后监测异常保留实际 Session 并降级。休息的可选外部授权 guard 直达最终首次数据库写入，原手机调用保持原规则。

### Consequences

无 Room v4、Migration、完整备份格式、状态转换阈值或签名身份变更。SDK 等待在业务事务外，发送成功不当成 APPLIED。自动化不等于新增真机操作通过。交付后等待自然使用和 ChatGPT 独立审查，不进入 Module 05。

## 2026-10-11 — 独立手环仓库与模块交付

### Decision

使用用户提供的 `cc7279694-debug/mirra-band` 仓库与当前工作区开发。先交付 Module 01 项目基础与核查，再等待验收后实施独立原型。

### Context / Alternatives

远端初始提交只有 README，本地目录为空。可选择在手机仓库增加模块或另起仓库；用户已建立独立仓库。

### Reason / Consequences

平台工具链和设备验证独立，避免手环实验影响手机未提交工作和用户数据。手机签名/SDK 集成后续单独授权。

## 2026-10-11 — 使用 Vela 原生快应用表达手环 UI

状态：Vela 平台选择继续有效；本条 TS 预编译部分由下方 Module 02 原生 JavaScript 决定替代。

### Decision

手环采用 Vela `.ux` 界面与 RPK；业务采用 TS 预编译为 JS，`.ux` 保留薄 JS 适配，实际编译链在 Module 02 验证。不向手环套用 React / Capacitor / SQLite 默认架构。

### Context / Alternatives

用户指定设备可安装 RPK，官方提供 Vela JS 工具链。替代路线包括普通表盘或完整 Android UI，都不满足同一平台交付。

### Reason / Consequences

选择设备实际支持的应用形式；平台脚本与业务状态分开。此决定不改变手机已有原生架构。

## 2026-10-11 — 先演示后通信，手机拥有真实学习事实

### Decision

首版离线测试模式，不保存真实学习记录；通信维度与学习/监测维度分开。拟使用独立演示包名与开发签名；正式通信身份暂不锁定。

### Context / Alternatives

可直接改手机接入 SDK，或先验证手环原型。官方 Interconnect 要求两端包名与签名一致；现有 APK 签名变更会影响覆盖安装。

### Reason / Consequences

先证明界面与打包可用。演示签名不匹配正式 Mirra，不能宣称真实连接成功；后续需实际签名与 SDK 可行性验证。不得借官方卸载建议去卸载或清除手机 Mirra 数据。

## 2026-10-11 — 继承 Mirra Blue 与状态可信性

### Decision

沿用手机现有强调色 `#6598E8`、主动作色 `#386FBE` 等 Palette；界面以状态、时间/动作、书名顺序呈现，永久标记模拟来源。

### Context / Alternatives

现有手机 Palette 有直接源码证据。可以重新设计品牌或缩小手机完整页面，但当前抬腕任务不需要这些变更。

### Reason / Consequences

保留产品连续性，只适配小屏布局与交互。未监测、休息、恢复或断连不变成虚构的有效专注，后台提醒仍需真机证据。

## 2026-10-11 — Module 02 使用原生 JavaScript

### Decision

按用户本轮明确授权，以原生 JavaScript 实现演示模型、计时刷新与只读诊断，页面只适配平台生命周期。替代此前 TS 预编译计划。

### Context / Alternatives

首版只有少量状态与平台适配；`.ux` 脚本本身采用 JS。加入 TS 会增加生成目录与同步检查，而本轮优先交付真实 RPK。考虑过 TS 预编译，当前选择无额外编译层。

### Reason / Consequences

维护一个源码版本，直接进入官方构建链。输入校验、边界单元测试、实际页面脚本测试与语法检查承担首版验证；它们不能声称是 TypeScript 类型检查。未来类型化须有明确收益，独立评估。

## 2026-10-11 — 隔离官方构建输入与独立演示签名

### Decision

固定局部 `aiot-toolkit@2.0.5` 与 lockfile；用 `scripts/build-rpk.cjs` 将应用、包信息与演示证书暂存到忽略目录，再串行调用官方 CLI。不修改全局 Node、npm 或工具源码。

### Context / Alternatives

实际源码显示 CLI 扫描工作目录，仅排除 node_modules/dist/build/.git；直接在仓库执行会复制 `.local` 中的模拟器文件，导致冗余复制和 Windows EPERM。可以修改工具内部排除规则或移动 SDK，当前采用隔离输入。

### Reason / Consequences

避免非产品文件参与编译，锁防止同一输入目录并发构建。每次验证新生成 RPK 的 RSA-SHA256、内容摘要、ZIP CRC、manifest 与公共样式，防止 CLI 失败却返回零时误交付旧包。签名使用本地新生成的演示身份，私钥只在忽略目录；公开指纹用于检查身份，不匹配正式手机。

## 2026-10-11 — Module 03 正式只读伴侣与独立演示构建

### Decision

正式包固定 `com.guanyi.mirra` / 0.2.0(code 2)，复用现有手机公开证书身份；演示包保留独立包名/签名和永久“演示数据”标识。用户已明确授权本机受保护、Git 忽略的签名格式转换与必要安装/授权测试，不替换手机身份。

### Context / Alternatives

Module 02 技术原型真机基础测试已通过用户反馈，正式 UI 尚未接受。官方 SDK 附件可取得，检查实际 AAR API 与摘要后接入；没有许可说明的二进制采用本地固定摘要下载，不提交第三方 SDK。选择已有 Kotlin/Compose/Room 只读增量，不迁移手机栈或新增服务器。

### Reason / Consequences

手机拥有学习事实，协议仅 HELLO/GET_SNAPSHOT。短事务读取捕获代际，SDK 等待放在事务之外，维护前排空并退役；设置放 noBackupFilesDir 独立 AtomicFile，保持 Room v4、备份格式与四项可携带偏好不变。正式故障不得自动回退演示。官方文档/本地同签名构建只证明前提；已安装手机证书、目标固件消息、锁屏主场景与 UI 必须另有真实设备证据。

## 2026-10-11 — 深墨色 Mirra Blue 与保守新鲜度

### Decision

采用已批准的深墨背景 `#0B0F14`、面板 `#151C25`、正文 `#EEF3F8`、辅助 `#A6B2C3`、Mirra Blue `#6598E8`。首页一个状态与一个时间/动作重点，详情滚动；真实来源和数据新鲜度与监测覆盖分开。替代 Module 02 仅用于原型的浅色页面表现，保留品牌色与历史记录。

### Reason / Consequences

近期 FULL+AVAILABLE 才展示专注；无有效快照不显示样例书/等待开始。断连、超时和时钟不连续冻结最后手机确认值，清楚标出上次同步；SAVING/ENDED 固定，倒计时归零不自动切换手机状态。Vela 未证明单调时钟，采用前台 Date 连续性检查；页面隐藏/重进重新握手。这是展示策略，不修改手机学习算法或有效专注计算。

## 2026-10-12 — 有界原生状态诊断与实际版本标签

### Decision

正式 0.2.5 连接帮助页始终显示本包 versionName/code。仅对同步 getApkStatus 返回的有限 ASCII 状态 token 展示受限诊断，保留大小写与引号/空格类别；其他类型、控制字符、长文本或任意对象仍只报固定类型。现代回调错误依旧采用数字白名单，不读取任意错误正文或业务消息。未知 token 一律失败，不通过别名、大小写转换或解析包装制造成功。

### Context

0.2.3 / 0.2.4 两次用户实拍均只有 APK_STATUS_UNKNOWN_STRING，既无法区分原生返回值，也不能从画面确认包版本。0.2.4 按[旧官方 native 实现](https://github.com/open-vela/frameworks_runtimes_feature/blob/26e8785bd16896fd748a2db05933d03abe809406/modules/interconnect_impl.cpp#L1146-L1170) 补上精确 CONNECTING 的有界等待；目标固件并未证明返回该 token，修补未解决故障。第七张实拍随后明确显示 0.2.5/7 与 APK_RAW_TIMEOUT，得到真实原生字符串 TIMEOUT，但底层失败原因仍未知。

### Alternatives / Reason

继续只显示 typeof 会让真实失败信息不足；直接输出原生对象、任意错误或 payload 会越过隐私边界；把未知值当连接成功则破坏状态真实性。选择只公开这个同步状态接口的有界 token，并明确原生状态、匹配 HELLO_ACK、完整 SNAPSHOT 是三个不同证据层。

### Consequences

此选择补充了 0.2.3 的固定类型诊断策略，不改变连接成功条件、原有 3 秒期限、业务协议或新鲜度。可见版本标签不是独立安装文件摘要证明，原生 TIMEOUT 不是应用握手计时器结果；该次失败曾保持 WRIST025_NATIVE_TIMEOUT，随后同进程手动重连+安装检查取得真实 IDLE 接收证据。恢复触发机制未隔离，首查恢复缺口尚未修复，不能根据公开历史源码或单次成功推断目标固件/后台行为。

## 2026-10-12 — 手机腕端安装查询与握手状态分开

### Decision

在已授权手机功能分支加入官方 SDK 只读 isWearAppInstalled 手动查询，独立 job/generation/state、3 秒期限，节点/授权/owner 前后核验。SDK 等待不占消息监听所有权；页面退出只取消诊断，晚到结果不能恢复旧状态。并发字段更新原子化，诊断不替换应用级 listener，不修改 handshake 或完整同步时间。

### Context / Alternatives

目标手机手动重新连接后可确认设备/服务/授权，腕端仍没有消息握手。仅重试腕端不能证明小米服务是否识别其 Mirra 包；官方 AAR 提供实际安装查询，返回 Boolean，没有证书或版本字段。选择现有 transport 内窄范围查询，不新增云端、保活、权限或 launchWearApp，也不改学习算法、Room Schema、备份格式、手机签名身份或用户数据。

### Reason / Consequences

将平台识别问题与业务消息问题分开，减少凭模糊错误反复换包。手机 1.1.2/code5 已通过构建/回归并经实际三方证书匹配安全覆盖，2026-10-12 UTC 01:55 实际查询为“小米服务报告已安装”。Boolean 本身不证明签名、腕端版本或消息往返；此次消息通过另有手机实际握手/完整发送和第八张真实 IDLE 接收照片相互证明。首查 NO_DEVICE 的恢复缺口已从代码确认，本次同 PID 32135 从 NO_DEVICE 到手动恢复排除了进程重启解释；重连与检查两个动作未隔离，不能将检查当作已定位的 TIMEOUT 修复或宣布恢复缺口已修复。单次 IDLE 不外推其他场景；用户随后明确完整监测学习锁屏重进正常，该主场景另记 USER_REPORTED_PASS，不冒充独立 Session/锁屏画面/原始消息采集，整个模块仍待其余验收。

当前证据状态为 MODULE_03_DEVICE_ACCEPTANCE_IN_PROGRESS / IDLE_ROUNDTRIP_PASSED_LOCKSCREEN_USER_PASS_OTHER_SCENARIOS_PENDING；其余状态完整画面和 30 分钟观察仍未验收，不改变模块边界。

## 2026-10-12 — 应用连接 owner 承担有界自动恢复

### Decision

首次 NO_DEVICE / 暂时 SERVICE_UNAVAILABLE / TIMEOUT 失败后，由同一个应用连接 job 按 2/5/10/30/60 秒延迟恢复，之后保持 60 秒上限；成功即停止。自动尝试 requestAuthorization=false，不新增权限弹窗、FGS、alarm 或 wake lock；系统休眠可能延迟执行，不承诺准点。身份、授权、多设备或监听清理不确定等非暂时错误停止并锁存；晚到事件/发送成功不能覆盖停止状态。关闭伴侣、维护 pause、source 退役、close 与进程 scope 取消所属重试，合法新 source owner 重新接线。SDK ready 不代表 HELLO 或 SNAPSHOT 成功。

### Context / Alternatives / Reason

初始空节点失败会移除 SDK service observer，单等 available/onResume 不能恢复。使用现有应用 owner 的可取消延迟和串行连接，不增加第二个消息监听、后台服务或高频查询；已持有节点的临时丢失也走同一退避。实际失败回归与全量构建支持本实现，真机恢复仍需另验。

### Consequences

永久错误不被可用/失联/晚到发送事件擦除；维护和进程边界停止旧任务。只在现有进程与合法数据源存在时恢复，不承诺 OEM 常驻或休眠准时通信。
