export const setupTopics=['quickstart','models','web-search','email','browser','agent'] as const;
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
  }
] as const;
export function startupGuideForEdition(_enabled=true){return startupGuide;}
