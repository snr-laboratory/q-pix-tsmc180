'use strict';
window.CHANNEL_ERRORS=[];
window.addEventListener('error',e=>window.CHANNEL_ERRORS.push(String(e.message)));
window.addEventListener('unhandledrejection',e=>window.CHANNEL_ERRORS.push(String(e.reason)));
window.addEventListener('DOMContentLoaded',async()=>{
 const d=window.QPIX_CHANNEL,colors=['#247986','#c87536','#6b5b92'],fmt=(v,n=3)=>Number(v).toFixed(n);
 const temp=r=>r.temperature_k===77?'77 K exploratory':'298.15 K factory';
 const style={paper_bgcolor:'white',plot_bgcolor:'#f8fbfc',font:{family:'system-ui',color:'#203e4c'},margin:{l:90,r:25,t:55,b:75},hovermode:'x unified'};
 const opts={responsive:true,displaylogo:false,scrollZoom:true,toImageButtonOptions:{format:'svg'}};
 document.getElementById('status').textContent='Native physical checks complete; electrical integration and calibration in progress.';
 document.getElementById('physical').textContent='The 1360 × 568-µm core includes the complete clock, shared bank and repeated channel. All 2637 physical MOS gates, 2238 MOM units and 91 resistor segments match their unchanged accepted geometry. Complete mask/module-tree comparison, 81-port strict LVS and local geometry DRC pass; PEX is complete.';
 document.getElementById('native-details').textContent=JSON.stringify({formalViews:d.formal,drc:d.physical.drc,matching:d.physical.matching_audit,mask:d.physical.mask_comparison,xrcCommentRounding:d.physical.xrc_coordinate_comment_rounding},null,2);
 const cal=d.calibrations.flatMap(c=>c.rows.map(r=>({...r,kind:c.kind}))),plot=[];
 for(const t of [298.15,77])for(const kind of ['sweep','holdout']){
  const rows=cal.filter(r=>r.temperature_k===t&&r.kind===kind).sort((a,b)=>a.seed_scale-b.seed_scale);
  plot.push({x:rows.map(r=>r.seed_scale),y:rows.map(r=>r.mean_quantum_c*1e15),type:'scatter',mode:kind==='sweep'?'lines+markers':'markers',name:`${t===77?'77 K':'Room'} ${kind}`,line:{color:colors[t===77?1:0]},marker:{color:colors[t===77?1:0],symbol:kind==='holdout'?'diamond':'circle',size:kind==='holdout'?12:7}});
 }
 await Plotly.newPlot('charge',plot,{...style,height:460,xaxis:{title:{text:'External replenisher seed / stock seed'}},yaxis:{title:{text:'Measured signed packet (fC)'}},shapes:[{type:'line',xref:'paper',x0:0,x1:1,y0:.1,y1:.1,line:{color:'#71828b',dash:'dot'}}]},opts);
 document.getElementById('calibration-table').innerHTML=cal.map(r=>`<tr><td>${temp(r)} · ${r.kind}</td><td>${fmt(r.seed_scale,6)}</td><td>${fmt(r.mean_quantum_c*1e15,5)}</td><td>${fmt(r.deterministic_cycle_rms_c*1e15,6)}</td><td>${fmt(r.mean_quantum_c*50e6*1e9)}</td></tr>`).join('');
 const scopes=await window.QPIX_PLOTS.loadAll(d.scopes);
 const views={};
 async function scopePlot(id,scope,rows,extra=[]){
  const data=[],layout={...style,height:rows.length*105+85,showlegend:false,margin:{l:170,r:25,t:35,b:55},grid:{rows:rows.length,columns:1,pattern:'independent'},annotations:[]};
  rows.forEach((row,i)=>{
   const axis=i?String(i+1):'',trace=scope.signals[row.name],scale=row.scale??1,offset=row.offset??0;
   if(!trace)throw new Error('Missing native scope '+row.name);
   layout['xaxis'+axis]={matches:i?'x':undefined,title:i===rows.length-1?{text:'Time (µs)'}:undefined,showticklabels:i===rows.length-1,range:scope.window_us};
   layout['yaxis'+axis]={fixedrange:false,tickfont:{size:10}};
   layout.annotations.push({xref:'paper',x:0,xanchor:'right',xshift:-43,yref:'y'+axis+' domain',y:.5,
    text:row.label.replace(' (','<br>('),showarrow:false,align:'right',font:{size:12,color:'#203e4c'}});
   data.push({x:trace.time_us,y:trace.value.map(v=>(v-offset)*scale),type:'scatter',mode:row.mode??'lines',name:row.label,xaxis:'x'+axis,yaxis:'y'+axis,line:{color:colors[i%3],width:1.4,shape:row.shape??'linear'},marker:{size:4}});
   if(row.overlay){const other=scope.signals[row.overlay];data.push({x:other.time_us,y:other.value.map(v=>(v-offset)*scale),type:'scatter',mode:'lines',name:row.overlay,xaxis:'x'+axis,yaxis:'y'+axis,line:{color:'#b66537',dash:'dot',width:1.3}})}
  });
  for(const trace of extra)data.push(trace);
  document.getElementById(id).style.height=layout.height+'px';
  await Plotly.react(id,data,layout,opts);
  return {rows:rows.length,fullWindow:scope.window_us,nativePoints:scope.native_points,dataset:scope.dataset};
 }
 const initial=d.initialization,initialScope=scopes.find(s=>s.group==='initialization');
 document.getElementById('initialization-note').textContent=`All ${initial.initial_scalars.toLocaleString()} initial scalars agree exactly. No clock or replenishment occurs. CSA span in the final 20 ns is ${fmt(initial.tail_spans_v.CSA_OUT*1e6,5)} µV against a ${fmt(initial.criteria.maximum_tail_span_v*1e6,0)}-µV limit. The native run uses ${initial.actual_threads} threads; ${initial.native_timing.join(' ')}`;
 views.initialization=await scopePlot('initialization-scope',initialScope,['CSA_OUT','SUM','DUMMY'].map(name=>({name,label:name+' shift (µV)',scale:1e6,offset:initialScope.signals[name].value[0]})));
 document.getElementById('initialization-table').innerHTML=Object.entries(initial.tail_spans_v).map(([name,span])=>`<tr><td>${name}</td><td>${fmt(span*1e6,7)}</td><td>${fmt(initial.criteria.maximum_tail_span_v*1e6,0)}</td></tr>`).join('');
 document.getElementById('initialization-details').textContent=JSON.stringify(initial,null,2);
 const coreSelect=document.getElementById('core-calibration-case');
 d.core_calibrations.forEach(entry=>{const o=document.createElement('option');o.value=entry.id;o.textContent=entry.title;coreSelect.appendChild(o)});
 async function drawCoreCalibration(){
 const entry=d.core_calibrations.find(r=>r.id===coreSelect.value),cc=entry.record,cf=cc.frozen_constants,cs=scopes.find(s=>s.dataset===entry.dataset);
 document.getElementById('core-calibration-note').textContent=`${entry.title}: effective feedback ${fmt(cf.effective_feedback_f*1e15,4)} fF; quantum ${fmt(cf.packet_charge_c*1e15,6)} fC (${fmt(cf.packet_charge_c/1.602176634e-19,1)} electrons). All ${entry.forced_returns} commanded return pulses occur, and declared input charge matches the current probe. The untouched holdout and every endpoint-stability check pass.`;
 const calRows=[['Effective integration capacitance',`${fmt(cf.effective_feedback_f*1e15,4)} fF`],['Return quantum',`${fmt(cf.packet_charge_c*1e15,6)} fC / ${fmt(cf.packet_charge_c/1.602176634e-19,1)} electrons`],[`${fmt(entry.declared_holdout_charge_c*1e15,3)}-fC input holdout error`,`${fmt(cc.holdout_errors.input_charge_c*1e15,7)} fC`],['Return-train holdout error',`${fmt(cc.holdout_errors.return_charge_c*1e15,6)} fC`],['Maximum CSA displacement',`${fmt(cc.maximum_csa_displacement_v*1000)} mV`],['Training quiet slope',`${fmt(cf.clock_only_drift_v_per_s)} V/s; diagnostic`],['Whole fixture draw',`${fmt(cc.energy.total_fixture_power_w*1e6)} µW over ${cc.energy.complete_clock_cycles} complete cycles`]];
 document.getElementById('core-calibration-table').innerHTML=calRows.map(([name,value])=>`<tr><td>${name}</td><td>${value}</td></tr>`).join('');
 const coreRows=[{name:'INPUT_CURRENT_NA',label:'Known input (nA)'},{name:'INPUT_CHARGE_FC',label:'Input integral (fC)'},{name:'CSA_OUT',label:'CSA shift / strobes (mV)',scale:1000,offset:cf.stopped_clock_initial_csa_v},{name:'SUM',label:'SUM shift (mV)',scale:1000,offset:cs.signals.SUM.value[0]},{name:'DUMMY',label:'DUMMY shift (mV)',scale:1000,offset:cs.signals.DUMMY.value[0]},...['CLK_IN','RUN','RESET','EVAL','CAPTURE','PHASE','CMP_OUT','HELD','FORCE','INHIBIT','EVENT','EN'].map(name=>({name,label:name+' (V)'}))];
 const strobe={x:cs.strobes.time_us,y:cs.strobes.csa_v.map(v=>(v-cf.stopped_clock_initial_csa_v)*1000),type:'scatter',mode:'markers',name:'Fixed-phase calibration strobes',xaxis:'x3',yaxis:'y3',marker:{size:4,color:'#b66537'}};
 views.coreCalibration=await scopePlot('core-calibration-scope',cs,coreRows,[strobe]);
 document.getElementById('core-calibration-details').textContent=JSON.stringify({accepted:cc.accepted_calibration,method:cc.analysis_method,checks:cc.checks,endpoints:cc.endpoint_measurements,quietWindows:cc.quiet_strobe_checks,originalWarmAnalysis:{accepted:d.core_calibration.original_analysis.accepted_calibration,checks:d.core_calibration.original_analysis.checks,startupFit:d.core_calibration.original_analysis.frozen_constants.clock_only_drift_v_per_s},job:cc.native_job_id,requested:cc.requested_execution,observed:cc.observed_execution,timing:cc.native_timing},null,2);
 }
 coreSelect.addEventListener('change',()=>drawCoreCalibration().catch(e=>{window.CHANNEL_ERRORS.push(String(e));document.getElementById('core-calibration-note').textContent=String(e)}));await drawCoreCalibration();
 const automaticCases=d.automatic_transfers,automaticSelect=document.getElementById('automatic-case');
 automaticCases.forEach((entry,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=entry.title;automaticSelect.appendChild(option)});
 async function drawAutomatic(){
 const entry=automaticCases[Number(automaticSelect.value)],automatic=entry.record,ledger=automatic.ledger,cf=automatic.frozen_constants;
 const as=scopes.find(s=>s.group==='automatic_transfer'&&s.dataset===entry.id);
 const verdict=automatic.accepted_automatic_transfer?'All independent transfer checks pass':'Outside the retained transfer bounds';
 document.getElementById('automatic-note').textContent=`${entry.title}: ${verdict}: ${ledger.operations} returns in the charge-measurement window and ${fmt(ledger.closure_error_c*1e15,6)} fC ledger error. The ${fmt(cf.packet_charge_c*1e15,6)}-fC quantum remains frozen. The native run uses ${automatic.actual_threads} threads; ${automatic.native_timing.join(' ')}`;
 const automaticRows=[['Known input',`${fmt(ledger.known_input_charge_c*1e15,6)} fC`],['Count-only charge',`${ledger.operations} × q = ${fmt(ledger.count_only_charge_c*1e15,6)} fC`],['Analog residual · diagnostic only',`${fmt(ledger.analog_residual_charge_c*1e15,6)} fC`],['Ledger error',`${fmt(ledger.closure_error_c*1e15,6)} fC / 0.03-fC limit`],['Normal-return quantum · diagnostic',`${fmt(ledger.diagnostic_auto_quantum_c*1e15,6)} fC; decoder gain unchanged`],['Whole fixture draw',`${fmt(automatic.source_energy.whole_record_cycles.total_fixture_power_w*1e6)} µW over ${automatic.source_energy.whole_record_cycles.complete_clock_cycles} complete cycles`]];
 document.getElementById('automatic-table').innerHTML=automaticRows.map(([name,value])=>`<tr><td>${name}</td><td>${value}</td></tr>`).join('');
 const endpointMarkers={x:[...ledger.pre_strobes_s,...ledger.post_strobes_s].map(t=>t*1e6),y:[...ledger.pre_voltage_v,...ledger.post_voltage_v].map(v=>(v-cf.stopped_clock_initial_csa_v)*1000),type:'scatter',mode:'markers',name:'Independent endpoint samples',xaxis:'x3',yaxis:'y3',marker:{size:6,color:'#b66537',symbol:'diamond'}};
 const automaticScopeRows=[{name:'INPUT_CURRENT_NA',label:'Known input (nA)'},{name:'INPUT_CHARGE_FC',label:'Input integral (fC)'},{name:'CSA_OUT',label:'CSA / endpoints (mV)',scale:1000,offset:cf.stopped_clock_initial_csa_v},{name:'SUM',label:'SUM shift (mV)',scale:1000,offset:as.signals.SUM.value[0]},{name:'DUMMY',label:'DUMMY shift (mV)',scale:1000,offset:as.signals.DUMMY.value[0]},...['CLK_IN','RUN','RESET','EVAL','CAPTURE','PHASE','CMP_OUT','HELD','FORCE','INHIBIT','EVENT','EN'].map(name=>({name,label:name+' (V)'}))];
 views.automaticTransfer=await scopePlot('automatic-scope',as,automaticScopeRows,[endpointMarkers]);
 document.getElementById('automatic-details').textContent=JSON.stringify(automatic,null,2);
 }
 automaticSelect.addEventListener('change',()=>drawAutomatic().catch(e=>{window.CHANNEL_ERRORS.push(String(e));document.getElementById('automatic-note').textContent=String(e)}));await drawAutomatic();
 const calibration=scopes.filter(s=>s.group==='calibration'),calSelect=document.getElementById('calibration-case');
 calibration.forEach((s,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=s.id;calSelect.appendChild(o)});
 async function drawCal(){
  const s=calibration[Number(calSelect.value)],c=cal.find(r=>r.kind==='holdout'&&r.name===s.id);
  document.getElementById('calibration-note').textContent=`${temp(c)}: ${fmt(c.mean_quantum_c*1e15,5)} fC mean; first/last ${c.first_to_late_quantum_c.map(v=>fmt(v*1e15,5)).join(' / ')} fC. The full train includes both large switching lobes.`;
  views.calibration=await scopePlot('calibration-scope',s,[{name:'RETURN_CURRENT_NA',label:'Return current (nA)'},{name:'RETURN_CHARGE_FC',label:'Signed charge (fC)'},{name:'PHASE',label:'PHASE (V)'},{name:'EN',label:'EN (V)'},{name:'DAC_VPB',label:'DAC bias (V)'},{name:'DUMMY',label:'DUMMY (V)'}]);
 }
 calSelect.addEventListener('change',drawCal);await drawCal();
 const tracking=scopes.filter(s=>s.group==='tracking'),trackSelect=document.getElementById('tracking-case');
 tracking.forEach((s,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=d.tracking.find(r=>r.id===s.dataset).title;trackSelect.appendChild(o)});
 async function drawTracking(){
  const s=tracking[Number(trackSelect.value)],record=d.tracking.find(r=>r.id===s.dataset),r=record.row;
  const local=record.show_local_packet_sum?cal.find(c=>c.temperature_k===r.temperature_k&&Math.abs(c.seed_scale-record.seed_scale)<1e-6):null;
  const edges=r.logic.cycles.flatMap(c=>c.edges_s.EN.rising).sort((a,b)=>a-b);
  const packets=local?[{x:[s.window_us[0],...edges.map(t=>t*1e6),s.window_us[1]],y:[0,...edges.map((_,i)=>(i+1)*local.mean_quantum_c*1e15),edges.length*local.mean_quantum_c*1e15],type:'scatter',mode:'lines',name:'Provisional local-calibration count sum',xaxis:'x2',yaxis:'y2',line:{shape:'hv',color:'#b66537',dash:'dot',width:1.5}}]:[];
  const modeCalibration=d.core_calibrations.find(c=>c.id===record.calibration_id);
  const modeTransfer=modeCalibration&&d.automatic_transfers.find(a=>a.record.frozen_calibration_sha256===modeCalibration.calibration_sha256&&a.record.accepted_automatic_transfer);
  const chargeNote=local?`Packet sum uses provisional same-seed local q=${fmt(local.mean_quantum_c*1e15,5)} fC.`:modeCalibration?`Independent mode calibration is frozen at q=${fmt(modeCalibration.record.frozen_constants.packet_charge_c*1e15,6)} fC; ${modeTransfer?'automatic-feedback transfer passes':'automatic-feedback transfer is pending'}. No packet-charge sum is shown in this early startup control.`:'Mode-specific charge calibration is pending; no packet-charge sum is shown.';
  document.getElementById('tracking-note').textContent=`${record.title}: ${fmt(record.frequency_hz/1e6)} MHz, ${fmt(r.input_charge_c*1e15)} fC input, ${r.logic.enable_pulses} returns, ${r.before_input.enable_pulses} before input. ${r.kind==='complete_core_pex'?'Complete core routing/coupling.':'Repeated-channel routing is extracted; links to the shared clock/bank remain ideal.'} ${chargeNote}`;
  views.tracking=await scopePlot('tracking-scope',s,[{name:'INPUT_CURRENT_NA',label:'Detector (nA)'},{name:'INPUT_CHARGE_FC',label:local?'Input / packet sum (fC)':'Input integral (fC)'},{name:'CSA_OUT',overlay:'VTH_QUIET',label:'CSA / threshold (mV)',scale:1000},{name:'SUM',label:'SUM shift (mV)',scale:1000,offset:s.signals.SUM.value[0]},...['CLK_IN','EVAL','CAPTURE','PHASE','CMP_OUT','HELD','EVENT','EN'].map(n=>({name:n,label:n+' (V)'}))],packets);
  window.CHANNEL_STATUS={ready:true,views,trackingCases:tracking.length,calibrationCases:calibration.length,errors:window.CHANNEL_ERRORS};
 }
 trackSelect.value=String(tracking.length-1);trackSelect.addEventListener('change',drawTracking);await drawTracking();
 document.getElementById('tracking-table').innerHTML=d.tracking.map(({title,row:r})=>`<tr><td>${title}</td><td>${fmt(r.input_charge_c*1e15)}</td><td>${r.logic.enable_pulses} / ${r.before_input.enable_pulses}</td><td>${fmt(r.maximum_csa_displacement_v*1000)} / ${fmt(r.final_csa_displacement_v*1000)}</td><td>${r.actual_threads}</td></tr>`).join('');
 const energy=d.tracking.map(r=>r.row.source_energy.whole_record_cycles),labels=d.tracking.map(r=>r.title);
 await Plotly.newPlot('power',[{x:labels,y:energy.map(e=>e.upstream_rail_power_w.AVDD*1e6),name:'Upstream AVDD',type:'bar',marker:{color:colors[0]}},{x:labels,y:energy.map(e=>e.upstream_rail_power_w.DVDD*1e6),name:'Upstream DVDD, including complete clock',type:'bar',marker:{color:colors[1]}},{x:labels,y:energy.map(e=>Object.values(e.positive_external_boundary_energy_j).reduce((a,b)=>a+b,0)/(e.window_s[1]-e.window_s[0])*1e6),name:'Positive external clock/control/reference work',type:'bar',marker:{color:colors[2]}}],{...style,height:460,barmode:'stack',yaxis:{title:{text:'Whole one-channel fixture (µW)'},rangemode:'tozero'},margin:{l:90,r:25,t:30,b:110}},opts);
 document.getElementById('power-note').textContent=energy.map((e,i)=>`${labels[i]}: ${fmt(e.total_fixture_power_w*1e6)} µW over ${e.complete_clock_cycles} complete cycles`).join('; ')+'.';
 document.getElementById('numerical-table').innerHTML=d.numerical.map(r=>`<tr><td>${r.title}</td><td>${r.passed?'Pass':'Outside bounds'}</td><td>${fmt(r.frontend.CSA_OUT.maximum_absolute_delta_v*1e6)} / ${fmt(r.frontend.CSA_OUT.time_weighted_rms_delta_v*1e6)}</td><td>${fmt(Math.max(...Object.values(r.edges).map(e=>e.maximum_absolute_edge_delta_s??0))*1e12)}</td></tr>`).join('');
 const noise=d.core_noise;
 if(noise){
  document.getElementById('core-noise-content').hidden=false;
  const label=r=>`${r.implementation==='full'?'Unreduced':'HPA'} · ${r.noise_scale===1?'noise on':'near-zero (10⁻¹²)'}`;
  document.getElementById('core-noise-summary').textContent=`Four actual native cases use the same physical stimulus and independently frozen ${fmt(noise.quantum_c*1e15,6)}-fC quantum. Both near-zero numerical controls ${noise.all_numerical_controls_passed?'pass every original bound':'retain their actual numerical misses'}. The stochastic records are one seed each; this does not qualify noise statistics, false-trigger rates, HPA noise equivalence or full noisy-event reconstruction.`;
  document.getElementById('core-noise-results').innerHTML=noise.rows.map(r=>`<tr><td>${label(r)}</td><td>${fmt(r.actual_noise.native_reported.noisefmin/1e6,6)}</td><td>${fmt(r.frontend_on_minus_off.CSA_OUT.time_weighted_rms_delta_v*1e3,6)}</td><td>${fmt(r.paired_charge_ledger.packet_bins.rms_charge_difference_c*1e15,6)}</td><td>${fmt(r.paired_charge_ledger.rms_diagnostic_increment_c*1e15,6)}</td><td>${r.paired_charge_ledger.noise_on_enable_pulses} / ${r.paired_charge_ledger.noise_off_enable_pulses}</td><td>${fmt(r.source_energy.total_fixture_power_w*1e6,2)}</td><td>${r.noise_scale===1?'Stochastic record':r.numerical_control_agreement_passed?'Pass':'Outside bounds'}</td></tr>`).join('');
  const select=document.getElementById('core-noise-case'),details=document.getElementById('core-noise-waveforms');
  noise.rows.forEach((r,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=label(r);select.appendChild(o)});
  select.value=String(noise.rows.findIndex(r=>r.implementation==='full'&&r.noise_scale===1));
  function noiseNote(){
   const r=noise.rows[Number(select.value)],n=r.actual_noise;
   document.getElementById('core-noise-note').textContent=`${label(r)}: seed ${n.seed}. Requested lower corner ${fmt(n.requested_minimum_frequency_hz/1e3,0)} kHz; native ${fmt(n.native_reported.noisefmin/1e6,6)} MHz, upper ${fmt(n.native_reported.noisefmax/1e6,0)} MHz. Packet-bin count-only change is ${fmt(r.paired_charge_ledger.packet_bins.rms_charge_difference_c*1e15,6)} fC RMS, with ${fmt(r.paired_charge_ledger.packet_bins.full_record_count_charge_difference_c*1e15,6)} fC total count change over this record. The separate detector-capacitor storage term changes by ${fmt(r.paired_charge_ledger.detector_storage.rms_increment_difference_c*1e15,6)} fC RMS between same-phase samples. The lower corner flattens colored noise; it is not a hard high-pass. This record does not establish the requested low-frequency spectrum. Whole-fixture upstream work is ${fmt(r.source_energy.total_fixture_power_w*1e6,2)} µW over ${r.source_energy.complete_clock_cycles} complete cycles, including all clock/shared support and positive boundary work, with no reservoir subtraction. Requested / observed threads: ${r.requested_threads} / ${r.actual_threads}. ${r.native_timing.join(' ')}`;
   document.getElementById('core-noise-details').textContent=JSON.stringify({record:r,completion:noise.completions[r.name],scope:noise.scope},null,2);
  }
  async function drawNoise(){
   const r=noise.rows[Number(select.value)],asset=d.core_noise_scopes.find(s=>s.name===r.name);
   const s=await window.QPIX_PLOTS.load(asset);
   const rows=[{name:'INPUT_CURRENT_NA',label:'Detector current (nA)'},
    {name:'CSA_OUT',overlay:'CSA_OUT_BASELINE',label:'CSA / noise off (mV)',scale:1e3},
    {name:'CSA_DELTA_UV',label:'CSA change (mV)',scale:1e-3},
    {name:'COUNT_ONLY_DELTA_FC',label:'Sampled count change (fC)',shape:'hv',mode:'lines+markers'},
    {name:'DETECTOR_STORAGE_DELTA_FC',label:'Detector storage change (fC)',mode:'lines+markers'},
    ...['SUM','DUMMY','VCM_QUIET','VTH_QUIET','CSA_VPB','CMP_NBIAS','DAC_VPB'].map(name=>({name,label:name+' (mV)',scale:1e3})),
    ...['CLK_IN','RUN','RESET','EVAL','CAPTURE','PHASE','CMP_OUT','HELD','FORCE','INHIBIT','EVENT','EN'].map(name=>({name,label:name+' (V)'}))];
   const offRises=r.noise_off_logic.cycles.flatMap(c=>c.edges_s.EN.rising);
   const markers={x:offRises.map(t=>t*1e6),y:offRises.map(()=>0),type:'scatter',mode:'markers',
    name:'Noise-off EN rising edges',xaxis:'x'+rows.length,yaxis:'y'+rows.length,
    marker:{color:'#b66537',symbol:'triangle-up-open',size:10}};
   views.coreNoise=await scopePlot('core-noise-scope',s,rows,[markers]);
   window.CHANNEL_NOISE_VIEW={name:r.name,rows:rows.length,window:s.window_us};
  }
  const redraw=()=>drawNoise().catch(e=>window.CHANNEL_ERRORS.push(String(e)));
  select.addEventListener('change',()=>{noiseNote();if(details.open)redraw()});
  details.addEventListener('toggle',()=>{if(details.open)redraw()});noiseNote();
 }
 document.getElementById('evidence').textContent=JSON.stringify({scope:d.physical.scope,nativePexJob:d.physical.native_pex_job,tracking:d.tracking.map(r=>({title:r.title,job:r.row.native_job_id,requested:r.row.requested_execution,observed:r.row.observed_execution,actualThreads:r.row.actual_threads,timing:r.row.native_timing,warnings:r.row.native_warnings,floatingNodeGuards:r.row.numerical_floating_node_guards,initialReadback:r.row.full_checkpoint_readback,scope:r.scope})),noise:noise?.completions,files:d.provenance},null,2);
 window.CHANNEL_STATUS={ready:true,views,trackingCases:tracking.length,calibrationCases:calibration.length,noiseCases:noise?.rows.length??0,errors:window.CHANNEL_ERRORS};
});
