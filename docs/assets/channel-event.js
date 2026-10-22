'use strict';
window.QPIX_EVENT_VIEWER=(()=>{
 const colors=['#247986','#c87536','#6b5b92','#71828b'];
 const style={paper_bgcolor:'white',plot_bgcolor:'#f8fbfc',font:{family:'system-ui',color:'#203e4c'},hovermode:'x unified'};
 const options={responsive:true,displaylogo:false,scrollZoom:true,toImageButtonOptions:{format:'svg'}};
 const cache=new Map();let generation=0;
 const fmt=(v,n=4)=>Number(v).toFixed(n);
 function reportError(error){
  window.CHANNEL_ERRORS=window.CHANNEL_ERRORS||[];window.CHANNEL_ERRORS.push(String(error));
  document.getElementById('detector-view-note').textContent=String(error);
 }
 async function unpack(packed){
  const bytes=Uint8Array.from(atob(packed),v=>v.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
 }
 function load(asset){
  if(!/^data\/channel-detector\/[A-Za-z0-9_-]+\/(overview|part-\d+)\.js$/.test(asset.file))throw new Error('Invalid local detector asset');
  if(!/^[0-9a-f]{64}$/.test(asset.payload_sha256))throw new Error('Detector asset hash required');
  const cacheKey=asset.file+':'+asset.payload_sha256;
  if(!cache.has(cacheKey)){
   const pending=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=asset.file;
    script.onload=async()=>{
     try{
      const packed=window.QPIX_EVENT_PARTS?.[asset.key];
      if(typeof packed!=='string')throw new Error('Detector asset identity differs');
      delete window.QPIX_EVENT_PARTS[asset.key];
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packed));
      const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      if(actual!==asset.payload_sha256)throw new Error('Detector asset hash differs from its report');
      resolve(await unpack(packed));
     }catch(error){reject(error)}finally{script.remove()}
    };
    script.onerror=()=>{script.remove();reject(new Error('Detector waveform file could not be opened'))};
    document.head.appendChild(script);
   });
   cache.set(cacheKey,pending);
   while(cache.size>24)cache.delete(cache.keys().next().value);
  }
  return cache.get(cacheKey);
 }
 function merge(parts,window){
  const signals={};
  for(const part of parts)for(const [name,trace] of Object.entries(part.signals)){
   const out=signals[name]||(signals[name]={time_us:[],value:[]});
   for(let i=0;i<trace.time_us.length;i++){
    const at=trace.time_us[i];
    if(!out.time_us.length||at>out.time_us[out.time_us.length-1]){out.time_us.push(at);out.value.push(trace.value[i])}
   }
  }
  return {window_us:window,signals};
 }
 function layout(rows,window,height=105){
  const result={...style,height:rows.length*height+100,showlegend:false,margin:{l:170,r:25,t:45,b:55},grid:{rows:rows.length,columns:1,pattern:'independent'},annotations:[]};
  rows.forEach((row,i)=>{
   const axis=i?String(i+1):'';
   result['xaxis'+axis]={matches:i?'x':undefined,range:window,showticklabels:i===rows.length-1,title:i===rows.length-1?{text:'Time (µs)'}:undefined};
   result['yaxis'+axis]={fixedrange:false,tickfont:{size:10}};
   result.annotations.push({xref:'paper',x:0,xanchor:'right',xshift:-43,yref:'y'+axis+' domain',y:.5,text:row.label.replace(' (','<br>('),showarrow:false,align:'right',font:{size:12}});
  });return result;
 }
 function rowsFor(overview){
  const s=overview.signals,offset=name=>s[name]?.value[0]||0;
  const rows=[{name:'INPUT_CURRENT_NA',label:'Detector (nA)'},{name:'INPUT_CHARGE_FC',label:'Input integral (fC)'},
   {name:'CSA_OUT',overlay:'VTH_QUIET',label:'CSA / threshold (mV)',scale:1000,offset:offset('CSA_OUT')},
   {name:'SUM',label:'SUM shift (mV)',scale:1000,offset:offset('SUM')},
   {name:'DUMMY',label:'DUMMY shift (mV)',scale:1000,offset:offset('DUMMY')},
   {name:'VCM_QUIET',label:'VCM shift (mV)',scale:1000,offset:offset('VCM_QUIET')},
   {name:'CMP_RAW',label:'Comparator RAW (V)'},{name:'CMP_BAL',label:'Comparator BAL (V)'},
   ...['CLK_IN','RUN','RESET','EVAL','CAPTURE','CMP_OUT','HELD','FORCE','INHIBIT','EVENT','PHASE','EN'].map(name=>({name,label:name+' (V)'})),
   {name:'AVDD',label:'Core AVDD shift (mV)',scale:1000,offset:offset('AVDD')},
   {name:'DVDD',label:'Core DVDD shift (mV)',scale:1000,offset:offset('DVDD')}];
  return rows.filter(row=>s[row.name]);
 }
 function traces(scope,rows){
  const result=[];
  rows.forEach((row,i)=>{
   const axis=i?String(i+1):'',factor=row.scale??1,origin=row.offset??0;
   for(const [name,dashed] of [[row.name,false],[row.overlay,true]]){
    if(!name)continue;const trace=scope.signals[name];if(!trace)throw new Error('Missing detector trace '+name);
    result.push({x:trace.time_us,y:trace.value.map(v=>(v-origin)*factor),type:'scatter',mode:'lines',name:dashed?name:row.label,
     xaxis:'x'+axis,yaxis:'y'+axis,line:{color:dashed?colors[1]:colors[i%3],width:dashed?1.1:1.4,dash:dashed?'dot':'solid'}});
   }
  });return result;
 }
 function reconstruction(record,overview){
  const r=record.reconstruction,rows=[{label:'Current (nA)'},{label:'Acquisition charge (fC)'},{label:'Charge error (fC)'}];
  const time=r.current_times_s.map(v=>v*1e6),ends=r.boundaries_s.map(v=>v*1e6);
  const result=[];
  const add=(x,y,name,row,color,dash='solid',shape='linear')=>result.push({x,y,type:'scatter',mode:'lines',name,xaxis:'x'+(row||''),yaxis:'y'+(row||''),line:{color,width:1.5,dash,shape}});
  const input=overview.signals.INPUT_CURRENT_NA;
  add(input.time_us,input.value,'Native detector current',0,colors[3]);
  add(time,r.filtered_truth_current_a.map(v=>v*1e9),'Truth with the same causal filter',0,colors[0]);
  add(time,r.reconstructed_current_a.map(v=>v*1e9),'Count-only reconstructed current',0,colors[1]);
  add(ends,r.truth_charge_c.map(v=>v*1e15),'Input charge at clock boundaries',2,colors[0]);
  add(ends,r.count_only_charge_c.map(v=>v*1e15),'Count-only charge at clock boundaries',2,colors[1],'solid','hv');
  const error=r.bin_charge_error_c.map(v=>v*1e15),length=Math.round(r.metrics.short_window_s*r.metrics.frequency_hz),prefix=[0];
  error.forEach(v=>prefix.push(prefix[prefix.length-1]+v));
  const short=error.map((_,i)=>prefix[i+1]-prefix[Math.max(0,i+1-length)]);
  add(time,error,'Per-clock charge error',3,colors[3]);
  add(time,short,'Fixed-window charge error',3,colors[2]);
  const plot=layout(rows,record.scope.window_us,185);plot.margin.t=105;plot.height+=60;plot.showlegend=true;plot.legend={orientation:'h',y:1.12};
  return {data:result,layout:plot};
 }
 function eventRange(event,full){
  if(Object.entries(event).some(([key,value])=>/^xaxis\d*\.autorange$/.test(key)&&value))return full;
  const direct=Object.keys(event).find(key=>/^xaxis\d*\.range$/.test(key));
  let range=direct?event[direct]:null;
  const start=Object.keys(event).find(key=>/^xaxis\d*\.range\[0\]$/.test(key));
  if(!range&&start)range=[event[start],event[start.replace('[0]','[1]')]];
  if(!range)return null;
  const left=Math.max(full[0],Number(range[0])),right=Math.min(full[1],Number(range[1]));
  return Number.isFinite(left)&&Number.isFinite(right)&&left<right?[left,right]:null;
 }
 async function init(records){
  const myGeneration=++generation,select=document.getElementById('detector-case'),panel=document.getElementById('detector-results');
  select.replaceChildren();
  if(!records.length){
   panel.hidden=true;select.hidden=true;
   document.getElementById('detector-note').textContent='Full-event qualification is pending. Completed native results will appear here with frozen calibration and their actual pass/fail verdict.';
   window.CHANNEL_EVENT_STATUS={ready:true,pending:true,cases:0};return;
  }
  select.hidden=false;panel.hidden=false;
  records.forEach(r=>{const option=document.createElement('option');option.value=r.id;option.textContent=r.title;select.appendChild(option)});
  let version=0,timer=null;
  async function draw(){
   clearTimeout(timer);
   const token=++version,entry=records.find(r=>r.id===select.value),m=entry.record,metrics=m.reconstruction_metrics;
   const overview=await load(entry.scope.overview);
   if(token!==version||myGeneration!==generation)return;
   const rows=rowsFor(overview),full=entry.scope.window_us;
   const failed=Object.entries(m.checks).filter(([,value])=>!value).map(([key])=>key.replaceAll('_',' '));
   document.getElementById('detector-note').textContent=`${entry.title}: ${m.accepted_detector_replay?'all declared bounded replay checks pass':'checks outside bounds: '+failed.join(', ')}. Frozen quantum ${fmt(metrics.quantum_c*1e15,6)} fC; ${metrics.operations} operations in the decoded acquisition. Gain and lag remain unfitted; analogue residual and short-record pedestal do not enter reconstruction. ${m.actual_threads} observed CPU threads. ${m.native_timing.join(' ')}`;
   if(m.operating_point){const p=m.operating_point;document.getElementById('detector-note').textContent+=` A–F words ${p.clock_words.join(', ')}; replenisher seed ${fmt(p.replenisher_seed_scale,6)}; detector ${fmt(p.detector_f*1e12,2)} pF; external VCM / VTH ${fmt(p.common_mode_v,6)} / ${fmt(p.threshold_v,6)} V.`}
   const power=m.source_energy.whole_record_cycles;
   const values=[['Decoded input charge',`${fmt(metrics.source_acquisition_charge_c*1e15,6)} fC`],['Count-only charge',`${fmt(metrics.count_only_charge_c*1e15,6)} fC`],
    ['Integrated count error',`${fmt(metrics.integrated_count_error_c*1e15,6)} fC`],['Per-clock error RMS',`${fmt(metrics.clock_bin_error_rms_c*1e15,6)} fC`],
    [`${fmt(metrics.short_window_s*1e6,3)}-µs window error RMS`,`${fmt(metrics.short_window_charge_error_rms_c*1e15,6)} fC`],
    ['Filtered-current relative RMS',`${fmt(metrics.relative_filtered_current_error_rms*100,3)}%`],['Preserved causal filter delay',`${fmt(metrics.filter_group_delay_s*1e6,4)} µs`],
    ['Complete-cycle fixture power',`${fmt(power.total_fixture_power_w*1e6,3)} µW over ${power.complete_clock_cycles} cycles`]];
   document.getElementById('detector-metrics').innerHTML=values.map(([name,value])=>`<tr><td>${name}</td><td>${value}</td></tr>`).join('');
   document.getElementById('detector-details').textContent=JSON.stringify({record:m,display:entry.scope},null,2);
   const plots=['detector-reconstruction','detector-scope'];
   const reconstructed=reconstruction(entry,overview);
   await Plotly.react(plots[0],reconstructed.data,reconstructed.layout,options);
   if(token!==version||myGeneration!==generation)return;
   await Plotly.react(plots[1],traces(overview,rows),layout(rows,full),options);
   if(token!==version||myGeneration!==generation)return;
   let synchronizing=false,zoomVersion=0,latestRange=full.slice();
   const detailWidth=Math.min(4,(full[1]-full[0])/8);
   async function detail(range){
    const revision=++zoomVersion;let scope=overview,kind='overview';
    if(range[1]-range[0]<=detailWidth){
     const parts=entry.scope.chunks.filter(p=>p.window_us[0]<=range[1]&&p.window_us[1]>=range[0]);
     scope=merge(await Promise.all(parts.map(load)),range);kind='retained detail';
    }
    if(revision!==zoomVersion||token!==version||myGeneration!==generation)return;
    synchronizing=true;
    try{await Plotly.react(plots[1],traces(scope,rows),layout(rows,range),options)}finally{synchronizing=false}
    document.getElementById('detector-view-note').textContent=`${kind}: ${range.map(v=>fmt(v,4)).join('–')} µs. Full-duration logic is retained; analogue overview bins preserve extrema. Zoom to ${fmt(detailWidth,2)} µs or less for all retained detail points. Numerical metrics use the complete native analysis.`;
    window.CHANNEL_EVENT_STATUS={ready:true,pending:false,cases:records.length,dataset:entry.id,view:kind,window:range,rows:rows.length};
   }
   function link(from,event){
    if(synchronizing)return;const range=eventRange(event,full);if(!range)return;
    if(range.every((v,i)=>Math.abs(v-latestRange[i])<1e-10))return;
    latestRange=range;
    synchronizing=true;const other=plots.find(id=>id!==from);
    Plotly.relayout(other,{'xaxis.range':range}).then(()=>{synchronizing=false;clearTimeout(timer);timer=setTimeout(()=>detail(range).catch(reportError),120)}).catch(error=>{synchronizing=false;reportError(error)});
   }
   plots.forEach(id=>{const graph=document.getElementById(id);graph.removeAllListeners('plotly_relayout');graph.on('plotly_relayout',event=>link(id,event))});
   await detail(full);
  }
  select.onchange=()=>draw().catch(reportError);await draw();
 }
 return {init,merge,unpack};
})();
window.addEventListener('DOMContentLoaded',()=>window.QPIX_EVENT_VIEWER.init(window.QPIX_CHANNEL?.detector_replays||[]).catch(error=>{
 window.CHANNEL_ERRORS=window.CHANNEL_ERRORS||[];window.CHANNEL_ERRORS.push(String(error));
 document.getElementById('detector-note').textContent=String(error);
}));
