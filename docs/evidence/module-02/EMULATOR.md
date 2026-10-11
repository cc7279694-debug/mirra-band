# Module 02 模拟器验证

日期：2026-10-11。结论：**本地 SDK 与 336 × 480 虚拟设备准备通过；应用运行、截图和触控为 Not Run。** 原生引擎在加载应用前失败，没有 RPK 安装、gRPC 画面或界面验收证据。

机器可读结果见 [emulator-report.json](emulator-report.json)。

## 已验证的本地准备

- 固定工具：`aiot-toolkit@2.0.5` / `@aiot-toolkit/emulator@2.0.5`，Windows x64，Node `v24.18.1`。
- 官方 Windows 引擎：`32.1.15.0 (build_id 20241202)`，资源版本 `0.1.0`。
- 官方 `vela-watch-4.0` 标签对应镜像 ID `vela-pre-4.0`，冻结版本 `20250225`。
- SDK：`.local/vela-sdk`；VVD：`.local/vela-vvd`。`VvdManager` 显式接收这两个目录。
- 配置：336 × 480，density 320，ARM，矩形，band；配置与图像复制通过官方 API 实测。
- 这两个目录均被 Git 忽略；不提交下载包、私钥、gRPC Token 或原始运行日志。

已执行并通过：

```powershell
node --check scripts/emulator-local.cjs
node scripts/emulator-local.cjs prepare
node scripts/emulator-local.cjs status
```

`prepare` 要求已存在本地官方 SDK 和安装完成的项目依赖；`status` 输出实际准备状态与运行阻塞。脚本仅保留这两个已验证入口。

## 官方资源与完整性

| 资源 | 来源与验证 |
| --- | --- |
| Windows 模拟器 | [官方 ZIP](https://vela-ide.cnbj3-fusion.mi-fds.com/vela-ide/emulator/v0.1.0/windows-x86_64.zip)；333,196,663 bytes；SHA256 `c4cf7af67ac37d404a312181ea8b80ace93f904002bebe97c96636b1efd8f034` |
| 开发镜像 | [官方 ZIP](https://vela-ide.cnbj3-fusion.mi-fds.com/vela-ide/system-images/vela-pre-4.0/20250225/vela-pre-4.0.zip)；221,529,710 bytes；响应 `Content-MD5` 与实际文件 MD5 均为 `15a51426821494f624e66a68fe30c023`；SHA256 `fd2c184a27da5a2ca73ab46704ae96ba6434e36fae1feb49994d6ca788eb6b31` |

解压前检查了所有 ZIP 条目的解析路径，均位于指定本地目标目录。模拟器解压体积 829,610,111 bytes；镜像解压体积 927,802,212 bytes。

模拟器 npm 包声明 ISC；[官方预编译仓库](https://github.com/open-vela/prebuilts_emulator_windows-x86_64)根许可证为 Apache-2.0，分发包内保留第三方 `NOTICE`。本仓库没有复制模拟器二进制或 SDK 代码。

## 实际失败路径

以下参数由 Node 子进程执行，目录环境只作用于该进程及其子进程，未修改 Shell、全局环境、用户 `.vela`、注册表或手机。运行登记被定向到 `.local/vela-vvd/runtime/Temp/avd/running`；ADB 使用独立端口 15037，目标 serial 限定为 `emulator-5558`。

### 1. 官方 VVD 启动器

实际主参数：

```text
emulator.exe -vela -avd Vela_Mirra_Band_336x480 -port 5558 -show-kernel -no-window -no-snapshot -no-audio -grpc 8558 -grpc-use-token -qemu -device virtio-snd,bus=virtio-mmio-bus.2 -semihosting
```

子进程提供局部 `ANDROID_AVD_HOME`、`ANDROID_SDK_ROOT`、`ANDROID_EMULATOR_HOME`、`ANDROID_PREFS_ROOT`、`LOCALAPPDATA`、`TEMP`、`TMP`。同一 `.ini` 能被 `-list-avds` 读取；Vela 启动返回 exit 1：

```text
Unknown VVD name [Vela_Mirra_Band_336x480]
Unknown AVD name [Vela_Mirra_Band_336x480]
```

局部 `runtime/vvd`、`runtime/.vela/vvd` 别名、子进程 `USERPROFILE` 和 `ANDROID_SDK_HOME` 覆盖均没有消除错误。

### 2. 官方直接引擎

同参数运行 `qemu/windows-x86_64/qemu-system-armel.exe`。先遇到 `0xC0000135`，通过 PE imports 定位到随包 DLL 搜索目录；局部子进程 PATH 增加 `lib64`、`lib64/qt/lib` 与 `lib64/gles_swiftshader` 后，DLL 加载错误消失，仍返回 exit 1：

```text
unknown virtual device name: 'Vela_Mirra_Band_336x480'
```

### 3. 官方 out-of-tree 路径

参考[官方 emulator.sh](https://raw.githubusercontent.com/open-vela/prebuilts_emulator_tools/dev/emulator.sh)，在局部 VVD 目录创建 `system/build.prop`，内容 `ro.product.cpu.abi=arm`。子进程设置 `ANDROID_EMULATOR_VELA=true`、`ANDROID_PRODUCT_OUT` 与 `ANDROID_BUILD_TOP` 为本地目录；实际参数包含：

```text
-kernel <local-image>/nuttx -sysdir <local-image> -datadir <local-vvd>
-system <local-vvd>/vela_system.bin -data <local-vvd>/vela_data.bin
-skin 336x480 -memory 1024 -no-window -no-snapshot -no-audio
-port 5558 -grpc 8558 -grpc-use-token
```

分别测试文档环境方式与显式 `-vela`，均返回 `0xC0000005`，没有有效 gRPC 登记。日志仅到引擎版本与 `encryption is off` 提示，应用没有加载。

## 路径限制依据与停止点

本地 Windows 二进制可见 `.vela`、`vvd`、`HOMEDRIVE`、`HOMEPATH`、`USER_HOME` 与 Android 目录变量，未发现 `USERPROFILE`、`VVD_HOME` 或 `VELA_HOME`。原生 `-help-all` 没有给出独立 Vela VVD home 覆盖选项。

[AOSP 同代 emu-32-release System.cpp](https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-32-release/android/android-emu-base/android/base/system/System.cpp) 的 Windows `getHomeDirectory()` 首先使用 `SHGetFolderPathW(CSIDL_PROFILE)`，仅该调用失败才读取 `HOMEDRIVE/HOMEPATH`。这解释了 `USERPROFILE` 子进程覆盖无效的现象；Vela 私有路径实现未找到，不据此推断全部平台都无法隔离。

本次创建的引擎子进程均已退出。已检查进程路径，现存其它 Mirra Android 模拟器没有被操作。两个测试别名目录保留在忽略的本地 runtime 内；自动审批拒绝递归清理，仅返回 `blocked by policy`。

后续需要独立验证受支持的原生隔离启动路径，或另行授权 SDK 设置范围，再在真实引擎或目标手环上加载 RPK。当前截图 0 张，不能用 Web 渲染图替代 Vela 运行证据。
