# 当前状态

更新：2026-10-13（Asia/Shanghai）。

## Current Stage / Module

**05C / DEV_COMPLETE_AWAITING_PHYSICAL_ACCEPTANCE**。用户已批准真实书籍离线目录与正式身份整合，采用方案A：保留独立实验应用及记录，不迁移。合同见[05C](plans/MIRRA_BAND_05C_OFFLINE_CATALOG.md)，交付记录见[evidence](evidence/module-05c/README.md)。不进入05D–05E。

Band基线d693d3502c4d8a05670fb0adf20ab4e8e4c0ba27，新分支codex/module-05c-offline-catalog；Android隔离工作树基线30a8af3fdea225cc96db6a360d71383a85b7ea39，新分支codex/mirra-band-05c-catalog。原手机工作区不修改，不合并main。

## 已接受的设备结果

Module03真实IDLE、用户确认的监测学习锁屏重进和首次NO_DEVICE自动恢复继续保留。05A选定file后端损坏恢复、同身份升级、正常重启记录保留为USER_REPORTED_PASS。05B基本体验、05B.2详情/休息交互、0.1.3/code4跨实例参考计时恢复的用户PASS保留。05B.1点击/计时失败历史保留。

05B.3的0.1.4/code5已有安装同意，但真机流畅度改善尚无明确反馈，不能标记通过。本轮也不能把旧实验数据保留证明扩大为新正式目录全部固件边界已证明。

## 当前实现

正式com.guanyi.mirra拥有Mode入口、手机在线伴侣与LOCAL独立学习。单Interconnect owner和单LocalOwner；已有v1/v2兼容，v3能力协商新增目录。已知手机活动/未确认控制阻止新独立开始，本地活动/存储未知阻止切到手机控制。离线未知不被描述为已证明手机空闲。

Android只读LearningItemEntity与FirstActionResolver；新目录授权默认关闭，明确披露ID/书名/页码/第一动作/主线标记。主线自动、最多11本其他IN_PROGRESS书籍，本地选书偏好独立no-backup设置。Room v4/Schema/原Intent与Session转换/监测/统计/备份格式不变。

目录最多12本、16KiB canonical UTF-8、1024字节分片、4096字节消息、固定30秒、双槽/CAS/完整校验/精确读回后ACK。重复完整目录幂等，CRC碰撞冲突拒绝，未知/损坏/迟到/缺失/断连不启用半目录；保存完成但ACK丢失保持“未确认”，不保证仍是旧目录。

目录与正式Session文件分别mirra_catalog_live_[ab].json、mirra_local_sessions_live_[ab].json；不读取其他包私有实验槽。正式Session独立marker/schema1，8192字节/8 pending/32 intervals/结束预留，原实验格式与schema不改。目录更新不改活动和已完成自包含快照；合法腕端结束页码仅待确认，未更新手机。

独立UI保留白色Mirra Blue、实际第一步完成后一次确认保存、忙碌反馈、只更新变化计时字段、休息主动继续及nullable页码。真实书名120码点、动作160码点完整行展示，超限拒绝同步，不静默截断。无完整目录则不能使用测试书籍替代。Logo保持现有资源/LOGO_PENDING。

## 新鲜验证

Node未过滤682/682 PASS；104脚本语法/配置0错误。Android88 suites/824 tests全部PASS、0fail/error/skip；Lint0 errors/20原有warnings/1hint，实际两APK构建通过。旧文件并发测试曾两次超时，原断言保持，最后无重构建负载的局部1024m/单worker未过滤通过，失败历史保留。

正式RPK0.4.0/code9、80245bytes、SHA bd0458ca70e63d815102d7becefe51a3c74644e87a9df29bc261ec98459fd0dc；APK1.3.0/code8、16950769bytes、SHA c95c9bf53634b465fff2039285d697bdf4f2587c72e0ece46caedd39203d2569。实际同包名/原29DE…证书/版本递增、内容/文件摘要与篡改拒绝已核验，不转换或更换签名材料。

实际签名编译RPK受控执行通过目录读回后ACK/单次开始/离线同Session重进/参考时间/休息排除/null结束/pending保留/tick零IO。自有Android API37 AVD19/19原生PASS（8新目录+11相关回归），只用测试in-memory Room及受控SDK，无用户数据/其他设备操作，完成后正常关闭所属AVD。人工截图未取得：系统Pixel Launcher ANR不被归因于Mirra，不宣称像素/流畅度通过。

22份旧APK/RPK、11项受保护Band资源/依赖、共享v3四份fixtures/Schema副本核对保持。手机Room/Schema/DAO/Migration/备份/非wearable算法未改；原手机checkout1338b9a干净。独立代码审查已修复ACK状态竞态/总期限及demo静态依赖，未发现剩余阻塞。

## Pending / Not Run / 下一步

开发交付已达经验证停止点；普通commit/push最终Git结果见交付记录。停05C。当前无本轮物理安装授权，实际覆盖安装/真实书籍往返/断手机独立学习/正式长文本画面Not Run，届时仅请求一次必要安装同意并自然体验。无腕端记录上传、手机历史合并、统计或数据库迁移。

墙钟累计仍是参考值，跨重启可信连续性及未保存中间时间异常不能证明，不计入已验证有效专注。模拟器/Node回调/Golden均不替代真实9 Pro的通信、流畅度、像素或持久保留。
