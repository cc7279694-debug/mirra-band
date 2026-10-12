# 05B — 隔离独立学习闭环实施合同

2026-10-12，Asia/Shanghai。依据用户本轮完整05B要求，自主实施普通开发、修复、自动化与隔离构建；不进入05C。

## Goal / Scope

原生 Vela 单一应用 owner：测试书籍快照 → 第一动作准备与亲自确认 → FOCUS → 5/10分钟BREAK → 主动继续 → 可选结束页码 → 本地待同步完成记录。第一动作完成前没有Session；每条记录自包含书籍及动作快照、稳定安装身份加单调本地序号ID。仅一个活动Session，pending完成记录不删除。

新分支 `codex/module-05b-local-session` 从真实干净05A HEAD `097076801ee632ee4ff727b416450136dafa7a0f` 创建。手机维持原控制分支、无代码/数据库/签名/备份/统计变更。Module03/04正式代码与APK/RPK保留，不重画Logo、不新增依赖/云服务。

## Storage / Admission

复用05A原生回调超时/退役防护，严格新增命名空间 `mirra_05b_test_sessions_a/b` 和对应Files URI。独立marker `MIRRA_05B_ISOLATED`、schemaVersion1、canonical JSON、CRC32、序列和精确读回；先保存再更新业务状态。未知schema/字段、双坏、读取错误、冲突、不确定IO停止写；不自动清空槽或删除未同步记录。每槽8192 UTF8字节，非FINISH操作预留1024字节完成预算，最多8pending/32interval（设计限制，不是实测容量）。

05A原只有默认storage保存/退出重开USER_REPORTED_PASS，因此开发起初profile gate关闭；本轮用户随后明确回复“file 全部正常”，对应损坏恢复→同身份覆盖升级0.1.1→正常重启保留的问题。现在选择file并记录USER_REPORTED_PASS，profile显式 `storageQualified:true/storageBackend:file`。未扩展为storage全部通过、真实容量或时钟已证明；不以隔离UI或自动化冒充05B自然学习真机闭环已可靠。至少一条路径已准入，无需重复已通过测试。

## Time

保存 `{wallMs,ownerId,monotonicMs,monotonicVerified}` 原始边界，FOCUS和BREAK分别建interval；timer只刷新显示，不决定业务。运行时默认墙钟未核验，不使用性能时钟存在即视为固件能力已证明。跨owner/回退/不可用/异常跳跃保留全部事实与同一Session、显示不确定，候选时长不能冒充可信时长。仅有经证明且相互印证的同owner单调端点可贡献trustedFocusMs；当前运行时不启用它。正常退出/息屏不结束学习，BREAK超时不自动FOCUS。

## Verification / Delivery

TDD验证状态、nullable页码、重复/并发、pending、字节/容量及结束余量、恢复/写失败/未知、时间边界、owner/page生命周期、准入与命名空间隔离。执行Node全量、语法/配置、官方release构建、独立签名/CRC/摘要/篡改与包内容检查。真机安装另取当前同意，用户自然短学习检查退出重进同Session与完成记录保留；不足项明确Not Run，不要求冗长矩阵。

隔离包 `com.guanyi.mirra.band.localsessiontest` / Mirra独立实验 / 0.1.0 code1，既有实验签名，正式Mirra不覆盖。最后提交并push本功能分支、简洁交付报告；停在05B。05C目录/手机导入、05D/05E去重ACK/有效专注整合/迁移均不实施。
