/* Same-origin, one-shot image transfer. IndexedDB avoids data-URL storage limits. */
(function () {
  'use strict';
  function open() { return new Promise((resolve,reject)=>{const r=indexedDB.open('codepool-image-handoff',1);r.onupgradeneeded=()=>r.result.createObjectStore('images');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
  async function transaction(mode,work){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('images',mode);let value;work(tx.objectStore('images'),v=>{value=v;});tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Image transfer aborted'));});}finally{db.close();}}
  window.DemoImageHandoff={
    put:async function(blob,name){const id=crypto.randomUUID();await transaction('readwrite',store=>{
      const now=Date.now();store.openCursor().onsuccess=function(e){const c=e.target.result;if(c){if(now-c.value.created>3600000)c.delete();c.continue();}};
      store.put({blob,name,created:now},id);
    });return id;},
    take:async function(id){return transaction('readwrite',(store,done)=>{const r=store.get(id);r.onsuccess=()=>{const v=r.result;store.delete(id);done(v&&Date.now()-v.created<3600000?v:null);};});}
  };
})();
