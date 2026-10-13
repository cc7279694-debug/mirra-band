# 当前手环伴侣架构

## 05C.1 正式主题构建隔离

只在live profile的暂存输入调用`formal-theme.cjs`，将正式浅色shared sheet及页面专有样式展开为各页style；Home忙碌按钮只增加展示class以配对灰背景/深字。所有页面脚本/onclick和共用源UX、旧theme.css/local-theme.css保持。新formal-theme.css不进入Demo/隔离实验；没有新增运行时全局CSS或主题owner。签名/资源检查后，构建器检查实际编译六页颜色与条件绑定，未通过则不替换交付。检查器运行在Node，不能证明固件透明合成、全局优先级或336×480像素可读性。

## 05C 正式目录与两种学习所有权

当前正式profile为`com.guanyi.mirra`，使用既有正式签名。`formal-app.ux`创建一份CompanionStore/Interconnect transport、一份LocalOwner与一份CatalogOwner；Mode、手机伴侣页与独立页共用通信lease，页面不创建存储writer。LOCAL默认；本地活动/准备/IO或不确定状态阻止手机控制，PHONE阻止本地操作；新鲜手机PREPARING/ACTIVE/SAVING及未确认控制阻止新的本地开始。未知离线状态允许独立学习，但不能称已证明手机空闲。

手机LearningItemEntity只读短事务 → StorageMaintenanceGate/source生命周期 → FirstActionResolver与已同意的本地选书设置 → 既有WearableCoordinator/WearTransport → v3 BOOK_CATALOG。旧v1/v2保持；目录披露同意默认关闭，主线自动、最多11本额外IN_PROGRESS书籍。手机Room v4、Session/Intent/监测算法、统计和备份格式保持。

目录为schema1完整canonical，最多12本/16,384 UTF-8 bytes；书名120码点、第一动作160码点，超限或无效内容明确拒绝，不静默截断。4096字节消息预算内最多32片，每片data最多1024字节，固定30秒期限与client/request/stream上下文。完整重组、校验后由CatalogOwner双槽/CAS/CRC保存相反槽并精确读回，才发布新目录和PERSISTED ACK；相同完整字节幂等免写，缺失/迟到/冲突/未知IO不冒充同步成功。CRC32用于损坏检测，不代替签名身份认证。

目录文件固定`internal://files/mirra_catalog_live_[ab].json`，单槽记录预算32,768 bytes；正式Session固定`internal://files/mirra_local_sessions_live_[ab].json`，marker `MIRRA_LOCAL_SESSION_V1`、schema1、单槽8192 bytes、8 pending、32 intervals及结束预留。实验`mirra_05b_test_sessions_[ab]`及marker保持，正式包不加载跨包数据、不迁移记录。目录更新不改active/pending的自包含快照；本地合法结束页码仅形成待确认进度，未更新手机。

白色LocalSession模板动态读最后确认目录，没有目录不回退测试书籍；短文本首屏、长书名/动作完整滚动展示。第一动作预览绑定catalogRevision，刷新等待期间目录改变则旧确认不能写入Session；明确完成后一次START_CONFIRMED提交。继承参考计时、休息排除、到时主动继续、可空页码、失败锁和轻量tick；显示参考值不证明跨重启可信时长。05C不实现学习记录上传或手机整合。下方为既有模块交付时架构记录，当前验收状态以CURRENT_STATE为准。

## 05B.3 单次确认提交与轻量刷新

明确完成第一步 → UI捕获并核对预览/锁重复点击 → 可刷新忙碌字段 → 专用START_CONFIRMED在内存复用原合法transition链 → Owner容量/结束余量 → 原journal双槽/CAS/历史/CRC/相反槽写入/精确读回 → Owner确认 → 页面业务成功。无通用批处理和schema变化，无准备中间状态持久化；已开始IO的页面隐藏只抑制旧页面导航，不能撤销原生写。

`timerSnapshot`只投影Owner内部已校验的选定Session，复用原时间算法及异常记忆；普通tick经`presentTime`仅提交变化标量，忙碌tick不执行全量刷新。完整错误与业务变化仍全量投影。UI平面绑定、白色主题和原Session事实保留。

`local-performance`是默认关闭的有界内存诊断，固定数值阶段通过Owner/Journal/Page记录，详情可开启，不写业务文件。字段提交≠原生像素绘制，Date.now诊断时长不变成可信学习时间；Node回调模型不变成9 Pro数据。0.1.3参考重进已获用户通过，0.1.4流畅度等待真机自然反馈。

## 05B.2 参考计时补修

时间投影将“有墙钟参考值”和“有可信单调证据”分开：跨Owner可恢复完整、有界的墙钟差，仍标参考值且不贡献可信时长。每个原始FOCUS/BREAK区间分开计算；硬时间异常使参考累计与倒计时未知。Owner内存保留同Session已观察异常，正常下一tick不解除；新Session有独立诊断记忆，该状态不写入持久数据。完成历史只使用闭合端点。

原Date.now入口、schema/transition/history、存储/IO与业务写入不变；平面LocalSession模板、主题、布局和已恢复控件保持字节一致。显示参考值不证明跨重启连续性；未保存的中间异常不能跨Owner证明。当前新实验交付0.1.3/code4，真机交互已有用户部分PASS，参考计时新行为待安装与自然反馈。

## 05B.2 原生兼容修复

主模板只绑定平面标量及平面重复行；纯presentation对象存于非响应字段`_projection`，其不可变第一动作预览仍用于严格开始回执。页面`safeRefresh`提供固定生命周期/刷新错误、事件计数、流程/显示视图、busy/准入及时间KNOWN/UNKNOWN诊断；异常不泄露原生消息，页面隐藏后无计时订阅，不新建数据owner。只读详情/返回可越过IO busy，业务操作安全锁保留。白色主题与递增实验证书身份只作用local-session。

`click-probe`是独立路由/app/profile/包名，只有system.router，无业务模块或存储读写；用于分层检验原生点击、标量刷新和布局区域。主包与探针均不能宣称已获固件触控证明。旧05B.1源码可由基线提交恢复；其Node验证有效，用户后续真机自然验收FAIL单独记录。Logo原图已收到，集成仍LOGO_PENDING。schema/双槽/时间算法不变。

## 05B.1 继承的独立学习界面（交付时记录）

`LocalSession`单路由互斥任务视图 → `local-presentation`只读事实投影与参考时间文案；`local-ui-flow`仅持有内存书籍/动作/页码草稿和跨整链提交锁 → 原05B app级LocalOwner。开始逐条调用既有命令并核对状态、序列、身份、对象及保存回执，中途失败或隐藏不补执行后续命令。结束只有实际FINISH读回后显示SAVED，Done不删pending、不执行NEW_SESSION。打开/选择/返回/刷新均不创建学习事实。

原05B状态机、schema、存储命名空间、容量与时间来源没有变化。仅local-session profile使用独立主题和临时文字图标；其他profile资源隔离。RECOVERED核对只属UI确认，不能证明全部数据完整。原Logo缺失为LOGO_PENDING；新原生像素/触控与同身份真机升级留待授权自然使用。

## 05B 隔离本地Session

`local-app.ux`单一owner → `local-owner`先保存后采纳 → `local-session`不可变转换/自包含测试书籍及动作快照 → `local-journal`双槽/CAS/历史延续校验 → 固定 `local-storage` file后端。页面单页切view、仅订阅与刷新投影，隐藏或退出不结束Session。独立包 `com.guanyi.mirra.band.localsessiontest`，marker `MIRRA_05B_ISOLATED`、schemaVersion1、专用05B测试Files；不加载手机SDK/协议或原伴侣页。

IDLE/PREPARING在明确完成第一动作前不生成Session。FOCUS/BREAK记录原始区间，5/10分钟休息到时不自动继续。FINISH可空页码，pending只追加且不自动删；安装身份+已持久counter产生稳定ID。32interval/8pending/8192bytes均是设计上限，结束预留1024bytes，实际字节限制可更早阻止增长。恢复不能将已确认历史变空、降低counter、替换pending或重写旧活动区间；未知/冲突/读失败/原生IO不确定停止写。

用户确认file必要损坏/升级/重启保留路径，当前隔离profile显式 `storageQualified:true/storageBackend:file`；owner默认仍fail closed。墙钟是未验证观察：保存wall/owner/可选mono原始端点，实际入口monotonic始终未验证；跨owner/回退/异常不造可靠时长、不清零Session。不存在后台timer学习事实或手机有效专注导入。旧05B用户已报告基本自然体验正常；该反馈不扩展为全部时钟、掉电或容量证明。05B.1真机自然验收FAIL，当前由05B.2等待修复包反馈。

## 05A 隔离持久化实验

实验构建使用单独入口 `probe-app.ux`，应用持有 `probe-controller` → `probe-journal` → `probe-storage` 的 owner。页面只订阅/执行实验，不释放全局存取。原正式入口、v1/v2、四个伴侣页面和协议代码不改。

`system.storage` 两个固定 key、`system.file` 两个 `internal://files` 固定 URI 分别存放合成快照。序号决定最新有效记录；保存写另一槽后精确读回并校验，保留前一槽。未知格式、双槽损坏、读错误、序号冲突阻断；5 秒存取结果未知锁存，晚回调和切后端不能解锁。没有删除、clear、move 或文件原子性假设。

实例标识只区分当前 JS owner；墙钟锚点及回调差只用于实验观察，回退或大幅 IO 时间差不报告可靠时长。没有后台 JS 计时或真实独立 Session。初始/升级实验 profile 同独立包、同实验证书，staging allowlist 与 RPK 检查排除所有伴侣/演示页面及 Interconnect。正常 live/demo staging 则排除实验代码。

Node 及真实临时文件证明应用边界，不能证明目标 Vela 固件持久性或像素。当前 05A 状态和设备证据门槛见 CURRENT_STATE，产品后续方案见 Standalone V1 合同。

## Module 04 扩展

v1 文件与只读报文保持原样；v2 在快照信封中加入控制事实，只允许 START_BREAK、FINISH_BREAK、CONFIRM_PREPARATION_AND_START。手机默认关闭的控制许可存放独立 no-backup AtomicFile，不进入 Room 或可携带备份偏好。

应用级 WearableCoordinator 持有当前节点、握手流和与 source 同时绑定的 WearableCommandExecutor。20 秒 opaque grant 绑定节点、client、stream、捕获的存储 owner 与业务状态，最多保留 4 个当前状态授权；状态变化、撤权、断连、维护或重新握手撤销。结果缓存最多 32 项，冲突载荷不能覆盖已证明结果。SDK 等待/发送在业务维护许可与 Room 事务外，零排队、单个在途操作，最长 12 秒。

休息操作复用 FocusSessionActions 和原转换规则，只增加可选外部授权准入：业务读取后和最终 Room 首次写入前再次检查。原手机接口不要求外部控制授权。第一步确认走 SessionStartCoordinator 的严格监测入口，READY/后台 FGS 失败在提交前停止；提交事务再次验证完整动作、页码、书籍、Intent 及授权。提交后失败保留真实 Session，并沿用 DEGRADED 处理。

腕端只有 v2、明确能力、新鲜完整快照和有效 grant 才启用控制。Control 页滚动展示实际第一步并显式确认；5 秒命令期限不重传，不把发送成功当业务成功。RESULT 后再读完整状态，超时/断连显示结果未确认。反馈绑定原命令与 Session，业务身份变化后清理；隐藏/销毁清理页面所有权。正式身份 com.guanyi.mirra / 0.3.0(code8)，演示身份与签名继续分离且不能发送控制。

下方保留 Module 03 基线架构说明；历史版本号指该基线，当前门禁与真机范围见 CURRENT_STATE。

Module 03 继承原生 Vela JavaScript；无服务器、账号、云端或腕端数据库。

```text
手机真实 Room / 监测运行时
  → WearableSnapshotReader：捕获数据库代际，短只读事务
  → WearableCoordinator：Application SupervisorScope、请求归属、流代际
  → XiaomiWearTransport：官方 AAR、用户授权、单一节点监听
  → Interconnect
  → interconnect-transport.js：平台单例回调唯一所有者
  → companion-protocol.js：4096 UTF-8 字节、白名单、严格 v1
  → companion-store.js：前台请求、新鲜度、内存快照
  → companion-timer.js / companion-presentation.js
  → Home / Detail / Connection .ux
```

协议只有 HELLO 与 GET_SNAPSHOT；没有学习写命令。手机 SDK 等待与发送发生在数据库事务和维护许可之外。维护开始先暂停并排空只读请求；退役资源不重开，新代际重新握手。设置保存在手机 `noBackupFilesDir` 的独立 AtomicFile，默认关闭；不会进入 Room、四项可携带偏好或完整备份。SDK 缺失/授权失败不会阻断正常学习。

腕端仅在页面可见时持有回调、轮询和定时器。页面使用所有权令牌，交叠生命周期不会被旧页面释放新页面的任务。HELLO/GET 最长 3 秒；活动 5 秒、空闲 15 秒查询；15/30 秒过期；退避 2/5/10/30 秒。迟到、重复、旧请求/旧流不刷新新鲜度。来源忙碌、关闭、授权错误清空私有展示；断连/过期冻结最后手机确认的数字。

计时用保守 Date 锚点，只插值近期确认且前台连续的显示时间；回退、超过 7 秒调度空档、隐藏/重开均废弃连续性。不计算有效专注，不在倒计时归零时推断手机切换状态。SAVING/ENDED 显示固定值；ENDED 仅能跟随曾收到的 Session。

构建配置互斥：当前正式包 `com.guanyi.mirra` / 0.2.5(code 7)，没有 States 路由；演示包 `com.guanyi.mirra.band.demo` / 0.2.0(code 2)、独立证书，每页标识“演示数据”。版本由 `scripts/build-profiles.cjs` 与实际产物核对，包身份与协议版本分别维护。正式故障不回退演示。共享 `.ux`/呈现模型以 `#0B0F14` 深墨背景、`#6598E8` 强调、168 设计宽度组织首页与可滚动详情。

`scripts/build-rpk.cjs` 隔离输入并串行调用固定 `aiot-toolkit@2.0.5`；新产物通过签名、内容/逐文件摘要、元数据签名、CRC、身份/路由和篡改检查才进入 `dist/`。正式本地 PEM 在忽略的 `sign/live`，不会进包或 Git。

Node 页面 harness 运行真实页面脚本，不能证明 Vela 渲染。Android API37 模拟器证明 Android 回归，不能证明小米服务、手环消息或锁屏可达性。实际边界与产物索引见 [Module 03 checkpoint](checkpoints/2026-10-11-module-03-companion.md)。

手机连接 owner 的 1.1.3 修正：首次 NO_DEVICE / 暂时 SERVICE_UNAVAILABLE / TIMEOUT 失败后，由同一个应用连接 job 按 2/5/10/30/60 秒延迟恢复，之后保持 60 秒上限；成功即停止。自动尝试 requestAuthorization=false，不新增权限弹窗、FGS、alarm 或 wake lock；系统休眠可能延迟执行，不承诺准点。身份、授权、多设备或监听清理不确定等非暂时错误停止并锁存；晚到事件/发送成功不能覆盖停止状态。关闭伴侣、维护 pause、source 退役、close 与进程 scope 取消所属重试，合法新 source owner 重新接线。SDK ready 不代表 HELLO 或 SNAPSHOT 成功。
