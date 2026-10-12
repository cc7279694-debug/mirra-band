# 当前状态

更新：2026-10-12（Asia/Shanghai）。

## Current Stage / Module

**05A / DEV_COMPLETE_AWAITING_DEVICE_PROOF**。用户已明确授权 05A 自主开发、测试与构建：仅隔离腕端持久化实验；目标手环存取/重进/升级/重启通过前，不开发真实独立学习记录或修改手机数据库。[当前合同](plans/MIRRA_BAND_STANDALONE_V1.md)、[交付与验证](evidence/module-05a/README.md)。

- 当前 Band 分支 `codex/module-05a-persistence-probe`，从 Module 04 最终 HEAD `92a30ad104381840702b1871140142e7874c62b0` 创建。
- 手机保持 `codex/mirra-band-control-bridge@30a8af3fdea225cc96db6a360d71383a85b7ea39`，工作区干净，未修改原手机工作区。

## 当前实现

独立 `com.guanyi.mirra.band.storageprobe` 的 0.1.0/code1 与 0.1.1/code2 同身份实验包。只有单个存储实验页和 storage/file 两槽合成数据，没有 Interconnect、手机业务写入或真实 Session。正式 live/demo 构建不带实验代码；实验构建不带原伴侣/演示页面。

双槽保存、严格 schema/UTF8/8192字节/32条界限、CRC32、序号恢复、精确读回确认；未知格式/双槽坏/读错误/冲突停止。原生 IO 超时锁存，晚回调/重进/切后端不能解锁。页面显示真实实验样本和回调观测，支持退出 JS 应用与实例标识；不推算可信阅读时间或宣称后台持续运行。

## 新鲜验证

完整 Node **274/274 PASS / 0 failure/cancel/skip/todo**；语法/配置 **47 scripts / 0 errors**。实验前基线184/184。真实电脑临时文件重建/截断恢复、真实页面脚本与完整 owner/adapter/controller 超时链、既有伴侣回归已通过，属于自动化证据。

两版 RPK 官方实际 release 构建 **11625ms / 1153ms / exit0**；独立 RSA/内容/逐文件摘要/元数据/CRC/篡改拒绝及模式隔离检查通过。Node24.18.1 + aiot-toolkit2.0.5，无依赖/全局环境变化。完整摘要/公开证书/绝对路径在 `docs/evidence/module-05a/artifacts.json`。

0.1.0：18,590 bytes，SHA `861e26f980aa4f8a608fed9c3e18118dfc2261832fa93e46255752e6417fbb04`；0.1.1：18,598 bytes，SHA `b1b51540cbb7e012de6ea2842b05c39752a1653f53fc6c178a92cb36d957d7b1`。均复用原实验公开证书 B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B，无新签名材料转换。

## 继承的成果

Module 04 仍 **DEV_COMPLETE_AWAITING_NATURAL_USE**：代码、798 JVM、78相关API37 Android、184腕端测试与配套构建/签名已验证，新控制真机操作/原生腕端画面/独立审查未验证。其 APK1.2.0/code7、RPK0.3.0/code8 本轮摘要与原交付完全一致。原 [Module 04 报告](evidence/module-04/README.md) 不改写。

Module 03 正式 IDLE 双端同步、监测学习锁屏重进 USER_REPORTED_PASS、首次 NO_DEVICE 同进程自动恢复与约5分钟正常使用反馈继续保留；30分钟被动观察的测量缺口保留。原证据和 checkpoint 不覆盖。

手机 Room v4 blob `97ae3a8a15aeb924350b4b7ecade389b314f7ebf`、Migration、备份格式、学习/统计规则、包名与签名均不变。未读取原始用户数据库、卸载/清数据/降级或操作设备。

## Pending / Not Run / 下一步

05A 真实 storage/file API、中文/像素/触控、表盘/息屏重进、JS应用真正退出后重开、同身份升级、设备重启/异常时钟、真实容量/延迟/配额与掉电/跨进程 IO 耐久性均 **Not Run**。32条和8192字节是有界实验限制，非固件实测。当前 Windows Vela 模拟器的既有启动阻塞未在本轮重试，不用 Android/Node 冒充 Vela 运行。

代码与产物交付后，先取得仅安装0.1.0和基本存取/重进的同意；升级0.1.1、设备重启在对应步骤另行确认。观察不同后端实际结果；失败先定位实验，不退回手机在线控制冒充独立模式。05B–05E 只保留产品方向，未授权代码实施，不合并 main、不自动 PR/发布。
