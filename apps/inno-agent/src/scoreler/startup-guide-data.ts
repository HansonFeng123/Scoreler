export const setupTopics=['quickstart','models','web-search','email','browser','agent','cli','plugins','chatgpt','proxy','github-proxy'] as const;
export type SetupTopic=typeof setupTopics[number];
export const startupGuide=[
  {
    "id": "quickstart",
    "en": {
      "title": "Start here",
      "intro": "Set up only what you need. Your study records are saved locally.",
      "steps": [
        "Choose your grade, language and theme in Settings.",
        "Select a model in the chat composer. Try a normal question, then ask it to add a test reminder.",
        "Connect study folders if you want the agent to read your learning materials. Notes and videos have their own sidebar libraries."
      ],
      "example": "What can you do in Scoreler? Help me set it up."
    },
    "zh": {
      "title": "开始使用",
      "intro": "按需要配置即可。学习记录保存在本机。",
      "steps": [
        "在设置中选择年级、语言和主题。",
        "在聊天输入框选择模型，先普通聊天，再让它创建一个测试提醒。",
        "需要 AI 阅读资料时，在学习工作区连接文件夹。笔记和视频有独立的侧栏资料库。"
      ],
      "example": "你在 Scoreler 里能做什么？帮我完成初始设置。"
    }
  },
  {
    "id": "models",
    "en": {
      "title": "Providers and API keys",
      "intro": "Settings → Providers and models. Use the endpoint and exact model ID supplied by your provider.",
      "steps": [
        "Select an existing provider to edit it, or Add provider. Choose the matching API type, Base URL and model ID.",
        "Enter the API key in the password field here, not in chat. Leaving the key blank when editing keeps the saved key.",
        "Enable tool calling and image input only if the model actually supports them. These switches do not give a model new abilities.",
        "Save provider, then select its model in chat. A 401/403 usually means credentials or permissions; a missing-model error requires checking the model ID and endpoint. Provider keys are saved in local configuration; keep exports and backups private."
      ],
      "example": "Open model settings and explain which fields I need."
    },
    "zh": {
      "title": "服务商与 API 密钥",
      "intro": "设置 → 服务商与模型。使用服务商提供的接口地址和准确模型 ID。",
      "steps": [
        "选择已有服务商修改，或点击添加服务商。选择对应接口类型、Base URL 和模型 ID。",
        "在设置的密码输入框填写 API Key，不要发送到聊天。编辑时密钥留空会保留原值。",
        "仅当模型实际支持时开启工具调用、图片输入；勾选开关不会赋予模型新能力。",
        "保存后在聊天中选择模型。401/403 通常是密钥或权限问题；模型不存在时检查 ID 和接口。模型密钥保存在本机配置中，请妥善保管备份和导出文件。"
      ],
      "example": "打开模型设置，解释我需要填写哪些信息。"
    }
  },
  {
    "id": "web-search",
    "en": {
      "title": "Web search",
      "intro": "Settings → Web search key. Online research uses Tavily separately from your chat provider.",
      "steps": [
        "Obtain your own Tavily API key from its official account dashboard. Paste it into the Web search key password field and save.",
        "Ask the agent to search the web and cite sources. It will use web_search when available.",
        "A model API key does not replace a search key. Search quotas and provider terms are separate.",
        "If search fails, check the saved key, quota and network. The agent should report failure instead of inventing search results."
      ],
      "example": "Search for reliable sources about atomic structure and cite them."
    },
    "zh": {
      "title": "联网搜索",
      "intro": "设置 → 联网搜索密钥。联网检索通过 Tavily，与聊天模型单独配置。",
      "steps": [
        "从 Tavily 官方账号后台获取自己的 API Key，填入联网搜索的密码输入框并保存。",
        "让 AI 联网搜索并引用来源，它会使用 web_search 工具。",
        "模型 Key 不能代替搜索 Key，搜索额度与服务条款单独计算。",
        "搜索失败时检查密钥、额度和网络。AI 应说明失败，而不是编造搜索结果。"
      ],
      "example": "联网搜索原子结构的可靠资料，并注明来源。"
    }
  },
  {
    "id": "email",
    "en": {
      "title": "School email",
      "intro": "School email → Connect school email / Account. Desktop app required.",
      "steps": [
        "Enable IMAP with your email provider and obtain an app password or client authorization code if required.",
        "Enter your address, IMAP hostname, TLS port 993 and authorization code in the email form. Optionally enter your webmail URL.",
        "Credentials are encrypted on this device. While Scoreler runs, connected mail can notify the app and pet.",
        "After connecting, ask the agent to search or summarize mail. Attachments, sending and deleting mail are not supported."
      ],
      "example": "Help me connect school email, then summarize today’s messages."
    },
    "zh": {
      "title": "学校邮箱",
      "intro": "学校邮箱 → 连接学校邮箱 / 账号设置。需使用桌面版。",
      "steps": [
        "根据邮箱服务商的说明启用 IMAP；如有需要，创建应用密码或客户端授权码。",
        "在邮箱表单填写地址、IMAP 主机、TLS 端口 993 和授权码，可选填网页版邮箱地址。",
        "凭据在本机加密保存，应用运行时可提醒新邮件。",
        "连接后可让 AI 搜索和总结邮件；不支持读取附件、发信或删除邮件。"
      ],
      "example": "帮我连接学校邮箱，然后总结今天的邮件。"
    }
  },
  {
    "id": "browser",
    "en": {
      "title": "Campus browser and saved logins",
      "intro": "Campus browser brings ManageBac, EduPage and school webmail into Scoreler.",
      "steps": [
        "The built-in browser is off by default. Enable it in Settings or the Campus browser page. Enter your school’s HTTPS address, click Open and save the shortcut.",
        "Log in on the website yourself, including any two-factor verification. Cookies persist on this device.",
        "Use Save login information to store credentials for that website; use Fill when needed and Forget to remove them. Explicitly saved browser credentials are encrypted locally; filling does not submit the login form.",
        "Passwords saved in your system browser are not imported automatically. Use the external-browser option if needed. The AI cannot currently operate campus pages or read your saved passwords."
      ],
      "example": "Open campus browser and show me how to save my login."
    },
    "zh": {
      "title": "校园浏览器与登录信息",
      "intro": "在 Scoreler 中集中使用 ManageBac、EduPage 和学校邮箱网页版。",
      "steps": [
        "内置浏览器默认关闭，先在设置或校园浏览器页面启用，再填写学校 HTTPS 地址并保存快捷入口。",
        "在网页中自行登录并完成双重验证；登录 Cookie 会保留在本机。",
        "使用保存登录信息记录该网站账号，按需点击填充，或忘记来删除。本机加密保存已明确保存的网页登录信息；填充不会自动提交登录。",
        "不会自动导入系统浏览器中的密码，需要时可打开外部浏览器。目前 AI 不能操作校园网页，也不能读取已保存密码。"
      ],
      "example": "打开校园浏览器，教我保存登录信息。"
    }
  },
  {
    "id": "agent",
    "en": {
      "title": "What the AI agent can do",
      "intro": "Tell it your goal, relevant subject, date and material. Review important results.",
      "steps": [
        "It can read connected study files, create/edit notes and pictures, generate teaching videos, manage calendar tasks, practice tests, mistakes, and memory capsules using scoped tools.",
        "It can search the web after search setup, search/read connected email, explain this guide, open setup panels.",
        "Try: “Create a Physics note from this file”, “Make a short video about vectors”, or “Add a homework deadline tomorrow at 17:00”. Generated material appears in its sidebar library.",
        "Send to AI prepares an editable draft; add your question and press Send. A tool-capable model is required for actions; vision also requires image support.",
        "Setup assistance opens the relevant form and explains the fields. Enter secrets in that form and review before saving. Never paste passwords, authorization codes or API keys into chat or memory. The agent cannot complete school login/2FA or automatically control campus websites."
      ],
      "example": "Read the startup guide, check my setup and help me choose the next step."
    },
    "zh": {
      "title": "AI Agent 能做什么",
      "intro": "说明目标、学科、日期和相关资料；重要结果请核对。",
      "steps": [
        "通过限定工具，AI 可读取已连接资料、创建和修改笔记与图片、生成教学视频，并管理日程任务、练习测试、错题和记忆胶囊。",
        "例如：“根据这份资料创建物理笔记”“制作向量讲解短视频”“把明天 17:00 的作业截止加入日历”。生成内容可在侧栏资料库查看。",
        "发送给 AI 会准备可编辑草稿，补充问题后自己发送。执行操作需要支持工具调用的模型，识图另需图片输入支持。",
        "AI 可解释设置并打开对应表单。密钥、授权码和密码请在表单内输入并检查后保存，不要发进聊天或记忆。AI 不能代替校园网页登录和双重验证，也不能自动操作校园网页。"
      ],
      "example": "阅读启动指南，检查我的配置，帮我确定下一步。"
    }
  },
{
  "id": "cli",
  "en": {
    "title": "Scoreler CLI",
    "intro": "Settings → Scoreler CLI (optional). Chat in a terminal alongside today’s scrollable agenda.",
    "steps": [
      "Choose Install CLI, then open a new CMD, PowerShell or terminal and type scoreler. The optional command follows Scoreler updates.",
      "Use /new for a new conversation, /model or /reasoning to open a picker; use ↑/↓ and Enter to confirm, or Esc to cancel. /help lists commands.",
      "Type Chinese or English. Alt+V adds a clipboard screenshot or image path; /image adds a file. Choose a model that supports images. Alt+↑/↓ scrolls the agenda; PgUp/PgDn scrolls chat.",
      "The CLI shares this profile’s configured providers, ChatGPT connection, histories and study tools. Scoreler starts when needed; ChatGPT credentials remain in the desktop main process."
    ],
    "example": "Open CLI settings and explain how to select a model and paste a screenshot."
  },
  "zh": {
    "title": "Scoreler CLI",
    "intro": "设置 → Scoreler CLI（可选）。在终端聊天，旁边显示可滚动的今日日程。",
    "steps": [
      "点击安装 CLI，然后打开新的 CMD、PowerShell 或终端，输入 scoreler。可选命令会随 Scoreler 更新。",
      "输入 /new 新建对话；/model 或 /reasoning 打开选择器，用 ↑/↓ 选择、Enter 确认、Esc 取消。/help 查看全部命令。",
      "支持中英文输入。Alt+V 添加剪贴板截图或图片路径，/image 添加图片文件；识图需要支持图片的模型。Alt+↑/↓ 滚动日程，PgUp/PgDn 滚动聊天。",
      "与当前资料库共用服务商、ChatGPT 连接、历史记录和学习工具。需要时会启动桌面应用，ChatGPT 凭据仅保留在桌面主进程。"
    ],
    "example": "打开 CLI 设置，教我选择模型和粘贴截图。"
  }
},
{
  "id": "plugins",
  "en": {
    "title": "Plugins",
    "intro": "Toolbox → Plugins. Discover, install and update independent study tools.",
    "steps": [
      "Choose Refresh plugin list to fetch the independent GitHub catalogue without updating Scoreler. A failed refresh keeps the last valid list.",
      "Choose Review installation, check author, version and source, then confirm installation. A checksum checks integrity, not safety.",
      "Installed, enabled plugins appear as tiles in Toolbox and open inside Scoreler. Use Plugins to disable, uninstall or review an available update. Refresh does not automatically update installed packages.",
      "List refresh and downloads follow the GitHub updates proxy switch. These tools run offline in isolated views without a study-data or credential API."
    ],
    "example": "Open Plugins and explain how to refresh the list and install a tool."
  },
  "zh": {
    "title": "插件",
    "intro": "百宝箱 → 插件。查找、安装和更新独立学习工具。",
    "steps": [
      "点击刷新插件列表，从独立 GitHub 目录获取可用插件，无需更新整个 Scoreler。刷新失败会保留上次有效列表。",
      "点击查看并安装，检查作者、版本与来源后确认安装。校验和只能验证完整性，不代表安全审查。",
      "已安装且启用的插件会显示为百宝箱卡片，并在 Scoreler 内打开。可在插件页停用、卸载或查看更新；刷新列表不会自动更新已安装插件。",
      "列表刷新和下载遵循 GitHub 更新代理开关。工具在离线隔离视图中运行，没有学习数据或凭据接口。"
    ],
    "example": "打开插件页，教我刷新列表并安装工具。"
  }
},
{
  "id": "chatgpt",
  "en": {
    "title": "ChatGPT account and models",
    "intro": "Settings → ChatGPT. Optional and separate from API-key providers.",
    "steps": [
      "Read the privacy notice, authorize plan use and choose Continue with ChatGPT. Complete the official browser authorization yourself; never paste passwords, cookies or session tokens.",
      "After connecting, Refresh models, select an available model and a supported reasoning level, then choose Use this ChatGPT model. Your other configured models remain selectable in chat and CLI.",
      "Review chat and background permission preferences separately. You can restore prompts in Settings, manage usage and access, or sign out / disconnect.",
      "Authorized requests send instructions, relevant conversation/memory, attachments and tool results to OpenAI. Tokens stay OS-encrypted locally in the desktop main process. Eligibility and subscription limits apply; this is not unlimited use or API credit."
    ],
    "example": "Open ChatGPT settings and explain model selection and usage permissions."
  },
  "zh": {
    "title": "ChatGPT 账号与模型",
    "intro": "设置 → ChatGPT。可选登录方式，与 API 密钥服务商分开配置。",
    "steps": [
      "阅读隐私说明并明确授权套餐使用，点击 Continue with ChatGPT，自行完成官方浏览器授权。不要粘贴密码、Cookie 或会话令牌。",
      "连接后刷新模型，选择可用模型及支持的推理强度，再点击使用此 ChatGPT 模型。其他已配置模型仍可在聊天和 CLI 中选择。",
      "分别检查对话与后台使用许可。可以在设置中恢复询问、管理用量与访问，或退出 / 断开连接。",
      "授权请求会将指令、相关对话与记忆、附件和工具结果发送给 OpenAI。令牌由系统在本地加密，仅保留在桌面主进程。适用资格及订阅额度限制，不提供无限使用或 API 额度。"
    ],
    "example": "打开 ChatGPT 设置，解释模型选择和用量授权。"
  }
},
{
  "id": "proxy",
  "en": {
    "title": "ChatGPT connection proxy",
    "intro": "Settings → ChatGPT connection. Save an address and choose whether to use it.",
    "steps": [
      "Enter a SOCKS5, HTTP or HTTPS proxy address such as socks5://localhost:1080. The proxy must already be running; addresses with usernames or passwords are not supported.",
      "Choose Use saved proxy, or turn it off and choose system proxy settings or a direct connection. Turning it off keeps the saved address.",
      "Test connection, then Save connection settings. The test sends no account credentials and does not prove successful account authorization.",
      "This setting affects ChatGPT sign-in requests, model discovery and study requests. External browser authorization uses the browser’s own network settings; other API providers keep their existing settings. A proxy does not change eligibility or subscription limits."
    ],
    "example": "Open connection settings and explain the proxy switches without changing them."
  },
  "zh": {
    "title": "ChatGPT 连接代理",
    "intro": "设置 → ChatGPT 网络连接。保存代理地址，并选择是否使用。",
    "steps": [
      "填写 SOCKS5、HTTP 或 HTTPS 地址，例如 socks5://localhost:1080。代理需已运行，此处不支持带账号密码的地址。",
      "勾选使用已保存的代理；关闭后可以选择系统代理或直接连接。关闭开关会保留地址。",
      "先测试连接，再保存连接设置。测试不会发送账号凭据，也不等于账号授权成功。",
      "此设置影响 ChatGPT 登录请求、模型列表和学习请求。外部浏览器授权使用浏览器自身网络设置；其他 API 服务商保留原有网络设置。代理不会改变使用资格或订阅限制。"
    ],
    "example": "打开网络连接设置，解释代理开关，但先不要修改。"
  }
},
{
  "id": "github-proxy",
  "en": {
    "title": "GitHub updates and plugin proxy",
    "intro": "Settings → App updates → Use saved proxy for GitHub updates.",
    "steps": [
      "First save a proxy address in ChatGPT connection settings. You can leave its ChatGPT switch off.",
      "Enable Use saved proxy for GitHub updates independently. It uses that saved address for GitHub version checks, source downloads, plugin-list refresh and plugin downloads.",
      "Choose Check for updates, then Prepare in background when an update is available. Wait until preparation is complete before restarting to apply it.",
      "npm dependency downloads follow npm’s own settings. If a source download fails, check the proxy and retry; failed preparation keeps the current app and records. Your profile is backed up before activation."
    ],
    "example": "Open App updates and explain the GitHub proxy and safe update steps."
  },
  "zh": {
    "title": "GitHub 更新与插件代理",
    "intro": "设置 → 应用更新 → GitHub 更新使用已保存的代理。",
    "steps": [
      "先在 ChatGPT 网络连接中保存代理地址；ChatGPT 的代理开关可以保持关闭。",
      "独立开启 GitHub 更新使用已保存的代理。该地址用于 GitHub 版本检查、源码下载、插件列表刷新与插件下载。",
      "点击检查更新，有新版本时后台准备更新，等待准备完成后再重启启用。",
      "npm 依赖下载遵循 npm 自身设置。源码下载失败时检查代理后重试；准备失败会保留当前应用和记录，启用前会备份本地数据。"
    ],
    "example": "打开应用更新，解释 GitHub 代理和安全更新步骤。"
  }
}
] as const;
export function startupGuideForEdition(_enabled=true){return startupGuide;}
