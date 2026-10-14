# 当前Mirra Band架构

更新：2026-10-14。描述当前05D实现；历史交付细节与旧版本范围见DECISIONS及各模块evidence/checkpoints，不作为当前限制重新执行。

## 运行所有权与模式

正式`com.guanyi.mirra`由`formal-app.ux`持有一份CompanionStore/Interconnect transport、一份LocalOwner、一份CatalogOwner和一份完成记录档案。页面只有通信lease、订阅、内存草稿和投影，不创建第二写入者。LOCAL拥有腕端Session；PHONE控制手机权威Session，沿用原互斥准入；已知手机活动、未确认控制、本地活动或不确定IO不能靠切页绕过。未知离线不被说成已证明手机空闲。

手机应用级WearableCoordinator复用OwnedWearTransport和官方Xiaomi SDK监听。SnapshotReader、CatalogReader、RecordReceiver及CommandExecutor都捕获startup、Room及StorageMaintenanceGate代际；维护前取消/排空，退役源不重新获取数据库。SDK等待/发送与Room事务分开。伴侣、控制、目录和记录披露许可独立、默认关闭，存no-backup AtomicFile，不随Full Backup迁移。

## 原始完成记录同步

```text
LocalOwner完成原始Session并保存pending
  → record-model完整规范原文 + 经向量自检的system.crypto SHA-256
  → record-sync / 同一CompanionStore通信流
  → v4 OFFER → NEED → 有界PART → COMMIT
  → WearableCoordinator严格完整校验
  → RoomWearableRecordReceiver / captured gate / withTransaction
  → 独立不可变wearable_completed_records / 提交及精确原文核对
  → 绑定身份、摘要、字节数与通信context的ACK
  → 腕端完成档案双份最新镜像 + 各份精确读回
  → 原LocalOwner CAS释放对应pending / 持久确认展示
```

v4能力`LOCAL_RECORD_SYNC`兼容旧v1/v2/v3，不以HELLO、SDK发送或摘要一致跳过完整原文。记录schema1、最多8192 UTF-8字节，最多8片/每片1024字节，各帧4096字节，固定30秒总期限包含手机提交与ACK；重复片不延长总期限。一次一个记录、有限重试及退避；旧stream/request、错误身份、摘要、字节数或迟到ACK不能确认另一记录。

手机独立表复合主键installationId/sessionId，保存canonical TEXT、SHA-256、字节数与receivedAt，无手机业务外键/级联。同ID同原字节幂等；不同原文冲突，即使摘要相同也不覆盖。事务返回后才可发送ACK，维护/源退役或撤权使旧context失效。OwnedWearTransport仅对严格v4记录帧使用单worker有界队列：最多10条在途/等待、32768字节，每帧重新核对授权；溢出退役当前代际并清队列，不建立第二监听或无限缓存。

腕端在本流首个有效SNAPSHOT后才开始记录同步；上传/本地确认期间暂缓普通快照轮询、目录和手机控制，避免共享通道竞争。新流重放档案及pending，手机旧备份恢复后的缺失行重新接收；已存在原文依旧完整核对。新握手重置流内成功事实；历史回执仅显示曾获保存确认。

## 腕端存储与容量保护

主Session保持`MIRRA_LOCAL_SESSION_V1` / schema1与原`mirra_local_sessions_live_[ab].json`，单槽8192字节、8 pending、32 intervals及结束预留，不把旧数据当空。新档案namespace `local-record-archive-live`，URI `internal://files/mirra_local_record_archive_live_[ab].json`，marker `MIRRA_CONFIRMED_RECORDS_V1` / schema1；每槽65536字节、最多64原文及稳定回执。

档案append包含全部原文，保存双槽完整镜像且分别精确读回后才提供窄的pending释放证明。中断仅写一份时pending仍保留；未知schema、双损坏、序列冲突、原生结果未知或历史变更停止危险写入。counter与档案/pending/active的连续覆盖检测记录消失、身份回退及冲突。档案不自动删除/压缩；条数或字节满时安全阻断，不承诺无限使用。8条确认、双份归档并释放pending后可开始第9场，实际字节预算可更早限制。

`system.crypto.hashDigest`必须通过ASCII/中文/emoji冻结向量，缺失或错误则停止记录同步/不释放pending。CRC用于槽与分片损坏检查，不替代SHA内容身份或应用签名。原文在腕端档案丢失时不能靠手机回执猜测重建。

## 手机数据库及完整备份

Room v5仅增加独立腕端完成表及索引；Migration4→5明确注册，schemas1–4保留。手机Intent/Active Session/监测/学习算法、页码和统计不由05D修改，腕端参考时长不进入有效专注。

新Full Backup format2/schema5包含全部13个权威表与媒体；旧format1/schema4以冻结可信v4布局严格校验，复制全部12个旧权威表和媒体到干净v5，再完整校验；不对不可信incoming数据库直接迁移。闭库恢复日志兼容合法v4/v5并保留恢复及回退保护。可读JSON/CSV保持原手机12表，明确声明不含腕端原始记录，不能替代Full Backup2。

## 目录与独立学习

目录schema1、最多12书籍/16384 UTF-8字节，书名120码点、动作160码点，完整滚动展示，超限拒绝而不截断语义。主线自动、额外最多11本IN_PROGRESS书籍经手机明确选择；FirstActionResolver只读内容不代表完成。v3/v4目录最多32片、每片1024字节、30秒总期限，CatalogOwner双槽/CAS/校验/精确读回后才启用新目录及ACK。最后完整目录可离线使用；更新不改变active/pending/档案的自包含学习事实。

第一动作实际完成并明确确认后一次START_CONFIRMED持久提交；重复点击锁、失败锁、主动继续休息及nullable结束页码保持。本地合法结束页码可参与腕端待确认进度，不更新手机。页面平面绑定，普通timer tick只更新变化字段；已在进行的原生IO不被隐藏页面虚假撤销。

时间保存原始FOCUS/BREAK边界，休息排除。跨owner合理墙钟差可展示为参考值，已知回退/异常保持未知；未观察或未保存的时钟异常不能跨重启证明。单调来源当前未验证，参考值不是有效专注。

## 正式主题、构建与验证界限

live暂存输入通过formal-theme.cjs展开明确正式浅色样式；白底深字、蓝按钮白字、灰按钮深字。正式主题不进入Demo/隔离实验。实际签名RPK检查编译六页颜色及条件绑定、身份、逐文件摘要、签名与篡改拒绝后才交付。原正式sign/live材料保持，不转换/更换，私钥不进Git或包。

实验包`com.guanyi.mirra.band.localsessiontest`、05A/点击探针及既有记录保持隔离，正式包不跨包读取/迁移。旧产物保护单独核对。Node和编译RPK受控运行证明软件边界；Android自有AVD证明所执行Room/备份及相关回归，均不能证明9Pro原生SHA、无线通信、真机响应或长期持久性。05C.1视觉与05C功能用户通过继承；05D正式安装与自然使用另需当前明确授权。具体实际结果见CURRENT_STATE和05D证据。