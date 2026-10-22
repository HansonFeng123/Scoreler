export function calculate(expression:string):number {
 const text=expression.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replace(/\s/g,'');
 if(!text||text.length>300)throw Error('Enter an expression up to 300 characters.');
 let i=0;
 function primary():number {if(text[i]==='+'){i++;return primary();}if(text[i]==='-'){i++;return -primary();}let value:number;if(text[i]==='('){i++;value=sum();if(text[i++]!==')')throw Error('Check your parentheses.');}else{const token=text.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);if(!token)throw Error('Use numbers and arithmetic operators.');i+=token[0].length;value=Number(token[0]);}while(text[i]==='%'){i++;value/=100;}return value;}
 function product():number {let n=primary();while(text[i]==='*'||text[i]==='/'){const op=text[i++],v=primary();if(op==='/'&&v===0)throw Error('Cannot divide by zero.');n=op==='*'?n*v:n/v;}return n;}
 function sum():number {let n=product();while(text[i]==='+'||text[i]==='-'){const op=text[i++],v=product();n=op==='+'?n+v:n-v;}return n;}
 const result=sum();if(i!==text.length)throw Error('Check your expression.');if(!Number.isFinite(result))throw Error('Result is outside the supported range.');return Number(result.toPrecision(14));
}
