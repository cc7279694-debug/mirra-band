# Mirra Band

国行小米手环 9 Pro（336 × 480）的 Xiaomi Vela 只读伴侣。正式模式只展示手机已确认的当前阅读信息；不控制学习、不保存腕端业务快照、无需账号或服务器。演示构建与正式构建使用不同身份，正式连接失败不会切换成模拟数据。

Module 02 技术原型真机基础测试已由用户确认通过。Module 03 已在两部手机完成签名核查与安全覆盖安装，当前 Xiaomi 显示手环设备、服务可用与设备已授权。用户更新正式 `0.2.1` 诊断包后，新真机照片显示 `INIT_READY_CALL_API_MISSING`：当前通信实例的 `getReadyState` 不是函数。`0.2.2` 兼容实现已实际构建并验签，可提供给用户，尚待更新后的真机复测；真实消息往返、手机锁屏主场景、六类业务画面及 30 分钟使用测试仍待验收。开发与真机证据分别记录在 [当前状态](docs/CURRENT_STATE.md) 和 [验证索引](docs/evidence/module-03/README.md)。

## 项目入口

- [PROJECT](PROJECT.md)、[AGENTS](AGENTS.md)：产品、架构约束与协作规范。
- [Module 03 完整合同](docs/plans/MIRRA_BAND_MODULE_03_COMPLETE_PLAN.md)：本轮授权与验收。
- [当前架构](docs/ARCHITECTURE.md)、[决策](docs/DECISIONS.md)、[路线图](docs/ROADMAP.md)。
- [Module 03 checkpoint](docs/checkpoints/2026-10-11-module-03-companion.md)：实现、继承规则与剩余验证。
- [Module 02 历史记录](docs/evidence/module-02/VERIFICATION.md)：原型构建与模拟器受阻证据。

## 配套安装与验收

本机交付文件在 `E:\CODEX\mirra-watch\dist`；准确大小、SHA-256、两端版本和公开证书见 [产物清单](docs/evidence/module-03/artifacts.json)。APK 沿用现有签名，仍为 `1.1.1-band-readonly` / code 4；当前供替换的正式腕端 RPK 是 `com.guanyi.mirra.release.0.2.2.rpk` / code 4。初版 `0.2.0` / code 2 与诊断版 `0.2.1` / code 3 保留溯源；演示包 `com.guanyi.mirra.band.demo.release.0.2.0.rpk` 每页标识“演示数据”，不参与正式通信验收。

同签名腕端兼容版 `0.2.2` / code 4：[正式兼容 RPK](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.release.0.2.2.rpk)，32,194 bytes，SHA-256 `27807efe94915c6ed691bfecfbe809abbc898d76995a3528fd3b5129cd799015`，对应实现提交 `cdfc77cf44aa1f1fcb1d4fc79326e4ab86b50bcc`。实际检查无错、未过滤测试 134/134 通过、构建与独立验签通过；兼容缺少 `getReadyState` 的查询接口，并调整原生发送参数，保留真实握手与快照验证。待用户更新后复测，尚不能宣称恢复连接。手机 APK 保持现有版本，无须重复安装；`0.2.1` 失败定位和历史摘要见验证索引。

1. Mirra 与小米运动健康须在同一台 Android 手机，手环与该手机配对。USB 调试连接后，只读核对已安装 Mirra 版本、公开证书与首页活动状态，并建议保存完整备份。本轮用户明确因数据很少跳过备份；两部手机原有 `0.2.0` / code 2 的证书与交付三方匹配，首页没有活动学习界面，已完成覆盖升级。
2. 仅对证书匹配且 versionCode 小于 4 的手机覆盖安装配套 APK，保留已有数据。已经安装本次匹配 `1.1.1-band-readonly` / code 4 且 APK 摘要一致时跳过重复安装。高于 code 4 或版本/签名不符时保留错误并停止；不要卸载、清数据、降级或更换签名。当前 Xiaomi 已核对实际安装摘要与交付一致。
3. 通过用户已经验证可用的 RPK 安装工具选择正式 `0.2.2` 兼容 RPK，替换当前正式包。正式包与旧演示包身份不同，不用旧演示包验证手机链路。更新后先查看连接页的初始化阶段诊断，再继续真实通信验收。
4. 手机 Mirra → 我的 → 手环伴侣 → 启用。阅读只读范围说明，在小米授权页确认设备消息权限。首次 SDK 授权可能同时包含通知能力；Mirra 不主动调用通知、健康、定位或麦克风接口。
5. 打开腕端 Mirra。仅收到匹配握手和完整快照后才显示当前书籍与学习状态。未连接/未授权/数据处理中会明确提示；不得把该页面记为通信成功。
6. 检查手机准备动作、正常学习、休息、恢复、未监测/监测中断与保存结果。腕端退出后暂停请求，再进入重新握手；断连冻结手机最后确认数字。关闭手机伴侣应清除腕端私有内容，并保持手机学习功能正常。
7. 必测主场景：手机正在学习且锁屏/后台，退出并重新打开腕端，确认得到最新真实数据。保留专注、准备、休息、断连、未监测、保存中六类手环实拍或真实 Vela 运行截图，再记录 30 分钟同步次数、延迟、断连与耗电。未执行前这些项目均为 Not Run。

SDK 若只发现多个设备，本版会要求先在小米配套应用中明确目标，避免自动选择其他设备。没有成功握手时，请保留错误分类、手机服务版本与手环固件；不要将用户书名、笔记或原始敏感日志公开上传。

当前 Xiaomi 的小米运动健康为 `com.mi.health` 3.59.1，XMS 服务可解析，用户确认 9 Pro 已配对且连接。初次 `COUNTERPART_APP_MISSING` 已解除；手机最新界面显示设备、小米服务可用和设备已授权，但仍等待腕端握手、最近完整同步尚无。初版两张正式 UI 实拍显示 `INTERCONNECT_UNAVAILABLE`；用户更新 `0.2.1` 后的新实拍显示 `INIT_READY_CALL_API_MISSING`，实例取得与回调注册已越过，失败于当前实例的 `getReadyState` 非函数。未读取腕端安装文件/版本元数据，版本依据用户指定安装包与新诊断 UI；没有握手或完整消息往返证据，不能据此断言整个平台不支持通信。电脑注入触控被 Xiaomi 安全策略拒绝，设置与系统授权使用手机手动操作，不绕过权限。

## 本地构建

实际 Node 24.18.1 / npm 11.16.0 与固定 `aiot-toolkit@2.0.5` 已成功构建初版、诊断版及 `0.2.2` 兼容包。本次兼容增量 fresh check-project 为 31 scripts / 3 pages / 0 errors，未过滤测试 134/134 PASS / 0 fail / 0 skip；初版 98/98 与 `0.2.1` 117/117 保留为历史。无 TypeScript 预编译、全局运行时修改或新腕端依赖。

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build:demo
npm.cmd run build:live
npm.cmd run inspect:rpk -- dist/com.guanyi.mirra.release.0.2.2.rpk sign/live/certificate.pem live
```

两种构建必须串行。演示使用已有 `sign/private.pem` 与 `sign/certificate.pem`；正式使用用户明确授权的本机转换材料 `sign/live`。构建会校验固定公开指纹，缺少匹配密钥时明确失败，不自动生成新正式身份。私钥、构建暂存、SDK 二进制、模拟器与产物全部 Git 忽略；不得提交或上传。

Android 工作区当前为 `E:\CODEX\mirra-watch\.local\android-worktree`，分支 `codex/mirra-band-readonly-bridge`，基于实际较新 V1.1 提交 `1338b9a4e41788082f30bf3894a974c2ff652630`。原手机工作区没有被切分支或覆盖。首次源码构建运行其 `scripts/fetch-wearable-sdk.ps1`，仅下载小米官方 SDK 并核对固定 SHA-256；官方附件没有明确再分发许可，因此 AAR 不进 Git。构建继承原手机 Kotlin/Compose/Room 与签名配置。

Node 页面测试不能证明 Vela 渲染；Android API37 回归不能证明小米手环消息、锁屏可达性或 OEM 行为。Module 03 保持当前模块，完成设备验收之前不进入 Module 04。
