'use strict';
window.MIM_ERRORS=[];
window.addEventListener('error',e=>window.MIM_ERRORS.push(String(e.message)));
window.addEventListener('unhandledrejection',e=>window.MIM_ERRORS.push(String(e.reason)));
document.addEventListener('DOMContentLoaded',async()=>{
 const d=window.QPIX_MIM,r=d.records,colors=['#247986','#c87536','#6b5b92'];
 const fmt=(v,n=3)=>Number.isFinite(v)?v.toFixed(n):'unavailable';
 const model=row=>row.temperature_k===77?'77 K exploratory':'Room factory';
 const label=row=>`${model(row)} · ${row.channels} equivalent load${row.channels===1?'':'s'}`;
 const opts={responsive:true,displaylogo:false,scrollZoom:true,toImageButtonOptions:{format:'svg'}};
 const style={paper_bgcolor:'white',plot_bgcolor:'#f8fbfc',font:{family:'system-ui',color:'#203e4c'},margin:{l:90,r:25,t:50,b:75},hovermode:'x unified'};
 const modules=[{name:'Clock phase',key:'clock',baseline:[1000,500]},{name:'Shared bias',key:'bias',baseline:[286,314]}];
 document.getElementById('status').textContent='Two compact flat native layouts: independent complete-mask proofs, zero cell-local geometry findings, strict LVS and completed PEX. Electrical checks and their limits are shown below.';
 document.getElementById('formal-status').textContent=modules.map(m=>`${r[m.key+'_native'].cell}: ${r[m.key+'_formal']?'formal Modules schematic, symbol and layout independently verified':'formal-library promotion pending'}`).join('; ')+'.';
 document.getElementById('geometry-table').innerHTML=modules.map(m=>{
  const n=r[m.key+'_native'],old=m.baseline[0]*m.baseline[1];
  return `<tr><td>${n.cell}</td><td>${m.baseline.join(' × ')} µm</td><td>${n.dimensions_um.join(' × ')} µm</td><td>${fmt((1-n.area_um2/old)*100,2)}%</td><td>Local geometry / strict LVS / 3-stage PEX pass</td></tr>`;
 }).join('');
 await Plotly.newPlot('area',[{x:modules.map(m=>m.name),y:modules.map(m=>m.baseline[0]*m.baseline[1]/1e6),type:'bar',name:'MOM baseline',marker:{color:colors[1]}},{x:modules.map(m=>m.name),y:modules.map(m=>r[m.key+'_native'].area_um2/1e6),type:'bar',name:'MIM derivative',marker:{color:colors[0]}}],{...style,height:450,barmode:'group',yaxis:{title:{text:'Module footprint (mm²)'},rangemode:'tozero'}},opts);
 const scopes=await window.QPIX_PLOTS.loadAll(d.scopes);
 const views={};
 async function scopePlot(id,s){
  const layout={...style,height:s.signals.length*105+90,showlegend:false,margin:{l:165,r:25,t:35,b:55},grid:{rows:s.signals.length,columns:1,pattern:'independent'},annotations:[]},data=[];
  const right=Math.max(...s.signals.map(t=>t.time_us.at(-1))),left=Math.min(...s.signals.map(t=>t.time_us[0]));
  s.signals.forEach((trace,i)=>{
   const axis=i?String(i+1):'';
   layout['xaxis'+axis]={matches:i?'x':undefined,showticklabels:i===s.signals.length-1,range:[left,right],title:i===s.signals.length-1?{text:'Time (µs)'}:undefined};
   layout['yaxis'+axis]={tickfont:{size:10},fixedrange:false};
   layout.annotations.push({xref:'paper',x:0,xanchor:'right',xshift:-40,yref:'y'+axis+' domain',y:.5,text:trace.name.replace(' (','<br>('),showarrow:false,align:'right',font:{size:12}});
   let x=trace.time_us,y=trace.value,shape='linear';
   if(trace.logicEdges){
    const edges=trace.logicEdges,events=[...edges.rising_us.map(t=>[t,1]),...edges.falling_us.map(t=>[t,0])].sort((a,b)=>a[0]-b[0]);
    x=[left,...events.map(e=>e[0]),right];y=[Number(edges.initial_high),...events.map(e=>e[1]),events.length?events.at(-1)[1]:Number(edges.initial_high)];shape='hv';
    layout['yaxis'+axis].range=[-.15,1.15];layout['yaxis'+axis].tickvals=[0,1];
   }
   data.push({x,y,type:'scatter',mode:'lines',name:trace.name,xaxis:'x'+axis,yaxis:'y'+axis,line:{color:colors[i%3],width:1.4,shape}});
  });
  document.getElementById(id).style.height=layout.height+'px';await Plotly.react(id,data,layout,opts);
  views[id]={rows:s.signals.length,dataset:s.dataset,name:s.name,window:[left,right]};
 }
 function selector(id,items,title,draw,selected=0){
  const select=document.getElementById(id);
  items.forEach((item,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=title(item);select.appendChild(o)});
  select.value=String(selected);select.addEventListener('change',()=>draw(items[Number(select.value)]).catch(e=>window.MIM_ERRORS.push(String(e))));
  return draw(items[selected]);
 }
 document.getElementById('clock-table').innerHTML=d.clock.map(row=>`<tr><td>${model(row)} · ${fmt(row.frequency_hz/1e6,0)} MHz · ${row.role} / ${row.kind}${row.initial_dc_bootstrap?' · relaxed DC bootstrap':''}</td><td>${row.trim_words.join(', ')}</td><td>${fmt((row.mean_edge_delays_s[5]-row.mean_edge_delays_s[4])*1e9,4)}</td><td>${row.local_timing_screen_passed?'Pass':'Outside strict target'}</td><td>${fmt(row.source_energy.total_fixture_power_w*1000,4)}</td></tr>`).join('');
 const clocks=scopes.filter(s=>s.group==='clock');
 await selector('clock-case',clocks,s=>`${s.dataset} · ${s.name}`,async s=>{
  const row=d.clock.find(row=>row.dataset===s.dataset&&row.run_job_id===s.notes.run_job_id);
  document.getElementById('clock-note').textContent=`${row.role}: all six mean edge delays (ns) ${row.mean_edge_delays_s.map(v=>fmt(v*1e9,4)).join(', ')}. Words A–F: ${row.trim_words.join(', ')}. ${row.source_energy.clock_cycles} complete power cycles; requested / observed threads ${row.requested_threads} / ${row.actual_threads}. ${row.native_timing.join(' ')}`;
  if(row.initial_dc_bootstrap)document.getElementById('clock-note').textContent+=' Initial DC automatically loosened to 0.005; transient reltol returned to '+row.initial_dc_bootstrap.observed_transient_reltol+'. This retained diagnostic does not qualify strict DC initialization or a selected mode.';
  await scopePlot('clock-scope',s);
 },Math.max(0,clocks.findIndex(s=>d.clock.some(row=>row.dataset===s.dataset&&row.role==='selected'))));
 const selected=d.clock.filter(row=>row.role==='selected'),rates=[5,10,20,50];
 const missing=[];for(const temperature of [298.15,77])for(const f of rates)if(!selected.some(row=>row.temperature_k===temperature&&row.frequency_hz===f*1e6))missing.push(`${temperature===77?'cold':'room'} ${f} MHz`);
 document.getElementById('clock-coverage').textContent=`Selected full-PEX coverage is explicit. Remaining nominal modes: ${missing.length?missing.join(', '):'none'}. Idle/reconfiguration, PVT, intrinsic jitter and chip distribution remain separate. Source trim probes and retained misses do not fill that coverage.`;
 if(r.clock_dc_failure)document.getElementById('clock-coverage').textContent+=' The first cold full-PEX default DC sequence reached its 600-s guard before a timing transient. Its gmin/source/dptran attempts and native log are retained; this is an initialization limit, not a demonstrated cold circuit failure.';
 if(r.clock_dc_controls)document.getElementById('clock-coverage').textContent+=' Subsequent DC-only pivot and free measured-starting-guess controls still loosened reltol to 0.005. Strict cold initialization and trim qualification remain open; the completed cold transient is a retained diagnostic.';
 function phase(real,imag){let prior=null,offset=0;return real.map((v,i)=>{const angle=Math.atan2(imag[i],v)*180/Math.PI;if(prior!==null){if(angle-prior>180)offset-=360;else if(angle-prior< -180)offset+=360;}prior=angle;return angle+offset})}
 const loops=r.bias_opac.rows.filter(row=>row.kind==='pex'&&row.analysis==='loop');
 await selector('loop-case',loops,row=>`${label(row)} · ${row.load_case}`,async row=>{
  const suffix=row.name.replace(/^pex-/,'');
  const curves=r.bias_curves.filter(c=>c.name===row.name||c.name==='schematic-'+suffix);
  const data=curves.flatMap(c=>{
   const pex=c.name.startsWith('pex-'),name=pex?'Full PEX':'Native source',line={color:colors[pex?0:1],dash:pex?'solid':'dot'};
   return [{x:c.frequency_hz,y:c.gain_real.map((v,i)=>20*Math.log10(Math.hypot(v,c.gain_imag[i]))),type:'scatter',mode:'lines',name,line,xaxis:'x',yaxis:'y'},{x:c.frequency_hz,y:phase(c.gain_real,c.gain_imag),type:'scatter',mode:'lines',name,line,xaxis:'x2',yaxis:'y2',showlegend:false}];
  });
  await Plotly.react('bode',data,{...style,height:650,title:{text:`${label(row)} · full-PEX PM ${fmt(row.margins[0].phase_margin_deg,2)}°`},grid:{rows:2,columns:1,pattern:'independent'},xaxis:{type:'log',matches:'x2',showticklabels:false,range:[1,Math.log10(50e6)]},xaxis2:{type:'log',range:[1,Math.log10(50e6)],title:{text:'Frequency (Hz)'}},yaxis:{title:{text:'Return-ratio gain (dB)'}},yaxis2:{title:{text:'Phase (degrees)'}}},opts);
 },Math.max(0,loops.findIndex(row=>row.temperature_k===77&&row.channels===1&&row.load_case==='no_load')));
 await selector('startup-case',scopes.filter(s=>s.group==='startup'),s=>s.name,async s=>{
  const row=r.bias_startup.rows.find(row=>row.name===s.name);
  document.getElementById('startup-note').textContent=`${label(row)}: ${row.passed?'passes':'misses'} bank power-up limits. Last DUMMY excursion outside ±2 mV: ${fmt(row.last_reference_outside_2mv_s.DUMMY*1e6)} µs; startup upstream work ${fmt(row.upstream_startup_energy_j*1e12)} pJ. No reservoir credit.`;
  await scopePlot('startup-scope',s);
 });
 const powers=r.bias_power.rows;
 document.getElementById('power-table').innerHTML=powers.map(row=>`<tr><td>${label(row)}</td><td>${fmt(row.windows.idle.bank_upstream_power_w*1e6)} / ${fmt(row.windows.active.bank_upstream_power_w*1e6)}</td><td>${fmt(row.windows.active.positive_fixture_power_w*1e6)}</td><td>${fmt(row.maximum_reference_errors_v.DUMMY*1e3,4)}</td><td>${fmt(Math.max(row.maximum_reference_errors_v.VCM_QUIET,row.maximum_reference_errors_v.VTH_QUIET)*1e6,4)}</td><td>${row.passed?'Pass':'Outside screen'}</td></tr>`).join('');
 await Plotly.newPlot('bias-power',[{x:powers.map(label),y:powers.map(row=>row.windows.active.bank_upstream_power_w*1e6),type:'bar',name:'Bank upstream supply',marker:{color:colors[0]}},{x:powers.map(label),y:powers.map(row=>(row.windows.active.positive_fixture_power_w-row.windows.active.bank_upstream_power_w)*1e6),type:'bar',name:'Positive external port work',marker:{color:colors[1]}}],{...style,height:450,barmode:'stack',yaxis:{title:{text:'Measured entire fixture (µW)'},rangemode:'tozero'}},opts);
 const cold=powers.find(row=>row.temperature_k===77&&row.channels===4),old=r.bias_power_reference.rows.find(row=>row.temperature_k===77&&row.channels===4);
 document.getElementById('power-limitation').textContent=`Cold four-load peak DUMMY error is ${fmt(cold.maximum_reference_errors_v.DUMMY*1e3,4)} mV, versus ${fmt(old.maximum_reference_errors_v.DUMMY*1e3,4)} mV with eight reservoir units. The provisional instantaneous ±2-mV screen remains a recorded miss. Quiet-reference movement stays below ${fmt(Math.max(cold.maximum_reference_errors_v.VCM_QUIET,cold.maximum_reference_errors_v.VTH_QUIET)*1e6,3)} µV. This deterministic load excursion is switching response, not random noise.`;
 const powerScopes=scopes.filter(s=>s.group==='power'||s.group==='reference');
 await selector('power-case',powerScopes,s=>`${s.group==='reference'?'Retained 8-unit':'Current 10-unit'} · ${s.name}`,async s=>{
  document.getElementById('power-note').textContent=`${s.group==='reference'?'Retained eight-unit reservoir':'Ten-unit reservoir'}: complete 5-µs noise-off port-load record. Every signal has a separate aligned time axis in this fixed overview.`;
  await scopePlot('power-scope',s);
 },Math.max(0,powerScopes.findIndex(s=>s.group==='power'&&s.name==='pex-77K-4ch')));
 const four=r.four_channel_source;
 const workingFormal=r.four_channel_ground_formal;
 const fourPhysical=r.four_channel_physical;
 document.getElementById('four-channel-note').textContent=`Modules/${four.cell}: schematic, symbol and layout have verified formal copy, complete native mask/master-tree/111-port correspondence and unchanged full CDL. Local geometry errors: ${fourPhysical.drc.cell_local_geometry_errors}; strict LVS: ${fourPhysical.strict_lvs.overall_result}, ${fourPhysical.strict_lvs.property_error_count} property errors; PEX stages completed: ${fourPhysical.completed_pex_stages}. All three phases have four 92-µm receiver branches. Four-channel electrical acceptance remains pending.`;
 if(workingFormal)document.getElementById('four-channel-note').textContent=`The maintained working return is Modules/${workingFormal.cell}. Its schematic, symbol and layout have verified native copy, complete masks/master trees/111 ports and full CDL correspondence with the checked ${workingFormal.physical_source_cell} extraction. Only the outer subcircuit identifier changes. All module geometry, connections, values and port order remain exact. The V1 baseline remains a separate comparison. Four-channel electrical acceptance remains pending beyond the bounded results below.`;
 const fourCases=d.four_channel_cases;
 document.getElementById('four-rate-results').innerHTML=fourCases.flatMap((item,index)=>{
  if(item.revision!=='ground')return [];
  const m=item.measurements,widths=m.channels.map(ch=>(ch.clock_timing.mean_edge_delays_s[5]-ch.clock_timing.mean_edge_delays_s[4])*1e9);
  return [`<tr><td><button type="button" data-rate-case="${index}">${item.id}</button></td><td>${fmt(m.temperature_k,2)}</td><td>${fmt(item.frequency_hz/1e6,0)}</td><td>${item.trim_words[5]}</td><td>${fmt(m.criteria.phase_target_s*1e9,3)} ± ${fmt(m.criteria.maximum_phase_width_error_s*1e9,3)}</td><td>${fmt(Math.min(...widths),5)}–${fmt(Math.max(...widths),5)}</td><td>${m.checks.loaded_timing?'Pass':'Outside bounds'}</td><td>${m.checks.capture&&m.checks.enable_gating?'Pass':'Outside bounds'}</td><td>${fmt(m.source_energy.total_fixture_power_w*1e6,2)}</td></tr>`];
 }).join('');
 function receiverSignals(s,i){
  const wanted=[[`INPUT_CURRENT_NA_${i}`,'Detector current (nA)'],[`SUM_${i}`,'SUM (V)'],[`CSA_OUT_${i}`,'CSA output (V)'],
   ['CLK_IN','CLK_IN (V)'],['RUN','RUN (V)'],['RESET','RESET (V)'],[`EVAL_AT_CH${i}`,'EVAL at receiver (V)'],
   [`CAPTURE_AT_CH${i}`,'CAPTURE at receiver (V)'],[`CMP_OUT_${i}`,'Comparator (V)'],[`HELD_${i}`,'HELD (V)'],
   [`FORCE_${i}`,'FORCE (V)'],[`INHIBIT_${i}`,'INHIBIT (V)'],[`EVENT_${i}`,'EVENT (V)'],
   [`PHASE_AT_CH${i}`,'PHASE at receiver (V)'],[`EN_${i}`,'EN (V)'],[`VCM_QUIET_AT_CH${i}`,'VCM quiet (V)'],
   [`VTH_QUIET_AT_CH${i}`,'VTH quiet (V)'],[`DUMMY_AT_CH${i}`,'Dummy return (V)'],[`VSS_AT_CH${i}`,'Local VSS (V)'],
   [`DVDD_AT_CH${i}`,'Local DVDD (V)'],['AVDD','AVDD (V)'],['DVDD','DVDD (V)']];
  return wanted.filter(([key])=>s.signals[key]).map(([key,name])=>({name,...s.signals[key]}));
 }
 const caseSelect=document.getElementById('four-channel-case'),channelSelect=document.getElementById('four-channel-channel');
 for(const button of document.querySelectorAll('[data-rate-case]'))button.addEventListener('click',()=>{caseSelect.value=button.dataset.rateCase;caseSelect.dispatchEvent(new Event('change'))});
 fourCases.forEach((item,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${item.id} · ${model(item.measurements)} · ${item.role}`;caseSelect.appendChild(o)});
 for(let i=0;i<4;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`Channel ${i}`;channelSelect.appendChild(o)}
 async function drawFour(){
  const item=fourCases[Number(caseSelect.value)],row=item.measurements,i=Number(channelSelect.value);
  const s=scopes.find(s=>s.group==='four_channel'&&s.dataset===item.dataset);
  const failed=Object.entries(row.checks).filter(([,v])=>!v).map(([n])=>n.replaceAll('_',' '));
  const skew=Math.max(...row.receiver_skew.filter(r=>r.cycle>=row.criteria.timing_startup_cycles).map(r=>r.maximum_edge_skew_s));
  document.getElementById('four-channel-electrical-note').textContent=`${item.id}: ${row.checks.loaded_timing?'loaded timing passes':'loaded timing outside screen'}, ${fmt(skew*1e12,3)} ps maximum receiver edge skew. ${failed.length?'Recorded screens outside bounds: '+failed.join(', ')+'.':'All bounded control screens pass.'} ${fmt(row.source_energy.total_fixture_power_w*1e6,2)} µW whole fixture; ${fmt(row.source_energy.total_per_actual_channel_power_w*1e6,2)} µW averaged over its four actual channels, including all shared support. ${row.source_energy.complete_clock_cycles} complete supply-work cycles. Requested / observed threads: ${row.requested_execution.requested_threads} / ${row.actual_threads}. ${row.native_timing.join(' ')}`;
  if(row.ideal_ground_normalization)document.getElementById('four-channel-electrical-note').textContent+=` The ideal VSS reference normalizes ${row.ideal_ground_normalization.applied_v} V to exactly zero; all other ${row.initial_scalars-1} parsed starting scalars agree exactly.`;
  document.getElementById('four-channel-results').innerHTML=row.channels.map(ch=>`<tr><td>${ch.channel}</td><td>${fmt(ch.input_charge_c*1e15,4)}</td><td>${ch.enable_pulses} / ${ch.returns_before_input}</td><td>${fmt(ch.csa.maximum_from_initial_v*1e3,4)}</td><td>${fmt(ch.actual_receiver_references.VCM_QUIET.maximum_from_initial_v*1e3,4)} / ${fmt(ch.actual_receiver_references.VTH_QUIET.maximum_from_initial_v*1e3,4)}</td><td>${fmt((ch.clock_timing.mean_edge_delays_s[5]-ch.clock_timing.mean_edge_delays_s[4])*1e9,5)}</td></tr>`).join('');
  const summary=Array.from({length:4},(_,n)=>({name:`CH${n} CSA output (V)`,...s.signals['CSA_OUT_'+n]}));
  await scopePlot('four-channel-comparison',{...s,signals:summary});
  await scopePlot('four-channel-scope',{...s,signals:receiverSignals(s,i)});
  window.MIM_FOUR_VIEW={dataset:item.id,channel:i,window:s.window_us,accepted:row.complete_channel_accepted};
 }
 const redrawFour=()=>drawFour().catch(e=>window.MIM_ERRORS.push(String(e)));
 caseSelect.addEventListener('change',redrawFour);channelSelect.addEventListener('change',redrawFour);
 if(fourCases.length)await drawFour();
 const pair=r.four_channel_warm_pair;
 if(pair){
  const quiet=pair.channels.filter(c=>!c.active_channel);
  const maximum=Math.max(...quiet.map(c=>c.active_minus_quiet['CSA_OUT_'+c.channel].maximum_absolute_delta_v));
  const changed=quiet.reduce((sum,c)=>sum+Math.abs(c.count_difference),0);
  document.getElementById('four-channel-pair-note').textContent=`Room factory model: the active 0.8-fC input changes the three quiet CSA outputs by at most ${fmt(maximum*1e3,4)} mV, with ${changed} additional quiet-channel replenishments. Pre-input waveforms agree exactly on the saved axes. ${pair.all_quiet_paired_analogue_screens_passed?'All provisional paired analogue screens pass.':'A provisional paired analogue screen is outside bounds.'} The larger absolute movement is also present in the all-quiet clocked control.`;
  const s=scopes.find(s=>s.group==='four_channel_pair');
  await scopePlot('four-channel-pair',{...s,name:'one-active minus all-quiet',signals:Array.from({length:4},(_,i)=>({name:`CH${i} active minus quiet (µV)`,...s.signals['CSA_ACTIVE_MINUS_QUIET_UV_'+i]}))});
 }
 if(r.four_channel_ground_physical){
  const old=Math.max(...r.four_channel_base_resistance.clock_to_csa_transfer_resistance_ohm.flat());
  const next=Math.max(...r.four_channel_ground_resistance.clock_to_csa_transfer_resistance_ohm.flat());
  document.getElementById('four-channel-ground-note').textContent=`The all-quiet baseline shows about 5 mV of local CSA-ground switching movement. Its extracted static clock-to-CSA return resistance is ${fmt(old,4)} Ω. The working return revision reduces that to ${fmt(next,4)} Ω (${fmt((1-next/old)*100,2)}%), with no change to transistor layouts or external bias settings. The diagnostic retains every native resistor, merges only actual positional port aliases, and checks current conservation, reciprocity and power balance. It is a static resistor-graph calculation, not a transient or substrate-isolation measurement. The revised full-PEX transient must establish the actual frontend improvement.`;
 }
 const calibrated=r.four_channel_ground_warm_calibration;
 const coldCalibrated=r.four_channel_ground_cold_calibration;
 const warm10Calibrated=r.four_channel_ground_warm10_calibration;
 if(calibrated){
  const calibrations=[calibrated,coldCalibrated,warm10Calibrated].filter(Boolean);
  document.getElementById('four-calibration-results').innerHTML=calibrations.flatMap(record=>record.channels.map(ch=>`<tr><td>${fmt(record.temperature_k,2)} K</td><td>${fmt(record.frequency_hz/1e6,0)}</td><td>${ch.channel}</td><td>${fmt(ch.frozen_constants.effective_feedback_f*1e15,4)}</td><td>${fmt(ch.frozen_constants.packet_charge_c*1e15,6)}</td><td>${fmt(ch.frozen_constants.packet_charge_c/1.602176634e-19,2)}</td><td>${fmt(ch.holdout_errors.input_charge_c*1e15,6)} / ${fmt(ch.holdout_errors.return_charge_c*1e15,6)}</td><td>${ch.accepted_calibration?'Pass':'Outside bounds'}</td></tr>`)).join('');
  document.getElementById('four-calibration-note').textContent=calibrations.map(record=>`${fmt(record.temperature_k,2)} K, ${fmt(record.frequency_hz/1e6,0)} MHz: all four training-only endpoint calibrations and untouched input/forced-return holdouts pass. ${record.protocol.clock_cycles} continuous clocks; ${fmt(record.source_energy.total_fixture_power_w*1e6,2)} µW whole fixture over ${record.source_energy.complete_clock_cycles} complete power periods, or ${fmt(record.source_energy.total_per_actual_channel_power_w*1e6,2)} µW per actual channel including shared overhead. Requested / observed threads: ${record.requested_execution.requested_threads} / ${record.actual_threads}. ${record.native_timing.join(' ')}`).join(' ')+` The 50-MHz room calibration uses the accepted matching full/HPA control. Room 10-MHz and cold calibrations use the complete unreduced extraction. The two inherited cold junction warnings remain in provenance. The independent room/cold simultaneous automatic transfers follow below; detector/noise and other-rate qualification remain open.`;
  const select=document.getElementById('four-calibration-channel'),temperature=document.getElementById('four-calibration-temperature'),details=document.getElementById('four-calibration-waveforms');
  temperature.querySelector('option[value="cold"]').disabled=!coldCalibrated;
  temperature.querySelector('option[value="warm10"]').disabled=!warm10Calibrated;
  for(let i=0;i<4;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`Channel ${i}`;select.appendChild(o)}
  async function drawCalibration(){
   const mode=temperature.value,s=await window.QPIX_PLOTS.load(mode==='cold'?d.cold_calibration_scope:mode==='warm10'?d.warm10_calibration_scope:d.calibration_scope),i=Number(select.value);
   await scopePlot('four-calibration-scope',{...s,dataset:`${mode}-four-channel-calibration`,name:`${mode} channel ${i}`,signals:receiverSignals(s,i)});
   window.MIM_CALIBRATION_VIEW={mode,channel:i,window:s.window_us};
  }
  const redraw=()=>drawCalibration().catch(e=>window.MIM_ERRORS.push(String(e)));
  details.addEventListener('toggle',()=>{if(details.open)redraw()});select.addEventListener('change',redraw);temperature.addEventListener('change',redraw);
 }
 const automatic=r.four_channel_ground_warm_automatic;
 const coldAutomatic=r.four_channel_ground_cold_automatic;
 const warm10Automatic=r.four_channel_ground_warm10_automatic;
 const warm10NormalAutomatic=r.four_channel_ground_warm10normal_automatic;
 if(automatic){
  const transfers=[automatic,coldAutomatic,warm10Automatic,warm10NormalAutomatic].filter(Boolean);
  const protocol=record=>record===warm10NormalAutomatic?'Staggered · normal scale':record===warm10Automatic?'Simultaneous · forced scale':'Simultaneous';
  document.getElementById('four-automatic-results').innerHTML=transfers.flatMap(record=>record.channels.map(ch=>`<tr><td>${fmt(record.temperature_k,2)} K</td><td>${fmt(record.frequency_hz/1e6,0)}</td><td>${protocol(record)}</td><td>${ch.channel}</td><td>${fmt(ch.frozen_constants.packet_charge_c*1e15,6)}</td><td>${fmt(ch.ledger.known_input_charge_c*1e15,4)}</td><td>${ch.ledger.operations}</td><td>${fmt(ch.ledger.count_only_charge_c*1e15,6)}</td><td>${fmt(ch.ledger.analog_residual_charge_c*1e15,6)}</td><td>${fmt(ch.ledger.closure_error_c*1e15,6)}</td><td>${ch.accepted_automatic_transfer?'Pass':'Outside bounds'}</td></tr>`)).join('');
  document.getElementById('four-automatic-note').textContent=transfers.map(record=>`${fmt(record.temperature_k,2)} K, ${fmt(record.frequency_hz/1e6,0)} MHz, ${protocol(record)}: ${record.accepted_automatic_transfer?"all four transfers pass the declared checks":"the retained fixed-scale holdout misses charge closure while timing/capture/gating/settling pass"} with frozen independent calibration. No gain or quantum is refitted to this holdout. ${fmt(record.source_energy.total_fixture_power_w*1e6,2)} µW whole fixture over ${record.source_energy.complete_clock_cycles} complete periods, or ${fmt(record.source_energy.total_per_actual_channel_power_w*1e6,2)} µW per actual channel including shared overhead. Requested / observed threads: ${record.requested_execution.requested_threads} / ${record.actual_threads}. ${record.native_timing.join(' ')}`).join(' ');
  if(warm10NormalAutomatic){
   const training=warm10NormalAutomatic.normal_scale;
   document.getElementById('four-normal-scale-results').innerHTML=training.channels.map(ch=>`<tr><td>${ch.channel}</td><td>${fmt(ch.training_input_charge_c*1e15,4)}</td><td>${ch.training_returns}</td><td>${fmt(ch.forced_packet_charge_c*1e15,6)}</td><td>${fmt(ch.packet_charge_c*1e15,6)}</td></tr>`).join('');
   document.getElementById('four-normal-scale-note').textContent=`The known 4-fC simultaneous record trains q during normal feedback; independent forced calibration supplies Ceff. The unseen 8-fC staggered holdout gives 16 returns per receiver, with maximum absolute diagnostic error ${fmt(Math.max(...warm10NormalAutomatic.channels.map(ch=>Math.abs(ch.ledger.closure_error_c)))*1e15,6)} fC. All source, loaded-timing, capture/gating, range and settled-endpoint checks pass. The original 0.03-fC limit remains unchanged. Short post-return drift is not extrapolated, and no gain or timing is fitted to the detector event.`;
  }
  const powerNames={startup:'Clock startup',idle:'Before input',signal:'Input interval',recovery:'Recovery'};
  document.getElementById('four-automatic-power').innerHTML=transfers.flatMap(record=>Object.entries(record.power_windows.windows).map(([name,p])=>`<tr><td>${fmt(record.temperature_k,2)} K</td><td>${fmt(record.frequency_hz/1e6,0)}</td><td>${protocol(record)}</td><td>${powerNames[name]}<br>${p.window_s.map(v=>fmt(v*1e6,4)).join('–')} µs</td><td>${p.complete_clock_cycles}</td><td>${fmt(p.upstream_rail_power_w.AVDD*1e6,2)}</td><td>${fmt(p.upstream_rail_power_w.DVDD*1e6,2)}</td><td>${fmt(p.total_fixture_power_w*1e6,2)}</td><td>${fmt(p.total_per_actual_channel_power_w*1e6,2)}</td><td>${p.total_replenishments}</td><td>${p.whole_fixture_energy_per_replenishment_j===null?'—':fmt(p.whole_fixture_energy_per_replenishment_j*1e12,3)}</td></tr>`)).join('');
  const select=document.getElementById('four-automatic-channel'),temperature=document.getElementById('four-automatic-temperature'),details=document.getElementById('four-automatic-waveforms');
  temperature.querySelector('option[value="cold"]').disabled=!coldAutomatic;
  temperature.querySelector('option[value="warm10"]').disabled=!warm10Automatic;
  temperature.querySelector('option[value="warm10normal"]').disabled=!warm10NormalAutomatic;
  for(let i=0;i<4;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`Channel ${i}`;select.appendChild(o)}
  async function drawAutomatic(){
   const mode=temperature.value,s=await window.QPIX_PLOTS.load(mode==='warm'?d.automatic_scope:d[mode+'_automatic_scope']),i=Number(select.value);
   await scopePlot('four-automatic-scope',{...s,dataset:`${mode}-four-channel-transfer`,name:`${mode} channel ${i}`,signals:receiverSignals(s,i)});
   window.MIM_AUTOMATIC_VIEW={mode,channel:i,window:s.window_us};
  }
  const redraw=()=>drawAutomatic().catch(e=>window.MIM_ERRORS.push(String(e)));
  details.addEventListener('toggle',()=>{if(details.open)redraw()});select.addEventListener('change',redraw);temperature.addEventListener('change',redraw);
 }
 const noisePilots=d.noise_pilots||[];
 if(noisePilots.length){
  const observations=noisePilots.flatMap(p=>p.record.rows.map(row=>({pilot:p,row})));
  document.getElementById('four-noise-results').innerHTML=observations.flatMap(({pilot:p,row})=>row.channels.map(ch=>{
   const q=ch.paired_charge_ledger;
   return `<tr><td>${fmt(p.record.temperature_k,2)} K · ${fmt(p.record.frequency_hz/1e6,0)} MHz</td><td>${row.noise_scale===1?'Native noise':'Near-zero control'}</td><td>${ch.channel}</td><td>${row.noise_scale===1?'One-seed record':ch.numerical_control_agreement_passed?'Pass':'Outside bounds'}</td><td>${fmt(q.packet_bins.rms_charge_difference_c*1e15,6)}</td><td>${q.noise_on_enable_pulses-q.noise_off_enable_pulses}</td><td>${fmt(q.rms_diagnostic_increment_c*1e15,6)}</td><td>${fmt(q.detector_storage.rms_increment_difference_c*1e15,6)}</td><td>${fmt(row.source_energy.total_fixture_power_w*1e6,3)}</td></tr>`;
  })).join('');
  const cases=document.getElementById('four-noise-case'),channels=document.getElementById('four-noise-channel'),details=document.getElementById('four-noise-waveforms');
  observations.forEach(({pilot:p,row},i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${fmt(p.record.temperature_k,2)} K · ${fmt(p.record.frequency_hz/1e6,0)} MHz · ${row.name}`;cases.appendChild(o)});
  cases.value=String(Math.max(0,observations.findIndex(v=>v.row.noise_scale===1)));
  for(let i=0;i<4;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`Receiver ${i}`;channels.appendChild(o)}
  const rows=[['INPUT_CURRENT_NA','Detector current (nA)'],['CSA_OUT','CSA output (V)'],['CSA_OUT_BASELINE','Matched noise-off CSA (V)'],['CSA_DELTA_UV','CSA change (µV)'],
   ...['SUM','DUMMY','VCM_QUIET','VTH_QUIET','CSA_VPB','CMP_NBIAS','DAC_VPB'].map(n=>[n,n+' (V)']),
   ...['CLK_IN','RUN','RESET','EVAL','CAPTURE','CMP_OUT','HELD','FORCE','INHIBIT','EVENT','PHASE','EN'].map(n=>[n,n+' logic (0/1)']),
   ['COUNT_ONLY_DELTA_FC','Count-only change (fC)'],['DETECTOR_STORAGE_DELTA_FC','Detector storage change (fC)']];
  const describe=({pilot:p,row})=>{const n=row.actual_noise;
   return `${fmt(p.record.temperature_k,2)} K / ${fmt(p.record.frequency_hz/1e6,0)} MHz: requested ${fmt(n.requested_minimum_frequency_hz/1e3,3)} kHz–${fmt(n.requested_maximum_frequency_hz/1e6,1)} MHz; actual ${fmt(n.native_reported.noisefmin/1e3,3)} kHz–${fmt(n.native_reported.noisefmax/1e6,1)} MHz, seed ${n.seed}. ${n.band_matches_request?'The reported band matches the request.':'The actual lower colored-noise corner is outside the requested band; low-frequency qualification remains open.'} ${fmt(row.source_energy.total_fixture_power_w*1e6,3)} µW whole fixture over ${row.source_energy.complete_clock_cycles} complete periods, or ${fmt(row.source_energy.total_per_actual_channel_power_w*1e6,3)} µW per actual receiver including shared support. ${row.native_timing.join(' ')}`;};
  document.getElementById('four-noise-note').textContent=observations.map(describe).join(' ');
  async function drawNoise(){
   const {pilot:p,row}=observations[Number(cases.value)],i=Number(channels.value);
   const s=scopes.find(s=>s.group==='four_channel_noise'&&s.dataset===p.id&&s.name===row.name&&s.channel===i);
   await scopePlot('four-noise-scope',{...s,name:`${row.name} / receiver ${i}`,signals:rows.map(([key,name])=>({name,...s.signals[key],logicEdges:s.logic[key]}))});
   window.MIM_NOISE_VIEW={mode:p.id,name:row.name,channel:i,rows:rows.length,window:s.window_us};
  }
  const redraw=()=>drawNoise().catch(e=>window.MIM_ERRORS.push(String(e)));
  details.addEventListener('toggle',()=>{if(details.open)redraw()});cases.addEventListener('change',redraw);channels.addEventListener('change',redraw);
 }else document.getElementById('four-noise-note').textContent='The four-receiver noise pair is not yet published. Original single-core noise pilots remain separate evidence; they do not qualify this coupled assembly.';
 document.getElementById('provenance').textContent=JSON.stringify({native:{clock:r.clock_native,bias:r.bias_native},formal:{clock:r.clock_formal,bias:r.bias_formal},clock:d.clock,coldDcInitializationLimit:r.clock_dc_failure,coldDcControls:r.clock_dc_controls,biasOpac:r.bias_opac,biasStartup:r.bias_startup,biasPower:r.bias_power,fourChannel:{source:four,placement:r.four_channel_floorplan,inventory:r.four_channel_inventory,routing:r.four_channel_routing,physical:fourPhysical,workingFormal,workingFormalMasks:r.four_channel_ground_formal_masks,warmCalibration:calibrated,coldCalibration:coldCalibrated,warm10Calibration:warm10Calibrated,warmAutomatic:automatic,coldAutomatic:coldAutomatic,warm10Automatic:warm10Automatic,warm10NormalAutomatic:warm10NormalAutomatic,noisePilots,coldNumerical:r.four_channel_ground_cold_numerical},files:d.provenance},null,2);
 window.MIM_STATUS={ready:true,errors:window.MIM_ERRORS,views,clockObservations:d.clock.length,opacCases:r.bias_opac.rows.length,startupCases:r.bias_startup.rows.length,powerCases:powers.length,fourChannelCases:fourCases.length};
});
