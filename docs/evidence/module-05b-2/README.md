# 05B.2 交付与真机反馈记录

2026-10-13 后续更新：用户已报告详情、休息选择和5分钟休息页/继续按钮恢复，记USER_REPORTED_PASS；退出重进的时间未知已定位为旧owner变化策略。已授权并交付0.1.3参考计时补修，见[当前计时交付](time-recovery/README.md)。以下保留0.1.2首次交付的历史验证与当时待验收项，不能覆盖后续已收到的成功反馈。

状态：`05B_2_DEV_COMPLETE_AWAITING_NATIVE_FEEDBACK`。本轮从05B.1实际HEAD `44b2e5c4025e2f424c9d0535142c4ddb5c65a3c4`创建 `codex/module-05b-2-native-recovery`。用户确认手环安装0.1.1/code2；电脑旧包实际版本、内容与公开证书已核对。05B.1用户自然验收FAIL（阅读计时未显示、学习与详情点击无响应）保留；旧05B基本自然使用正常反馈也保留。

## 1. 完成功能与定位结论

- 独立点击探针：顶部div、中部text、底部div、详情/返回、平面变量计数和前台刷新。无Owner、学习、通信或存储模块；与现有记录隔离。其数字是刷新诊断，不是学习计时。
- 主页面采用旧05B的平面数据绑定形态：11种互斥视图、计时/按钮/状态/详情均为标量；纯投影和不可变第一步预览保留在非响应字段`_projection`。不重写状态机。
- 仅只读详情和详情返回可越过读取/保存busy；所有业务导航和写入仍受原锁、准入和逐条读回回执限制。
- 固定诊断记录事件计数、页面/流程视图、生命周期、busy/准入、操作、时间KNOWN/UNKNOWN及刷新成功/失败。持续刷新失败仍可打开只读诊断；不能从失败页面的旧预览写记录。页面显示失败保留到成功重新进入，不会被普通计时tick清掉。
- 白色背景、灰色卡片、Mirra Blue按钮与计时，主按钮白字；详情/返回40×40设计单位。源码尺寸检查保持208单位内容预算，不能替代真实336×480像素检查。未知时间明确`--:-- / 时间待核对`，已知墙钟观察仍标参考值。
- 用户原Logo已原字节保存于`src/common/local-brand/logo-source.png`，SHA-256 `71f4b8277f1f1a54215aab9eadb9cc113eb14c2541176b93295edf861a4759be`；本轮按合同继续`LOGO_PENDING`，未裁剪、重绘或集成到RPK。

已复现的软件原因与修正：

| 受控复现 | 结论/修正 |
| --- | --- |
| onShow真实Owner/file读取等待 | busy挡住只读详情，计时仍可更新；只放开只读诊断，不放开业务写入 |
| 注入页面refresh异常 | flow已导航但画面未更新；旧订阅吞异常。页面捕获固定代码并提供可见诊断 |
| show失败后普通tick | 本轮页面包装中实际复现错误被误清；增加显示代际与失败状态，成功重进才解除 |
| actionRows/actionChoices原生setter失败一次 | 缓存先提交会跳过重试、留下旧文本却启用新动作；现在全部依赖数组赋值成功后才提交缓存键 |

**真机故障的最终根因仍未证明。** 实际旧RPK保留编译点击绑定，不能说编译丢了onclick。[Vela数据文档](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/page-data.html)未将vm列为保留字；[Vela公开runtime](https://github.com/open-vela/frameworks_runtimes_quickapp/blob/58af216ec93b13f572aacb3e41b8e39a130056bf/README_en.md)核心为预编译库。实际执行[HAP参考observer](https://github.com/hapjs-platform/hapjs/blob/dde9e8e9f708c7dc195cfed6b5a9cf5d98359dac/core/framework/src/dsls/xvm/vm/observer.js)不出现冻结对象赋值异常，该结果也不是目标Vela固件。因此平面绑定属于有旧版对照的兼容修正，不能宣称它已证明此次根因。

## 2. 修改文件

- 新增：ClickProbe app/page/theme、探针产物执行验证、点击profile/原生绑定/只读锁回归测试、Logo原图、本轮合同及证据。
- 修改：`LocalSession/index.ux`、`local-ui-flow.js`、`local-theme.css`、`local-tokens.js`；build/source profiles、构建/检查/验签、旧/新编译产物验证及相关既有测试；项目当前状态、架构、决定、路线图和入口文档。
- 删除：无。旧05B/05B.1源码可由对应提交恢复；全部旧RPK/APK保留。

## 3. 数据层和配置

schemaVersion1、marker、installationId/counter、双槽URI、校验/序列/CAS、存储IO不确定锁存、容量预算、pending队列均不变。无SQLite、Room Migration或备份变化，不访问或修改手机用户数据。第一动作明确确认、单一Session、休息到时不自动继续、可空结束页码及先保存后提交保留。

主修复包使用同包名`com.guanyi.mirra.band.localsessiontest`、同实验证书，目标0.1.2/code3；探针为独立`com.guanyi.mirra.band.clickprobe`0.1.0/code1，仅system.router。没有新依赖、全局环境修改、正式身份或正式产物变化。

## 4. 实际验证

精确结果见`verification.json`和`artifacts.json`。探针实际官方release构建exit0，toolkit84,118ms；10,983bytes，SHA-256 `d778a5a08da16a1217f5b271f9e9ee2ec68a06b52cd0f573dd5d54481a3acc37`。独立验签、内容/每文件摘要、签名元数据、ZIP CRC和三类篡改拒绝均通过。

真实探针RPK的编译app/page/template/onclick在Node受控边界执行：36次编译点击、323次文本求值、详情/返回正常、前台1定时器且隐藏/销毁0；原生模块加载/存储调用0。**这些是编译脚本验证，非固件触控或像素。**

最终未过滤Node **534/534 PASS，0失败/取消/跳过/todo**，27,733.6267ms；语法/配置 **80 scripts，0 errors**。官方主包release exit0，toolkit18,733ms；Node24.18.1 / aiot-toolkit2.0.5兼容实构建，无全局环境或依赖变化。构建输入冻结后与实际staging摘要匹配。

| 产物 | 版本 / 大小 | SHA-256 |
| --- | --- | --- |
| [学习修复包](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.band.localsessiontest.release.0.1.2.rpk) | 0.1.2/code3；35,276bytes | f087ed20b0423dfdc413f16f6dc1dfcbd810cf6eae49261c85ad41529b2346b1 |
| [独立点击探针](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.band.clickprobe.release.0.1.0.rpk) | 0.1.0/code1；10,983bytes | d778a5a08da16a1217f5b271f9e9ee2ec68a06b52cd0f573dd5d54481a3acc37 |

公开证书SHA-256两包及旧0.1.1一致：`B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B`。RPK主签名、内容及每文件摘要、签名元数据、CRC和篡改拒绝均真实检查；同身份递增满足包层安全升级条件，尚不证明设备已完成升级保留。

分别执行实际0.1.0→0.1.2、0.1.1→0.1.2签名RPK app/page：旧pending/活动ID/序列保留，重进0额外写，UNKNOWN时间不变，5次真实编译onclick/48文本求值、12可选键、重复结束只新增1条null页码记录、最终2条pending、Done0写、52file回调/2槽/隐藏timer0。Controlled Node通过不等于跨进程原生耐久或真机UI。

11个受保护核心/正式资源与18个已有APK/RPK实际SHA全部不变。内部只读审查发现的缓存P2已修复并回归；该审查不是ChatGPT独立验收。

## 5. 当前问题 / Not Run

- 探针真机：用户已明确同意自行安装，目前等待计数、详情返回与前台刷新实际反馈，不能标PASS。
- 主修复包真机：用户已同意在探针反馈后自行覆盖体验；尚未收到安装或自然使用反馈。按钮、计时实际渲染、中文像素及同身份升级保留未验证。
- 原生模拟器：本轮未运行新包。既有Windows引擎在应用加载前阻塞，05B.1记录包含目录查找失败/0xC0000005；没有把旧阻塞或Node模板当新运行截图。
- 时间：墙钟观察不是跨Owner/重启可信持续时长。保留原始Session/边界，UNKNOWN不清零、不造已验证时长。原生时钟、全部固件、掉电、真实配额/耗电仍未证明。
- Android构建/测试Not Run：本轮手机未修改或操作。TS/ESLint Not Run：继承授权原生Vela JavaScript，执行语法和Node验证。

## 6. Git

功能分支`codex/module-05b-2-native-recovery`，实现提交`bdf8ca71d545bee0472c69a4c94689efa6c41ed0`。普通push已成功，远端分支SHA核对一致；后续仅补记交付状态。本轮不创建PR、不合并main、不改历史。

## 7. 下一步与安装边界

停在05B.2。先用已授权的独立探针自然点按一轮，反馈计数/详情返回/刷新；用户已明确同意在探针反馈后自行覆盖体验，用既有成功的RPK工具**直接覆盖**`Mirra独立实验`0.1.2，不卸载、清数据、降级或换证书。若工具身份/版本异常，停止并保留错误原文。

无需冗长矩阵：自然短学习中观察大计时或明确时间待核对；点详情并返回；退出重进同次Session；正常结束后记录保留。休息到时仍需主动继续，结束页码可留空。不进入05C或修改手机数据库。