# 05D — 独立学习记录可靠同步合同与实施方案

日期：2026-10-14。用户已授权方案、隔离开发和自动化；不含正式设备安装、真实用户数据库写入/恢复、清数据或不可逆操作。

## 基线与已接受结果

Band实际1c2ac537545f4d5cb365dfa7e276cbd24cd2425f，分支codex/module-05d-record-sync；Android隔离树实际6589a19f0305245fe0e63bf77f105f61f27a913e，分支codex/mirra-band-05d-record-sync。原手机checkout1338b9a未改。

用户确认0.4.1/code10真机视觉正常，05C.1为USER_REPORTED_PASS — PASS WITH NOTES。05C真实书籍/离线/保存基本正常的反馈继承；OEM覆盖、原生SHA实现、可信跨重启计时、长期耐久和05B.3专门性能测量不外推。

## Goal / Scope / Non-goals

独立完成记录经同一个Interconnect owner传到手机独立表，事务提交后ACK；腕端校验并持久保存回执才确认。覆盖断连/重启/重传/ACK丢失/迟到、旧schema1和旧完整备份、确认后的第9场。

允许Room4→5、专用不可变完成记录表和Full Backup2/schema5，以及旧1/schema4安全读取/重建。保留原手机Session/唯一Active/Intent/监测/学习/统计，记录不注入study_sessions，不更新手机书籍页码。05E历史整合/统计尚未实施。不加云、账号、Bridge或第二SDK owner。不迁移/操作独立实验；不自动PR/main合并。

## 05D-0 已核实风险

- 正式Session文档schema1，MAX_PENDING8、MAX_INTERVALS32、8192B整槽，非FINISH预留1024B；historyError禁止pending消失或改内容。
- 结构合法的极值Session可达14619B，现codec不会保存此大小。真实8192B槽内单Session最大构造7979B；canonical为{schemaVersion:1,installationId,session}，比原envelope至少少162B，8192B传输上限覆盖现存量。每片1024B、最多8片；重新检查每帧4096B，切片按Unicode码点，极端转义也有边界测试。
- 原installationId64+ordinal16+冒号产生Session ID81，不能复用旧wire ID80。完整记录depth6/8192B独立严格解析，不放宽原wire depth4/4096B。
- 手机BackupArchive/Validation/闭库恢复日志写死format1/schema4，单改Room版本会破坏恢复；同时调整可信schema4参考、干净schema5复制及闭库v4/v5日志验证，不迁移或发布不可信incoming库。

## 05D-1 手机接收与备份

新增独立记录表，复合键installationId/sessionId，存原始canonical TEXT、SHA256和必要只读投影。无业务表外键/级联；同ID同原字节幂等，字节不同冲突，即使摘要相同也不覆盖。OFFER不凭摘要直接ACK，完整payload必须再次核对。当前gate/startup/Room捕获所有者，短withTransaction返回后才允许当前通信context发送ACK。

MIGRATION_4_5仅新增独立表/索引，保留1–4 schema及完整旧业务。新Full Backup2/schema5必须包含记录原字节与精确计数；旧1/schema4按冻结可信布局校验，复制全部旧权威表到干净5，新表为空，再校验。不接受未知格式/schema组合，保留恢复日志/回滚保护。测试只用隔离fixture/自有模拟器，无真实数据。

## 05D-2 协议与能力

v4 LOCAL_RECORD_SYNC兼容旧v1/v2/v3；新接收披露同意默认关闭，开启后才协商上传。OFFER→NEED→有界PART→COMMIT→ACK/ERROR；一次一条，固定30秒总期限，重复/乱序片不延长。所有消息绑定client/request/stream和sourceInstallationId/localSessionId/recordDigest/totalBytes。8片×1024B、4096B消息，严格重复key/Unicode/字段/结束边界校验。

完整摘要使用官方system.crypto.hashDigest SHA256，固定ASCII/中文/emoji自检，不支持则明确停同步，不用CRC替代；每片CRC只检查意外损坏。AndroidJCA/Nodecrypto为独立oracle。官方接口存在不证明9Pro已支持，真机证据仍待安装授权后自然使用。

## 05D-3 腕端保留与容量

主Session schema1和原URI/8192B预算保持兼容，不将旧数据当空。新完成档案双槽独立65536B/最多64记录，保存完整原始wrapper和稳定确认收据；不自动删除任何档案。双槽必须镜像最新完整档案且逐份精确读回，再允许LocalOwner按原CAS退休对应pending；未证明档案、摘要/原文不对应、任何不确定IO都不释放pending。原默认历史保护保持，正式归档证明是唯一删除pending的窄例外。

一次新的HELLO有界重放保留档案和pending，不另造持久手机restore epoch。手机旧备份回退后缺失行重新接收；已有行比原字节去重。同步已保存不代表永不需要核对。归档raw继续参与合法腕端待确认页码投影，不改变手机进度。64条/字节总限满时明确阻断并保留全部记录，不承诺无限留存/无限继续；清理/导出删除流程未授权。第9场验收条件是8条全部确认、双副本归档与pending释放完成；原共享字节/结束余量依然适用。

## 05D-4 验证与交付

纯协议/Golden、失败注入、断片/乱序/超时/迟到、DB提交后ACK丢失、事务失败/重启、回执IO失败、schema1兼容/损坏恢复、8→确认→9、Room真实4→5与旧/新Full Backup恢复及原业务回归。Node全量、AndroidJVM/lint/APK/testAPK、自有Android原生迁移/备份；RPK实际构建/签名/摘要/编译浅色主题和受控端到端。真实设备、OEM、nativeSHA/长期耐久未做则Not Run。

交付双端版本递增、原签名APK/RPK和证据/分支提交，停05D。新正式安装与真实DB风险操作另取当次明确同意；自然使用验收不强制USB或冗长人工矩阵。
