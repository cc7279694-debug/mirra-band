# 05E-0 架构与数据准入审查

日期：2026-10-15（Asia/Shanghai）。产品基线 **ACCEPTED / FROZEN**；不是生产实现、发布或真机PASS。

## 1. 本次完成范围

核对双仓库真实HEAD、工作区、Room5不可变原文、历史/详情/统计入口、活动工作流、时间事实及Full Backup兼容。形成[技术审查方案](../../plans/MIRRA_BAND_05E_0_ARCHITECTURE_REVIEW.md)，保持[冻结产品口径](../../plans/MIRRA_BAND_05E_PRODUCT_BASELINE_V1.md)。ChatGPT外部审查实际状态见[review-status.json](review-status.json)，不得用内部审查或模型通过替代。

ChatGPT已独立完成 **PASS WITH NOTES（仅架构）**，完整原文见[chatgpt-review.md](chatgpt-review.md)。首次回复页面无法加载且复制为空，一次重载未恢复；同一对话纯文本重发后完整复制并读回核对。没有把第一条不可读结果算成通过，没有以Codex子审查替代。

核心方案：类型化来源复合身份；捕获固定成员的只读分页视图；独立腕端详情；原始接收与条件页码MAX分开；参考阅读与旧有效专注/速度/节奏隔离。实际legacy原文没有双端时钟校准证据，因此不制造双端总量。

## 2. 修改文件

Band新增两份产品/技术方案及本目录模型、冻结Packet元数据、外部审查状态/结果和验证证据；仅更新AGENTS、CURRENT_STATE、DECISIONS、ROADMAP。Android隔离树仅更新AGENTS、CURRENT_STATE、DECISIONS。没有删除文件，没有修改应用源码、依赖、Schema、签名或旧产物。

## 3. 数据层

**无变更**：Room5、腕端schema1、原始表、索引、StorageMaintenanceGate、Session、目录/记录协议、Full Backup1/schema4与2/schema5全部继承。原手机工作区、真实数据及腕端档案未操作。技术设计中的条件MAX未实现；需要Room6或派生索引时仍要独立Migration/Backup评估。

## 4. 实际验证

- Node v24.18.1：**33/33 MODEL_ONLY PASS，0 FAIL**，见[模型结果](model-results.json)及可复现[独立模型](model-scenarios.cjs)。覆盖来源身份、区间重叠/去重/休息/未知、固定集合50/51分页、页码MAX/活动阻断/恢复后重新准入。仅合成模型语义，不证明生产API、SQL事务或设备性能。
- 冻结Packet：33文件、267677包含字节、无截断；ZIP每份文件SHA-256与manifest精确核对。源码绑定两个已验证基线，节选明确保留原行号/完整文件摘要；不包含DB、签名、凭据、设备日志或个人数据。
- Packet为dist/Mirra-05E-0-Architecture-Review.zip，172678字节，SHA-256 `44d1e3f0951b96619dc4b1117e7e6a6e1c4ef124aa50e5f70d8e0737a1baa9e9`。ChatGPT审查引用的20处blob/工作区原始字节摘要差异，经实际LF/CRLF归一化核对全部相等，见[source-eol-verification.json](source-eol-verification.json)；不能由此推定节选包含完整文件。
- 既有APK1.4.0/code9、正式RPK0.5.0/code11实际SHA-256未改变；本轮未重新构建/安装。05D的740 Node、849 JVM、70原生PASS仅为继承历史，未重跑，不作为05E结果。
- `Not Run`：05E-1～5生产实施/回归、真实Room/迁移/Backup测试、APK/RPK构建、设备安装/无线、原生像素及长期性能。原因：当前只授权05E-0设计/核查/模型，实际05D设备反馈未到。

## 5. 当前风险与门禁

Room5的排序字段在canonical内，固定成员再解析的正确性有模型支持，但真实IO/隔离及1～10001条性能未证明；预算不足须明确失败，不隐匿历史。已知时间异常/未知结束不补造；任何墙钟参考都不升级为有效专注。旧完整备份不包含腕端表，补传依赖仍保留的原始腕端档案。

外部Notes N1～N6均继承为未来实现的验收门槛：固定源与容量性能、同事务页码MAX、跨端时钟域证据、合理参考/硬异常区别、恢复后旧任务退役、复合身份及phone-only旧模型。设计已覆盖这些约束；真实SQL、容量性能及后续实现尚未完成，不能标成Notes已在生产验证。

05D仍为`USER_SELF_INSTALL_AUTHORIZED_AWAITING_FEEDBACK`，实际Room4→5、无线完整ACK及重进保留没有用户反馈。已有用户自行安装许可保持，不要求USB、不重复询问。外部审查结果与05D必要真机结果未齐全时，不把05E视为可发布。

## 6. Git

Band：`codex/module-05e-0-product-baseline`，基线42714a8919799238cbd295636b5c57a4c8fb6092。
Android隔离树：`codex/mirra-band-05e-0-review`，基线8ae37f67ca7bba523d23f5198fddb8820f7066f7。
仅提交/推送本次文档及MODEL_ONLY证据；最终提交由Git日志及最终报告记录。没有PR或main合并，原手机checkout1338b9a不改。

## 7. 停止点

停在05E-0技术审查，等待05D自然使用事实及后续实施准入。05E-1～5、正式安装、真实数据/恢复或归档清理均不由本报告授予。
