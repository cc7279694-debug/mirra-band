# 当前只读伴侣架构

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
