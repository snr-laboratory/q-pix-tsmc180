'use strict';
window.CAPTURE_CONTROL_ERRORS=[];
window.addEventListener('error',e=>window.CAPTURE_CONTROL_ERRORS.push(String(e.message)));
window.addEventListener('unhandledrejection',e=>window.CAPTURE_CONTROL_ERRORS.push(String(e.reason)));
document.addEventListener('DOMContentLoaded',async()=>{
 const d=window.QPIX_CAPTURE_CONTROL,c=d.candidate,rows=c.electrical,colors=['#177e89','#b66537'];
 const fmt=(v,n=3)=>Number.isFinite(v)?v.toFixed(n):'unavailable';
 const label=r=>`${r.kind==='pex'?'Full PEX':'Native source'} · ${r.temperature_k===77?'77 K model':'Room'} · ${r.frequency_hz/1e6} MHz`;
 const opts={responsive:true,displaylogo:false,toImageButtonOptions:{format:'svg'}};
 const style={paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'system-ui',color:'#203e4c'},margin:{l:80,r:20,t:55,b:70},legend:{orientation:'h'}};
 document.getElementById('status').textContent=`${c.cell}: accepted local candidate at all four rates and both model temperatures; 16 source/PEX records, all 320 tested cycles pass.`;
 document.getElementById('physical').textContent=`Native checks: zero cell-local DRC findings, strict LVS, completed three-stage PEX, exact mask/port comparison and verified formal schematic/symbol/layout copy. ${c.via_cuts} added via cuts; ${c.redundant_signal_accesses} signal accesses use redundant lower-level cuts.`;
 document.getElementById('limits').textContent=c.limitations;
 function curves(value){return ['source','pex'].flatMap(kind=>[298.15,77].map((temp,i)=>{const a=rows.filter(r=>r.kind===kind&&r.temperature_k===temp).sort((a,b)=>a.frequency_hz-b.frequency_hz);return{x:a.map(r=>r.frequency_hz/1e6),y:a.map(value),type:'scatter',mode:'lines+markers',name:`${kind==='pex'?'PEX':'Source'} · ${temp===77?'77 K':'Room'}`,line:{color:colors[i],dash:kind==='source'?'dot':'solid'},marker:{symbol:kind==='source'?'circle-open':'circle'}};}));}
 await Plotly.newPlot('width',curves(r=>(r.active_pulse_width_range_s[0]+r.active_pulse_width_range_s[1])/2*1e9),{...style,height:410,title:{text:'Loaded EN pulse width'},xaxis:{title:{text:'Clock rate (MHz)'},tickvals:[5,10,20,50]},yaxis:{title:{text:'Width (ns)'},range:[3.9,4.05]}},opts);
 await Plotly.newPlot('charge',curves(r=>r.active_pulse_charge_mean_c*1e15),{...style,height:410,title:{text:'Mean returned charge, fixed replenisher bias'},xaxis:{title:{text:'Clock rate (MHz)'},tickvals:[5,10,20,50]},yaxis:{title:{text:'Net charge per valid pulse (fC)'}}},opts);
 await Plotly.newPlot('power',curves(r=>r.source_energy.upstream_supply_power_w.CTRL*1e6),{...style,height:420,title:{text:'Upstream controller supply draw'},xaxis:{title:{text:'Clock rate (MHz)'},tickvals:[5,10,20,50]},yaxis:{title:{text:'Controller power (µW)'},rangemode:'tozero'}},opts);
 const sorted=[...rows].sort((a,b)=>a.kind.localeCompare(b.kind)||b.temperature_k-a.temperature_k||a.frequency_hz-b.frequency_hz);
 document.getElementById('results').innerHTML=sorted.map(r=>`<tr><td>${label(r)}</td><td>${r.active_pulse_width_range_s.map(v=>fmt(v*1e9,4)).join('–')}</td><td>${fmt(r.source_energy.upstream_supply_power_w.CTRL*1e6)}</td><td>${fmt(r.source_energy.total_fixture_power_w*1e6)}</td><td>${r.actual_threads} / ${r.requested_threads}</td><td>${r.cycles.filter(v=>v.passed).length} / ${r.cycles.length}</td></tr>`).join('');
 document.getElementById('provenance').textContent=JSON.stringify({candidate:c,provenance:d.provenance},null,2);
 const scopes=await window.QPIX_PLOTS.loadAll(d.scopes);
 const select=document.getElementById('case');
 scopes.forEach((s,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=label(s.notes);select.appendChild(option)});
 async function draw(){
  const index=Number(select.value),scope=scopes[index],signals=scope.signals;
  const layout={...style,height:1850,showlegend:false,margin:{l:105,r:25,t:35,b:60},grid:{rows:signals.length,columns:1,pattern:'independent'}};
  const data=signals.map((s,i)=>{const axis=i?String(i+1):'';layout['xaxis'+axis]={matches:i?'x':undefined,title:i===signals.length-1?{text:'Time (µs)'}:undefined,showticklabels:i===signals.length-1};layout['yaxis'+axis]={title:{text:s.name},fixedrange:false};return{x:s.time_us,y:s.value,type:'scatter',mode:'lines',name:s.name,xaxis:'x'+axis,yaxis:'y'+axis,line:{width:1.5}};});
  document.getElementById('case-note').textContent=`${label(scope.notes)}; complete record. Data deliberately changes after capture. Cycles 17/18 truncate EN; cycle 19 recovers. Integrated charge includes signed switching lobes.`;
  await Plotly.react('scope',data,layout,opts);
  window.CAPTURE_CONTROL_STATUS={ready:true,selectedIndex:index,scopes:scopes.length,signals:signals.length,errors:window.CAPTURE_CONTROL_ERRORS};
 }
 select.addEventListener('change',draw);
 select.value=String(Math.max(0,scopes.findIndex(s=>s.notes.kind==='pex'&&s.notes.temperature_k===77&&s.notes.frequency_hz===50e6)));
 await draw();
});
