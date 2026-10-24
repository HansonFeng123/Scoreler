const descriptions:Record<string,[string,string]>={
 network_error:['Could not reach the official sign-in service. Check your connection.','无法连接官方登录服务，请检查网络。'],
 discovery_failed:['The official sign-in configuration could not be verified. Authorization has not started.','无法验证官方登录配置，授权尚未开始。'],
 browser_unavailable:['Could not open your default browser.','无法打开默认浏览器。'],
 callback_port_unavailable:['The local callback port could not be opened. Close other test copies and retry.','无法打开本地授权回调端口，请关闭其他测试副本后重试。'],
 access_denied:['Authorization was declined or denied. No plan-use permission was granted.','授权被拒绝或未获批准，未授予套餐使用权限。'],
 cancelled:['Authorization was cancelled.','授权已取消。'],
 invalid_client:['OpenAI did not accept this app registration. Do not reuse another application’s credentials.','OpenAI 未接受此应用注册，请勿复用其他应用的凭据。'],
 registration_incomplete:['OpenAI did not complete Scoreler registration.','OpenAI 未完成 Scoreler 注册。'],
 subscription_sharing_user_not_eligible:['This account or workspace is not eligible. This integration cannot be used for it.','此账号或工作区不符合资格，无法使用此集成。'],
 subscription_sharing_usage_limit_exceeded:['A plan or app usage limit was reached. Manage usage in ChatGPT settings.','已达套餐或应用用量限制，请在 ChatGPT 设置管理用量。'],
 invalid_id_token:['The returned identity could not be verified. Credentials will not be used.','无法验证返回的身份，不会使用该凭据。'],
 identity_verification_unavailable:['Identity verification is temporarily unavailable. Existing encrypted credentials are preserved.','身份验证暂不可用，现有加密凭据会保留。'],
 storage_unavailable:['OS-protected credential storage is unavailable. Sign-in is disabled.','操作系统安全凭据存储不可用，已禁用登录。'],
};
export function chatgptDiagnostic(error:unknown,en:boolean){
 const raw=(error as {code?:unknown}|null)?.code;
 const status=(error as {status?:unknown}|null)?.status;
 if(status===403)return {code:'HTTP 403',message:en?'OpenAI refused this request. A policy, permission, network-access or supported-region restriction may apply. Scoreler will not bypass this restriction.':'OpenAI 拒绝了此请求。可能涉及政策、权限、网络访问或支持地区限制，Scoreler 不会绕过此限制。'};
 if(status===429)return {code:'HTTP 429',message:en?'A usage or request limit was reached. Review ChatGPT usage settings; do not repeatedly retry.':'已达用量或请求限制，请查看 ChatGPT 用量设置，不要反复重试。'};
 // Display only known diagnostic codes, never remote messages, URLs or bodies.
 const code=typeof raw==='string'&&Object.hasOwn(descriptions,raw)?raw:'connection_error';
 return {code,message:descriptions[code]?.[en?0:1]??(en?'The connection could not be completed. Check permission and official service availability.':'连接未能完成，请检查权限与官方服务可用性。')};
}
