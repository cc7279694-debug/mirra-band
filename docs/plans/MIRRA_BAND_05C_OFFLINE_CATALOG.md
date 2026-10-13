# Mirra Band 05C — 真实书籍离线目录与正式包整合

> 执行：已获用户完整方案A授权，05C-0至05C-4连续设计/实施/测试，不逐项暂停。原生安装、系统权限/正式替换另取当前同意。

**Goal**：真实书籍可靠出现在正式手环应用，断开手机仍可用最后确认目录独立学习。
**Architecture**：正式com.guanyi.mirra中一个Interconnect通信所有者，目录与腕端Session分别双槽保存；PHONE和LOCAL模式分开准入，手机仍权威管理其Session。使用既有Kotlin/Compose/Room v4、Vela原生JS/UX。
**Out of scope**：不迁移独立实验、不上传记录/ACK导入、不整合历史/统计、不改Room v4/备份/手机业务算法、不转换签名、不合并main或进入05D。

## 已核实基线

- Band：干净d693d3502c4d8a05670fb0adf20ab4e8e4c0ba27；新分支codex/module-05c-offline-catalog。
- Android隔离worktree：干净30a8af3fdea225cc96db6a360d71383a85b7ea39；新分支codex/mirra-band-05c-catalog。原checkout未修改。
- 原正式APK1.2.0/code7、RPK0.3.0/code8、现有公开正式证书指纹一致29:DE:D2:6B:EA:44:F1:AF:E4:FE:38:3A:30:2E:4B:50:74:23:D1:62:23:46:9D:7D:A3:FE:57:8D:9A:7F:83:B9。继续使用原材料，不转换/替换。
- 05B.3自动化和构建已交付，真机流畅度仍无明确反馈；0.1.3跨实例参考恢复用户通过事实保留。
- 目前ADB仅模拟器，无物理手机；设备实际已安装版本/证书未知，不能声称安全覆盖设备核查已通过。

## 05C-0 身份、模式与存储决策

- 正式APK目标1.3.0/code8，RPK0.4.0/code9，最终按实际产物及设备条件核实递增。旧正式/实验产物保留。
- 正式Session命名空间local-session-live、marker MIRRA_LOCAL_SESSION_V1；目录catalog-live。旧local-session-test URI/marker不变，绝不从另一包读取文件。
- Session字段/schema1继承；正式文本预算title120码点/action160码点，实验仍64/128。通过显式profile上下文验证，目录不能修改active/pending自包含快照。
- LOCAL默认；LOCAL活动/准备/IO/结果未知时不能开启手机控制，PHONE模式不能开始本地学习。新鲜手机PREPARING/ACTIVE/SAVING阻止新的LOCAL开始；断连未知允许独立但不称已证明手机空闲。

## 05C-1 手机只读目录与披露

- LearningItemEntity只读短事务，复用StorageMaintenanceGate/source生命周期；主线自动、最多12本，其余只能选择IN_PROGRESS。
- 独立noBackup本地设置保存目录披露同意/选中IDs；默认关闭，明确书名、页码、第一步及目录用途，不静默扩大旧权限披露；不增加新系统权限。
- 第一动作经FirstActionResolver.resolve，合法内容不当成已完成；空/无效允许腕端预设，每次用户实际完成后确认。

## 05C-2 协议

- 旧v1/v2字节与行为保持；v3能力有序READ_ONLY_SNAPSHOT[,SESSION_CONTROL],BOOK_CATALOG。v3手机快照/控制继续v2语义。
- 现有4096UTF8消息预算。目录schema1 books：id,title,totalPages,currentPage,firstAction,isMainline；ASCII稳定ID1..48，title120码点、action可空160码点，拒绝控制字符/孤代理/空文本；total可空1..999999，current0..999999且不超过已知total；IDs唯一，主线至多1。
- 目录最多12本/完整canonical16,384bytes/32片/单片data1024bytes/30秒固定总期限。合法长文本按原生行完整展示，超预算明确错误，不截断动作语义。
- GET_CATALOG knownRevision；MANIFEST revision/schemaVersion/totalBytes/partCount/bookCount/checksum；PART revision/index/data/checksum；ACK revision/PERSISTED；ERROR code。共用v3 client/request/stream上下文。
- CRC32是意外损坏检测，不是身份认证；revision为catalog-CRC8-bytecount。始终完整传输，完整canonical相等才幂等免写；同revision不同字节冲突停止。拒绝重复键/未知字段/迟到、冲突、缺片与超时。

## 05C-3 正式腕端

- 独立CatalogOwner校验双槽/序列/CAS/CRC、写另一槽并精确读回；成功才发布/ACK。中断保留上份完整目录，未知IO锁存，容量不删记录。
- App单例LocalOwner与CatalogOwner，共用CompanionStore transport。目录GET从同一已握手通道发送；完整确认后才可离线选择真实书籍。页内目录更新使过期预览拒绝开始，已活动Session快照不变。
- 白色UI与05B.3单次确认/忙碌/轻量tick/参考计时/主动继续/nullable页码保持。手机进度未更新、记录等待05D，明确文案。

## 05C-4 验证与交付

- 每责任路径先RED/GREEN；Node全量、Kotlin未过滤JVM/Lint/build，双端Golden字节fixtures，乱序/重复/冲突/迟到/缺失/断连/固定deadline/未知IO/损坏/精确读回/容量及活动快照/历史保护。
- 实际构建APK/RPK、元数据/公开签名/SHA、旧产物保留；相关自有原生模拟器验证与真机分别记录，不操作无关设备。
- 新包安装前当前同意及目标设备只读版本/签名/空闲核查；自然使用反馈为主，不制造结果或冗长人工矩阵。交付双端功能分支提交push和简洁报告，然后停05C。

官方复核：[Interconnect](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)、[file](https://iot.mi.com/vela/quickapp/zh/features/data/file.html)。官方卸载/转换建议不适用于本轮用户禁止边界。
