"use client";
import { useState } from 'react';
import { Boxes } from 'lucide-react';
export default function ProductThumbnail({src,title,large=false,size}:{src?:string|null;title:string;large?:boolean;size?:number}) {
  const [failed,setFailed]=useState<string|null>(null);
  const valid=src && /^https:\/\//i.test(src) && failed!==src;
  const thumbnailSize = size ?? (large ? 96 : 46);
  return <span className={`product-thumbnail ${large?'large':''}`} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:thumbnailSize, height:thumbnailSize, minWidth:thumbnailSize, maxWidth:thumbnailSize, minHeight:thumbnailSize, maxHeight:thumbnailSize, flex:`0 0 ${thumbnailSize}px`, overflow:'hidden', boxSizing:'border-box' }}>{valid?<img src={src} alt={title} width={thumbnailSize} height={thumbnailSize} style={{ display:'block', width:thumbnailSize, height:thumbnailSize, maxWidth:'100%', maxHeight:'100%', objectFit:'contain', padding:3, boxSizing:'border-box' }} loading="lazy" onError={()=>setFailed(src)}/>:<Boxes size={large?40:Math.min(23, thumbnailSize - 8)} aria-label="Product image unavailable"/>}</span>;
}
