# 05B.3 交付报告

日期：2026-10-13（Asia/Shanghai）。状态：DEV_COMPLETE_AWAITING_DEVICE_NATURAL_USE。用户已确认0.1.3/code4真机重进计时恢复正常，保留USER_REPORTED_PASS；本版流畅度尚未验收，不进入05C。

## 1. 完成功能与根因

开始学习原来串行保存SELECT_BOOK→SELECT_ACTION→CONFIRM_START，首次3次提交，已有完成记录后含NEW_SESSION共4次。受控测量里串行文件等待占主要部分；每秒tick也重复整页投影、JSON深拷贝和字段赋值。已先提交[最小设计与测试方案](../../plans/MIRRA_BAND_05B_3_PERFORMANCE.md)，设计提交eac744d。

START_CONFIRMED仅在用户核对当前第一步并明确完成后，将原合法转换放在内存，最终一次提交。每次合法开始3读1写、sequence/counter各+1，历史pending不变；原命令不删除。写失败/未知不能显示成功，无部分PREPARING保存。已开始的IO在隐藏后可能完成，重进按真实结果恢复同一FOCUS。

休息/继续/保存仍完整提交；按钮立即提交忙碌文字并给事件循环刷新机会。等待期间跳过计时全量投影，普通tick只更新变化的时间文字。失败/异常仍明确显示，详情和返回保留。可选耗时诊断默认关闭，在详情启用，固定阶段/数值仅内存保存，不写业务槽；字段提交耗时不等于物理屏幕绘制耗时。

## 2. 修改文件

新增：local-performance.js、受控测量脚本及性能/原子开始回归测试、合同与本证据目录。修改：local-session新增专用事务；local-owner时间只读入口/诊断；local-journal仅阶段测量；local-ui-flow单次开始/让出事件循环；local-presentation时间小投影；LocalSession原生页面忙碌/变化字段/诊断。build-profile版本及白名单、RPK二进制执行验证脚本、关联测试和项目记忆同步。没有删除产品文件或记录。

## 3. 数据层与安全

schema1、marker、命名空间、双槽URI、CRC/序列/CAS/历史保护、校验及精确读回全部保留。8个核心/正式资源和21个历史APK/RPK SHA相同；schema/validation、原时间投影/history逐段相同；白色主题/tokens不变。45个冻结构建输入与构建时一致。无Migration、手机/Room/备份/统计/正式签名或依赖变化，不清记录。原Session ID与pending可从0.1.3恢复，结束页码仍nullable。

## 4. 实际测试、测量与产物

全量Node：**607/607 PASS，0失败/取消/跳过/todo，7150.3466ms**。语法/配置：88 scripts / 4源伴侣pages / 0 errors。原子开始先RED 9PASS/18FAIL再GREEN27PASS；流程与失败94项；页面性能13项，含时钟异常、原生setter失败、重复点击、忙碌详情/返回与真实回执门槛。实际覆盖双槽读/写/精确读回失败、错字节、超时迟到回调、损坏/历史恢复、counter/pending/容量、磁盘CAS、隐藏重进/资源退役。

同一Windows Node24.18.1受控实际app/page/Owner/file适配器链，文件回调人为配置20ms（Windows实际调度常约30ms），各开始3个样本，其余各6个样本。**这不是9 Pro耗时**；包围函数时间可重叠，不能相加；事件循环调度不是纯CPU。原始汇总与分段见[performance.json](performance.json)。

| 操作 | 0.1.3中位ms | 0.1.4中位ms | 原生读/写变化 |
| --- | ---: | ---: | --- |
| 空白开始 | 373.501 | 141.645 | 9/3 → 3/1 |
| 已有pending后开始 | 503.113 | 141.512 | 12/4 → 3/1 |
| 休息 | 123.031 | 135.107 | 3/1 → 3/1 |
| 继续 | 125.413 | 139.465 | 3/1 → 3/1 |
| 结束保存 | 123.928 | 140.176 | 3/1 → 3/1 |

开始等待明显下降，**休息/继续/保存总等待未下降**；新增让出事件循环在本Windows环境增加调度等待，不据此声明固件更快。忙碌字段提交中位分别从0.300/0.380/0.532/0.470/0.528ms变为0.187/0.231/0.275/0.364/0.476ms，仍不是实际像素反馈。60tick中位14.637→2.565ms，响应式字段3660→120、JSON调用1080→0，文件IO都是0。

实际官方release：exit0，toolkit2.0.5构建12,669ms。**[隔离RPK 0.1.4/code5](E:/CODEX/mirra-watch/dist/com.guanyi.mirra.band.localsessiontest.release.0.1.4.rpk)**，38,644bytes，包名com.guanyi.mirra.band.localsessiontest。SHA-256：`27df0dddbb5465f1eea548be325cdde474b1174987bc15e4709b83620b3687dd`。

与已接受0.1.3同实验签名，公开SHA-256指纹：`B9:AD:5C:30:7A:17:03:1C:3D:19:3F:8E:E2:BA:AB:2A:B5:D1:FE:38:3F:73:84:28:EB:FE:64:9E:9F:67:E9:0B`。RSA/内容/各文件SHA/签名元数据/ZIP CRC及篡改拒绝通过，版本单调递增。[artifacts.json](artifacts.json)、[verification.json](verification.json)。

实际签名0.1.3→0.1.4 app/page/编译模板在Node受控回调执行：旧active/pending保留；跨owner参考/可信0、休息排除和主动继续保留；新开始3读1写、重复点击counter只+1、busy先提交、null结束，最终3pending。5个真实编译onclick/49文本绑定、60file回调/2槽、隐藏后0timer。验证器曾遇跨VM对象原型比较问题，改为精确JSON事实比较后通过；不是设备存储失败。

## 5. 未验证与限制

**Not Run：0.1.4真机安装、按钮到实际像素反馈、9 Pro原生文件分段耗时和等待感。**没有新设备截图/模拟器运行。自动化/受控测量不证明固件流畅度、可信跨重启计时、实际配额/掉电/耗电。参考值仍不是已验证有效专注。Android/TS/ESLint Not Run：本轮不改手机，继承原生JS检查。Logo仍LOGO_PENDING。

内部代码审查不是ChatGPT独立验收；发现的计时起点偏晚问题已有RED/GREEN修正，未发现其他具体P1/P2问题。

## 6. Git

分支codex/module-05b-3-persistence-performance，从真实cf0328f基线创建。设计eac744d；实现/证据提交**48b86e08f73532d9acffd2d566e037fcb1db2779**已普通push，远端SHA核对一致。提交前33文件秘密/路径审计0告警，diff检查通过。后续仅补记准确交付状态。没有PR、main合并、Force Push或手机工作区操作。

## 7. 下一步

用户已明确同意自行直接覆盖0.1.4并自然体验，授权已满足，无需再次确认。安装尚未取得完成反馈；不卸载、不清数据，不改手机。自然完成一次短学习，反馈开始、休息、继续、保存等待感是否明显改善即可；需要分段定位时可先在详情开启耗时诊断。不要求重复已通过的计时与冗长矩阵。真机结果另记录，停在05B.3。
