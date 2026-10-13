# 当前状态

更新：2026-10-13（Asia/Shanghai）。

## Current Stage / Module

**05B.2 / TIME_RECOVERY_DEV_COMPLETE_AWAITING_DEVICE_FEEDBACK**。继续腕端独立学习修复，不进入05C。[合同追加范围](plans/MIRRA_BAND_05B_2_NATIVE_RECOVERY.md)、[计时交付](evidence/module-05b-2/time-recovery/README.md)。

当前分支`codex/module-05b-2-time-recovery`，从干净真实05B.2 HEAD `427d1292ec667842a8d3e9c617d2d8fd4d2ad99e`建立。0.1.3/code4已实际构建、验签并核对旧包身份；用户已同意自行覆盖体验，尚未收到新计时反馈。代码提交/推送正在最终核对，手机/其他Android设备未操作。

## 已收到的真机反馈

用户确认05B.2详情可进入、休息5/10选项可打开、点击5分钟后进入休息页并看到继续学习，保留USER_REPORTED_PASS，不重复定义未完成。不推定10分钟执行、继续按钮点击、独立探针或全部生命周期都通过。

用户同时报告退出重进仍为--:--/时间待核对。根因已软件复现：新ownerId直接使旧duration返回null，先于墙钟合法性检查。1.3仅修参考恢复策略；已恢复页面/主题/布局/flow四文件SHA保持。

## 当前计时行为

完整、非负且单区间不超过既有6h的墙钟差可跨owner显示**参考值**；OWNER_CHANGED/WALL_ONLY、UNVERIFIED保留。跨owner单调值不比较，实际Date.now入口仍monotonicVerified:false，参考不增加可信/有效专注。FOCUS/BREAK分开累计，休息到时仍需主动继续。

缺失、回退、跳跃或矛盾使整个参考累计/倒计时未知；Owner内存保留同Session已观察异常，正常下一tick不能忘掉，新Session有独立诊断。完成历史只依赖闭合端点，不受无关当前时钟污染。未保存的中间异常无法跨新实例证明；仍不证明跨重启可信时间或排除小幅未观察时钟调整。

## 数据与界面边界

schema1、marker、双槽URI/CRC/序列/CAS/历史保护、8192bytes/8pending/32interval/结束余量、业务Owner IO/写入门禁和Session转换不变；9个保护核心文件、4个已恢复UI文件、20个历史产物SHA不变。原始端点/稳定ID、nullable页码、pending及第一步确认保留，不清数据。不修改手机Room/备份/统计/正式签名，无依赖或全局环境修改。Logo原图已保存，仍LOGO_PENDING。

05A选定file损坏/同身份升级/正常重启保留USER_REPORTED_PASS；旧05B正常基本体验保留，05B.1自然验收FAIL历史保留。Module03 IDLE/锁屏重进/首查自动恢复与约5分钟使用成功、30分钟测量缺口保留；Module04源码/产物与其验证边界保留。05C–05E未实施。

## 新鲜验证

最终完整Node **558/558 PASS，0失败/取消/跳过/todo**；语法配置 **82 scripts，0 errors**。实际app/page/file适配器覆盖跨owner65秒恢复/5秒tick、息屏/重进、休息倒计时/不自动继续、原始记录保留、异常与内存记忆。Node与受控回调不代替固件证明。

官方release exit0，toolkit12,393ms，Node24.18.1/aiot-toolkit2.0.5。RPK **0.1.3/code4，35,722bytes**，SHA **c2960d2b890cc05ddac6ffefbe8fdac3cf9199d393137b3ad11c131a7e159d7f**。与0.1.2同包名/证书，签名/内容/每文件SHA、元数据/CRC/篡改拒绝通过；冻结输入与staging一致。

实际0.1.2→0.1.3签名RPK app/page在Node执行：01:05→01:10/参考值、可信时长0、旧ID/pending保持、6分钟BREAK不计阅读/到时仍BREAK、主动继续后才累计；5编译onclick/48文本绑定、52file回调/2槽、重进与Done0写、重复结束只新增1条null页码记录。非原生像素。

## Pending / Not Run / 下一步

用户已同意自行覆盖0.1.3，只需自然学习片刻后退出重开，反馈累计是否恢复并标参考值，不要求重测已通过入口。新包安装/参考计时画面待反馈；没有新截图或原生模拟器运行。可信跨重启计时、掉电、实际配额/耗电未证明。

Android构建/测试Not Run（手机未改），TS/ESLint Not Run（继承原生Vela JS语法/Node验证）。停05B.2等自然反馈，不自动PR/main合并、05C或手机迁移。