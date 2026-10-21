"use client";
import { useState } from 'react';
import { Boxes } from 'lucide-react';
export default function ProductThumbnail({src,title,large=false}:{src?:string|null;title:string;large?:boolean}) {
  const [failed,setFailed]=useState<string|null>(null);
  const valid=src && /^https:\/\//i.test(src) && failed!==src;
  const size = large ? 96 : 46;
  return <span className={`product-thumbnail ${large?'large':''}`} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, minWidth:size, maxWidth:size, minHeight:size, maxHeight:size, flex:`0 0 ${size}px`, overflow:'hidden', boxSizing:'border-box' }}>{valid?<img src={src} alt={title} width={size} height={size} style={{ display:'block', width:size, height:size, maxWidth:'100%', maxHeight:'100%', objectFit:'contain', padding:3, boxSizing:'border-box' }} loading="lazy" onError={()=>setFailed(src)}/>:<Boxes size={large?40:23} aria-label="Product image unavailable"/>}</span>;
}
