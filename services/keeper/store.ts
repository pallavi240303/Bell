import {existsSync,readFileSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {raw,json,type Deployment} from './types.ts';
export interface StoredBlock {header:{number:string;hash:string;parentHash?:string;timestamp:string};logs:any[];projection:any;evidence?:any[]}
export interface Data {deployment:Deployment;blocks:StoredBlock[];cursor:{blockNumber:string;blockHash:string}|null}
/** Single-writer store. Atomic rename publishes a whole block, its projection/evidence and cursor together. */
export class Store {
  data:Data;
  constructor(readonly path:string,readonly deployment:Deployment){
    this.data=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{deployment,blocks:[],cursor:null};
    if(json(this.data.deployment)!==json(deployment))throw Error('store deployment identity mismatch');
    const last=this.data.blocks.at(-1);if(last&&(this.data.cursor?.blockHash!==last.header.hash||this.data.cursor.blockNumber!==last.header.number))throw Error('uncommitted store cursor');
  }
  replace(blocks:StoredBlock[]){
    const last=blocks.at(-1);const next:Data=raw({deployment:this.deployment,blocks,cursor:last?{blockNumber:last.header.number,blockHash:last.header.hash}:null});
    mkdirSync(dirname(this.path),{recursive:true});const file=openSync(this.path+'.tmp','w',0o600);
    try{writeFileSync(file,json(next));fsyncSync(file);}finally{closeSync(file);}
    renameSync(this.path+'.tmp',this.path);const directory=openSync(dirname(this.path),'r');try{fsyncSync(directory);}finally{closeSync(directory);}this.data=next;
  }
}
