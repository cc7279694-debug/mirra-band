# 05B.2 参考计时恢复交付

状态：`TIME_RECOVERY_DEV_COMPLETE_AWAITING_DEVICE_FEEDBACK`。从干净真实HEAD `427d1292ec667842a8d3e9c617d2d8fd4d2ad99e`创建功能分支`codex/module-05b-2-time-recovery`，不进入05C。

## 1. 结果与根因

用户已确认05B.2详情可进入、休息5/10选项可打开、5分钟可进入休息页并看到继续学习，分别保留USER_REPORTED_PASS。不要求重复这些测试；没有推定10分钟已执行、继续按钮已点击或所有生命周期通过。用户同时报告重进仍为`--:-- / 时间待核对`。

根因已复现：新应用实例生成新ownerId；旧duration在墙钟合法性检查之前遇到OWNER_CHANGED就返回null。同样的2000→10000端点，同owner显示8000，跨owner原来显示未知。修复仅调整时间投影：完整、非负、单区间不超过既有6h的墙钟差可跨owner显示**参考值**；保留OWNER_CHANGED、WALL_ONLY、UNVERIFIED。跨owner单调数值不比较、不贡献trustedFocusMs；实际入口仍Date.now、monotonicVerified:false。

任何已知缺失、回退、跳跃或矛盾使整个参考累计/倒计时未知。Owner在内存保留同Session已观察异常，正常下一tick不能忘掉；新Session有独立记忆。完成历史只依赖闭合端点，不被无关当前时钟污染。FOCUS与BREAK分开累计，休息到时不自动恢复。

## 2. 修改文件

- 修改：local-session的duration/summarize、local-owner时间投影与内存诊断、local-presentation参考文案、local构建版本、实际RPK执行验证器及相关既有测试。
- 新增：local-time-reference和local-time-reentry针对性测试、本交付与摘要/验证记录。
- 页面、主题、布局参数、UI flow **4文件SHA未变**；schema/transition/history和Owner IO/业务门禁区域逐字核对不变，另9个保护核心文件及20个历史产物SHA不变。删除无。

## 3. 数据与安全边界

无schema/migration/命名空间/双槽/字节预算/容量/备份变化；原始时间端点、Session ID、页码nullable、第一步确认、pending及保存顺序不变。快照/重进/计时tick不额外写文件。手机、Room、正式包和正式签名未操作；无新依赖或全局环境修改。

内存异常记录不写schema，不能跨新实例证明未保存的中间异常；不能排除未观察到的小幅墙钟调整。参考值不等于可信跨重启计时，更不等于已验证有效专注。本轮未加入bootId或新时钟API，未来导入/统计不在范围。

## 4. 实际验证与产物

最终完整Node **558/558 PASS，0失败/取消/跳过/todo**，4,310.0745ms；语法配置 **82 scripts，0 errors**。纯时间RED为2通过/9失败→11通过；完成历史边界另复现1失败后修复，最终13通过。真实app/page+file adapter重进RED为1通过/6失败→7通过；投影27/27通过。内部只读审查的完成历史时钟P2已修复；不是ChatGPT独立验收。

官方实际release exit0，toolkit12,393ms，Node24.18.1/aiot-toolkit2.0.5。构建冻结输入与实际staging摘要一致。

- [RPK 0.1.3/code4](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.band.localsessiontest.release.0.1.3.rpk)
- 大小：**35,722 bytes**
- SHA-256：`c2960d2b890cc05ddac6ffefbe8fdac3cf9199d393137b3ad11c131a7e159d7f`
- 包名：`com.guanyi.mirra.band.localsessiontest`
- 公开证书SHA-256：`B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B`，与旧0.1.2一致。

实际独立验签、内容/每文件SHA、元数据签名、CRC与篡改拒绝通过。实际0.1.2→0.1.3 RPK app/page在Node受控file边界执行：恢复01:05→01:10/参考值、trustedFocusMs=0、原ID/pending保留；休息6分钟后阅读累计不增加、到时仍BREAK、主动继续后才累计；5编译onclick/48文本绑定、52file回调/2槽、重进和Done0写、重复结束只追加1条null记录。**这是编译脚本验证，不能替代固件计时/像素。**

精确清单见artifacts.json与verification.json。

## 5. 未验证项

0.1.3实际安装、参考计时重进显示待用户反馈；尚无新真机截图或原生模拟器执行。原生跨重启时间连续性、掉电、配额/耗电仍未证明。Android构建/测试Not Run（手机未改），TS/ESLint Not Run（继承原生JS验证）。0.1.2已恢复交互为已收到的设备证据，不重新标未完成。

## 6. Git

分支`codex/module-05b-2-time-recovery`；提交/普通push正在最终核对。不创建PR、不合并main或改历史。

## 7. 安装与自然反馈

用户已明确同意自行覆盖体验。使用既有成功的RPK工具选择上述0.1.3，直接覆盖，不卸载、不清数据、不换身份或降级；身份/版本提示异常则保留原文，不绕过。

只需自然学习片刻后退出并重开，反馈累计时间是否恢复且旁边为“参考值”；已通过的详情/休息入口不重复验收。有异常时保留实际状态/诊断，不把未知当零或假造可信时长。停在05B.2，等待这轮自然反馈。