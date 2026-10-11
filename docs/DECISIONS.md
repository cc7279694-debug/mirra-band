# 架构与产品决定

## 2026-10-11 — 独立手环仓库与模块交付

### Decision

使用用户提供的 `cc7279694-debug/mirra-band` 仓库与当前工作区开发。先交付 Module 01 项目基础与核查，再等待验收后实施独立原型。

### Context / Alternatives

远端初始提交只有 README，本地目录为空。可选择在手机仓库增加模块或另起仓库；用户已建立独立仓库。

### Reason / Consequences

平台工具链和设备验证独立，避免手环实验影响手机未提交工作和用户数据。手机签名/SDK 集成后续单独授权。

## 2026-10-11 — 使用 Vela 原生快应用表达手环 UI

状态：Vela 平台选择继续有效；本条 TS 预编译部分由下方 Module 02 原生 JavaScript 决定替代。

### Decision

手环采用 Vela `.ux` 界面与 RPK；业务采用 TS 预编译为 JS，`.ux` 保留薄 JS 适配，实际编译链在 Module 02 验证。不向手环套用 React / Capacitor / SQLite 默认架构。

### Context / Alternatives

用户指定设备可安装 RPK，官方提供 Vela JS 工具链。替代路线包括普通表盘或完整 Android UI，都不满足同一平台交付。

### Reason / Consequences

选择设备实际支持的应用形式；平台脚本与业务状态分开。此决定不改变手机已有原生架构。

## 2026-10-11 — 先演示后通信，手机拥有真实学习事实

### Decision

首版离线测试模式，不保存真实学习记录；通信维度与学习/监测维度分开。拟使用独立演示包名与开发签名；正式通信身份暂不锁定。

### Context / Alternatives

可直接改手机接入 SDK，或先验证手环原型。官方 Interconnect 要求两端包名与签名一致；现有 APK 签名变更会影响覆盖安装。

### Reason / Consequences

先证明界面与打包可用。演示签名不匹配正式 Mirra，不能宣称真实连接成功；后续需实际签名与 SDK 可行性验证。不得借官方卸载建议去卸载或清除手机 Mirra 数据。

## 2026-10-11 — 继承 Mirra Blue 与状态可信性

### Decision

沿用手机现有强调色 `#6598E8`、主动作色 `#386FBE` 等 Palette；界面以状态、时间/动作、书名顺序呈现，永久标记模拟来源。

### Context / Alternatives

现有手机 Palette 有直接源码证据。可以重新设计品牌或缩小手机完整页面，但当前抬腕任务不需要这些变更。

### Reason / Consequences

保留产品连续性，只适配小屏布局与交互。未监测、休息、恢复或断连不变成虚构的有效专注，后台提醒仍需真机证据。

## 2026-10-11 — Module 02 使用原生 JavaScript

### Decision

按用户本轮明确授权，以原生 JavaScript 实现演示模型、计时刷新与只读诊断，页面只适配平台生命周期。替代此前 TS 预编译计划。

### Context / Alternatives

首版只有少量状态与平台适配；`.ux` 脚本本身采用 JS。加入 TS 会增加生成目录与同步检查，而本轮优先交付真实 RPK。考虑过 TS 预编译，当前选择无额外编译层。

### Reason / Consequences

维护一个源码版本，直接进入官方构建链。输入校验、边界单元测试、实际页面脚本测试与语法检查承担首版验证；它们不能声称是 TypeScript 类型检查。未来类型化须有明确收益，独立评估。

## 2026-10-11 — 隔离官方构建输入与独立演示签名

### Decision

固定局部 `aiot-toolkit@2.0.5` 与 lockfile；用 `scripts/build-rpk.cjs` 将应用、包信息与演示证书暂存到忽略目录，再串行调用官方 CLI。不修改全局 Node、npm 或工具源码。

### Context / Alternatives

实际源码显示 CLI 扫描工作目录，仅排除 node_modules/dist/build/.git；直接在仓库执行会复制 `.local` 中的模拟器文件，导致冗余复制和 Windows EPERM。可以修改工具内部排除规则或移动 SDK，当前采用隔离输入。

### Reason / Consequences

避免非产品文件参与编译，锁防止同一输入目录并发构建。每次验证新生成 RPK 的 RSA-SHA256、内容摘要、ZIP CRC、manifest 与公共样式，防止 CLI 失败却返回零时误交付旧包。签名使用本地新生成的演示身份，私钥只在忽略目录；公开指纹用于检查身份，不匹配正式手机。
