const C='skolekalender-v1';
const ASSETS=['skolekalender-bfk.html','kalender.html','skolekalender.ics','manifest.webmanifest','icon.svg','flagofnorway.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{
      const c=r.clone();
      caches.open(C).then(c0=>c0.put('skolekalender-bfk.html',c));
      return r;
    }).catch(()=>caches.match('skolekalender-bfk.html').then(m=>m||caches.match(e.request))));
    return;
  }
  const isStatic=url.origin===location.origin||url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com';
  if(!isStatic)return;
  e.respondWith(caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{
    const c=r.clone();
    if(r.ok)caches.open(C).then(c0=>c0.put(e.request,c));
    return r;
  }).catch(()=>m)));
});