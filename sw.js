// BuzzHit : service worker minimal (réseau d'abord, cache en secours hors ligne) + rappel du Défi du jour
const C='buzzhit-v3';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','BuzzHit.png','icon-192.png','icon-512.png','badge-defi.png']).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;
e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))))});
/* rappel du Défi du jour : le serveur n'envoie le rappel qu'aux joueurs qui n'ont pas encore joué aujourd'hui ; le texte est écrit ici */
self.addEventListener('push',e=>{e.waitUntil(self.registration.showNotification('🎯 Défi du jour BuzzHit',{body:"Tu n'as pas encore joué aujourd'hui : 10 titres t'attendent !",icon:'icon-192.png',badge:'badge-defi.png',tag:'defi-du-jour',data:{url:'./?defi=1'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if(c.url.startsWith(self.registration.scope)&&'focus' in c){c.postMessage({defi:1});return c.focus()}}return clients.openWindow(url)}))});
