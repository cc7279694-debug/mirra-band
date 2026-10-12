# 当前手环伴侣架构

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
