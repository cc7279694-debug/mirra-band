# Module 02 验证记录

日期：2026-10-11，Windows x64。开发交付与国行小米手环 9 Pro 真机验收分开记录。

## 实际构建产物

本次使用 Node 24.18.1 / npm 11.16.0 / 项目局部 aiot-toolkit 2.0.5。无需替代 Node；没有改全局环境。原生 JS / `.ux`，不使用 TS 预编译。

| 产物 | 本地绝对路径 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| 推荐安装 release | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.band.demo.release.0.1.0.rpk` | 19569 | `76e5eb9b47d10e1dd59b0eaf114ac5536eaf0694571ec7bd66fa884a7674b0af` |
| 开发诊断 debug | `E:\CODEX\mirra-watch\dist\com.guanyi.mirra.band.demo.debug.0.1.0.rpk` | 24373 | `76d01b9eb6354ae498db07534792900d3a12b6d1203159785661d30353934a8c` |

两个包均为 `com.guanyi.mirra.band.demo` / 0.1.0，由本地新生成的独立演示证书签名。证书公开 SHA-256 指纹：

```text
B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B
```

实际校验：主签名、逐文件摘要签名与 META-INF/CERT 内层签名的 RSA-SHA256 验证，嵌入公钥与证书一致，整体与逐文件 SHA-256、内外层 ZIP CRC32、manifest/三个页面/入口/图标、公共主题与测试标识均通过。独立修改负载、主签名、文件摘要签名各一字节均被拒绝。该验证证明包的内部完整性和演示身份，不证明量产固件接受或商店认证。

构建输出原始内容（仅去掉行末空白）：[release](release-build.txt)、[debug](debug-build.txt)。独立检查报告：[release](release-package.json)、[debug](debug-package.json)。产物和私钥不进入 Git；重构建可能因工具生成的构建时间元信息产生新哈希，以实际交付文件为准。

## 测试与边界

| 实际执行 | 结果 / 证据 |
| --- | --- |
| `npm.cmd run check` | JavaScript / CJS / UX script 语法、manifest 路由与能力、图标与测试标识检查通过 |
| `npm.cmd test` | 62 项通过：19 模型、10 计时刷新、21 诊断、8 页面脚本集成、4 构建交付边界；见 tests.tap |
| debug/release 构建 | 两种新产物成功，实际 Node 24 兼容；见构建日志 |
| 包与签名检查 | 两种产物通过；三种篡改均被拒绝；公共样式实际进入编译页 |
| 本地审查 | 修复公共样式遗漏、首页 263→232 高度预算、连接页换行/详情空间；源码审查不是 ChatGPT 独立验收 |

页面集成测试执行实际 `.ux` script，通过注入时钟、路由与平台模块验证初始化、隐藏/返回/销毁、计时锚点与零发送。它是 Node harness，不是 Vela 渲染截图。

TypeScript：Not Run，原型为用户授权的 JS。ESLint：Not Run，当前工程以语法/配置检查及官方编译验证，没有声称 lint 通过。Android Build、正式 Mirra 通信、目标固件安装/中文/触控/息屏/耗电：Not Run，本轮不修改手机且没有真实手环控制入口。

## 模拟器

官方 Windows SDK0.1.0/engine32.1.15-20241202 与 vela-pre-4.0/20250225 镜像已安装在忽略的 `.local`，336 × 480 矩形配置准备通过；镜像官方 MD5 校验通过。Vela 启动仍报告 Unknown VVD/AVD；局部环境别名和子进程 USERPROFILE 不能解决。官方 out-of-tree 输入路径退出 0xC0000005，无 gRPC 注册。

应用加载、实际截图和触控：**Not Run**。本次没有实际运行截图，也没有概念图代替。实际命令路径、错误和官方源码解释边界见 [模拟器尝试](EMULATOR.md)。`scripts/emulator-local.cjs` 只保留验证过的 prepare/status，不提供未验证的运行命令。没有更改用户 Vela 目录、全局环境或手机，没有本轮启动的模拟器存活。

## 工具链风险与已定位问题

完整 `npm audit --json`：22 个受影响依赖节点（3 Critical / 16 High / 3 Low）；`npm audit --omit=dev --json`：0。它们是开发工具链的依赖审计计数，不是手环 RPK 内 22 个运行时漏洞。

涉及 simple-git / argv-parser（不可信 Git 配置与环境）、adm-zip（不可信 ZIP）、minimatch / braces（不可信匹配输入）、tmp（临时文件边界）等。未确认本轮实际利用路径；未执行自动修复、回退或依赖升级。后续独立评估固定官方工具的升级与可信输入边界。

CLI 默认扫描整个仓库，会复制 `.local` 的模拟器，曾发生 Windows EPERM；当前包装脚本隔离输入，最终两种构建通过。工作区外的生成临时目录 `E:\CODEX\.temp_mirra-watch` 与局部模拟器测试别名清理被自动审批策略拒绝，返回原因仅为 blocked by policy；暂保留生成文件，不进入 Git，未删除用户资料或手机数据。

## 真机交接

安装步骤见 [README](../../../README.md#安装与体验)。按 [产品规格真机清单](../../PRODUCT_SPEC.md#真机检查清单尚未执行) 检查七状态、中文、长书名、5 秒休息、返回重进、退出重开与只读诊断。记录安装错误/固件版本即可，无需提供设备 AuthKey、私钥或手机数据库。

当前停止点：交付后等待用户真机验收；正式只读 Companion 另行授权。
