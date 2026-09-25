import { useEffect, useRef, useState } from 'react'
export default function Artwork({src,artist,album}:{src?:string;artist:string;album:string}){
  const [url,setUrl]=useState(src)
  const ref=useRef<HTMLSpanElement>(null)
  useEffect(()=>{setUrl(src);if(src||!window.api?.findAlbumCover)return
    let cancelled=false
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();void window.api.findAlbumCover(artist,album).then(found=>{if(!cancelled&&found)setUrl(found)}).catch(()=>{})})
    if(ref.current)observer.observe(ref.current)
    return()=>{cancelled=true;observer.disconnect()}
  },[src,artist,album])
  const seed=Array.from(artist+album).reduce((sum,ch)=>sum+ch.charCodeAt(0),0)
  return <span ref={ref} className={'tl-cover'+(!url?' artwork-fallback':'')} style={!url?{ '--art-hue': String(seed%55+15), '--art-turn': `${seed%4*90}deg` } as React.CSSProperties:undefined}>{url?<img loading="lazy" src={url} alt="" onError={()=>setUrl(undefined)}/>:<span className="artwork-geometry" aria-hidden="true"><i/><b/><em/></span>}</span>
}
