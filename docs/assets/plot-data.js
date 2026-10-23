'use strict';
/* Fixed overview plots, local-file loading, and bounded display data. */
window.QPIX_PLOTS=(()=>{
 const cache=new Map();
 async function unpack(packed){
  const bytes=Uint8Array.from(atob(packed),v=>v.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 }
 function load(asset){
  if(!/^data\/plots\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.js$/.test(asset.file)||
     !/^[0-9a-f]{64}$/.test(asset.payload_sha256))throw new Error('Invalid plot asset');
  const key=asset.file+':'+asset.payload_sha256;
  if(!cache.has(key))cache.set(key,new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=asset.file;
   script.onload=async()=>{
    try{
     const packed=window.QPIX_PLOT_DATA?.[asset.key];
     if(typeof packed!=='string')throw new Error('Missing plot payload');
     delete window.QPIX_PLOT_DATA[asset.key];
     const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packed));
     const hex=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
     if(hex!==asset.payload_sha256)throw new Error('Plot payload differs from its report');
     resolve(await unpack(packed));
    }catch(error){reject(error)}finally{script.remove()}
   };
   script.onerror=()=>{script.remove();reject(new Error('Cannot open plot: '+asset.file))};
   document.head.appendChild(script);
  }));
  return cache.get(key);
 }
 function fixed(layout={}){
  const result={...layout,dragmode:false};
  for(const name of new Set(['xaxis','yaxis',...Object.keys(layout).filter(k=>/^[xy]axis\d*$/.test(k))]))
   result[name]={...layout[name],fixedrange:true};
  return result;
 }
 for(const method of ['newPlot','react']){
  const original=Plotly[method];
  Plotly[method]=function(node,data,layout,config){
   return original.call(this,node,data,fixed(layout),{...config,scrollZoom:false,doubleClick:false,
    modeBarButtons:[['toImage']],displaylogo:false});
  };
 }
 document.addEventListener('DOMContentLoaded',()=>{
  for(const id of ['case-reset','wave-reset','detector-reset','clock-reset','native-clock-reset']){
   const button=document.getElementById(id);if(button)button.hidden=true;
  }
 });
 return {load,loadAll:scopes=>Promise.all(scopes.map(s=>load(s.plot_asset))),unpack,fixed};
})();
