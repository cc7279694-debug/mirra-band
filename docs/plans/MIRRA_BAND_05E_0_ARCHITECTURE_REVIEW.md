# 05E-0 — 架构、数据准入与技术审查
日期：2026-10-15（Asia/Shanghai）。范围：方案及纯模型推演；05E-1～5未实施。产品规范见MIRRA_BAND_05E_PRODUCT_BASELINE_V1.md，不以技术便利改口径。

## 合同与基线
Goal：给冻结产品找到最小、安全、可验证的实施路径，明确不能证明的时间/数据边界。
Scope：只读双仓库源码/Schema/历史验证；文档、纯合成模型与ChatGPT冻结Packet架构审查。
Out of Scope：生产代码、协议、数据库/索引/备份格式变化、APK/RPK构建或安装、真实用户数据、归档删除、05E-1～5、PR/main合并。
Acceptance：关键入口/字段已核实；身份/时间/分页/进度/恢复设计不污染旧指标；模型结果和未执行项区分；真实ChatGPT审查独立记录；05D真机门禁未被推定通过。
Band基线42714a8919799238cbd295636b5c57a4c8fb6092，审查分支codex/module-05e-0-product-baseline。
Android基线8ae37f67ca7bba523d23f5198fddb8820f7066f7，审查分支codex/mirra-band-05e-0-review。原手机checkout1338b9a保持不改。
05D device-acceptance仍USER_SELF_INSTALL_AUTHORIZED_AWAITING_FEEDBACK：无线持久ACK、实际Room4→5及重进保留没有用户结果。本阶段不重复安装授权/USB，不声称可发布。

## 1. 已核实数据入口
Android文件均相对于该仓库app/src/main/java/com/guanyi/mirra；Band文件相对于Band仓库。
- data/repository/GlobalReadingHistoryRepository.kt:8–27、data/local/dao/SessionDao.kt:14：手机历史仅endedAt/id，50+1 keyset。
- feature/profile/GlobalReadingHistoryViewModel.kt:57、GlobalReadingHistoryScreen.kt:48、MirraApp.kt:233：去重/key/导航都按手机sessionId，必须升级为来源复合身份。
- data/local/entity/WearableCompletedRecordEntity.kt:6–15、dao/WearableCompletedRecordDao.kt:9：复合PK与receivedAt索引；书籍、结束、时间性质藏在canonical，无分页/单书索引，无书籍FK/级联。
- domain/wearable/WearableLocalRecord.kt:43–47,59–92,110–111：完整原文/区间保留；书籍快照仅id/title/startPage，没有总页数；页码只验证1..999999，未证明业务合法。
- feature/knowledge/LearningItemScreens.kt:194–241,307,354：原observeHistory还给速度/节奏喂数据；endPage?:startPage不能复制到腕端。
- domain/ReadingAnalyticsService.kt:16–29、domain/trends/TrendsAccumulator.kt:303：原normalReading/gross为整场时长，不能直接当排除休息的阅读区间。
- domain/ReadingRecordService.kt:21–28：FOCUS/DEEP_FOCUS→READING，其他段保持原独立类型；domain/SessionTimelineValidator.kt:34–60是旧有效专注准入，不等于新增参考/跨端时间准入。
- Band src/lib/formal-local-runtime.js:56–59：Date.now墙钟，monotonic=null/verified=false；schema1没有双端offset、误差、boot或校准有效期。
- data/local/dao/LearningItemDao.kt:64–65：advanceProgress会重复写updatedAt且没有完整冲突准入，不能原样重复协调。
- data/backup/BackupValidation.kt:14–22：严格拒绝views/triggers、验证Schema；未注册的SQLite view/索引不是“无需迁移”的捷径。

## 2. 来源与只读历史
类型化身份Phone(sessionId) / Wrist(installationId,sessionId)，不得依靠可碰撞字符串拼接。UI key、distinct、详情路由、游标和统计去重共享该身份；禁止创建手机Session代替腕端。
新的UnifiedReadingHistoryRepository/Projection只负责展示；原ReadingAnalyticsRepository、ReadingInsightRepository及Trends输入继续phone-only，不改原DTO含义。
腕端详情从原文精确身份查找并严格复核schema/SHA/bytes；展示快照书名/动作、原始区间、nullable页码、时间性质、当前关联书籍（若存在）及单独接收时间。不得INNER JOIN掉缺失书籍，不用名称匹配，不按当前书籍status删除历史。损坏原文保留，展示不可读取和覆盖不完整，不当空列表或跳过后声称全量统计。

## 3. 时间排序与稳定分页
区分“原始记录结束墙钟可供展示排序”与“已证明跨设备时钟可比较”。完整合理的腕端墙钟可排序但仍标参考时间；它不是校准证明。
已知回退/跳跃/缺失、不可表示日期或结构坏的结束时间放独立未知桶，绝不填receivedAt。未知桶按复合身份确定排序，不能归入某日完成总量。
总排序：结束桶 → endedAt DESC（已知桶）→固定来源顺序→installationId→sessionId。详情receivedAt仅接收元数据。
游标：viewGeneration、timeBucket、endedAt?、完整复合身份。50+1 lookahead；恢复/源退役或视图失效时拒绝旧游标并明确刷新，不悄悄拼接新视图。
snapshotNow/receivedAt水位不足以冻结集合：迟到历史可结束于过去，调时可改变接收时钟，原已存在Active手机记录也可在打开分页后变成Ended。
Room5正确性候选：同一captured Room/startup/gate、同一短withTransaction捕获PHONE已终结排序元数据，以及WRIST的PK+digest+bytes完整成员清单。腕端排序字段只在canonical内，不能声称一次轻量SQL即可得到。事务外再从固定成员按有界块读取不可变canonical，逐条复核身份/SHA/bytes后生成腕端排序；不在主线程/每次翻页/重组全量重复解析，不跨用户翻页持有长事务。
每次分块读取及最终发布仍进入captured gate.operation并检查源代际；任一成员缺失、摘要/字节不符、source退役或预算失败则整个视图失效，不能跳过该行后声称完整，也不抓最新container续读。viewGeneration属于该捕获source及一次构建；刷新生成新代际，取消/维护/恢复即退役成员、解析任务、页面与游标。成员、摘要、手机终结元数据及历史列表展示字段固定；新导入在刷新后的新视图出现。翻页不二次INNER JOIN当前书籍，不因更名/删除使成员消失；独立打开详情的最新关联书籍说明不改变列表视图。
这不是已证实的长期性能方案：手机历史和腕端导入数量可增长，必须量测1/50/51/1001/10001及长原文的首屏、峰值内存、解析次数、完整遍历和稳定性。有界预算不足时明确视图不可用/不完整，不隐藏超预算历史、不把前N条当完整总量。
现有Room5索引不能提供结束/单书高效seek；先做不变schema的正确性/性能实证，再独立决定Room6派生索引。不得未经证明依赖JSON1/窗口函数，不另建并行权威库绕过Room/Backup审查。

## 4. 页码协调（设计，未实现）
ACK仍只证明05D原文事务提交；进度协调成败不能倒置ACK。
拟用独立WearableProgressCoordinator复用当前Room/startup/StorageMaintenanceGate，触发为原始导入提交后、工作流结束、书籍再次合法、新容器startup完成；合并、有界、无高频轮询/第二SDK owner。
同一受gate保护事务：重读原文与摘要→bookId查当前书籍→重查当前页/总页/状态→活动工作流→条件更新。
仅匹配真实稳定书籍、IN_PROGRESS、原始start/end与当前范围合法（没有原始总页数证明），endPage非null，且不存在活动Intent/Session时应用。合法范围明确为当前totalPages为有效已知正数、currentPage/startPage/endPage均在1..totalPages且endPage>=startPage；原始startPage为空或当前总页数未知时保守暂缓，保留原文和原因，不猜补页码。V1保守选择任何全局活动工作流都暂缓；保存中PENDING仍active。暂停/完成不自动改状态，缺书不重建。
仅endPage>currentPage时currentPage=max(current,endPage)，才改updatedAt。等值/低值/null无写入，不改主线/status/completedAt/Session，不发重复通知，不更新统计。状态变化可重试，失败保留raw并显示“进度待处理”。
不新增永久applied flag/收据表：重复、迟到、并发和旧备份恢复后都根据当前事实重新检查，条件MAX天然幂等。若后来要求精确一次性副作用/审计，再独立评估权威收据与Schema/Backup，不能假装当前已有。
活动准入与条件写必须同事务；不可先UI判断后调用裸advanceProgress。原LearningItemRepository/StudyWorkflowRepository的状态门禁为继承证据，不改其手机转换算法。

## 5. 参考统计与ClockDomain准入
并列字段：原phoneEffectiveFocus / 原phoneNormalReading / 原StartMaintainRecover；wristReferenceFocus?、wristReferenceBreak?、未知条数；dualReferenceUnion?及原因/覆盖数。
timeUncertain=true包括WALL_ONLY和OWNER_CHANGED的可计算参考，不直接隐藏它们。硬回退、>6h单区间、缺端点、结构破损或已知mono/wall分歧使整场参考未知，沿用05D保守完整聚合；原文不改，null绝不转0。
手机参考候选区间另做闭合/parent关联/连续结构/无重叠空洞/算术/已知异常检查，再按原READING分类。FULL不是时钟可比证明；PARTIAL不自动否定合法READING段。UNMONITORED/RECOVERY等保留原类别与排除/覆盖说明，不悄悄改名或丢弃。
旧gross/normalReading、速度、剩余时间、节奏/洞察及有效专注公式一律保持，不把new参考指标塞进原趋势或ReadingSessionProjection。
当前原始记录没有持久跨设备校准/连续性证据，双端完整union返回null/CLOCK_DOMAIN_UNPROVEN。合理时差、同owner、FULL、ACK、自动时间设置均不能补造历史证明。不为显示总量擅改schema1/v4协议；未来校准证据方案另审，不能回填旧记录可信性。
纯模型可接收明确“已满足可比门槛”的合成区间演示并集，不能给实际旧raw加true。仅此门槛通过：取PHONE READING与WRIST FOCUS的[start,end)→裁剪窗口→按起点排序→合并重叠/相接→安全累加；BREAK排除、身份去重，同ID不同内容冲突，完全unknown不产完整总量。
部分可计算参考小计必须N/M及排除理由；某些记录未知不以已知子集冒充完整双端结果。按窗口/时区展示不修改原始时间或时长。

## 6. 数据与备份
05E-0不改变Room5/原始表/Schema/索引/Backup。当前原文足够无损详情与纯重建投影，现索引不证明规模性能。
若需Room6：另审派生索引列/timeBucket/compositePK/投影版本和digest；原始记录仍权威，坏缓存从有效raw重建，不遗漏未投影/坏原文。迁移、strict schema规则、closed bootstrap（当前仅4/5）、可信v5 reference与新旧备份映射/恢复需一并落实，不因“可重建”免责。
旧FullBackup1/schema4完整恢复后新腕端表为空；只能依赖仍完整保留的腕端档案新握手重放。不是merge，也不能从旧备份恢复未曾包含的记录。FullBackup2/schema5保持raw精确bytes和全部原手机事实/媒体。恢复/维护退役所有旧投影、游标和writer，不能旧任务重新抓最新container继续写。

## 7. 待实施验证矩阵与门禁
身份冲突、相同结束跨页、50/51/迟到/调时/未知桶、取消/重试/恢复旧游标失效；更名/暂停/完成/删除书籍、空页码/越界/总页变化。
条件进度的null/equal/lower不写updatedAt；同/跨书活动、BREAK/PENDING、事务间并发开始、并发MAX、取消/失败/旧source、旧备份回退重建。
统计重叠/包含/相接/重复/多段/BREAK排除、未知不转0、结构坏/时钟异常/窗口裁剪/DST/溢出、独立旧模型输入结果不变。
05D必要真机结果待用户自然反馈；ChatGPT架构审查另记录，不以Codex子审查替代。05E-1～5执行/正式安装/数据写入仍需明确进入授权，高风险Schema/恢复/清理独立审查。本方案不是发布许可。

## 8. 本次证据分类
CODE_INSPECTION：上述文件/字段/生命周期核查。
MODEL_ONLY：合成输入的纯数学/身份/条件更新语义推演，结果见evidence/module-05e-0/model-results.json；不是生产API/Room/设备测试。
INHERITED_05D：740 Node、849 JVM、70隔离原生属于已交付05D历史，本阶段未重跑，不充当05E回归。
CHATGPT_REVIEW：冻结Packet外部独立审查，实际发送/结果见evidence/module-05e-0/review-status.json；未完成不标PASS。
NOT_RUN：05E生产实施、真实SQL/迁移、APK/RPK构建/安装、真实数据/无线、Vela像素/性能及原生新回归。

## 9. 独立审查结果（冻结Packet之后记录）
ChatGPT实际读取冻结Packet并返回PASS WITH NOTES（仅架构），原文/Packet摘要/发送及重试状态见evidence/module-05e-0。N1～N6对应上述固定快照/容量、事务条件MAX、ClockDomain、参考/硬异常、恢复退役、复合身份及旧统计隔离，必须作为后续生产验收条件；尚未证明SQL/容量/真机，不将Notes标已解决。审查中20处Git blob/工作区SHA差异实际证实仅LF/CRLF，节选边界继续保留。产品仍冻结、05D必要真机反馈仍待补充、05E-1～5未实施；架构审查不是发布许可。
