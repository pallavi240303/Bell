import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {bell} from './controller.ts';
export function useBell(){const version=useSyncExternalStore(bell.subscribe,bell.getVersion);return useMemo(()=>bell.renderVals(),[version]);}
export function useBellRuntime(){useEffect(()=>{bell.start();return()=>bell.stop();},[]);}
