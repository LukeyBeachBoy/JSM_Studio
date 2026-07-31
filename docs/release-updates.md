# JSM Studio 发布与应用内更新

JSM Studio 使用 Tauri updater。每次发布 Windows 版本时，GitHub Actions 会构建 NSIS/MSI 安装包，并将安装包、`latest.json` 和 updater 签名文件上传到 GitHub Release。已安装的软件启动后会检查：

`https://github.com/hotuns/JSM_Studio/releases/latest/download/latest.json`

## 第一次配置 GitHub Secret

Tauri updater 必须验证签名。公钥已经提交到 `JSM_GUI/jsm_gui_tauri/src-tauri/tauri.conf.json`；私钥不能提交到仓库。

在 `hotuns/JSM_Studio` 的 GitHub 设置中打开 `Settings → Secrets and variables → Actions`，创建：

- `TAURI_SIGNING_PRIVATE_KEY`：本机生成的 updater 私钥文件完整内容。当前正式私钥位于 `C:\Users\hotuns\.tauri\jsm-studio-updater-v2.key`，只应通过 GitHub Secret 保存。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成正式私钥时设置的密码。这个 Secret 必须配置，不能提交到仓库。

私钥丢失后，已经发布的版本仍可运行，但不能继续发布能被现有安装识别的新更新；应妥善备份私钥。若私钥泄露，应生成新的密钥对，并通过新版本替换配置中的公钥。

## 发布流程

1. 修改 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中的版本号，并保持三者一致。
2. 提交并推送代码。
3. 创建与版本号对应的标签，例如 `v0.2.2`，并推送标签：

   ```powershell
   git tag v0.2.2
   git push origin v0.2.2
   ```

4. `Release JSM Studio` workflow 会构建并发布安装包。发布完成后，Release 中应至少包含 NSIS 安装包、MSI 安装包、对应 `.sig` 文件和 `latest.json`。

不要手动替换 `latest.json` 或 `.sig` 文件，也不要把 updater 私钥放进项目目录。应用更新下载完成后，用户点击“立即重启”即可安装；Windows 安装流程会退出当前应用并重新启动。

## 本地验证

开发模式下通常没有可用的 GitHub Release updater 元数据，因此检查失败会记录到开发者控制台，不会阻塞应用启动。正式安装包应从 GitHub Release 安装后验证更新流程。

构建前端和 Tauri 安装包：

```powershell
Set-Location JSM_GUI/jsm_gui_tauri
npm ci
npm run tauri:build
```
