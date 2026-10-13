# 05C 开发交付报告

更新：2026-10-13（Asia/Shanghai）。开发、自动化、实际构建与本项目自有Android模拟器回归完成；状态为DEV_COMPLETE_AWAITING_PHYSICAL_ACCEPTANCE，以下不构成真机通过结论。

## 1. 完成功能

正式`com.guanyi.mirra`整合单通信owner下的PHONE伴侣和LOCAL独立学习；手机书籍目录默认关闭，新增披露后启用，主线自动加入、最多11本额外IN_PROGRESS书籍。通过兼容v3有界目录协议、双槽/CAS/校验/精确读回和持久化ACK，提供最后完整目录的离线使用。第一动作每次实际完成后确认，目录更新不修改活动Session与pending；页码仅为待确认进度、未更新手机。

继承05B.3白色UI、一次开始提交、忙碌反馈、轻量tick、跨实例参考计时、休息主动继续与nullable页码。05B.3真机流畅度仍待明确反馈。方案A保留实验应用及记录，不迁移，不假设跨包文件共享。

## 2. 修改文件

- Band新增：formal app/runtime、catalog协议/owner/wire、Mode入口、相关回归与实际RPK受控执行脚本。
- Band修改：现有CompanionStore/协议路由，LocalOwner/domain/codec/journal显式正式上下文，原生LocalSession与presentation、严格profile白名单及验签检查。
- Android修改：现有只读目录投影、本地目录选书/披露设置、WearableCoordinator消息路由和伴侣设置页面；具体清单以最终双端diff为准。
- 删除：无；原正式及实验代码/产物保留。

## 3. 数据层变化

Room v4、SQLite schema、学习算法、备份及手机统计保持。手机目录偏好使用独立本地设置；腕端目录与正式Session各自独立命名空间，不加载实验槽。

正式Session：schema1、marker `MIRRA_LOCAL_SESSION_V1`、8192字节单槽、最多8 pending/32 intervals、结束预留及全部历史保护。目录：schema1、最多12本/16,384 UTF-8字节，最多32片/1024字节data/4096字节消息/30秒固定期限，目录双槽记录预算32,768字节。书名120码点、动作160码点完整保留，超限明确拒绝；原实验证据与格式保留，22份历史APK/RPK大小与SHA-256已逐项核对保持；11项受保护Band资源/依赖保持，原手机checkout1338b9a仍干净。

## 4. 测试与产物

已执行责任路径RED/GREEN、协议Golden、异常传输、损坏恢复/未知IO/读回及模式/目录并发确认测试。最终Node未过滤682/682 PASS，104脚本语法/配置检查0错误；Android未过滤88 suites/824 tests全部PASS，0失败/错误/跳过。Lint 0 errors/20原有warnings/1hint，lint+两个APK实际构建SUCCESS10m48s，最后未过滤JVM SUCCESS3m13s。

自有MirraBand_Module03_API37/emulator-5580实际19/19原生PASS（8项新增目录/设置/UI，11项已有只读快照/控制设置/休息准入回归），43.711s。真实Room/SQLite在in-memory fixtures运行，无用户数据库；UI部分SDK为受控transport。只在此自有AVD核对1.2.0/code7公开证书后安全覆盖1.3.0/code8，无卸载/清数据/wipe；完成后关闭所属AVD，不操作其他设备。

正式RPK实际Node24.18.1/toolkit2.0.5 release exit0，toolkit报告编译53273ms（不含CLI初始化）。RSA签名、内容/逐文件SHA、签名元数据、ZIP CRC和篡改拒绝通过。实际签名旧0.3.0与新0.4.0编译代码执行通过：8个编译点击绑定/53个文字绑定、精确读回后ACK、一次开始一写/重复点击单Session、离线同Session重进参考01:05→01:10且trustedFocusMs0、休息排除/主动继续、nullable结束及目录删除后pending保留、tick零文件IO/实验槽访问0。文件/SDK/手机回调受控，不是真实无线或固件证明。

失败历史：初次Node三项旧版本/profile断言更新后全绿；首次编译成功被独立RPK检查捕获Mode缺少共享page样式，修正后实际重构建；目录ACK竞态/30秒总期限/manifest边界先RED后修复；新locale lint已按可观察配置修复，无suppress。旧ExportWorkspace并发文件测试两次重负载10秒超时，原测试未改，回收本任务所属Java后局部1024m/单worker最终未过滤通过；负载原因属于推断，不能宣称已证明。

目标正式版本：RPK `0.4.0/code9`，APK `1.3.0/code8`。实际文件：

| 文件（本机绝对路径） | bytes | SHA-256 |
| --- | --- | --- |
| E:\CODEX\mirra-watch\dist\Mirra-1.3.0-band-catalog-debug.apk | 16950769 | c95c9bf53634b465fff2039285d697bdf4f2587c72e0ece46caedd39203d2569 |
| E:\CODEX\mirra-watch\dist\com.guanyi.mirra.release.0.4.0.rpk | 80245 | bd0458ca70e63d815102d7becefe51a3c74644e87a9df29bc261ec98459fd0dc |

两包同com.guanyi.mirra、公开证书SHA-256：29ded26bea44f1afe4fe383a302e4b507423d16223469d7da3fe578d9a7f83b9，与实际旧正式APK/RPK相同；Android v1/v2单signer核验通过。完整元数据见[artifacts.json](artifacts.json)，执行证据见[verification.json](verification.json)。使用原正式签名材料，未转换或更换；相对原本机正式RPK0.3.0/code8与APK1.2.0/code7递增不代表已证明设备当前升级条件。

Not Run：本轮物理设备已安装版本/公开签名核查、覆盖安装、真实目录往返及离线独立自然使用、正式UI真机画面、真机流畅度与固件持久化扩展证明。原因：当前无目标物理设备核查证据，且05C新包安装尚未获当前同意。受控Node执行、模拟器及Golden不替代这些结果。

## 5. 当前问题与边界

时间仅墙钟参考，跨重启可信连续性和未持久的中间时钟异常尚未证明；不计入已验证有效专注。目录ACK只证明本次完整目录保存，不代表Session上传。05C无腕端学习记录上传、手机历史导入/统计合并、实验记录迁移或数据库迁移。长文本真实排版与手环流畅度等待自然反馈。原生测试后的人工截图尝试得到自有模拟器系统Pixel Launcher ANR（主机内存压力下），未取得产品画面，也未证明由Mirra导致；不把19项原生自动化通过当作人工画面或真机流畅度通过。

## 6. Git

Band：`codex/module-05c-offline-catalog`。Android：`codex/mirra-band-05c-catalog`。基线见05C合同；实现提交Band `502f47a21a6d0b0c8a70b28179425f907ca786ee`、Android `c159983919093f031553b9e5e17f245635b5c15e` 已普通push，ls-remote逐一匹配；本报告的Git记录为后续文档提交，无产物/源码改动。无自动PR、main合并或force push。

## 7. 下一步

停在05C。完成开发交付后，仅在用户当前明确同意及目标设备安全预检通过后安装配套包，再自然体验真实选书→断开手机→独立学习→结束本地保留。不安排冗长人工矩阵，不自动进入05D–05E。

## 安装与自然使用（需本轮当前同意）

1. 先核对原配对手机Mirra版本、公开证书、空闲状态，以及腕端正式Mirra版本。同包名/原证书且版本递增才能覆盖；不卸载、清数据、降级或改签。当前物理预检未执行。
2. 覆盖配套APK与正式0.4.0 RPK，保留单独的Mirra独立实验。手机Mirra与小米运动健康须在同一已配对手机。
3. 手机「我的→手环伴侣」主动同意新增书籍目录披露。主线自动加入，按需选择其他进行中书籍；腕端打开Mirra并同步目录，等待完整保存确认。超长/无效目录保持明确失败，上一份完整保存仍可用，未知ACK不冒充确认。
4. 选择「独立学习」，实际完成第一步再确认；自然体验一次断开手机/退出重进/休息与结束本地保存即可。参考时间不代表可信有效专注，结束页码可留空；记录和待确认页码不会更新手机历史/进度。无需冗长人工矩阵。
