'use strict';
document.addEventListener('DOMContentLoaded',async()=>{
 const data=window.QPIX_REPLENISHER,r=data.records,temps=[298.15,77],rates=[5,10,20,50],colors=['#177e89','#b66537'];
 const opts={responsive:true,toImageButtonOptions:{format:'svg'}};
 const style={paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'system-ui',color:'#203e4c'},margin:{l:75,r:20,t:40,b:65},legend:{orientation:'h'}};
 const rows=r.physical.electrical,training=[...r.training_source.rows,...r.training_pex.rows];
 const nominal=[...training,...rows.filter(v=>/\/rate-(5|20|50)m-(source|schematic|pex)-analysis-v1\//.test(v.path))];
 const label=v=>`${v.kind==='pex'?'PEX':'Source'} · ${v.temperature_k} K · ${v.frequency_hz/1e6} MHz`;
 document.getElementById('status').textContent=r.physical.acceptance;
 document.getElementById('physical').textContent=r.physical.disposition;
 document.getElementById('results').innerHTML=nominal.slice().sort((a,b)=>a.kind.localeCompare(b.kind)||a.temperature_k-b.temperature_k||a.frequency_hz-b.frequency_hz).map(v=>`<tr><td>${label(v)}</td><td>${(v.mean_quantum_c*1e15).toFixed(6)}</td><td>${(v.source_energy.total_fixture_power_w*1e6).toFixed(4)}</td><td>${(v.worst_reverse_charge_c*1e15).toFixed(4)}</td></tr>`).join('');
 const curves=(pool,x,y)=>temps.flatMap((temp,i)=>['schematic','pex'].map(kind=>{
  const selected=pool.filter(v=>v.temperature_k===temp&&v.kind===kind).sort((a,b)=>x(a)-x(b));
  return {x:selected.map(x),y:selected.map(y),mode:'lines+markers',name:`${kind==='pex'?'PEX':'Source'} · ${temp} K`,line:{color:colors[i],dash:kind==='pex'?'solid':'dot'}};
 }));
 Plotly.newPlot('charge',curves(nominal,v=>v.frequency_hz/1e6,v=>v.mean_quantum_c*1e15),{...style,height:370,title:{text:'Frozen gain, nominal SUM'},xaxis:{title:{text:'Clock rate (MHz)'},tickvals:rates},yaxis:{title:{text:'Delivered charge (fC)'}}},opts);
 const compliance=[...rows.filter(v=>/\/sum-(inner-)?(low|high)/.test(v.path)),...nominal.filter(v=>v.frequency_hz===50e6)];
 Plotly.newPlot('compliance',curves(compliance,v=>v.sum_v,v=>v.mean_quantum_c*1e15),{...style,height:370,title:{text:'SUM dependence at 50 MHz'},xaxis:{title:{text:'Clamped SUM (V)'}},yaxis:{title:{text:'Delivered charge (fC)'}}},opts);
 Plotly.newPlot('power',curves(nominal,v=>v.frequency_hz/1e6,v=>v.source_energy.total_fixture_power_w*1e6),{...style,height:370,xaxis:{title:{text:'Clock rate (MHz)'},tickvals:rates},yaxis:{title:{text:'Total fixture draw (µW)'}}},opts);
 const widths=[...rows.filter(v=>/\/width[35]-50m/.test(v.path)).map(v=>({...v,width_ns:v.path.includes('/width3-')?3:5})),...nominal.filter(v=>v.frequency_hz===50e6).map(v=>({...v,width_ns:4}))];
 Plotly.newPlot('width',curves(widths,v=>v.width_ns,v=>v.mean_quantum_c*1e15),{...style,height:370,xaxis:{title:{text:'Command width (ns)'},tickvals:[3,4,5]},yaxis:{title:{text:'Delivered charge (fC)'}}},opts);
 const scopes=await window.QPIX_PLOTS.loadAll(data.scopes);
 const select=document.getElementById('case');
 scopes.forEach((s,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${s.variant} · ${label(s.notes)} · SUM ${s.notes.sum_v} V`;select.appendChild(option);});
 async function draw(){
  const record=scopes[Number(select.value)],v=record.notes,count=record.signals.length;
  const layout={...style,height:Math.max(900,count*170),showlegend:false,margin:{l:115,r:25,t:30,b:60},grid:{rows:count,columns:1,pattern:'independent',roworder:'top to bottom'}};
  const traces=record.signals.map((signal,i)=>{const suffix=i?String(i+1):'';layout['xaxis'+suffix]={matches:'x',showticklabels:i===count-1,title:i===count-1?{text:'Time (µs)'}:undefined};layout['yaxis'+suffix]={title:{text:signal.name},automargin:true};return{x:signal.time_us,y:signal.value,type:'scatter',mode:'lines',xaxis:'x'+suffix,yaxis:'y'+suffix,name:signal.name,line:{color:colors[i%2],width:1.2}};});
  await Plotly.react('scope',traces,layout,opts);
  document.getElementById('case-note').textContent=`${record.variant}. ${label(v)}. Net charge ${v.mean_quantum_c===null?'idle':(v.mean_quantum_c*1e15).toFixed(6)+' fC'}. Fixture ${(v.source_energy.total_fixture_power_w*1e6).toFixed(4)} µW. Native threads ${v.actual_threads}; requested ${v.requested_threads}.`;
  window.REPLENISHER_STATUS={ready:true,scopes:scopes.length,selectedIndex:Number(select.value),selected:record.variant};
 }
 select.value=Math.max(0,scopes.findIndex(v=>v.variant==='rate-50m-pex'&&v.notes.temperature_k===77));select.addEventListener('change',draw);draw();
 document.getElementById('provenance').textContent=JSON.stringify({physical:r.physical,calibration:r.calibration,training,inputs:data.provenance},null,2);
});
