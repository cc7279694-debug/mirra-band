# Mirra Band

观已 Mirra 的独立 Xiaomi Vela 演示应用，目标为国行小米手环 9 Pro（336 × 480）。所有学习状态与计时都是测试数据；不保存真实学习记录，不发送控制消息，无需账号或服务器。

Module 01 已由用户报告通过 ChatGPT 独立验收（PASS WITH NOTES）。Module 02 的实际产物与运行边界见 [验证记录](docs/evidence/module-02/VERIFICATION.md) 和 [checkpoint](docs/checkpoints/2026-10-11-module-02-prototype.md)。真机安装仍需用户验收。

## 项目入口

- [PROJECT.md](PROJECT.md)：产品定位、技术与边界。
- [AGENTS.md](AGENTS.md)：协作、Skill 路由、数据安全和 Git 规则。
- [当前状态](docs/CURRENT_STATE.md)：已验证内容、未完成事项和下一模块。
- [产品规格](docs/PRODUCT_SPEC.md)：首版原型状态、界面与验收要求。
- [当前架构](docs/ARCHITECTURE.md)：代码结构与验证边界。
- [路线图](docs/ROADMAP.md) / [决策](docs/DECISIONS.md)。
- [Vela 技术与通信核查](docs/research/VELA_FEASIBILITY.md)。
- [Module 01 检查点](docs/checkpoints/2026-10-11-module-01-foundation.md)。

## 开发边界

手环使用 Xiaomi Vela JS 快应用，交付为 `.rpk`。现有 Mirra Android 项目保持独立，真实学习数据仍由手机负责。

使用 HR-Codex Project Memory System：首次初始化选择 Bootstrap；已有可靠记忆选择 Resume；出现冲突选择 Recovery；模块验证后选择 Checkpoint。每个独立模块完成后暂停验收。

## 安装与体验

使用本次交付的 `com.guanyi.mirra.band.demo.release.0.1.0.rpk`；开发诊断备选为同签名 debug 包。绝对路径、大小与 SHA-256 见验证记录；RPK 和私钥不进入 Git。

1. 将 RPK 复制到手机可选取的目录，在你已验证能安装 RPK 的“表盘自定义工具”中选择文件，按原有流程发送到国行 9 Pro。无需更改手机 Mirra。
2. 在手环应用列表打开 **Mirra演示**，应显示“Mirra Band / 测试模式 · 模拟数据”。
3. 点击“选择测试状态”或“切换状态”，上下滚动并检查七种状态；选择后自动返回首页。
4. 启动准备的按钮只进入演示专注；计时状态可重置。列表下方“休息倒计时 · 5 秒”用于检查归零，归零保持休息。
5. “长书名显示测试”检查中文截断。进入列表或连接页后返回，保留本次演示并按锚点重算；真正退出后重新启动应回到未开始。
6. “连接信息”只读探测平台接口，列表可滚动至“重新探测 / 返回首页”。“通道已连接”也不代表正式 Mirra 接入或真实学习数据。

如安装工具报告错误，保留错误文字及手环固件版本；不要卸载、清理手机 Mirra 或替换正式签名。目标固件的安装、触控、息屏、退出与耗电仍需真机验证。

## 本地构建

本轮实际使用 Node **24.18.1**、npm **11.16.0**、局部 `aiot-toolkit@2.0.5` 完成 debug/release 构建。未替换全局环境。原生 JavaScript，无 TS 预编译。

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
```

首次构建需要独立演示证书，保存到已忽略的 `sign/`。已有演示证书应继续使用，避免改变后续覆盖安装身份；不要导出正式手机密钥。当前 Windows 可使用 Git 自带 OpenSSL：

```powershell
New-Item -ItemType Directory -Path sign -Force
& 'C:\Program Files\Git\usr\bin\openssl.exe' req -newkey rsa:2048 -nodes -keyout sign/private.pem -x509 -days 3650 -out sign/certificate.pem -subj '/CN=Mirra Band Demo/O=Mirra Local Prototype'
npm.cmd run build
npm.cmd run build:release
npm.cmd run inspect:rpk -- dist/com.guanyi.mirra.band.demo.release.0.1.0.rpk sign/certificate.pem
```

构建脚本只暂存应用输入，再调用官方 CLI，避免全目录扫描本地 SDK；它验证新生成的签名、内容摘要、CRC、配置与公共样式后才复制到 `dist/`。两种构建请串行运行。私钥、暂存目录、模拟器和产物均被 Git 忽略。

开发工具链审计有已知上游漏洞，生产依赖审计为零；细节见验证记录，未自动升级或强制修复。完成本轮交付后停止，等待真机验收；正式通信另行授权。
