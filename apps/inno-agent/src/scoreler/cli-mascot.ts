// Pixel geometry from Scoreler's existing mascot, packed two pixel rows per terminal row.
const pixels=[
 "00000111110000001111100000",
 "00000111110000001111100000",
 "00000111110000001111100000",
 "00000122211111111222100000",
 "00000122211111111222100000",
 "00111122211111111222111100",
 "00111122222222222222111100",
 "00111133333333333332111100",
 "00122233333333333332222100",
 "11123322222222222222222111",
 "11123322222222222222222111",
 "11123322555222225552222111",
 "11123322555222225552222111",
 "11123322555222225552222111",
 "11122222555222225552222111",
 "11122444222222222224442111",
 "11122444222255522224442111",
 "11122222111155511122222111",
 "11111122111111111122111111",
 "00011122111111111122111000",
 "00011111000000000011111000",
 "00011111000000000011111000"
];
const palette:Record<string,string>={'1':'82;180;190','2':'39;75;81','3':'166;232;225','4':'94;157;165','5':'217;250;245'};
function renderMark(pixels:string[]){const scorelerMark:string[]=[];
for(let y=0;y<pixels.length;y+=2){let line='  ';for(let x=0;x<pixels[y].length;x++){const top=pixels[y][x],bottom=pixels[y+1]?.[x]||'0';if(top==='0'&&bottom==='0'){line+=' ';continue;}if(top==='0')line+='\x1b[38;2;'+palette[bottom]+'m▄\x1b[39m';else if(bottom==='0')line+='\x1b[38;2;'+palette[top]+'m▀\x1b[39m';else line+='\x1b[38;2;'+palette[top]+'m\x1b[48;2;'+palette[bottom]+'m▀\x1b[39;49m';}scorelerMark.push(line);}

return scorelerMark;}
export const scorelerMark=renderMark(pixels);
const small=Array.from({length:11},(_,y)=>Array.from({length:13},(_,x)=>{const values=[pixels[y*2][x*2],pixels[y*2][x*2+1],pixels[y*2+1][x*2],pixels[y*2+1][x*2+1]];return ['5','1','3','4','2'].find(color=>values.includes(color))||'0';}).join(''));
export const smallScorelerMark=renderMark(small);
