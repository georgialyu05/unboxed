// storage: Supabase (public, shared) if configured, else this browser only.
export const CFG = { url: '', key: '' }; // filled in when the shared database is set up

const LS = 'bf-envelopes-v1';
const local = {
  async list(){ return JSON.parse(localStorage.getItem(LS)||'[]').map(({id,name,items,created})=>({id,name,created,count:items.length})); },
  async get(id){ return JSON.parse(localStorage.getItem(LS)||'[]').find(e=>e.id===id); },
  async save(env){ const all=JSON.parse(localStorage.getItem(LS)||'[]'); all.unshift(env); localStorage.setItem(LS, JSON.stringify(all)); return env; },
};
const remote = {
  h(){ return {apikey:CFG.key, Authorization:'Bearer '+CFG.key, 'Content-Type':'application/json'}; },
  async list(){ const r=await fetch(`${CFG.url}/rest/v1/envelopes?select=id,name,created,count&order=created.desc&limit=200`,{headers:this.h()}); return r.json(); },
  async get(id){ const r=await fetch(`${CFG.url}/rest/v1/envelopes?id=eq.${encodeURIComponent(id)}&select=*`,{headers:this.h()}); return (await r.json())[0]; },
  async save(env){ const row={...env,count:env.items.length};
    const r=await fetch(`${CFG.url}/rest/v1/envelopes`,{method:'POST',headers:{...this.h(),Prefer:'return=minimal'},body:JSON.stringify(row)}); if(!r.ok) throw new Error(await r.text()); return env; },
};
export const store = () => (CFG.url ? remote : local);
export const newId = () => Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-3);
