# 当前状态

更新：2026-10-14（Asia/Shanghai）。

## 当前阶段与授权

**05D / DEV_COMPLETE_AWAITING_DEVICE_NATURAL_USE**。独立完成记录可靠同步开发、自动化、原生隔离验证及配套产物核验已完成；用户自行安装已授权，尚未收到实际安装/数据库升级及真机反馈。合同见[05D方案](plans/MIRRA_BAND_05D_RECORD_SYNC.md)，最终事实以[交付证据](evidence/module-05d/README.md)、artifacts.json及verification.json、device-acceptance.json为准。不进入05E、不自动PR或合并main。

Band分支`codex/module-05d-record-sync`，基线`1c2ac537545f4d5cb365dfa7e276cbd24cd2425f`。Android隔离树`E:\CODEX\mirra-watch\.local\android-worktree`，分支`codex/mirra-band-05d-record-sync`，基线`6589a19f0305245fe0e63bf77f105f61f27a913e`。原手机工作区不修改；最终提交与推送由交付证据记录。

## 已接受的真实设备结果

- **05C.1：USER_REPORTED_PASS — PASS WITH NOTES**。用户确认正式0.4.1/code10真机视觉正常；05C真实书籍同步、离线独立使用与保存基本正常的反馈保留。0.4.0白底浅字失败及修复证据见[05C.1记录](evidence/module-05c-1/README.md)。不再将已通过视觉描述为待验收。
- Module03真实IDLE、用户确认的监测学习锁屏/腕端重进及首次NO_DEVICE自动恢复继承；05A选定file后端损坏恢复、同身份升级及正常重启保留为USER_REPORTED_PASS。
- 05B基本体验、05B.2详情/休息交互与0.1.3/code4跨实例参考计时恢复的用户通过反馈保留。05B.3的0.1.4/code5流畅度改善仍无明确认可，不推定性能验收通过。

上述反馈不证明全部OEM、掉电、原生SHA、长期耐久或跨重启可信时长边界。

## 当前实现与数据边界

正式`com.guanyi.mirra`同身份应用保留白色Mirra Blue、LOCAL独立学习、PHONE在线伴侣/有限控制及可靠离线目录。单Interconnect owner、单LocalOwner和独立CatalogOwner继续保留；本地活动/IO未知与新鲜手机活动/未确认控制按原模式门禁互斥。手机目录更新不修改活动Session的自包含书籍及动作快照。

v4协商`LOCAL_RECORD_SYNC`，兼容v1/v2/v3。新增手机记录同步披露许可默认关闭，不继承旧目录或只读许可。一次一条完整记录，4096字节帧、最多8片/每片1024字节、原文最多8192字节、固定30秒总期限。首个有效SNAPSHOT后才上传；共享通道在记录上传/确认期间暂缓普通快照、目录与手机控制。重传有界，不将SDK发送、HELLO或摘要相同当成持久保存。

手机Room v5新增独立不可变`wearable_completed_records`表，稳定installationId/sessionId复合键；同ID同原字节幂等，不同内容拒绝冲突。完整校验、事务提交和原文读回后才ACK。新表不注入study_sessions、不占用Active Session、不更新手机书籍页码或统计，不修改Intent/Session/监测算法。Full Backup format2/schema5包含原始记录；旧format1/schema4严格验证并完整重建到干净v5，闭库日志及回滚保护保留。

腕端主Session仍为schema1、原URI与8192字节单槽、最多8 pending；旧有效记录按原格式恢复。新增独立档案`mirra_local_record_archive_live_[ab].json`，每槽65536字节、最多64条，保存完整原始记录和稳定回执。只有双份最新镜像及精确读回证明后，才允许原CAS释放对应pending；未知IO/损坏/冲突不释放历史。档案原文不自动删除，counter连续覆盖检测归档消失/身份回退。每次新握手有界重放档案及pending，应对手机旧备份回退；64条或字节预算满时安全阻断，不承诺无限留存。8条确认并归档释放后可以继续第9场，仍受原字节及结束预留约束。

原生SHA-256经ASCII/中文/emoji已知向量自检；缺失或失败则停止同步，不使用CRC替代。CRC仅用于损坏检查。参考计时、第一动作明确完成、一次确认开始、休息到时主动继续、nullable结束页码及性能优化保持。档案历史确认不等于当前手机仍拥有记录；本地合法页码只是待确认进度。旧独立实验应用和记录不迁移、不跨包读取、不操作。

## 本轮验证与未验证

实际执行：Band未过滤Node **740/740 PASS**；124脚本/配置0错误；Android未过滤JVM **849/849 PASS**（91 suites）；最后Lint **0 errors / 20 warnings / 1 hint**。自有API37原生 **70/70 PASS**，59.033秒，0skip/assumption，包含真实迁移、SQLite失败回滚/文件库重开及新旧完整备份。首轮69/1旧fixture计数错误与0case启动ANR历史保留，修正后完整重测，所属AVD已正常关闭。实际APK **1.4.0/code9** 与正式RPK **0.5.0/code11**构建/原签名/摘要、六页颜色条件及签名编译包受控同步回归通过，精确产物数据见交付索引。

**Not Run / 未收到反馈**：05D原配对手机/国行9 Pro正式安装、真实用户Room升级、设备消息/原生SHA/记录确认及自然使用。用户已明确同意先备份后自行覆盖配套包并体验，记USER_SELF_INSTALL_AUTHORIZED，尚无实际结果，不重复要求同一授权或USB。Node、编译RPK受控运行及Android自有模拟器不能替代设备证明。真实DB直接操作/恢复、系统权限变更及其他不可逆操作仍须单独同意。

## 当前限制与停止点

墙钟累计只属参考值，跨重启可信连续性和未持久化的中间时间异常没有证明，不计入有效专注。档案可补传的前提是腕端保留原始档案；档案丢失或容量上限没有猜测性删除/修复。可读JSON/CSV明确只含原手机业务数据，完整原始记录保护依赖Full Backup2。

已交付配套APK/RPK与完整验证记录，停在05D自然使用验收。用户已同意先备份后自行覆盖APK1.4.0/code9、RPK0.5.0/code11（含APK正常Room4→5升级），开启「接收腕端完成记录」后自然体验；等待实际同步与保留反馈，见[evidence](evidence/module-05d/device-acceptance.json)。不强制USB或冗长人工矩阵，不进入05E。
