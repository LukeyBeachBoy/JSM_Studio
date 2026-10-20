# JSM Evolved（原 JSM Studio）

JSM Evolved 是面向 Windows 的 JoyShockMapper 图形界面和配套分支，提供陀螺仪瞄准、触摸板设置、按键映射和游戏配置管理。

**发布状态：**[0.7.155 Windows x64 未签名预发行版](https://github.com/LukeyBeachBoy/JSM_Studio/releases/tag/v0.7.155)供早期测试使用，包含下方所述的新界面和权限设置。请先备份配置，并查看[版本说明和测试状态（英文）](docs/releases/0.7.155.md)。此安装包的全新系统安装和真实手柄验收仍待完成。旧版 v0.7.22 仍是稳定版本；应用内更新检查只查找稳定版本，请通过上方链接下载测试版。

- [本项目的官方下载页面](https://github.com/LukeyBeachBoy/JSM_Studio/releases)
- [完整英文说明、截图和功能对比](README.md)
- [首次使用指南（英文）](docs/getting-started.md)
- [权限、驱动和隐私（英文）](docs/privacy-and-permissions.md)
- [问题反馈](https://github.com/LukeyBeachBoy/JSM_Studio/issues/new/choose)

当前开发版本默认使用普通用户权限。需要时可在 **Settings → Startup** 中选择以管理员身份重启，或开启手动启动时请求管理员权限。驱动安装仍可能需要单独的 Windows 授权。旧版本的行为不同。

Windows 锁屏手柄输入默认关闭；必须在 **Settings → Startup → Windows sign-in** 中单独开启并确认。已安装 FakerInput 驱动不会自动启用该功能。**View release** 只在浏览器中打开发布页面，不会下载安装程序或自动退出应用。

目前仅提供 Windows x64 应用，未提供 Linux、SteamOS 或 macOS 版本。应用安装包尚未签名，Windows 可能显示“未知发布者”；请勿关闭安全防护来安装。

本项目建立在 JoyShockMapper、Custom Curve 和 JSM Studio 的工作之上。请参阅[致谢](docs/CREDITS.md)和[许可证](LICENSE.md)。英文文档是当前版本的完整说明；旧中文说明中的上游下载地址和默认管理员启动描述已移除。
