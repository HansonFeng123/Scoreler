export function EmailAddresses({from,to,date,en}:{from:string;to:string;date:string;en:boolean}){
 return <div className="email-addresses"><div className="email-address-row"><span>{en?'From':'发件人'}</span><span className="email-address-summary" title={from}>{from}</span></div>{to&&<details><summary><span>{en?'To':'收件人'}</span><span className="email-address-summary">{to}</span><span className="email-address-expand">{en?'Details':'展开'}</span></summary><p>{to}</p></details>}{date&&<time>{new Date(date).toLocaleString()}</time>}</div>;
}
