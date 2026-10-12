# 05B — 隔离独立学习交付报告

2026-10-12（Asia/Shanghai）。**DEV_COMPLETE_AWAITING_DEVICE_ACCEPTANCE**。代码、自动化与实际RPK完成；05B自身自然学习/原生画面尚未执行。停在05B，不修改手机或进入05C。[合同](../../plans/MIRRA_BAND_05B_LOCAL_SESSION.md)

## 1. 完成功能

单app owner与原生单页：测试书籍选择、第一动作选择及亲自完成确认、FOCUS、5/10分钟BREAK、主动继续、可空结束页码、结束后本地pending结果。准备不创建Session，休息到时不自动继续，正常退出不结束，重复操作不生成重复记录；书籍与动作快照保存在记录内。

双槽、独立schema/marker、CRC32、序号/CAS、精确读回后才提交业务显示。先前pending与活动Session不可静默丢改；恢复异常、未知格式/冲突、nativeIO不确定锁存，保留最后确认数据。容量不足不自动删未同步记录，结束操作预留空间。

05A用户明确确认file损坏恢复→覆盖升级0.1.1→正常重启后保留全部正常，记作USER_REPORTED_PASS；选择file，无需storage全部通过。此前closed-gate开发产物已经重建替换；当前编译产物显式true/file。

## 2. 修改文件

新增 `local-session/local-codec/local-journal/local-owner`、固定namespace的`local-storage`、`local-app.ux`与`pages/LocalSession/index.ux`、9组相关测试及一个05B合同/本报告和JSON证据。修改构建/profile/filter/inspect/check、现有builder测试和package scripts；probe适配器仅增加严格枚举namespace，默认05A行为保留。

AGENTS、PROJECT、CURRENT_STATE、DECISIONS、ARCHITECTURE、ROADMAP同步当前授权/实现；05A仅新增真实反馈，旧Module03/04源码、协议、Logo、package-lock和签名身份不改。没有删除产品文件。

## 3. 数据层

仅新实验包 `com.guanyi.mirra.band.localsessiontest`，schemaVersion1/marker `MIRRA_05B_ISOLATED`，专用 `internal://files/mirra_05b_test_sessions_a/b.json`，隔离05A与正式伴侣。ID为已持久installationId加counter，counter不能回退；第一动作确认后才创建Session。pending只追加，不实现ACK/删除/导入。

每槽8192 UTF8 bytes，非FINISH预留1024 bytes；8pending/32interval为应用设计限额，字节预算可提前阻止增长，非设备总容量。手机Room v4 blob `97ae3a8a15aeb924350b4b7ecade389b314f7ebf`、迁移、备份、统计、学习算法和用户数据不变，无新APK或依赖。

## 4. 实际测试

| 检查 | 实际结果 |
| --- | --- |
| 最终未过滤Node全量 | **397/397 PASS**，0 failure/cancel/skip/todo；05A基线274/274 |
| JS/配置 | **63 scripts，0 errors**；正式4路由与隔离1路由分别核对 |
| 官方release RPK | **exit0，12419ms**；Node24.18.1 / aiot-toolkit2.0.5 |
| 独立产物检查 | RSA-SHA256、内容/逐文件摘要、签名metadata、CRC、3种篡改拒绝、正确包/单页/features、无秘密/通信/伴侣页 |
| 实际RPK中的编译app执行 | Node受控file回调下完成第一动作/学习/休息/继续/null页码结束；读回1pending，true/file、仅05B两URI，trusted时长0 |
| 内部只读审查 | 复核9/9异常/正常内存探针通过；不是ChatGPT独立验收 |

实际RED→GREEN包括首次业务缺失、页生命周期/未知操作结果、native超时及已知存储消失/回退；复核发现的跨快照丢改记录已有实际失败探针与新增回归，修复后全量清零。CRC中文/emoji独立Node oracle、真正字节预算、结束余量、快速并发、nullable页码、重进同Session、BREAK不自动恢复均覆盖。测试替身仅用于固件边界，不能当Vela运行截图。

Not Run：05B目标手环安装/自然短学习、原生像素/长中文/触控、真实Session退出重进/完成保留、真实异常跳时/boot/monotonic、原生IO跨进程/强制中断与掉电耐久性、实测quota/延迟。Vela本机profile336×480仍准备好，既有Windows引擎启动阻塞在加载应用前，本轮只复核status，无运行截图。Android测试/构建、TS/ESLint Not Run：手机未改、平台已授权原生JS。所有原始本地日志在`.local/module05b-evidence`，摘要见[verification.json](verification.json)。

## 5. 时间与安全边界

FOCUS/BREAK原始端点保存wall/owner/可选mono可信标志；真实入口只用未验证墙钟，**不产生已验证时长**。同owner正常墙钟显示“观察”，跨owner、回退/缺失/大跳跃显示不确定，保留原Session与全部区间，不造负时长、不清零或自动结束。休息不计入学习候选。

目前没有目标固件monotonic或boot证据；官方[设备信息](https://iot.mi.com/vela/quickapp/zh/features/basic/device.html)、[全局方法](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/global-data-method.html)、[生命周期](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/lifecycle.html)不作为跨重启可信时长证明。6小时观察边界是保守应用限制，不是固件事实；正常重启保留也不等于异常掉电安全。CRC防意外损坏，不是攻击者认证；损坏回收上一有效快照可能需要核对最近边界，双坏无法自动重建。未知/冲突时不能清库或伪造保存成功。

## 6. 产物与Git

Band分支 `codex/module-05b-local-session`，from `097076801ee632ee4ff727b416450136dafa7a0f`。实现提交 `5cc9000518b73c2b86d7383faf3fb34605b42291` 已推送并核对远端；不合并main/创建PR/发布。手机保持干净 `codex/mirra-band-control-bridge@30a8af3fdea225cc96db6a360d71383a85b7ea39`。旧正式APK/RPK与05A两RPK实际SHA全部仍与原交付一致。

- RPK：`E:\CODEX\mirra-watch\dist\com.guanyi.mirra.band.localsessiontest.release.0.1.0.rpk`
- 版本：**0.1.0/code1**；大小：**27,193 bytes**。
- SHA-256：`79d162a81acfff4f42a85dadebdc2f50a7ae4cde9468e8b162a40fa1eaba81b2`
- 实验证书：`B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B`，复用既有本机忽略材料；无转换/上传/正式签名替换。公开主体沿用Mirra Band Demo。

完整产物与继承文件元数据见[artifacts.json](artifacts.json)。

## 7. 下一步

新独立实验包安装须用户当前同意。沿用已有安装工具，无需更新手机或替换正式Mirra。之后只需一次自然短学习：选择测试书籍/完成第一步→学习→退出重开同Session→休息/主动继续→空页码结束→重开仍有完成待同步记录。实际失败先定位，未执行不标PASS；不安排长矩阵。完成设备反馈与05B验收后暂停，不自动05C。
