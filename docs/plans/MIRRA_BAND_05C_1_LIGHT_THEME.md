# 05C.1 — 正式版全局主题可读性修复

## 合同

- Goal：正式0.4.1/code10六页一致浅色，消除旧浅字在白底及忙碌灰按钮上的低对比组合。
- Scope：正式profile构建期主题、样式回归检查、版本与交付证据。基线为05C分支实际HEAD `92122a2`，功能分支 `codex/module-05c-1-light-theme-fix`。
- Locked：页面流程、原脚本/onclick、Interconnect/目录协议/书籍、Local Session/参考时间/性能/双槽/存储路径与原正式身份。Android和旧Demo/实验资源及历史产物不改。
- Adjustable：正式构建的背景、表面、文字和按钮配对；Home忙碌按钮的展示class。
- Palette：白底#FFFFFF、灰面#F2F4F7、主字#181A1D、次字#626873、蓝#386FBE；蓝按钮白字，灰次按钮主字，灰忙碌按钮可用清楚的次字。
- Acceptance：六正式页面与隐藏/禁用/输入/保存/错误分支的源声明和实际编译声明配对通过；同包/原证书/递增版本；自然使用视觉验收须新安装同意后另验。
- Verification：旧签名0.4.0实际资源RED；新源/动态分支GREEN；Node全量/语法；实际RPK构建/签名/摘要/编译资源；旧资源与产物hash及脚本保留核查；可用时Vela原生336×480画面，不可用则Not Run。

## 已定位与证据边界

用户报告05C真实书籍同步、离线使用和保存基本正常，功能获用户正常反馈、视觉验收失败，整体不记PASS。旧正式RPK混用两套颜色：manifest白色，Mode/LocalSession浅色，Home/Detail/Control/Connection实际编译为旧深色页面。@import已实际展开，各页面各自style，app.style为空；未证明固件为何让旧页显示白背景，不能断言全由全局CSS覆盖。

采用仅正式构建阶段展开统一浅色样式，不新增运行时主题owner；旧共享页面和theme.css/local-theme.css原字节保留。检查器按实际声明计算对比和条件配对，不替代原生像素与固件优先级验证。

安装新0.4.1须当前另行同意，不卸载、清数据、降级、改实验包或进入05D。
