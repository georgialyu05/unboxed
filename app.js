import { lookup, stickerFromUrl, stickerFromFile } from './sticker.js';
import { store, newId } from './store.js';

/* envelope art + where its parts are (percent of the image) */
const ART = 'env.webp';
const GEO = { ar: 1035/894, bl:1.3, br:98.7, bt:44.2, bb:98.8, fx:50, fy:1, nl:42.8, nr:57.2, ny:68.1 };

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a,b) => a + Math.random()*(b-a);
const toast = (t, ms=2200) => { const el=$('#toast'); el.textContent=t; el.classList.add('on'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('on'),ms); };

/* ---------- build an envelope ---------- */
function makeEnv(host, W, {open=false}={}){
  host.innerHTML = '';
  host.style.setProperty('--w', W+'px');
  const env = document.createElement('div'); env.className = 'env' + (open?' open':'');
  const g = GEO, s = env.style;
  s.setProperty('--ar', g.ar); s.setProperty('--img', `url(${ART})`);
  for (const k of ['bl','br','bt','bb','fx','fy','nl','nr','ny']) s.setProperty('--'+k, g[k]+'%');
  s.setProperty('--fd', (2*g.bt - g.fy)+'%');           // tip of the closed flap
  env.innerHTML = `
    <div class="ground"></div>
    <div class="layer back"></div>
    <div class="items"></div>
    <div class="layer pocket"></div>
    <div class="flapshadow"></div>
    <div class="flap"><div class="face layer in"></div><div class="face out"><div class="tex"></div></div></div>
    <div class="items top" style="z-index:8;pointer-events:none"></div>`;
  host.appendChild(env);
  const E = { host, env, W, H: W*g.ar, flap: env.querySelector('.flap'), shadow: env.querySelector('.flapshadow'),
    inside: env.querySelector('.items'), top: env.querySelector('.items.top'), stickers: [] };
  if (open) setOpen(E, true);
  return E;
}
function setOpen(E, v){
  E.flap.style.transform = v ? 'rotateX(0deg)' : 'rotateX(180deg)';
  E.flap.style.zIndex = v ? 1 : 6;
  E.shadow.style.opacity = v ? 0 : 1;
  E.env.classList.toggle('open', v);
}

/* ---------- sticker geometry ---------- */
function sizeFor(E, it, k=1){ const S = E.W*0.36*k, a = it.w/it.h; let w = S*Math.sqrt(a), h = S/Math.sqrt(a);
  const m = E.W*0.5*k; if (w>m){h*=m/w;w=m;} if (h>m){w*=m/h;h=m;} return {w,h}; }
const T = p => `translate(${p.x}px,${p.y}px) translate(-50%,-50%) rotate(${p.r}deg) scale(${p.s})`;
function peekPos(E, i, n, h){ const g=GEO; const span = n<=1?0:Math.min(0.42, 0.1*n);
  const x = E.W*(0.5 + (n<=1?0:(i/(n-1)-0.5)*span)) + rnd(-6,6);
  return { x, y: E.H*(g.bt + (g.ny-g.bt)*0.55)/100 + rnd(-6,10), r: rnd(-11,11), s: 0.62 }; }
function tuckPos(E, p, h){ return { ...p, y: E.H*(GEO.bb/100) - h*0.62/2 - E.H*0.05, s: 0.6, r: p.r*0.6 }; }

function addSticker(E, it, {pos, layer='inside'}={}){
  const {w,h} = sizeFor(E, it);
  const el = document.createElement('div'); el.className='st';
  el.style.width = w+'px'; el.style.height = h+'px';
  el.innerHTML = `<img alt=""><span class="tag"></span>`;
  if (it.src) el.querySelector('img').src = it.src;
  el.querySelector('.tag').textContent = it.title || '';
  el.onclick = () => { if (E.env.classList.contains('open') && it.link && !el.classList.contains('loading')) window.open(it.link, '_blank', 'noopener'); };
  E[layer].appendChild(el);
  const S = { el, it, w, h, p: pos || {x:E.W/2,y:E.H*0.7,r:0,s:0.6} };
  el.style.transform = T(S.p);
  E.stickers.push(S); return S;
}
function move(S, to, opt){ const a = S.el.animate([{transform:T(S.p)},{transform:T(to)}], {fill:'forwards', ...opt}); S.p = to; return a.finished.then(()=>{ S.el.style.transform=T(to); a.cancel(); }); }

/* where each thing lands when it spills out — spread like a little map around the envelope */
function scatterTargets(E, n){
  const r = E.env.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  const O = { x: E.W/2, y: E.H*0.52 };
  const pts = [];
  const ring1 = Math.min(n, 8);
  for (let i=0;i<n;i++){
    const inRing1 = i < ring1, k = inRing1 ? i : i-ring1, m = inRing1 ? ring1 : n-ring1;
    const a0 = inRing1 ? 160 : 150, a1 = inRing1 ? 380 : 390;     // a fan from the left side, over the top, to the right side
    const t = m===1 ? 0.5 : k/(m-1);
    const ang = (a0 + (a1-a0)*t + rnd(-5,5)) * Math.PI/180;
    const R = inRing1 ? 1 : 1.5;
    pts.push({ x: O.x + Math.cos(ang)*E.W*1.02*R, y: O.y + Math.sin(ang)*E.H*0.95*R, r: rnd(-12,12), s: n>10 ? 0.8 : 1 });
  }
  // keep on screen + nudge apart
  const box = S => ({ hw: S.w*S.p2.s/2, hh: S.h*S.p2.s/2 });
  E.stickers.forEach((S,i)=>S.p2=pts[i]);
  for (let it=0; it<60; it++){
    for (const A of E.stickers) for (const B of E.stickers){ if (A===B) continue;
      const a=box(A), b=box(B), dx=B.p2.x-A.p2.x, dy=B.p2.y-A.p2.y;
      const ox = a.hw+b.hw - Math.abs(dx) - 4, oy = a.hh+b.hh - Math.abs(dy) - 4;
      if (ox>0 && oy>0){ const f=0.18; if (ox<oy){ const d=Math.sign(dx)||1; A.p2.x-=d*ox*f; B.p2.x+=d*ox*f; } else { const d=Math.sign(dy)||1; A.p2.y-=d*oy*f; B.p2.y+=d*oy*f; } } }
    for (const A of E.stickers){ const a=box(A);
      const minX = -r.left + a.hw + 16, maxX = vw - r.left - a.hw - 16, minY = -r.top + a.hh + 130, maxY = vh - r.top - a.hh - 70;
      A.p2.x = Math.max(minX, Math.min(maxX, A.p2.x)); A.p2.y = Math.max(minY, Math.min(maxY, A.p2.y)); }
  }
  return E.stickers.map(S=>S.p2);
}

/* ---------- the open / close moments ---------- */
async function openEnvelope(E){
  E.env.animate([{transform:'translateY(0) scale(1)'},{transform:'translateY(-10px) scale(1.015)',offset:.45},{transform:'translateY(0) scale(1)'}],{duration:1100,easing:'cubic-bezier(.3,0,.2,1)'});
  E.shadow.animate([{opacity:1},{opacity:0}],{duration:420,fill:'forwards'});
  const f = E.flap.animate([{transform:'rotateX(180deg)'},{transform:'rotateX(-14deg)',offset:.74},{transform:'rotateX(4deg)',offset:.88},{transform:'rotateX(0deg)'}],
    {duration:1150,easing:'cubic-bezier(.5,0,.3,1)',fill:'forwards'});
  setTimeout(()=>E.flap.style.zIndex=1, 520);
  E.env.classList.add('open');
  await sleep(650);
  const targets = scatterTargets(E, E.stickers.length);
  const n = E.stickers.length;
  await Promise.all(E.stickers.map(async (S,i)=>{
    await sleep(i*85);
    const peek = peekPos(E, i, n, S.h);
    await move(S, {...peek, y: peek.y - S.h*0.18}, {duration:480, easing:'cubic-bezier(.3,.0,.3,1)'});
    E.top.appendChild(S.el);                         // now in front of the pocket
    await move(S, targets[i], {duration:1050, easing:'cubic-bezier(.16,1.22,.38,1)'});
    S.el.classList.add('idle'); S.el.style.animationDelay = (-Math.random()*3)+'s';
  }));
  f.commitStyles?.();
}
async function sealEnvelope(E){
  E.stickers.forEach(S=>{ S.el.classList.remove('idle'); move(S, tuckPos(E, S.p, S.h), {duration:520, easing:'cubic-bezier(.4,0,.2,1)'}); });
  await sleep(380);
  E.shadow.animate([{opacity:0},{opacity:1}],{duration:500,delay:450,fill:'forwards'});
  const f = E.flap.animate([{transform:'rotateX(0deg)'},{transform:'rotateX(186deg)',offset:.8},{transform:'rotateX(180deg)'}],{duration:900,easing:'cubic-bezier(.55,0,.35,1)',fill:'forwards'});
  setTimeout(()=>E.flap.style.zIndex=6, 400);
  await f.finished;
  E.env.classList.remove('open');
  await E.env.animate([{transform:'scale(1)'},{transform:'scale(.97,1.02)'},{transform:'scale(1.01,.99)'},{transform:'scale(1)'}],{duration:450,easing:'ease-out'}).finished;
}

/* soft 3D tilt while the envelope is closed */
function tilt(E, stage){
  stage.onpointermove = e => { if (E.env.classList.contains('open')) return;
    const r = E.env.getBoundingClientRect(); const dx=(e.clientX-(r.left+r.width/2))/r.width, dy=(e.clientY-(r.top+r.height/2))/r.height;
    E.env.style.transform = `rotateY(${dx*10}deg) rotateX(${-dy*8}deg)`; };
  stage.onpointerleave = () => E.env.style.transform = '';
}

/* ---------- views ---------- */
const views = ['home','env','new'];
function show(v){ views.forEach(x=>$('#v-'+x).classList.toggle('on', x===v)); }
const envWidth = () => Math.round(Math.min(innerHeight*0.40, 400, innerWidth*0.56));

async function routeHome(){
  show('home');
  const wall = $('#wall'); wall.innerHTML = '';
  let list = []; try { list = await store().list(); } catch(e){}
  if (!list.length){ wall.innerHTML = `<p class="hint" style="position:static">no envelopes yet, be the first</p>`; return; }
  for (const e of list){
    const b = document.createElement('button'); b.className='mini';
    b.innerHTML = `<div class="envwrap"></div><div class="who"></div><div class="n"></div>`;
    b.querySelector('.who').textContent = e.name || 'someone';
    b.querySelector('.n').textContent = `${e.count} thing${e.count==1?'':'s'}`;
    wall.appendChild(b); makeEnv(b.querySelector('.envwrap'), 170);
    b.onclick = () => location.hash = '#/e/'+e.id;
  }
}

async function routeEnv(id){
  show('env');
  const host = $('#stage1'), W = envWidth();
  const data = await store().get(id);
  if (!data){ $('#who').innerHTML = 'this envelope got <i>lost</i>'; host.innerHTML=''; return; }
  $('#who').innerHTML = ''; $('#who').append(document.createTextNode((data.name||'someone')+'’s ')); $('#who').insertAdjacentHTML('beforeend','<i>haul</i>');
  host.style.top = Math.round(innerHeight*0.58 - W*GEO.ar*0.62)+'px';
  const E = makeEnv(host, W);
  data.items.forEach((it,i)=>{ const S = addSticker(E, it); S.p = tuckPos(E, peekPos(E,i,data.items.length,S.h), S.h); S.el.style.transform=T(S.p); });
  const hint = $('#hint1'); hint.style.top = (host.offsetTop + W*GEO.ar + 34)+'px'; hint.style.opacity = 1; hint.textContent='tap to open';
  tilt(E, host);
  let opened = false;
  E.env.onclick = async () => { if (opened) return; opened = true; hint.style.opacity = 0; E.env.style.transform='';
    await openEnvelope(E); hint.innerHTML = 'tap anything to shop it'; hint.style.top = (innerHeight-64)+'px'; hint.style.opacity = 1; };
  E.env.style.cursor='pointer';
}

let NEW = null;
function routeNew(){
  show('new');
  const host = $('#stage2'), W = envWidth();
  host.style.top = Math.round(innerHeight*0.53 - W*GEO.ar/2)+'px';
  NEW = { E: makeEnv(host, W, {open:true}), items: [] };
  $('#seal').style.display = 'none'; $('#ln').value = '';
  $('#nm').value = localStorage.getItem('bf-name') || '';
}
function relayoutInside(){
  const E = NEW.E, n = E.stickers.length;
  E.stickers.forEach((S,i)=>{ const p = peekPos(E,i,n,S.h); p.r = S.p.r; move(S, p, {duration:500, easing:'cubic-bezier(.2,1,.3,1)'}); });
}
async function addItem(fromFile){
  const link = $('#ln').value.trim();
  if (!fromFile && !/^https?:\/\//i.test(link)){ toast('paste a product link first'); return; }
  const E = NEW.E;
  const it = { link: fromFile ? '' : link, title:'', w:1, h:1.1 };
  const S = addSticker(E, it, { pos: { x:E.W/2, y:E.H*GEO.bt/100 - E.W*0.32, r:rnd(-6,6), s:0.62 } });
  S.el.classList.add('loading'); S.el.style.transform = T(S.p);
  S.el.animate([{opacity:0, transform:T({...S.p,y:S.p.y+30})},{opacity:1, transform:T(S.p)}],{duration:450,easing:'cubic-bezier(.2,1,.3,1)'});
  $('#ln').value='';
  try{
    let st;
    if (fromFile) st = await stickerFromFile(fromFile);
    else { const meta = await lookup(link); it.title = meta.title; st = await stickerFromUrl(meta.img); }
    Object.assign(it, { src: st.src, w: st.w, h: st.h });
    const sz = sizeFor(E, it); S.w=sz.w; S.h=sz.h; S.el.style.width=sz.w+'px'; S.el.style.height=sz.h+'px';
    S.el.querySelector('img').src = st.src; S.el.querySelector('.tag').textContent = it.title;
    await S.el.querySelector('img').decode().catch(()=>{});
    S.el.classList.remove('loading');
    await sleep(250);
    NEW.items.push(it);
    // drop into the envelope
    relayoutInside();
    NEW.E.env.animate([{transform:'translateY(0)'},{transform:'translateY(5px) scaleY(.985)',offset:.55},{transform:'translateY(0)'}],{duration:500,delay:280,easing:'ease-out'});
    $('#seal').style.display = '';
  }catch(e){
    S.el.remove(); E.stickers.splice(E.stickers.indexOf(S),1);
    if (!fromFile){ $('#ln').value = link; toast('that shop won’t let me peek — add a photo of it instead', 3600); $('#add').textContent='add photo'; $('#add').dataset.photo='1'; }
    else toast('couldn’t read that photo');
  }
}
$('#add').onclick = () => { if ($('#add').dataset.photo && !$('#ln').value.trim().match(/^https?:/)) { $('#file').click(); return; } if ($('#add').dataset.photo){ $('#file').click(); return; } addItem(); };
$('#ln').addEventListener('input', () => { delete $('#add').dataset.photo; $('#add').textContent='add'; });
$('#ln').addEventListener('keydown', e => { if (e.key==='Enter') addItem(); });
$('#file').onchange = e => { const f=e.target.files[0]; if (f){ const keep=$('#ln').value.trim(); addItem(f).then(()=>{ const it=NEW.items[NEW.items.length-1]; if(it && /^https?:/.test(keep)) it.link=keep; }); } e.target.value=''; delete $('#add').dataset.photo; $('#add').textContent='add'; };
addEventListener('paste', e => { if (!$('#v-new').classList.contains('on')) return; const f=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/')); if (f){ e.preventDefault(); addItem(f); } });
$('#seal').onclick = async () => {
  if (!NEW.items.length) return;
  const name = $('#nm').value.trim() || 'someone'; localStorage.setItem('bf-name', name);
  $('#seal').style.display='none';
  await sealEnvelope(NEW.E);
  const env = { id: newId(), name, created: new Date().toISOString(), items: NEW.items };
  try { await store().save(env); } catch(e){ toast('couldn’t save, try again'); $('#seal').style.display=''; return; }
  location.hash = '#/e/'+env.id;
  navigator.clipboard?.writeText(location.href).then(()=>toast('sealed ♡ link copied'),()=>toast('sealed ♡'));
};

$('#home').onclick = () => location.hash = '#/';
$('#mk').onclick = () => location.hash = '#/new';
function route(){
  const h = location.hash;
  $('#mk').style.visibility = h.startsWith('#/new') ? 'hidden' : 'visible';
  if (h.startsWith('#/e/')) routeEnv(h.slice(4));
  else if (h.startsWith('#/new')) routeNew();
  else routeHome();
}
addEventListener('hashchange', route);
route();
