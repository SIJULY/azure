# Azure VM Management Panel 🚀（全网最好的Azure管理面板）

一个基于 Python Flask 和 Azure SDK 的简易 Web 面板，用于在一个界面中管理多个 Azure 账户的虚拟机。

本项目整合了所有必需的前后端代码、配置文件和一键部署脚本，旨在方便用户在任何新的 Debian/Ubuntu VPS 上快速部署和使用。

<img width="1536" height="1819" alt="c5a31738-e84a-46a1-9949-c2501c1e8817" src="https://github.com/user-attachments/assets/b043c9f7-9f10-47c0-b443-102eb6fda1be" />

<img width="1621" height="1698" alt="703410a7-332b-4e62-8a13-b4021ef97fda" src="https://github.com/user-attachments/assets/ba284577-8e81-4dae-ad0c-ff48292d45ac" />

![telegram-cloud-photo-size-1-5098559598846741265-y](https://github.com/user-attachments/assets/87fbc293-3646-4c77-a201-9cf67e49b546)



## ✨ 特性

- **多账户管理**: 安全地在本地 `json` 文件中保存和切换多个 Azure 账户凭据。
- **实时状态概览**: 集中展示所有虚拟机的状态、区域、IP、实例类型、运行时间等信息。
- **完整的生命周期操作**: 支持对虚拟机进行创建、启动、停止、重启和删除。
- **一键更换IP**: 为指定的虚拟机更换一个全新的公网IP。
- **自定义创建实例**: 通过图形化弹窗，自定义区域、实例类型、操作系统、硬盘大小和IP类型来创建新虚拟机。
- **后台异步任务**: 所有耗时操作（如创建VM）都在后台执行，并通过轮询机制将最终结果（成功或失败）实时反馈到前端日志窗口。
- **一键部署脚本**: 提供 `install.sh` 脚本，可在全新的服务器上一键完成所有环境配置和部署工作。
- **稳定后台服务**: 使用 `systemd` 和 **Caddy** 进行部署，确保Web应用稳定、持久地在后台运行，并支持开机自启。

## ⚙️ 第一步：获取 Azure API 凭据

在使用此面板前，您需要先为您的Azure订阅创建一个“服务主体（Service Principal）”，它将为本应用提供API访问权限。

### **通过 Azure Cloud Shell 创建**

1.  访问 [Azure Portal](https://portal.azure.com/)。
2.  在页面顶部的搜索栏中，找到并打开 **Cloud Shell** (图标是一个 `>_` 符号)。
3.  确保环境选择的是 **Bash**。
4.  将以下命令完整地复制并粘贴到 Azure Cloud Shell 中，然后按 Enter 执行：

    ```bash
    sub_id=$(az account list --query '[0].id' -o tsv) && az ad sp create-for-rbac --role contributor --scopes /subscriptions/$sub_id
    ```

5.  执行成功后，将会输出一段 JSON 格式的结果，请**务必将它完整地复制并保存**在一个安全的地方。它看起来像这样：

    ```json
    {
      "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "displayName": "azure-cli-2025-09-26-....",
      "password": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "tenant": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
    ```
6.  查询可用区域：

    ```bash
    az policy assignment list --disable-scope-strict-match --query "[?parameters.listOfAllowedLocations].parameters.listOfAllowedLocations.value[]" -o tsv | sort -u
    ```


## 🚀 第二步：一键部署到新服务器

#### **前提**

- 一台全新的 Debian 11/12 或 Ubuntu 20.04/22.04 服务器。
- 您拥有 `root` 权限。

#### **一键安装命令**

以 `root` 用户登录您的VPS，然后直接运行下面这一行命令即可：

```bash
git clone https://github.com/SIJULY/azure.git && cd azure && chmod +x install.sh && sudo ./install.sh
```

## 🖥️ 第三步：使用Web面板

1.  **访问面板**: 在浏览器中打开 `http://您的服务器IP`。
2.  **首次登录**: 密码在 `app.py` 文件中设置，默认为 `You22kme#12345`。
3.  **添加Azure账户**:
    * 登录后，在左上角的表单中，填入您在**第一步**获取到的凭据。
    * **对应关系如下**:
        * **账户名称**: 您自己起一个容易记的名字 (例如 `My-Azure-Account`)。
        * **客户端 ID (appId)**: 对应上面JSON输出中的 `appId` 值。
        * **客户端密码**: 对应 `password` 值。
        * **租户 ID (tenant)**: 对应 `tenant` 值。
        * **订阅 ID**: 填入您的 Azure 订阅ID (即第一步命令中的 `sub_id`)。
    * 点击“添加账户”。
4.  **开始管理**: 在“账户列表”中点击您账户对应的“选择”按钮。应用会自动加载该账户下的区域列表和虚拟机列表，之后您就可以开始所有管理操作了。

## 🛠️ 第四步：管理后台服务

您的应用由 `systemd` 管理，非常稳定。以下是常用的管理命令：

* **查看服务状态**:
    ```bash
    sudo systemctl status azureapp
    ```
* **重启服务** (在您修改了 `app.py` 后需要执行):
    ```bash
    sudo systemctl restart azureapp
    ```
* **停止服务**:
    ```bash
    sudo systemctl stop azureapp
    ```
* **查看实时日志** (VM创建成功后的密码会显示在这里):
    ```bash
    sudo journalctl -u azureapp.service -f
    ```
