import {parseUnits} from 'viem';
export function exactUnits(value:string,decimals:number,positive=true):bigint{
 if(!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${decimals}})?$`).test(value))throw Error(`Enter an exact amount with at most ${decimals} decimal places.`);
 const n=parseUnits(value,decimals);if(positive&&n===0n)throw Error('Enter an amount greater than zero.');return n;
}
export function utcInput(value:string|bigint|undefined):string{
 try{if(value===undefined||value==='')return '';return new Date(Number(BigInt(value))*1000).toISOString().slice(0,19);}catch{return '';}
}
export function utcSeconds(value:string):string{
 if(value==='')return '';const normalized=value.length===16?value+':00':value;
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(normalized))throw Error('Choose an offer expiry in UTC.');
 const ms=Date.parse(normalized+'Z');if(!Number.isFinite(ms)||ms<0||new Date(ms).toISOString().slice(0,19)!==normalized)throw Error('Invalid UTC expiry.');return String(ms/1000);
}
export function timestamp(value:bigint|undefined){const result=utcInput(value);return result?result.replace('T',' ')+' UTC':'Unavailable';}
