const defaults={
  "defaultProvider": "default",
  "defaultModel": "configure-a-model",
  "providers": {
    "default": {
      "baseUrl": "https://api.openai.com/v1",
      "api": "openai-completions",
      "apiKey": "",
      "authHeader": true,
      "models": [
        {
          "id": "configure-a-model",
          "name": "Configure a model",
          "input": [
            "text"
          ],
          "supportsTools": false,
          "reasoning": false,
          "contextWindow": 128000,
          "maxTokens": 8192
        }
      ]
    }
  },
  "server": {
    "port": 3000
  },
  "channels": {
    "feishu": {
      "enabled": false
    },
    "qq": {
      "enabled": false,
      "mode": "bridge",
      "sidecarBaseUrl": "http://127.0.0.1:4318"
    },
    "wechat": {
      "enabled": false,
      "mode": "bridge",
      "sidecarBaseUrl": "http://127.0.0.1:4319"
    }
  },
  "bridge": {
    "token": ""
  },
  "subagents": {
    "enabled": false
  },
  "plugins": {
    "computerUse": {
      "enabled": false
    },
    "codemode": {
      "enabled": false
    }
  },
  "ui": {
    "theme": "light",
    "closeBehavior": "quit"
  }
};
module.exports={defaultConfig:(_edition,port=3000)=>({...defaults,server:{port}})};
