# 当前状态

更新：2026-10-12（Asia/Shanghai）。

## Current Stage / Module

**DEV_COMPLETE_AWAITING_NATURAL_USE**。用户已明确授权方案 B「学习常用控制」，按[完整合同](plans/MIRRA_BAND_MODULE_04_WRIST_CONTROLS.md)连续实现；完成后停在 Module 04，等待自然使用和 ChatGPT 独立审查，不进入 Module 05。最终交付和未验证项集中在[交付报告](evidence/module-04/README.md)，不增加重复冻结文档。

- Band：`codex/module-04-wrist-controls`，接受基线 `8b14819f15682fd22752dbdf2b05e8d465e255ee`。
- 手机：隔离工作区 `E:\CODEX\mirra-watch\.local\android-worktree`，`codex/mirra-band-control-bridge`，接受基线 `3fecf50a208ddb145a67986749420b490193e903`。原手机工作区不变。

## 已实现

- 腕端 5/10 分钟休息、提前结束休息、手机已有有效 Intent 的真实第一步确认。手机原业务及 Room 事务拥有事实；恢复由原监测规则决定。
- v2 SESSION_CONTROL、短授权与有界去重；v1 继续只读，原 schema/fixtures/快照 body 保持兼容。授权绑定节点、流、存储 owner 和实际业务状态，最终首次写入前再验。
- 独立 no-backup 控制开关默认关闭、开启需显式同意。关闭/维护/退役/旧流不能继续写。超时不重发，结果未知重新读权威快照。
- 腕端开始必须通过严格监测准入和 READY，提交前受限保留 Intent；提交后监测异常保留真实 Session 并准确降级。动作/页码变更、过期、暂停/完成书籍和保存中拒绝。
- 原生 Vela 控制确认/滚动页面、状态反馈及页面租约。演示数据隔离，无控制写入。

## 验证与产物

最终未过滤 JVM **798/798 / 86 suites / 0 failure/error/skip**；Lint/Debug APK/test APK 单次构建 exit0（4m17s）。Node **184/184**、检查 **34 scripts / 4 pages / 0 errors**；正式 RPK 已实际构建并独立验签、内容/文件摘要/元数据/CRC 与三类篡改检查通过。最终 APK 相关 API37 Android 单次回归 78/78 实际 PASS，零失败/assumption/ignored；实际手机设置模拟器截图已检查，腕端像素图仍未执行。完整摘要见交付报告和 verification.json。

配套 APK `dist/Mirra-1.2.0-band-control-debug.apk`（1.2.0/code7），RPK `dist/com.guanyi.mirra.release.0.3.0.rpk`（0.3.0/code8）。两者沿用已接受公开签名身份；最终摘要在 artifacts.json。正式安装前仍须核对目标手机当前版本、公开证书及空闲首页。

Room v4 Git blob `97ae3a8a15aeb924350b4b7ecade389b314f7ebf` 不变；Migration、Full Backup v1、portable preferences、状态转换/监测/Closeout 规则、签名、依赖和权限未改。没有原始用户数据库访问、卸载、清数据、降级或操作其他真实设备。

## 已接受 Module 03 基线

正式 IDLE 双端同步有实际手机与腕端证据；监测学习锁屏后腕端退出重进为 **USER_REPORTED_PASS**，不得重新定义未通过。首次 NO_DEVICE 蓝牙恢复后同进程自动恢复设备/服务/授权并完成新握手、完整同步已通过。用户约 5 分钟自然使用正常反馈保留。

30 分钟被动观察已执行，有完整同步次数、精确 RTT、腕端电量及放电耗电等测量缺口，不声明连续 30 分钟学习或完整可靠性基准。Module 03 历史产物/验证/照片和 checkpoint 保留在[原证据](evidence/module-03/README.md)，当前明确 Module 04 授权优先于历史文件的「不进入 Module 04」。未编造 Module 03 全状态或最终 ChatGPT 独立通过。

## Pending / Not Run / 下一步

Module 04 新控制真实设备安装/操作、原生腕端像素截图与小屏触控、新控制锁屏 FGS/OEM 行为、其他 API/OEM、全量 connected、专用阶段备份 fixtures、release/生产发布和 ChatGPT 独立审查 **Not Run**。Node harness 与 API37 模拟器不能替代腕端真实渲染或新控制真机成功。

代码、完整门禁、二进制与交付记录已完成；两功能分支实现提交已推送并核对远端 SHA；交付记录跟随同分支文档提交，接下来请求本轮安装同意；然后一次自然使用准备确认→休息→提前结束，记录真实结果或系统限制。无需逐项重复人工矩阵，不合并 main、不自动建 PR、不开始下一模块。
