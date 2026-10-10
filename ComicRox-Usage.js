// Additive observer: original identification click handler, API responses and result handling stay intact.
(()=>{
 const original=api;let runId='';
 const identify=document.getElementById('identify');
 identify?.addEventListener('click',()=>{runId=globalThis.crypto?.randomUUID?.()||('run-'+Date.now()+'-'+Math.random().toString(16).slice(2));},true);
 api=async function(url,opt){
  if(url==='/api/identify'){
   const options={...(opt||{})};const headers=new Headers(options.headers||{});
   headers.set('X-ComicRox-Run',runId||('request-'+Date.now()));options.headers=headers;
   return original(url,options);
  }
  return original(url,opt);
 };
})();
