Mirra Band 05E-0 独立架构审查

审查日期：2026-10-15

结论：PASS WITH NOTES（仅限架构）

一、证据完整性

我已重新实际打开 ZIP，读取 manifest.json、SOURCE_IDENTITIES.json，并逐项核对 manifest 声明的全部 33 个文件。

核验结果：

- ZIP 共 35 个条目，包含 33 个冻结证据文件。
- 33/33 文件存在。
- 33/33 文件字节长度与 SHA-256 匹配。
- 33/33 的 truncated 均为 false。
- ZIP CRC 检查通过。
- 未发现缺失、损坏或字节截断。

注意：部分 Android 文件本身是 excerpt（源码摘录），不能视为完整源码。SOURCE_IDENTITIES 显示部分冻结 Android 文件与记录的工作区 SHA 不一致。本次只依据冻结字节，不推定当前仓库状态。

33 项 MODEL_ONLY 通过不等于生产实现或真机通过。

二、Blocking

未发现足以直接否决 05E-0 核心架构的已证实 Blocking 缺陷。

但以下关键问题若在后续实现中未解决，将构成阶段验收阻断。

三、关键 Notes

N1【高】历史快照一致性与容量风险

位置：架构文档 §3、SessionDao.kt、WearableCompletedRecordDao.kt。

触发：分页期间新增记录、恢复数据库、超过万条历史或存在大型 canonical。

风险：重复、漏页、内存超限及跨 Room 读取。

最小修正：同一 captured Room/gate 短事务捕获 PHONE 终结元数据和 WRIST PK/digest/bytes，事务外有界分块解析并复核。退役即使游标失效；验证 1/50/51/1001/10001 条。性能不足不能截断冒充完整历史。

N2【高】进度协调事务安全

位置：架构文档 §4、LearningItemDao.kt、StudyWorkflowRepository.kt。

触发：页码协调与 Intent、Session、PENDING 或书籍状态变化并发。

风险：越权推进页码、重复修改 updatedAt。

最小修正：同一事务重查状态、活动工作流、当前页和总页。仅合法 endPage 大于 currentPage 时执行 MAX；等值、低值、未知及冲突不写入。

N3【高】跨设备时间不可比较

位置：formal-local-runtime.js、WearableLocalRecord.kt、架构文档 §5。

现有旧 raw 无持久时钟校准、误差与有效期证明。

最小修正：实际双端总量保持 null/CLOCK_DOMAIN_UNPROVEN。合成区间仅验证去重并集算法，不得赋予旧 raw 可比资格。

N4【中高】时间异常与参考统计

位置：架构文档 §3、§5。

WALL_ONLY、OWNER_CHANGED 允许保留合理的单端参考时长；硬回退、超限、缺端点及结构损坏应返回未知。未知结束时间不得用 receivedAt 替代。

合成统计应验证 BREAK 排除、重叠合并、身份冲突、窗口裁剪及整数溢出。未知不能变成零。

N5【中高】恢复与旧任务退役

位置：StorageMaintenanceGate.kt、备份相关文件、架构文档 §6。

恢复或维护后，旧快照、解析任务和分页游标必须全部失效，不能重新抓取新 Room 接续旧任务。

Room5 raw 保持不可变。旧 FullBackup1/schema4 不包含腕端 raw，恢复后不能凭空重建，只能依赖仍存在的腕端档案重新同步。

N6【中】来源身份与旧模型隔离

位置：GlobalReadingHistoryRepository.kt、LearningItemScreens.kt、ReadingAnalyticsService.kt。

全局历史和单书历史必须统一采用 Phone(sessionId) / Wrist(installationId,sessionId)，不得用书名关联或将腕端记录伪装为手机 Session。

原有效专注、Start/Maintain/Recover、速度和节奏模型继续严格 phone-only，不修改冻结统计口径。

四、产品冻结基线判断

05E-0 对 Product Baseline V1 的架构映射基本符合要求。

核心边界清晰：腕端参考阅读独立展示、来源身份分离、跨端时间不强行比较、原始记录保留、旧统计体系不受污染。

但上述属于设计符合，不代表生产代码已经验证。

五、最终结论与门禁

架构审查：PASS WITH NOTES。

允许：

- 记录本次独立审查结论。
- 保留并冻结架构方案及 Notes。
- 继续补充不修改生产代码的验证矩阵、容量预算和事务约束。

仍需授权：

- 05E-1～05E-5 生产开发。
- Room6、Schema 或备份格式变更。
- 实际数据写入、恢复及设备操作。

05D 真机门禁继续保留：无线记录持久同步与 ACK、手机 Room4→5 升级、重进后 raw 保留，均尚待实际反馈。

最终意见：05E-0 可以作为后续开发的架构依据，但关键 Notes 必须成为验收条件。不得据此宣布 05E 实现完成、真机 PASS 或批准发布。
