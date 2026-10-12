# 05A — 国行 9 Pro 持久化实验交付

日期：2026-10-12（Asia/Shanghai）。状态 **DEV_COMPLETE_AWAITING_DEVICE_PROOF**。开发、自动化和 RPK 构建已完成；用户已确认默认 storage 的保存/退出重开正常，记作 **USER_REPORTED_PASS**。file、故障恢复、升级和设备重启仍待真机结果，不进入真实学习或手机迁移。[合同](../../plans/MIRRA_BAND_STANDALONE_V1.md)

## 1. 已实现

独立「Mirra存储实验」包，单页、深墨/Mirra Blue、持续标识隔离测试数据。可切换 storage/file、保存中文结构化样本、执行有界 1/4/8/16/32 条批次、故意截断实验槽后恢复、注入写入失败后重新读回。故障动作只处理本实验合成数据，未构建真实 Session。

双槽快照含版本、标记、序号、严格字段/Unicode 与 CRC32；每槽最多 8192 UTF-8 字节。写入另一槽、精确读回校验后才显示确认；未知格式、双槽坏、读取失败或序号冲突停止。超时与原生调用不确定时锁住后续 IO，禁止重试或切后端绕过；晚回调无效。退出接口和内存实例标记用于区分普通重进与重新创建 owner；不是 boot ID/可信计时证明。

没有 Interconnect、手机 SDK、云服务或保活权限；不会改手机学习。旧正式 APK/RPK 已重新计算摘要，与 Module 04 交付完全一致。

## 2. 文件变化

新增 `probe-app.ux`、`probe-controller.js`、`probe-journal.js`、`probe-storage.js`、`StorageProbe/index.ux`、source profile filter 及七组实验测试。修改构建 profile、staging/验签/检查脚本、现有 builder 外部边界测试与 package scripts。AGENTS/PROJECT/DECISIONS/ARCHITECTURE/ROADMAP/CURRENT_STATE 按实际实验范围更新；完整用户产品方案保存在一个合同文件，无重复冻结。

正式 app.ux、业务/控制模块、v1/v2/schema/fixtures、Logo、依赖版本及 package-lock 不变；没有删除产品文件。手机仓库仍 `codex/mirra-band-control-bridge@30a8af3fdea225cc96db6a360d71383a85b7ea39`，工作区干净，原手机工作区未操作。

## 3. 数据层与安全

实验包 `com.guanyi.mirra.band.storageprobe`；不覆盖 `com.guanyi.mirra` 或旧演示包。专用 key `mirra_05a_journal_a/b` 与 Files URI `mirra_05a_journal_a/b.json`，没有 storage.clear、delete、move 或任意路径访问。CRC32 仅检测意外损坏，不是防篡改认证。

手机 Room v4 blob `97ae3a8a15aeb924350b4b7ecade389b314f7ebf`、Schema/Migration、Full Backup v1、统计和学习算法、签名身份均不变，没有原始用户数据库访问。不需要新 APK；当前实验与未来 Room v5/同步收据/备份扩展分开授权。

## 4. 实际验证

最终完整 `npm test`：**274/274 PASS，0 failure/cancel/skip/todo**，单次未过滤运行。实验前基线 **184/184**。语法/配置检查 **47 scripts / 0 errors**；源正式 manifest 四路由与实验 profile 单页分别核对。两版 RPK 实际官方 release 构建 **11625ms / 1153ms，exit0**；固定 aiot-toolkit 2.0.5 与 Node24.18.1，未改变全局环境。

实际 RED→GREEN：journal 原 30 项行为失败及稀疏数组失败；平台 18 项行为失败、安全回调失败及空字符串删除边界失败；页面 12 项及后端切换/读回/退出边界失败；controller 8 项、实例标记、时钟前跳/安全诊断失败；身份 2 项，以及放宽 staging 后实际 2 项隔离测试失败。首次完整运行另有 4 个现有 builder harness 未识别新 source-filter 边界的失败，已保留日志并更新真实 filter 约定，不删断言；最终完整门禁清零。

含真实临时文件的重建/截断恢复测试，以及真实 UX 脚本 + adapter + journal + controller 的超时/隐藏/重进/晚回调链测试。Node 原生边界用受控回调，不当成 Vela 实际 API 执行或像素；真实临时文件是电脑文件系统，不等于手环掉电耐久性。

独立 RPK 检查：RSA-SHA256、内容/逐文件摘要、签名元数据、CRC、正确实验包/版本/单页/功能列表、三种篡改拒绝；没有 private material、伴侣页面或 Interconnect。完整二进制元数据见 [artifacts.json](artifacts.json)，测试与边界摘要见 [verification.json](verification.json)。本机原始日志在 `.local/module05a-evidence/`，不上传设备敏感日志或签名材料。

## 5. 待验证及限制

用户已同意自行安装 0.1.0 并反馈基本保存/退出重进。在明确的默认 storage、保存实验记录、退出实验应用、重新打开、核对中文样本与序列步骤后，回复“没问题”。这是用户对该流程的确认，保留为 USER_REPORTED_PASS；没有设备截图或读回日志，实际版本、序列数值、文本、实例标记、耗时与是否创建新 JS owner 未独立核对。不能扩大为 file、升级/重启或完整 05A 已通过。

| 国行 9 Pro 证据 | 状态 |
| --- | --- |
| 默认 storage 保存、中文样本与序列退出重开保留 | USER_REPORTED_PASS；用户回复“没问题”，无开发端设备画面 |
| 真实 file 写读、正确错误码、原生回调与耗时 | Not Run |
| 返回表盘/息屏后重进、退出后新 JS owner 创建 | Not Run；基本退出重开反馈不证明实例重建 |
| 同实验身份 code1→2 升级后记录保留 | Not Run；须另行同意并先保存可核对样本 |
| 设备重启后的保存与时钟可靠性 | Not Run；须当前重启许可 |
| 写入/损坏/中断恢复的固件表现 | Not Run；自动化只是应用策略证据 |
| 实际数量、配额、时延、空间限制 | Not Run；32 条/8192 字节是实验设计上限，非实测容量承诺 |
| Vela 像素、圆角/触控/滚动/长中文 | Not Run；未用概念图冒充运行截图 |
| 非正常掉电后的耐久性、并发 native IO 跨进程边界 | Not Run；读回或 `$app.exit` 文档不能证明 |

当前未运行 Vela 原生模拟器：已有 Windows 模拟器在应用加载前的启动阻塞记录；本轮没借 Android 模拟器声称 storage/file 运行通过。TypeScript/ESLint/Android tests/build Not Run：授权原生 JS，手机代码无变化。未引入真实独立计时，无法外推 05B；未监测腕端阅读以后也不能冒充有效专注。

## 6. 产物与 Git

Band 功能分支 `codex/module-05a-persistence-probe` 从 Module 04 `92a30ad104381840702b1871140142e7874c62b0` 创建。实现提交 `e52ca66d66d474c77faf9502bbb3227f2419e0bd` 已提交并推送，实际远端分支 SHA 与本机一致；不合并 main/创建 PR/发布。手机保留原功能分支与 HEAD，无新增手机提交或 APK。

| 实验包 | bytes | SHA-256 |
| --- | ---: | --- |
| 0.1.0 / code1 | 18,590 | `861e26f980aa4f8a608fed9c3e18118dfc2261832fa93e46255752e6417fbb04` |
| 0.1.1 / code2 | 18,598 | `b1b51540cbb7e012de6ea2842b05c39752a1653f53fc6c178a92cb36d957d7b1` |

绝对路径为 `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.band.storageprobe.release.0.1.0.rpk` 和同目录 `.0.1.1.rpk`。两者复用既有实验证书：`B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B`，身份匹配且版本单调；没有转换或替换正式签名。签名主体名称继承 Mirra Band Demo，包名/入口/测试槽独立。

## 7. 下一步

0.1.0 首次自行安装和基本 storage 存取/退出重进已得到用户反馈，不重复要求这段流程。用户沿用成功的「表盘自定义工具」与独立「Mirra存储实验」；无需覆盖手机 Mirra 或卸载正式腕端。

剩余 file/故障与保留检查尽量合成一轮，升级0.1.1与设备重启仍需当前明确同意，先保留可核对样本再覆盖升级。每个结果分开记录，让设备界面上的后端、版本、序列、中文样本和实例标记可核对；不要求重复冗长矩阵。目标持久化前提失败时先修复实验，不退回手机在线模式冒充独立学习成功，不进入 05B–05E。

剩余操作顺序：0.1.0 补测两后端的实验槽损坏恢复、注入写失败恢复与数量试验，形成可核对基准；随后在明确同意后同身份覆盖升级 0.1.1，只读取原数据；再在明确同意后正常重启手环，只读取原数据。重开时后端选择默认回到 storage，需要再次切到文件试验核对 file；不能把默认后端变化当成丢失。升级/重启前后不要保存或运行故障按钮，以免改写基准。写失败是 native IO 前注入，不是真实固件写失败；32条是实验样本下限；正常重启不证明掉电耐久性或异常跳时。

Module 03 已证明通信/锁屏用户反馈/首次 NO_DEVICE 自动恢复继续保留；Module 04 新控制仍是原 `DEV_COMPLETE_AWAITING_NATURAL_USE`，本实验不宣称它已验收或失败。
