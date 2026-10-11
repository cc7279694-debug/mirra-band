# Vela 平台、构建与手机通信核查

核查日期：2026-10-11。原始记录范围为 Module 01 只读研究；工具现状和 Proposed 方案属于当时快照。Module 02 的实际变化见末尾增补和 [验证记录](../evidence/module-02/VERIFICATION.md)，原始“未构建”等措辞不能当作当前状态。

标签含义：**Verified** 为本轮源码/命令/官方材料直接证实；**User-reported** 为用户提供的设备事实；**Proposed** 为待实施方案；**Unknown / Not Run** 不可表述为已支持或已通过。

## 结论

离线 Vela 快应用原型有官方工具链依据，适合先验证。真实 Mirra 手机通信仍取决于同包名/签名、Android SDK、小米服务与目标固件的实际支持；不能因第三方 RPK 安装成功就声称链路成立。

## 设备与界面

- **User-reported**：国行小米手环 9 Pro；已有第三方 RPK 安装能力。
- **Verified**：官方表列出 9 Pro 矩形 336 × 480、宽度 168 DP。[官方多屏适配](https://iot.mi.com/vela/quickapp/zh/guide/multi-screens/)
- **Verified**：`config.designWidth` 按实际屏幕宽度缩放。**Proposed**：先使用 168，按 336 × 480 运行效果验证字体、触控与边缘空间。[manifest](https://iot.mi.com/vela/quickapp/zh/guide/framework/manifest.html)
- **Verified**：`.ux` 是平台模板/样式/脚本格式，不是浏览器 DOM。[UX 文件](https://iot.mi.com/vela/quickapp/zh/guide/framework/ux.html)
- **Unknown**：用户当前固件、运行时 APILevel / platformVersionCode、可用空间、安装工具版本。下一模块可读 `system.device.getInfo()`，不采集设备 ID / AuthKey。[设备信息](https://iot.mi.com/vela/quickapp/zh/features/basic/device.html)
- 官方配置文档的表使用 `minAPILevel`，其完整示例仍含 `minPlatformVersion: 1000`；包名一般说明和通信专属说明也存在不一致。需结合固定工具链与真机确定，不能把示例 1000 当作设备版本。

## 本地工具现状

本轮实际运行了版本查询与命令发现：

| 项目 | 本轮结果 |
| --- | --- |
| Git / GitHub CLI | 可用；仓库克隆与远端读取成功 |
| Node / npm | v24.18.1 / 11.16.0 |
| OpenSSL | Git 自带程序可执行，版本 3.5.7；常规 PATH 未发现独立 openssl 命令 |
| `aiot` / `hap` | 命令发现与全局 npm 列表中均未发现 |
| AIoT IDE | 常规安装登记未查到；不是全磁盘排查结果 |
| 产品依赖 / 模拟器镜像 | 未安装；本仓库无 package.json |

Node 可运行不等于 Vela 工具链兼容 Node 24。Module 02 必须先实际验证最小工程，再固定项目局部依赖和 lockfile；如需替代运行时，优先局部使用，不替换机器全局 Node。

## 构建路径

**Verified**：官方提供 AIoT toolkit 与 Windows AIoT IDE；CLI 提供 `aiot build` / `aiot release`。本轮只读 npm 查询的 `aiot-toolkit` / `create-aiot` latest 均为 2.0.5，官方页面推荐 2.0.x 并标注 IDE 1.6.0；IDE 安装包当前最新版未独立验证。根 CLI 包没有声明 engines，不可由此推断 Node 24 兼容。[官方 toolkit](https://iot.mi.com/vela/quickapp/zh/tools/toolkit/start.html)、[固定版本 npm 包](https://www.npmjs.com/package/aiot-toolkit/v/2.0.5)

开发构建和带指定证书的 release 构建分别记录。官方 IDE 支持 Windows 10+，开发包输出为 debug RPK；打包行为不等于商店发布。[使用 AIoT IDE](https://iot.mi.com/vela/quickapp/zh/guide/start/use-ide.html)、[发布应用](https://iot.mi.com/vela/quickapp/zh/tools/release/release.html)

**Proposed**：下一模块优先使用项目局部固定 `aiot-toolkit@2.0.5`；只有预览或诊断确有需要时增加 IDE/模拟器。开发证书独立、本地保存，`sign/`、密钥格式与构建 RPK 已被 .gitignore 排除。不要从手机正式 Keystore 导出私钥来制作演示包。

**Verified（发布者说明）**：Vela 语言插件说明 `.ux` 内脚本为 JS，TS 需先编译为 JS。**Proposed**：业务 TS 预编译，`.ux` 仅保留薄适配，不使用 Node 的 fs 等运行时能力。[Vela 语言插件](https://marketplace.visualstudio.com/items?itemName=vela.aiot-ux)、[官方脚本语法](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/)

官方 IDE 入门页和 Interconnect 页的签名目录描述不同。下一模块应检查固定 CLI 的实际行为，并用构建产物证书确认开发身份，而不是仅按目录名称推断；正式身份迁移留在后续模块。

**Verified**：官方多屏模拟器页说明，miwear 4.0 / 5.0 镜像目前只提供 466 × 466 xiaomiWatch；开发镜像 vela-watch-4.0 支持 bandpro 或自定义设备。应选择目标尺寸，并记录镜像、尺寸和运行证据；模拟器性能不能外推到量产手环。[模拟器多屏配置](https://iot.mi.com/vela/quickapp/zh/tools/debug/multi-screens.html)

**Unknown / Not Run**：本项目 TS→JS→RPK 实际编译、Node 24 兼容性、模拟器安装/启动、Debug/Release RPK 签名构建、目标真机安装和性能。当前无可交付 RPK 或实际界面截图。

## 通信契约与身份

**Verified**：官方 Interconnect 要求声明 feature，通过单例连接查询状态与收发消息；事件覆盖打开、关闭、消息和错误。快应用 manifest 的 package 必须与配套 Android 包名一致，两端签名一致。[Interconnect 官方契约](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html)

手机现有源码包名为 `com.guanyi.mirra`；演示拟用 `com.guanyi.mirra.band.demo`，因此不会满足正式手机通信身份。正式接入前要核对已安装 APK 的公开证书指纹及其可用签名流程，不更换手机签名，不要求卸载或清数据。本轮未读取手机 Keystore、密码或私钥。

**Verified（文档层面）**：官方 Android SDK PDF v1.4 提供设备管理许可、节点查询、消息监听/发送和服务连接监听。手机与小米服务、手机与设备、快应用通道分别判断；传输回调不能等同业务 ACK。[Android SDK PDF v1.4](https://vela-docs.cnbj1.mi-fds.com/vela-docs/files/%E5%B0%8F%E7%B1%B3%E7%A9%BF%E6%88%B4%E7%AC%AC%E4%B8%89%E6%96%B9APP%E8%83%BD%E5%8A%9B%E5%BC%80%E6%94%BE%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3_1.4.pdf)

**Unknown**：当前适用 SDK 分发包、AAR / Gradle / Android Manifest 条件、许可、服务授权、现代 Android 兼容性、量产 9 Pro 固件兼容矩阵。本轮未解包或执行官方测试 Demo；PDF v1.4 不证明当前所有版本可用。后续 SDK 来源从 Interconnect 页面官方附录核实。[官方 FAQ](https://iot.mi.com/vela/quickapp/zh/guide/other/faq.html)

## 网络与后台

- **Verified**：官方 fetch 支持表将小米手环 9 / 9 Pro 列为不支持，方案不依赖手环直接 HTTP 请求。[fetch 支持明细](https://iot.mi.com/vela/quickapp/zh/features/network/fetch.html#支持明细)
- **Verified（文档层面）**：普通应用退后台可能停止；后台要求声明且实际运行允许的能力，官方列举 audio / request / geolocation，没有给出 Interconnect 常驻承诺。[后台运行](https://iot.mi.com/vela/quickapp/zh/guide/framework/other/background-running.html)
- **Unknown / Not Run**：息屏通信、退后台消息、振动送达、可靠后台计时、掉线重连与耗电。不借用无关音频/定位能力保活，不用模拟回调伪装成功。

## 后续真机通信门槛

Module 02 只做能力加载与连接状态的只读探测。Module 03 经单独授权后才评估同身份 APK/RPK 和 Android SDK：双方前台双向测试消息及业务 ACK、断连与重连、手机后台、手环息屏/退出、服务和设备重启均需分项验证。未通过时保留未连接/未知/过期状态，手机核心功能继续离线可用。

## 可复用参考（未复制代码）

| Reference | 本轮证据 | 应用方式 |
| --- | --- | --- |
| [open-vela/packages_fe_examples](https://github.com/open-vela/packages_fe_examples/tree/52e835b9e4826d45d55db7e4304d62e9e5707e80) | 官方 dev SHA `52e835b9e4826d45d55db7e4304d62e9e5707e80`；根 LICENSE 实读 Apache-2.0；最近提交 2026-06-02 | 优先参考 calendar/settings/多屏待办的 `.ux`、manifest、列表与生命周期组织，按需复用并保留署名；不整包引入旧工具依赖 |
| [BandQQ band-pro](https://github.com/Gsjsjzhznsz/BandQQ/tree/446d9f2839156e9d15048cf587d2a36bc6674290) | 社区 SHA `446d9f2839156e9d15048cf587d2a36bc6674290`；该分支 LICENSE 是 MIT，默认 main 是 AGPL-3.0；仓库最近 push 2026-10-06 | 可看目标屏幕与 aiot2.0.5 构建组织；作者的 9 Pro 支持声明未独立复验，分支许可证不能混用 |

许可证以冻结版本实际 LICENSE 为准。社区网络/登录/保活等能力不属于 Mirra 原型，不因 reference 存在而引入。此阶段未复制源码或素材，不添加推定的项目开源许可证。

## 研究边界

公开官方资料可证明接口存在与约束；不能证明用户设备实际运行、未来稳定性或生产级兼容。社区 README 的“支持”属于项目作者声明，应与许可证、分支、代码和用户真机结果分别记录。

研究使用 agent-reach 的 GitHub CLI 路由及官方网页核查。`agent-reach` 主命令未检出，因此其版本更新检查 Not Run；这不影响现有 GitHub/官方网页读取，也未安装或升级该工具。

## Module 02 实编译增补

- **Verified**：局部安装 `aiot-toolkit@2.0.5`；其实际 `lib/bin.js` 要求 Node >=18.0.0。Node 24.18.1 已实际完成 debug/release RPK，不再仅凭版本推断兼容；没有改全局运行时。
- **Verified**：原生 JS / `.ux` 已进入实际 RPK；TS 预编译方案按本轮用户授权替换，见 [决定](../DECISIONS.md)。
- **Verified**：实际签名解析表明 development 优先 sign/debug，其次 sign 根目录，再回落工具默认；production 优先 sign/release，其次根目录。构建隔离输入只复制根目录独立演示证书，两个包使用同一公开指纹，经 RSA 与内容摘要检验。
- **Verified**：`<style src>` 在本版本没有带入公共规则；改单个 style 内 `@import` 后，三个编译页面均包含公共主题。[官方样式导入](https://iot.mi.com/vela/quickapp/zh/guide/framework/style/)
- **Verified**：CLI 全目录扫描会把局部模拟器复制到临时工程；本项目用小型构建包装隔离应用输入，未修改官方依赖源码。曾遇到 Windows EPERM，生成临时目录清理被自动策略拒绝，保留该生成目录，不纳入产品或 Git。
- **Verified**：RPK 内为应用脚本、manifest、图标和签名元信息；不含 Node 开发依赖或私钥。开发依赖审计风险与手环包内运行时分别记录。
- **Unknown / Not Run**：目标国行 9 Pro 实际安装与固件兼容、中文/触控、息屏生命周期、性能和正式通信仍待用户验收；模拟器记录不能替代这些证据。
