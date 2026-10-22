'use strict';
window.SHARED_BIAS_ERRORS=[];
window.addEventListener('error', e=>window.SHARED_BIAS_ERRORS.push(String(e.message)));
window.addEventListener('unhandledrejection', e=>window.SHARED_BIAS_ERRORS.push(String(e.reason)));

document.addEventListener('DOMContentLoaded', async()=>{
 const d=window.QPIX_SHARED_BIAS, c=d.candidate;
 const colors=['#177e89','#b66537'];
 const fmt=(v,n=3)=>Number.isFinite(v)?v.toFixed(n):'unavailable';
 const temp=r=>r.temperature_k===77?'77 K model':'Room';
 const label=r=>`${temp(r)} · ${r.channels} receiver${r.channels===1?'':'s'}`;
 const opts={responsive:true,displaylogo:false,toImageButtonOptions:{format:'svg'}};
 const style={paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'system-ui',color:'#203e4c'},
  margin:{l:85,r:25,t:55,b:75},legend:{orientation:'h'}};
 const minimumPM=Math.min(...c.opac.flatMap(r=>(r.margins||[]).map(v=>v.phase_margin_deg)));
 document.getElementById('status').textContent=`Accepted bounded shared-support candidate: 40 source/PEX DC/AC cases, four bank power-up cases and four initialized physical receiver groups. Minimum modeled loop margin ${fmt(minimumPM,2)}°. `;
 document.getElementById('physical').textContent=`Flat ${c.dimensions_um.join(' × ')} µm; ${c.mos_units} MOS units, ${c.mom_units} MOM units, ${c.resistor_units} resistor units and ${c.via_cuts.toLocaleString()} via cuts. Complete mask/port proof, zero cell-local DRC findings, strict LVS, completed PEX and independently verified formal views.`;
 document.getElementById('limits').textContent=c.limitations;
 document.getElementById('provenance').textContent=JSON.stringify({candidate:c,provenance:d.provenance},null,2);

 const loopSelect=document.getElementById('loop-case');
 const loopRows=c.opac.filter(r=>r.analysis==='loop'&&r.kind==='pex');
 loopRows.forEach((r,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${temp(r)} · ${r.channels}-channel equivalent · ${r.load_case.replaceAll('_',' ')}`;loopSelect.appendChild(o)});
 function phase(real,imag){
  let prior=null,offset=0;
  return real.map((v,i)=>{const angle=Math.atan2(imag[i],v)*180/Math.PI;
   if(prior!==null){if(angle-prior>180)offset-=360;else if(angle-prior< -180)offset+=360;}
   prior=angle;return angle+offset;});
 }
 async function drawBode(){
  const selected=loopRows[Number(loopSelect.value)];
  const rows=d.bode.filter(r=>r.name===selected.name&&r.load_case===selected.load_case);
  const data=rows.flatMap(r=>{
   const name=r.kind==='pex'?'Full PEX':'Native source';
   const line={color:r.kind==='pex'?colors[0]:colors[1],dash:r.kind==='pex'?'solid':'dot',width:2};
   return [{x:r.frequency_hz,y:r.gain_real.map((v,i)=>20*Math.log10(Math.hypot(v,r.gain_imag[i]))),
    name,type:'scatter',mode:'lines',line,legendgroup:name,xaxis:'x',yaxis:'y'},
    {x:r.frequency_hz,y:phase(r.gain_real,r.gain_imag),name,type:'scatter',mode:'lines',line,
     showlegend:false,legendgroup:name,xaxis:'x2',yaxis:'y2'}];
  });
  const margin=selected.margins[0];
  await Plotly.react('bode',data,{...style,height:650,
   title:{text:`${label(selected)} · ${selected.load_case.replaceAll('_',' ')} · PEX PM ${fmt(margin.phase_margin_deg,2)}°`},
   grid:{rows:2,columns:1,pattern:'independent'},
   xaxis:{type:'log',matches:'x2',showticklabels:false},xaxis2:{type:'log',title:{text:'Frequency (Hz)'}},
   yaxis:{title:{text:'Return-ratio gain (dB)'}},yaxis2:{title:{text:'Phase (degrees)'}},
   shapes:[{type:'line',xref:'x',yref:'y',x0:10,x1:50e6,y0:0,y1:0,line:{color:'#b6c9cd',dash:'dot'}}]},opts);
 }
 loopSelect.value=String(Math.max(0,loopRows.findIndex(r=>r.temperature_k===77&&r.channels===1&&r.load_case==='no_load')));
 loopSelect.addEventListener('change',drawBode);
 await drawBode();

 const rows=[...c.electrical].sort((a,b)=>b.temperature_k-a.temperature_k||a.channels-b.channels);
 const names=rows.map(label);
 const bank=rows.map(r=>r.power.active.shared_bank_allocation_per_receiver_w*1e6);
 const whole=rows.map(r=>r.power.active.total_fixture_per_receiver_w*1e6);
 await Plotly.newPlot('power',[
  {x:names,y:bank,type:'bar',name:'Shared bank',marker:{color:colors[0]}},
  {x:names,y:whole.map((v,i)=>v-bank[i]),type:'bar',name:'Receivers + declared external ports',marker:{color:colors[1]}}
 ],{...style,height:460,barmode:'stack',title:{text:'Measured 50-MHz fixture draw per receiver'},yaxis:{title:{text:'Upstream + positive external work (µW)'},rangemode:'tozero'}},opts);
 document.getElementById('results').innerHTML=rows.map(r=>`<tr><td>${label(r)}</td><td>${fmt(r.power.idle.upstream_supply_power_w.BANK*1e6)} / ${fmt(r.power.active.upstream_supply_power_w.BANK*1e6)}</td><td>${fmt(r.power.active.shared_bank_allocation_per_receiver_w*1e6)}</td><td>${fmt(r.power.active.total_fixture_per_receiver_w*1e6)}</td><td>${fmt(r.charge[0].holdout_mean_charge_c*1e15,4)}</td><td>${fmt(Math.max(...r.charge.map(q=>q.holdout_calibrated_rms_fraction))*100)}</td></tr>`).join('');

 const noiseSelect=document.getElementById('noise-node');
 [...new Set(d.spectra.map(r=>r.node))].forEach(node=>{const o=document.createElement('option');o.textContent=node;noiseSelect.appendChild(o)});
 async function drawNoise(){
  const node=noiseSelect.value;
  const spectra=d.spectra.filter(r=>r.node===node);
  const data=spectra.map(r=>{
   const cold=r.case.endsWith('77K'),pex=r.case.startsWith('pex');
   return {x:r.frequency_hz,y:r.asd_v_sqrt_hz.map(v=>v*1e9),type:'scatter',mode:'lines',
    name:`${pex?'PEX':'Source'} · ${cold?'77 K model':'Room'}`,line:{color:colors[cold?1:0],dash:pex?'solid':'dot',width:2}};
  });
  await Plotly.react('noise',data,{...style,height:470,title:{text:node+' · stationary model spectrum'},
   xaxis:{type:'log',title:{text:'Frequency (Hz)'}},yaxis:{type:'log',title:{text:'Output ASD (nV/√Hz)'}}},opts);
  document.getElementById('noise-note').textContent=c.stationary_noise.map(r=>{
   const output=r.outputs.find(v=>v.node===node),band=output.bands.find(v=>v.limits_hz[0]===1e4);
   return `${r.kind==='pex'?'PEX':'Source'} ${temp(r)}: ${fmt(band.rms_v*1e6)} µV RMS from 10 kHz to 50 MHz`;
  }).join('; ')+'.';
 }
 noiseSelect.addEventListener('change',drawNoise);
 await drawNoise();

 const bytes=Uint8Array.from(atob(d.packed_scopes),v=>v.charCodeAt(0));
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 const scopes=JSON.parse(await new Response(stream).text());
 const views={};
 for(const group of ['startup','sharing']){
  const cases=scopes.filter(s=>s.group===group),select=document.getElementById(group+'-case');
  cases.forEach((s,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=label(s.notes);select.appendChild(o)});
  async function draw(){
   const scope=cases[Number(select.value)],signals=scope.signals,r=scope.notes;
   const layout={...style,height:Math.max(1050,signals.length*115),showlegend:false,
    margin:{l:130,r:25,t:30,b:55},grid:{rows:signals.length,columns:1,pattern:'independent'}};
   document.getElementById(group+'-scope').style.height=layout.height+'px';
   const data=signals.map((s,i)=>{
    const axis=i?String(i+1):'';
    layout['xaxis'+axis]={matches:i?'x':undefined,title:i===signals.length-1?{text:'Time (µs)'}:undefined,showticklabels:i===signals.length-1};
    layout['yaxis'+axis]={title:{text:s.name},fixedrange:false};
    return {x:s.time_us,y:s.value,type:'scatter',mode:'lines',name:s.name,xaxis:'x'+axis,yaxis:'y'+axis,line:{width:1.4}};
   });
   const note=group==='startup'
    ? `${label(r)}; reference settling within 2 mV by ${fmt(Math.max(...Object.values(r.last_reference_outside_2mv_s))*1e6,2)} µs. Upstream startup energy ${fmt(r.upstream_startup_energy_j*1e12,1)} pJ, including rail charging; no reservoir subtraction.`
    : `${label(r)}; ${r.initialization.full_state_count.toLocaleString()} captured native states, with actual initial solution checked. Complete EVAL/EN burst and recovery. All signed replenishment-current lobes enter charge calibration.`;
   document.getElementById(group+'-note').textContent=note;
   await Plotly.react(group+'-scope',data,layout,opts);
   views[group]={cases:cases.length,signals:signals.length,selectedIndex:Number(select.value)};
   window.SHARED_BIAS_STATUS={ready:true,views,loopSpectra:d.bode.length,noiseSpectra:d.spectra.length,errors:window.SHARED_BIAS_ERRORS};
  }
  select.value=String(Math.max(0,cases.findIndex(s=>s.notes.temperature_k===77&&s.notes.channels===4)));
  select.addEventListener('change',draw);
  await draw();
 }
});
