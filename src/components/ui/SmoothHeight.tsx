import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {motion,useReducedMotion} from 'motion/react';

/** Animate intrinsic content height without scaling text or retaining an outgoing form. */
export function SmoothHeight({children}:{children:ReactNode}){
 const content=useRef<HTMLDivElement>(null),reduce=useReducedMotion();
 const [height,setHeight]=useState<number>();
 useLayoutEffect(()=>{
  const node=content.current;if(!node||reduce)return;
  const measure=()=>setHeight(node.getBoundingClientRect().height);
  measure();const observer=new ResizeObserver(measure);observer.observe(node);
  return()=>observer.disconnect();
 },[reduce]);
 return <motion.div className="smooth-height" initial={false} animate={{height:reduce?'auto':height??'auto'}} transition={{duration:reduce?0:0.22,ease:[0.22,1,0.36,1]}}>
  <div ref={content} className="smooth-height-content">{children}</div>
 </motion.div>;
}
