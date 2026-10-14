# 05D 交付与验证记录

日期：2026-10-14（Asia/Shanghai）。状态：DEV_COMPLETE_AWAITING_DEVICE_NATURAL_USE，正式设备安装与真实用户数据库操作未执行。本记录精确数值见 artifacts.json、verification.json。

## 1. 完成功能

正式应用新增 v4 LOCAL_RECORD_SYNC，保持 v1/v2/v3。用户单独同意记录披露后，完成记录通过既有唯一 Interconnect 所有者自动传输。完整原字节校验、Room 事务提交及读回后，手机才返回绑定安装身份、Session、内容摘要、字节量和通信上下文的 ACK。同 ID 同原文幂等，不同原文冲突，不能仅凭 OFFER 摘要直接确认。

腕端先验证 ACK，再把完整原始记录与稳定回执保存为双份最新档案，并分别精确读回；最后按原 CAS 释放对应 pending。手机提交但 ACK 丢失、腕端确认 IO 失败或晚回执不会假同步。新握手重放保留档案，应对手机旧备份回退。8 条确认归档后可开始第9场，字节预算仍适用。

新增入站记录 FIFO 修复原生单 worker 忙时丢弃连续分片的问题：最多10条在途/排队、32768字节，逐帧复核授权，溢出退役。首个有效 SNAPSHOT 后才上传；上传期间暂缓快照、目录和手机控制，避免同通道竞争。每条固定30秒、最多3次本流尝试，错误保留记录。

## 2. 修改文件

完整新增/修改清单见 changes.json，无删除业务文件。

Band 新增 record-model/envelope/wire/sync/archive/history-guard、原生 SHA 适配器、v4 fixtures/schema及协议/故障/归档/端到端回归；修改正式 runtime、CompanionStore、LocalOwner/Journal 的窄归档准入、历史确认展示与构建验签检查。保留 local-session 状态机、local-codec 原始格式、白色主题、计时、第一动作确认和单次开始优化。

Android 新增独立 Entity/DAO/Room receiver、v4 协议/Coordinator接线、独立记录披露设置、可信旧 v4 备份参考；修改 Migration/FullBackup/闭库恢复校验和设置 UI。原手机工作区未改。

## 3. 数据层变化

- 手机 Room4→5：只新增不可变 wearable_completed_records 表，复合主键 installationId/sessionId。旧 schemas1–4 不改；不注入 study_sessions、书籍进度、监测或统计。
- Full Backup2/schema5 包含新记录原文。旧 Full Backup1/schema4 严格验证后，全部12个旧权威表与媒体重建到干净v5，新记录表为空，随后可由腕端保留档案补传。不直接迁移不可信 incoming 库。闭库日志与恢复回滚保护保留。
- JSON/CSV仍明确只导出原手机业务表；完整腕端原文保护依赖 Full Backup2。记录同步许可与选书/控制设置位于独立 no-backup 本地设置。
- 腕端正式主 schema1、原 URI、8192字节单槽与8 pending不变。新档案每槽65536字节、最多64条，无自动删除；counter连续覆盖检查归档丢失、身份回退。双副本不确定时不释放历史。
- 旧独立实验应用和全部实验记录保留，不迁移、不跨包读取。现有签名材料只复用，未转换或替换。

## 4. 实际验证

已执行的命令、次数、环境和结果见 verification.json：

- Band 全量 Node740/740 PASS，124脚本/配置检查0错误；Node24.18.1 + aiot-toolkit2.0.5实际构建。
- Android全量JVM849/849 PASS（91 suites），最后lint0 errors/20 warnings/1 hint。APK与testAPK实际 BUILD SUCCESSFUL in12m40s；最后fixture修正后的testAPK/Lint增量构建 BUILD SUCCESSFUL in4m18s。没有为native测试修改最终APK/RPK。
- 实际签名RPK运行在Node原生形状回调与合成手机提交环境：首快照后上传、完整原文/ACK、提交无ACK不释放、上传时禁止控制、单SDK、双镜像读回后退休及资源取消均PASS。六正式页各256条件分支颜色/绑定检查PASS。这些不是Vela固件或无线实测。
- 受控端到端：8 pending、ACK丢失重传、8唯一手机行、双档案、手机合成备份回退重放、同身份第9场及待确认页码。失败注入覆盖档案写/读回/未知IO、损坏/回退、乱序/缺片/超时/迟到/冲突。
- 自有API37原生最终70/70 PASS（18项新增05D + 52项相关回归），0fail/skip/assumption，59.033秒。真实4→5/1→5、SQLite INSERT ABORT回滚/安全重试、file-backed闭库重开/幂等、备份1→5及备份2完整恢复、旧备份回退重放、新旧目录/控制/手机事实与1000条笔记恢复均实际执行。所属AVD无wipe/卸载/清数据，结束已正常关闭且进程退出；只用合成fixture。
- 审查确认非法 context 的 fail 未定义，精确断言先RED，最小修复后8/8GREEN，并重跑全量与RPK。新增真实SQLite INSERT ABORT和file-backed close/reopen fixture弥补验证缺口。早期RED和 fixture授权接线失败记录留在忽略的.local，最终结果不抹去失败历史。
- 首轮原生70项实际69 PASS/1 FAIL/0 skip/0 assumption，123.281秒。18项新增05D用例全部通过；旧1000条笔记恢复fixture误要求新腕端表也有1行，修正为旧表保持1行/腕端表明确0，保留原失败日志，再完整重跑70项。最终结果另列，不将修正代码当通过。
- 另有一次API37 BIND APPLICATION启动ANR，0 case实际执行，日志显示88% iowait；同一未改APK、未重装/清数据，环境稳定后完整70重测通过。不把此未执行attempt计为业务失败或通过，保留环境限制。
- 27项旧产物/依赖摘要不变；原手机checkout1338b9a干净，旧Schema1–4及学习状态机/算法保护检查通过。

Not Run：05D配对手机/国行9Pro安装、真实Room升级、真实SHA及无线记录ACK、自然使用、掉电/OEM/长期耐久、Vela336×480本包实际像素。原因：本轮仅授权隔离开发自动化，新正式安装和真实数据风险操作须另行当前同意。05C.1已确认真机视觉 USER_REPORTED_PASS — PASS WITH NOTES 保留；不重复定义为未完成。

## 5. 当前问题与恢复边界

墙钟为参考时长，不等于可信跨重启连续时间，不计入有效专注。既有0.1.3重进计时成功保留；05B.3真机流畅度仍未获得明确反馈。

档案不自动回收原文。64条或65536字节容量到达时安全阻断；长期历史清理/导出删除未授权。手机旧备份补传依赖腕端原始档案仍完整可读，不能保证已丢失档案的恢复。主槽存在总字节与结束预留，8条不是任意长记录都能装入的承诺。

原生SHA接口需已知向量自检；缺失则明确停同步，不以CRC代替。跨语言Golden包含中文、emoji、分数与极小数，手机保留原始数字词法及字节；没有宣称任意恶意JSON数字别名的完整ECMAScript规范化证明。正式时间源monotonic为null，原文去重不因数值等价而覆盖。

新数据只保存原始独立记录，不进入手机学习历史、统计或进度；05E未实施。本次没有正式设备SAFE_TO_INSTALL三方预检，也未更新真实用户数据库。

## 6. Git与产物

Band：codex/module-05d-record-sync，基线1c2ac537545f4d5cb365dfa7e276cbd24cd2425f。
Android：codex/mirra-band-05d-record-sync，隔离基线6589a19f0305245fe0e63bf77f105f61f27a913e。
最终提交/普通Push结果由交付索引与最终回复记录。不创建PR，不合并main。

APK：E:\CODEX\mirra-watch\dist\Mirra-1.4.0-band-record-sync-debug.apk，1.4.0/code9，17016301字节，SHA-256 1f1ad829a179318d640190b6d1ddaefd37a23431c3e03b66a7426fe5ab0faaac。
RPK：E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.5.0.rpk，0.5.0/code11，87768字节，SHA-256 e3063f93832f4113585a1490fc2e9def54fd0c7bcfae90534a4af7dc48b56d3f。
两者com.guanyi.mirra，证书SHA-256 29ded26bea44f1afe4fe383a302e4b507423d16223469d7da3fe578d9a7f83b9，旧交付身份一致。APK v1/v2、RPK RSA-SHA256/内容与文件签名、ZIP CRC及篡改拒绝均实际核验。已安装实体版本/指纹未本轮核查，不能扩大为三方实体SAFE_TO_INSTALL。

## 7. 下一步：仅05D自然使用验收

另取当前正式安装/真实Room升级同意后，自行在没有正在进行学习时直接覆盖配套APK和正式RPK；不卸载、不清数据、不降级、不更新旧独立实验。覆盖前先在手机导出一份完整备份并保留旧APK；Room升级后不要直接安装旧APK试图降级。

在手机“手环伴侣”明确开启新“独立学习记录同步”披露许可，手环用真实目录自然完成一次短学习。连接后查看本次记录确认，退出重进保留；不必USB或长人工矩阵。断连时仍保留待同步，失败及时反馈实际提示。本步骤目前未授权执行；停05D，不进入05E。
