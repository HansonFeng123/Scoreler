import React from 'react';import {it,expect,vi,afterEach} from 'vitest';import {render,screen,fireEvent,cleanup,within} from '@testing-library/react';import {StartupGuide} from './StartupGuide.js';
afterEach(cleanup);
it('covers all setup topics and sends questions as drafts without secrets',()=>{const open=vi.fn(),ask=vi.fn();render(<StartupGuide en open={open} ask={ask}/>);for(const name of ['Providers and API keys','Web search','School email','Campus browser and saved logins','What the AI agent can do'])expect(screen.getByRole('heading',{name})).toBeTruthy();fireEvent.click(screen.getAllByRole('button',{name:'Open setup'})[3]);expect(open).toHaveBeenCalledWith('email');fireEvent.click(screen.getAllByRole('button',{name:'Ask AI (draft)'})[0]);expect(ask).toHaveBeenCalledWith('What can you do in Scoreler? Help me set it up.');expect(document.querySelector('input[type=password]')).toBeNull();});
it('provides Chinese help and explains the secret-entry boundary',()=>{render(<StartupGuide en={false}/>);expect(screen.getByRole('heading',{name:'启动工具包'})).toBeTruthy();expect(screen.getByText(/不要把密钥或密码发进聊天/)).toBeTruthy();expect(screen.getByRole('heading',{name:'学校邮箱'})).toBeTruthy();});

it('opens all five new setup destinations and provides Chinese instructions',()=>{
 const open=vi.fn();const view=render(<StartupGuide en open={open}/>);
 for(const [title,topic] of [['Scoreler CLI','cli'],['Plugins','plugins'],['ChatGPT account and models','chatgpt'],['ChatGPT connection proxy','proxy'],['GitHub updates and plugin proxy','github-proxy']]){
  const card=screen.getByRole('heading',{name:title}).closest('article')!;
  fireEvent.click(within(card).getByRole('button',{name:'Open setup'}));expect(open).toHaveBeenLastCalledWith(topic);
 }
 expect(screen.getByText(/Alt\+V adds a clipboard screenshot/)).toBeTruthy();
 view.rerender(<StartupGuide en={false} open={open}/>);
 for(const title of ['Scoreler CLI','插件','ChatGPT 账号与模型','ChatGPT 连接代理','GitHub 更新与插件代理'])expect(screen.getByRole('heading',{name:title})).toBeTruthy();
 expect(screen.getByText(/刷新列表不会自动更新已安装插件/)).toBeTruthy();
});
