import React,{useState} from 'react';
import {afterEach,describe,it,expect} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {ScreenshotField} from './ScreenshotField.js';
import type {MistakeImage} from '../../../src/scoreler/store.js';
afterEach(cleanup);
function Editor({field}:{field:MistakeImage['field']}){const [images,setImages]=useState<MistakeImage[]>([]);return <ScreenshotField field={field} label={field} images={images} change={setImages} en/>;}
describe('mistake screenshot paste',()=>{it.each(['question','answer','correction'] as const)('pastes an image into %s, previews it and removes it',async field=>{render(<Editor field={field}/>);const file=new File([new Uint8Array([137,80,78,71])],'screenshot.png',{type:'image/png'});fireEvent.paste(screen.getByRole('textbox'),{clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>file}]}});await waitFor(()=>expect(screen.getByRole('img').getAttribute('src')).toMatch(/^data:image\/png;base64,/));if(field==='question')expect((screen.getByRole('textbox') as HTMLTextAreaElement).required).toBe(false);fireEvent.click(screen.getByRole('button',{name:new RegExp('Remove screenshot')}));expect(screen.queryByRole('img')).toBeNull();});});
