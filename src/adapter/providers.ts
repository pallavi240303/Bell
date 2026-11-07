import type {Provider} from './wallet.ts';
export const FALLBACK_ID = 'window.ethereum';
export interface DiscoveredProvider {id:string;name:string;rdns:string;provider:Provider}
/** Validates one EIP-6963 announcement. It never calls the provider. */
export function parseAnnouncement(detail:unknown):DiscoveredProvider|undefined {
  const d = detail as {info?:{uuid?:unknown;name?:unknown;rdns?:unknown};provider?:{request?:unknown}}|null;
  const info = d?.info, provider = d?.provider;
  if (!info || typeof info.uuid !== 'string' || !info.uuid || typeof info.name !== 'string' || !info.name) return undefined;
  if (!provider || typeof provider.request !== 'function') return undefined;
  return {id:info.uuid, name:info.name.slice(0,48), rdns:typeof info.rdns === 'string' ? info.rdns.slice(0,64) : '', provider:provider as Provider};
}
interface Target {addEventListener(type:string,listener:(event:any)=>void):void;removeEventListener(type:string,listener:(event:any)=>void):void;dispatchEvent(event:Event):boolean}
/** EIP-6963 discovery: announcements are collected passively; accounts are requested only on an explicit Connect. */
export class ProviderDiscovery {
  private found = new Map<string,DiscoveredProvider>();
  private listener = (event:any) => {
    const found = parseAnnouncement(event?.detail); if (!found || [...this.found.values()].some(p=>p.provider===found.provider)) return;
    // Announcement UUIDs are self-reported; a second object cannot replace a user's choice.
    const base=found.id;let suffix=1;while(this.found.has(found.id))found.id=`${base}:${suffix++}`;
    this.found.set(found.id, found); this.onChange();
  };
  constructor(private target:Target, private onChange:()=>void = () => {}) {}
  start() {this.target.addEventListener('eip6963:announceProvider', this.listener); this.target.dispatchEvent(new Event('eip6963:requestProvider'));}
  stop() {this.target.removeEventListener('eip6963:announceProvider', this.listener); this.found.clear();}
  list():DiscoveredProvider[] {return [...this.found.values()].sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));}
  get(id:string):DiscoveredProvider|undefined {return this.found.get(id);}
}
/** Single-provider fallback for browsers that announce nothing through EIP-6963. */
export function fallbackProvider(host:object):DiscoveredProvider|undefined {
  const provider = (host as {ethereum?:unknown}).ethereum as Provider|undefined;
  return provider && typeof provider.request === 'function' ? {id:FALLBACK_ID, name:'Browser wallet', rdns:'window.ethereum', provider} : undefined;
}
