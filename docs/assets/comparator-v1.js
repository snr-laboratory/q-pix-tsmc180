'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const data=window.QPIX_COMPARATOR, r=data.records;
  const opts={responsive:true,toImageButtonOptions:{format:'svg'}};
  const style={paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'system-ui',color:'#203e4c'},margin:{l:85,r:30,t:45,b:60}};
  const rates=[5,10,20,50], temps=[298.15,77];
  const rows=rates.flatMap(rate=>['source','pex'].flatMap(kind=>r[`${kind}_${rate}`].rows));
  const label=row=>`${row.kind==='pex'?'PEX':'Schematic'} · ${row.temperature_k} K · ${row.frequency_hz/1e6} MHz · ±${(row.tested_differential_v??.001)*1e3} mV`;
  const fmt=(value,scale=1)=>value===null?'—':(value*scale).toFixed(3);
  document.getElementById('status').textContent=r.physical.acceptance;
  document.getElementById('physical').textContent=r.physical.disposition;
  document.getElementById('results').innerHTML=rows.map(row=>`<tr><td>${label(row)}</td><td>${row.valid_setup_samples} / ${row.valid_setup_errors}</td><td>${fmt(row.maximum_valid_decision_delay_s,1e9)}</td><td>${fmt(row.source_energy.total_fixture_power_w,1e6)}</td><td>${fmt(row.source_energy.energy_per_cycle_j,1e15)}</td><td>${fmt(row.maximum_clocked_input_positive_lobe_fc)}</td></tr>`).join('');
  document.getElementById('one-mv').textContent=rates.flatMap(rate=>r[`pex_1mv_${rate}`].rows).map(row=>`${label(row)}: ${row.valid_setup_errors} errors / ${row.valid_setup_samples} valid captures`).join('\n')+'\n\nBalanced-routing 10-MHz comparison:\n'+r.balanced_trial.rows.map(row=>`${label(row)}: ${row.valid_setup_errors} errors / ${row.valid_setup_samples} valid captures`).join('\n');
  const colors=['#177e89','#b66537'];
  const threshold=['threshold_warm','threshold_cold'].map((key,i)=>{
    const row=r[key].rows[0];return {x:row.samples.map(s=>s.level_v*1e3),y:row.samples.map(s=>Number(s.positive)),name:`${row.temperature_k} K`,mode:'lines+markers',line:{color:colors[i],shape:'hv'}};
  });
  Plotly.newPlot('threshold',threshold,{...style,height:300,xaxis:{title:{text:'Commanded INP − INN (mV)'}},yaxis:{title:{text:'Positive decision'},tickvals:[0,1]},legend:{orientation:'h'}},opts);
  const power=temps.flatMap((temp,i)=>['schematic','pex'].map(kind=>{
    const selected=rows.filter(row=>row.temperature_k===temp&&row.kind===kind).sort((a,b)=>a.frequency_hz-b.frequency_hz);
    return {x:selected.map(row=>row.frequency_hz/1e6),y:selected.map(row=>row.source_energy.total_fixture_power_w*1e6),name:`${kind==='pex'?'PEX':'Schematic'} · ${temp} K`,mode:'lines+markers',line:{color:colors[i],dash:kind==='pex'?'solid':'dot'}};
  }));
  Plotly.newPlot('power',power,{...style,height:350,xaxis:{title:{text:'EVAL rate (MHz)'},tickvals:rates},yaxis:{title:{text:'Total fixture power (µW)'}},legend:{orientation:'h'}},opts);
  const loading=['source_loading','pex_loading'].flatMap(key=>r[key].rows.map(row=>({x:row.frequency_hz.map(f=>f/1e6),y:row.capacitance_f.map(c=>c*1e15),mode:'lines',name:`${row.kind==='pex'?'PEX':'Schematic'} · ${row.temperature_k} K`,line:{color:colors[temps.indexOf(row.temperature_k)],dash:row.kind==='pex'?'solid':'dot'}})));
  Plotly.newPlot('loading',loading,{...style,height:350,xaxis:{title:{text:'Frequency (MHz)'},type:'log',range:[-2,Math.log10(50)]},yaxis:{title:{text:'Effective input C (fF)'}},legend:{orientation:'h'}},opts);
  const scopes=await window.QPIX_PLOTS.loadAll(data.scopes);
  const select=document.getElementById('case');
  for(let i=0;i<scopes.length;i++){const option=document.createElement('option');option.value=i;option.textContent=label(scopes[i].notes);select.appendChild(option);}
  async function draw(){
    const record=scopes[Number(select.value)], notes=record.notes, count=record.signals.length;
    const layout={...style,height:1100,showlegend:false,margin:{l:100,r:30,t:30,b:60},grid:{rows:count,columns:1,pattern:'independent',roworder:'top to bottom'},shapes:[]};
    const traces=record.signals.map((signal,i)=>{
      const suffix=i?String(i+1):'';layout['xaxis'+suffix]={matches:'x',showticklabels:i===count-1,title:i===count-1?{text:'Time (µs)'}:undefined};
      layout['yaxis'+suffix]={title:{text:signal.name},automargin:true};
      return {x:signal.time_us,y:signal.value,type:'scatter',mode:'lines',xaxis:'x'+suffix,yaxis:'y'+suffix,line:{width:1.2,color:colors[i%2]},name:signal.name};
    });
    const offset=(notes.decision_reference_v-.9)*1e3;
    layout.shapes.push({type:'line',xref:'x domain',yref:'y',x0:0,x1:1,y0:offset,y1:offset,line:{color:'#805a70',dash:'dash',width:1}});
    await Plotly.react('scope',traces,layout,opts);
    document.getElementById('case-note').textContent=`${label(notes)}. ${notes.valid_setup_samples} captures meet 40 ns setup; ${notes.valid_setup_errors} errors. Decision reference ${notes.decision_reference_v.toFixed(5)} V. Native threads: ${notes.actual_threads}; requested: ${notes.requested_threads}.`;
    window.COMPARATOR_STATUS={ready:true,selected:record.name,selectedIndex:Number(select.value),rows:rows.length,scopes:scopes.length};
  }
  select.value=Math.max(0,scopes.findIndex(s=>s.name==='pex-298.15K-10MHz'&&s.notes.tested_differential_v===.002));select.addEventListener('change',draw);draw();
  document.getElementById('provenance').textContent=JSON.stringify({physical:r.physical,calibration:r.calibration,measurements:rows,loading:{source:r.source_loading,pex:r.pex_loading},sources:data.provenance},null,2);
});
