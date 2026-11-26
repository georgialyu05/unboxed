// link -> product image -> sticker (cutout + white border)
const PROXY_IMG = u => `https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//,''))}&w=800&h=800&fit=inside&output=png`;

async function viaJina(link){
  const r = await fetch('https://r.jina.ai/' + link, {headers:{Accept:'application/json','X-Return-Format':'html'}});
  if(!r.ok) throw 0;
  const j = await r.json(); const d = j.data||{}; const m = d.metadata||{};
  const h = d.html||'';
  let img = m['og:image'] || m['twitter:image'] ||
    (h.match(/property=["']og:image["'][^>]*content=["']([^"']+)/)||[])[1] ||
    (h.match(/content=["']([^"']+)["'][^>]*property=["']og:image/)||[])[1];
  const bad = /access denied|just a moment|attention required|robot|captcha/i;
  if(!img || bad.test(d.title||'')) throw 0;
  if(img.startsWith('//')) img = 'https:'+img;
  return {img: new URL(img, link).href, title: (m['og:title']||d.title||'').replace(/\s*\|\s*[^|]+$/,'')};
}
async function viaMicrolink(link){
  const r = await fetch('https://api.microlink.io/?url='+encodeURIComponent(link));
  const j = await r.json();
  if(j.status!=='success' || !j.data.image || /akamai|cloudflare/i.test(j.data.image.url)) throw 0;
  return {img:j.data.image.url, title:(j.data.title||'').replace(/\s*\|\s*[^|]+$/,'')};
}
export async function lookup(link){
  for(const f of [viaJina, viaMicrolink]){ try{ return await f(link); }catch(e){} }
  throw new Error('nolink');
}
export function loadImg(src){
  return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=src;});
}
export async function stickerFromUrl(imgUrl){
  let im; try{ im = await loadImg(PROXY_IMG(imgUrl)); }catch(e){ im = await loadImg(imgUrl); }
  return makeSticker(im);
}
export async function stickerFromFile(file){
  const url = URL.createObjectURL(file); const im = await loadImg(url); return makeSticker(im);
}

export function makeSticker(im){
  const M = 640, s = Math.min(1, M/Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.round(im.naturalWidth*s), h = Math.round(im.naturalHeight*s);
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const x = c.getContext('2d',{willReadFrequently:true}); x.drawImage(im,0,0,w,h);
  const id = x.getImageData(0,0,w,h), p = id.data;
  // background color = median of border pixels
  const bs=[]; for(let i=0;i<w;i++){bs.push(i, i+(h-1)*w);} for(let j=0;j<h;j++){bs.push(j*w, j*w+w-1);}
  const med = k => { const a = bs.map(i=>p[i*4+k]).sort((a,b)=>a-b); return a[a.length>>1]; };
  const bg=[med(0),med(1),med(2)];
  const tol=30, tol2=tol*tol;
  const near = i => { const o=i*4; const dr=p[o]-bg[0],dg=p[o+1]-bg[1],db=p[o+2]-bg[2]; return p[o+3]<20 || dr*dr+dg*dg+db*db < tol2; };
  const mask = new Uint8Array(w*h); // 1 = background
  const q = new Int32Array(w*h); let qh=0, qt=0;
  for(const i of bs){ if(!mask[i] && near(i)){ mask[i]=1; q[qt++]=i; } }
  while(qh<qt){ const i=q[qh++], xx=i%w;
    const nb=[xx>0?i-1:-1, xx<w-1?i+1:-1, i-w, i+w];
    for(const n of nb){ if(n>=0 && n<w*h && !mask[n] && near(n)){ mask[n]=1; q[qt++]=n; } } }
  const removed = qt/(w*h);
  if(removed > 0.04 && removed < 0.97){
    // soft edge: alpha from 3x3 neighbourhood
    for(let i=0;i<w*h;i++){ if(mask[i]){ p[i*4+3]=0; continue; }
      const xx=i%w; let n=0,t=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const k=i+dy*w+dx; if(xx+dx<0||xx+dx>=w||k<0||k>=w*h)continue; t++; if(mask[k])n++;}
      if(n) p[i*4+3]=Math.round(255*(1-n/t*0.75));
    }
    x.putImageData(id,0,0);
  }
  // trim
  let x0=w,y0=h,x1=0,y1=0; const d=x.getImageData(0,0,w,h).data;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++) if(d[(j*w+i)*4+3]>40){ if(i<x0)x0=i; if(i>x1)x1=i; if(j<y0)y0=j; if(j>y1)y1=j; }
  if(x1<=x0){x0=0;y0=0;x1=w-1;y1=h-1;}
  const cw=x1-x0+1, ch=y1-y0+1, r=Math.max(6, Math.round(Math.max(cw,ch)*0.028)), pad=r+4;
  const o=document.createElement('canvas'); o.width=cw+pad*2; o.height=ch+pad*2; const ox=o.getContext('2d');
  // white silhouette
  const sil=document.createElement('canvas'); sil.width=cw; sil.height=ch; const sx=sil.getContext('2d');
  sx.drawImage(c,x0,y0,cw,ch,0,0,cw,ch); sx.globalCompositeOperation='source-in'; sx.fillStyle='#fff'; sx.fillRect(0,0,cw,ch);
  for(let a=0;a<360;a+=10){ const t=a*Math.PI/180; ox.drawImage(sil, pad+Math.cos(t)*r, pad+Math.sin(t)*r); }
  ox.drawImage(sil,pad,pad);
  ox.drawImage(c,x0,y0,cw,ch,pad,pad,cw,ch);
  return {src:o.toDataURL('image/webp',0.9), w:o.width, h:o.height};
}
