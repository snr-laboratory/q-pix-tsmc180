/* Local report UI. Measurement arrays are generated from retained evidence. */
"use strict";
(() => {
  const D = window.QPIX_REPORT;
  const $ = id => document.getElementById(id);
  const C = {ink: "#172c3b", muted: "#526674", teal: "#147d82", blue: "#365eae", warm: "#b16a32", cold: "#197f99", red: "#b9434b", green: "#238674", grid: "#e6edef", gray: "#8699a3"};
  const rateColor = {1: "#8494a3", 5: "#708742", 10: "#147d82", 20: "#b66c28", 50: "#8a50a3"};
  const noiseColor = {off: "#778993", analog: "#b5792c", all: "#197f99"};
  const noiseName = {off: "Noise off", analog: "Analog only", all: "All source fields"};
  const rates = [1, 5, 10, 20, 50];
  const temps = [298.15, 77];
  const plots = new Set();
  const status = window.REPORT_STATUS = {ready: false, math: false, plots: [], errors: [], selectedCase: null};
  window.addEventListener("error", event => { if (event.message) status.errors.push(event.message); });
  window.addEventListener("unhandledrejection", event => status.errors.push(String(event.reason)));
  const esc = x => String(x).replace(/[&<>"']/g, s => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[s]));
  const fmt = (x, n = 3) => Number.isFinite(x) ? x.toFixed(n) : "—";
  const tempName = t => t === 77 ? "77 K" : "298.15 K";
  const tempColor = t => t === 77 ? C.cold : C.warm;
  const yes = b => `<span class="badge${b ? "" : " fail"}">${b ? "Pass" : "Fail"}</span>`;
  const sum = a => { let s = 0; return a.map(x => s += x); };
  const line = (x, y, name, color, extra = {}) => ({type: "scatter", mode: "lines", x, y, name, line: {color, width: 1.9}, ...extra});
  const axis = title => ({title: {text: title, standoff: 9}, zeroline: false, gridcolor: C.grid, linecolor: "#becfd6", automargin: true, ticks: "outside", ticklen: 3});
  const freqAxis = () => ({...axis("Sampling clock (MHz)"), type: "log", tickmode: "array", tickvals: rates, ticktext: rates.map(String), range: [-0.1, 1.8]});
  const titleNote = text => ({text, x: 0, y: 1.16, xref: "paper", yref: "paper", showarrow: false, xanchor: "left", font: {size: 11, color: C.muted}});
  const config = id => ({responsive: true, displaylogo: false, scrollZoom: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
    toImageButtonOptions: {format: "svg", filename: "qpix-" + id, scale: 1}});
  async function plot(id, data, extra = {}) {
    const node = $(id);
    const layout = {font: {family: "Arial, sans-serif", size: 11, color: C.ink}, paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      margin: {l: 65, r: 32, t: 58, b: 52}, hovermode: "closest", hoverlabel: {font: {size: 11}},
      legend: {orientation: "h", x: 0, y: 1.19, font: {size: 10}, traceorder: "normal"},
      xaxis: axis(""), yaxis: axis(""), ...extra};
    await Plotly.react(node, data, layout, config(id));
    plots.add(id); status.plots = [...plots];
  }
  function table(id, headers, rows, caption = "") {
    $(id).innerHTML = `<table>${caption ? `<caption>${esc(caption)}</caption>` : ""}<thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  function fail(error, context) {
    status.errors.push(`${context}: ${String(error)}`);
    const target = $(context);
    if (target) target.innerHTML = `<p class="runtime-error">Figure unavailable: ${esc(String(error))}. The retained measurements remain linked in the evidence registry.</p>`;
  }
  const timeGroups = new Map();
  async function setTimeRange(group, range, resetY = false) {
    if (group.busy) return;
    group.busy = true;
    group.range = range.slice();
    try {
      await Promise.all(group.ids.map(id => {
        const node = $(id), update = {};
        for (const key of Object.keys(node.layout)) {
          if (/^xaxis\d*$/.test(key)) {
            const current = node.layout[key];
            if (current.autorange !== false || !current.range || current.range.some((v,i)=>v!==range[i])) {
              update[key+'.range'] = range; update[key+'.autorange'] = false;
            }
          }
          if (resetY && /^yaxis\d*$/.test(key) && !node.layout[key].fixedrange) update[key+'.autorange'] = true;
        }
        return Object.keys(update).length ? Plotly.relayout(node, update) : Promise.resolve();
      }));
      status.timeRanges = {...status.timeRanges, [group.name]:range.slice()};
    } finally {group.busy = false;}
  }
  async function linkTime(name, ids, full, context) {
    const previous = timeGroups.get(name);
    const range = previous?.context === context ? previous.range : full;
    const group = {name, ids, full:full.slice(), range:range.slice(), context, busy:false};
    timeGroups.set(name, group);
    for (const id of ids) {
      const node = $(id);
      if (node._qpixTimeListener) node.removeListener('plotly_relayout', node._qpixTimeListener);
      node._qpixTimeListener = event => {
        if (group.busy || timeGroups.get(name) !== group) return;
        for (const key of Object.keys(node.layout).filter(k => /^xaxis\d*$/.test(k))) {
          let selected;
          if (event[key+'.autorange']) selected = group.full;
          else if (Array.isArray(event[key+'.range'])) selected = event[key+'.range'];
          else if (event[key+'.range[0]'] !== undefined || event[key+'.range[1]'] !== undefined) {
            selected = [event[key+'.range[0]'] ?? node.layout[key].range[0], event[key+'.range[1]'] ?? node.layout[key].range[1]];
          }
          if (selected) {setTimeRange(group, selected).catch(e => fail(e,id)); break;}
        }
      };
      node.on('plotly_relayout', node._qpixTimeListener);
    }
    await setTimeRange(group, range);
  }
  function resetTime(name) {
    const group = timeGroups.get(name);
    if (group) setTimeRange(group, group.full, true).catch(e => fail(e,group.ids[0]));
  }
  const loadScope = id => loadLatest('QPIX_SCOPES',id,`data/scopes/${id}.js`);
  async function logicScope(id, scope) {
    const names = Object.keys(scope.signals), gap = 2.6;
    const colors = {clk:C.ink, reset:C.gray, eval:C.cold, capture:C.teal, cmp_out:C.gray, held:C.warm, event:C.blue, phase:C.cold, en:C.red};
    const label = n => n === 'clk' ? (scope.physical_clock ? 'CLK_IN' : 'CLK ref.') : n.toUpperCase();
    const data = [
      line(scope.input.time_us,scope.input.value,'Input current',C.ink),
      line(scope.output.time_us,scope.output.value,'CSA output',C.teal,{xaxis:'x2',yaxis:'y2'}),
      line(scope.threshold.time_us,scope.threshold.value,'VTH reference',C.gray,{xaxis:'x2',yaxis:'y2',line:{color:C.gray,width:1,dash:'dot'}})
    ];
    names.forEach((name,i) => {
      const row = scope.signals[name], offset = (names.length-1-i)*gap;
      data.push(line(row.time_us,row.value.map(v => v+offset),label(name),colors[name],{
        xaxis:'x3',yaxis:'y3',showlegend:false,customdata:row.value,
        line:{color:colors[name],width:1.4,simplify:false},
        hovertemplate:`${label(name)} %{customdata:.5f} V<br>%{x:.9f} µs<extra></extra>`,
        meta:{signal:name,rising_edges:row.rising_edges,falling_edges:row.falling_edges}
      }));
    });
    const node = $(id), narrow = node.clientWidth < 560;
    node.style.height = `${330+names.length*61}px`;
    await plot(id,data,{
      uirevision:scope.id,dragmode:'zoom',
      xaxis:{...axis(''),type:'linear',range:scope.window_us,showticklabels:false,anchor:'y'},
      xaxis2:{...axis(''),type:'linear',range:scope.window_us,showticklabels:false,anchor:'y2',matches:'x'},
      xaxis3:{...axis('Time (µs)'),type:'linear',range:scope.window_us,anchor:'y3',matches:'x'},
      yaxis:{...axis('Input (nA)'),domain:[.89,1],fixedrange:true},
      yaxis2:{...axis('CSA (mV)'),domain:[.74,.84],anchor:'x2',fixedrange:true},
      yaxis3:{...axis(''),domain:[0,.66],anchor:'x3',fixedrange:true,
        tickmode:'array',tickvals:names.map((_,i)=>(names.length-1-i)*gap+scope.vdd_v/2),
        ticktext:names.map(label),range:[-.2,(names.length-1)*gap+scope.vdd_v+.25],showgrid:false,zeroline:false},
      shapes:names.map((_,i)=>({type:'rect',xref:'paper',x0:0,x1:1,yref:'y3',
        y0:(names.length-1-i)*gap-.12,y1:(names.length-1-i)*gap+scope.vdd_v+.12,
        fillcolor:i%2?'#f1f5f6':'#fafcfc',line:{width:0},layer:'below'})),
      margin:{l:85,r:25,t:narrow?82:55,b:54},
      legend:{orientation:'h',x:0,y:narrow?1:1.02,yanchor:'bottom',font:{size:10}}
    });
    status.logicScopes = {...status.logicScopes, [id]:{id:scope.id,window_us:scope.window_us,signals:names,
      native_points:scope.native_points,display_policy:scope.display_policy,source_voltage_error_bound_v:scope.source_voltage_error_bound_v}};
  }
  function sourceLinks() {
    const labels = {ota_pmos_front_bias: "CSA · PMOS input", input_preamplifier: "Differential preamplifier", comparator_preamplified: "Dynamic comparator and buffers", feedback_steer_cancel: "Replenisher and edge cancellation", capture_latch: "Static decision latch", feedback_control: "Feedback control", bias_reference_startup: "Bias mirrors", compare_preamplified_tb: "Comparator timing fixture", clock_buffer: "Clock buffer"};
    $("schematic-gallery").innerHTML = D.schematic_figures.filter(n => !n.startsWith("channel_")).map(n => `<a class="schematic-card" href="figures/${esc(n)}" target="_blank" rel="noopener"><img loading="lazy" src="figures/${esc(n)}" alt="${esc(labels[n.replace(".svg", "")])}"><span>${esc(labels[n.replace(".svg", "")])} ↗</span></a>`).join("");
    $("build-meta").innerHTML = `<dt>Design branch</dt><dd>${esc(D.meta.branch)}</dd><dt>Base commit</dt><dd><code>${esc(D.meta.head)}</code></dd><dt>Source state</dt><dd>${esc(D.meta.source_state)}</dd><dt>Report built</dt><dd>${esc(D.meta.built_utc)}</dd><dt>Measurement coverage</dt><dd>30 reference nominal points · 10 physical-clock points · 2 full detector-current replays with separate calibrations · 10 analytic structured-rate cases · 6 reference noise fields · 46 stress cases</dd>`;
    const tools = D.run_receipts.find(r => r.tool_versions)?.tool_versions;
    if (tools) $("build-meta").innerHTML += `<dt>Retained tool versions</dt><dd>${esc(tools.xschem.split("\n")[0])} · ${esc(tools.ngspice.split("\n").find(s => s.includes("ngspice-"))?.replace(/^\*+\s*/, "") || "See run receipts")}</dd>`;
    const modelFiles = ["docs/local-model.md", "docs/model-validation.md", "config/local_model.toml", "scripts/local_model.py"];
    $("model-evidence").innerHTML = modelFiles.map(path => {const p = D.provenance.find(x => x.path === path); return `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(path)}</a>`;}).join(" · ");
    table("source-registry", ["Source file", "Role", "Bytes", "SHA-256"], D.provenance.map(p => [`<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.path)}</a>`, esc(p.role), p.bytes.toLocaleString(), `<code title="${esc(p.sha256)}">${esc(p.sha256.slice(0, 16))}…</code>`]));
  }
  function symmetric(row) {
    return row.passed && D.cases.some(r => r.temperature_k !== row.temperature_k && r.frequency_hz === row.frequency_hz && r.detector_capacitance_f === row.detector_capacitance_f && r.passed);
  }
  function matrixLayout() {
    const narrow = $("envelope-plot").clientWidth < 560;
    const ya = {...axis("Detector capacitance (pF)"), tickmode: "array", tickvals: [.3, 3, 6], range: [-.7, 7]};
    return {xaxis: {...freqAxis(), domain: narrow ? [0, 1] : [0, .44]},
      xaxis2: {...freqAxis(), domain: narrow ? [0, 1] : [.57, 1], anchor: "y2"},
      yaxis: {...ya, domain: narrow ? [.61, 1] : [0, 1]},
      yaxis2: {...ya, domain: narrow ? [0, .39] : [0, 1], anchor: "x2", title: {text: narrow ? "Detector capacitance (pF)" : ""}},
      annotations: temps.map((t, i) => ({text: tempName(t), xref: "paper", yref: "paper", x: narrow ? .5 : i ? .77 : .23, y: narrow ? i ? .48 : 1.09 : 1.13, showarrow: false, font: {size: 13, color: tempColor(t)}})),
      margin: {l: 65, r: 24, t: 48, b: 53}};
  }
  async function envelope() {
    const data = [];
    temps.forEach((t, ti) => {
      const rows = D.cases.filter(r => r.temperature_k === t);
      data.push({type: "scatter", mode: "markers+text", x: rows.map(r => r.frequency_hz / 1e6), y: rows.map(r => r.detector_capacitance_f * 1e12),
        xaxis: ti ? "x2" : "x", yaxis: ti ? "y2" : "y", showlegend: false,
        customdata: rows.map(r => [r.id, r.operations, r.power_plus_ports_uw, r.quiet_recovered ? "recovered" : "failed recovery", r.mean_quantum_fc, r.passed ? "nominal pass" : "retained failure"]),
        marker: {symbol: "square", size: 25, color: rows.map(r => r.passed ? C.green : C.red), line: {color: rows.map(r => symmetric(r) ? C.blue : "#fff"), width: rows.map(r => symmetric(r) ? 3 : 1)}},
        text: rows.map(r => r.operations), textfont: {color: "#fff", size: 10},
        hovertemplate: "%{x} MHz · %{y} pF<br>%{customdata[1]} operations · %{customdata[2]:.3f} µW<br>Mean quantum %{customdata[4]:.4f} fC<br>%{customdata[3]} · %{customdata[5]}<extra></extra>"});
    });
    await plot("envelope-plot", data, matrixLayout());
    $("envelope-plot").on("plotly_click", e => {
      const row = D.cases.find(r => r.id === e.points[0]?.customdata?.[0]);
      if (!row) return;
      $("case-temp").value = row.temperature_k; $("case-cap").value = row.detector_capacitance_f * 1e12; $("case-rate").value = row.frequency_hz / 1e6;
      updateCase().catch(e => fail(e, "case-overview"));
    });
    const power = [];
    for (const t of temps) for (const cap of [.3, 3, 6]) {
      const rows = D.cases.filter(r => r.temperature_k === t && Math.abs(r.detector_capacitance_f * 1e12 - cap) < 1e-6).sort((a, b) => a.frequency_hz - b.frequency_hz);
      power.push(line(rows.map(r => r.frequency_hz / 1e6), rows.map(r => r.power_plus_ports_uw), `${tempName(t)} / ${cap} pF`, tempColor(t), {mode: "lines+markers", line: {color: tempColor(t), width: cap === 3 ? 2.5 : 1.3, dash: cap === .3 ? "dot" : cap === 6 ? "dash" : "solid"}, marker: {size: 5}, hovertemplate: "%{x} MHz · %{y:.3f} µW<extra>%{fullData.name}</extra>"}));
    }
    await plot("rate-power-plot", power, {xaxis: freqAxis(), yaxis: axis("Source draw + positive interface work (µW)"), shapes: [{type: "line", x0: 1, x1: 50, y0: 24, y1: 24, line: {color: C.red, dash: "dash", width: 1}}, {type: "line", x0: 10, x1: 10, y0: 0, y1: 1, yref: "paper", line: {color: C.gray, dash: "dot", width: 1}}], annotations: [{text: "24 µW analog allocation", x: 1.1, y: 24, yshift: 10, showarrow: false, xanchor: "left", font: {color: C.red, size: 10}}]});
  }
  const casePromises = new Map();
  function loadCase(id) {
    if (window.QPIX_CASES?.[id]) return Promise.resolve(window.QPIX_CASES[id]);
    if (!casePromises.has(id)) casePromises.set(id, new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = `data/cases/${id}.js`;
      script.onload = () => window.QPIX_CASES?.[id] ? resolve(window.QPIX_CASES[id]) : reject(new Error("Case data missing"));
      script.onerror = () => reject(new Error("Cannot load local case " + id)); document.head.append(script);
    }));
    return casePromises.get(id);
  }
  let requestCase = 0;
  async function updateCase() {
    const t = +$("case-temp").value, cap = +$("case-cap").value, rate = +$("case-rate").value;
    const row = D.cases.find(r => r.temperature_k === t && Math.abs(r.detector_capacitance_f * 1e12 - cap) < 1e-6 && r.frequency_hz === rate * 1e6);
    if (!row) throw new Error("Selected point is missing");
    const request = ++requestCase;
    const obj = await loadCase(row.id);
    if (request !== requestCase) return;
    const scope = await loadScope(obj.scope_id);
    if (request !== requestCase) return;
    const r = obj.summary, o = obj.overview, q = obj.ledger;
    status.selectedCase = r.id; status.selectedSummary = r;
    const scores = [
      ["Nominal screens + heat", r.passed ? "Pass" : "Retained failure", `${tempName(t)} · ${cap} pF · ${rate} MHz`, r.passed],
      ["Replenishments / 2 fC", `${r.operations}`, r.quiet_recovered ? "Quiet range recovered" : "Quiet recovery failed", r.quiet_recovered],
      ["Supply + positive ports", `${fmt(r.power_plus_ports_uw)} µW`, `Supply alone ${fmt(r.power_uw)} µW`, r.power_plus_ports_uw <= 24],
      ["Mean physical quantum", `${fmt(r.mean_quantum_fc, 4)} fC`, `Range ${fmt(r.quantum_min_fc, 4)}–${fmt(r.quantum_max_fc, 4)} fC`, r.all_nominal_quanta_within_5percent]
    ];
    $("case-scorecard").innerHTML = scores.map(([label, value, note, ok]) => `<div class="score"><span>${esc(label)}</span><strong class="${ok ? "pass" : "fail"}">${esc(value)}</strong><small>${esc(note)}</small></div>`).join("");
    const top = [.39, 1], bottom = [0, .23];
    const jobs = [];
    jobs.push(plot("case-overview", [
      line(o.time_us, o.output_mv, "CSA output", C.teal),
      line(o.time_us, o.sum_error_uv, "SUM shift from settled state", C.warm, {yaxis: "y2", line: {color: C.warm, width: 1.1}}),
      line(o.time_us, o.input_na, "Detector input", C.ink, {xaxis: "x2", yaxis: "y3"}),
      line(o.time_us, o.feedback_na, "Feedback probe", C.blue, {xaxis: "x2", yaxis: "y4", line: {color: C.blue, width: 1.1}})
    ], {xaxis: {...axis(""), domain: [0, .97], showticklabels: false}, xaxis2: {...axis("Time (µs)"), anchor: "y3", matches: "x", domain: [0, .97]}, yaxis: {...axis("CSA output (mV)"), domain: top}, yaxis2: {...axis("SUM shift (µV)"), overlaying: "y", side: "right", anchor: "x"}, yaxis3: {...axis("Input (nA)"), domain: bottom, anchor: "x2"}, yaxis4: {...axis("Feedback (nA)"), overlaying: "y3", side: "right", anchor: "x2"}, margin: {l: 63, r: 68, t: 62, b: 48}}));
    jobs.push(logicScope('case-detail',scope));
    jobs.push(plot("case-ledger", [
      line(q.time_us, q.input_fc, "Detector input", C.ink), line(q.time_us, q.feedback_fc, "Physical feedback", C.teal),
      line(q.time_us, q.decoded_fc, "Fixed-gain counts", C.blue, {line: {color: C.blue, width: 1.7, shape: "hv"}}),
      line(q.time_us, q.storage_fc, "Storage change", C.warm), line(q.time_us, q.gate_fc, "Gate/displacement", C.gray),
      line(q.time_us, q.closure_fc, "Ledger residual", C.red, {line: {color: C.red, width: 1.1, dash: "dot"}})
    ], {xaxis: axis("Cycle boundary (µs)"), yaxis: axis("Integrated charge (fC)"), annotations: [{text: `Final ledger residual ${fmt(r.closure_fc, 5)} fC`, xref: "paper", yref: "paper", x: .99, y: .03, showarrow: false, xanchor: "right", font: {size: 10, color: C.muted}}]}));
    const domains = Object.keys(r.domains_uw);
    jobs.push(plot("power-domains", [{type: "bar", x: domains.map(n => ({ota: "CSA", comp: "Comparator", dac: "Replenisher", driver: "Local drivers/control", bias: "Bias mirrors"}[n] || n)).concat(["Positive interface work"]), y: Object.values(r.domains_uw).concat([r.power_plus_ports_uw - r.power_uw]), marker: {color: [C.teal, C.cold, C.warm, C.blue, C.gray, "#cf9b61"]}, hovertemplate: "%{x}<br>%{y:.5f} µW<extra></extra>"}], {yaxis: axis("Source draw (µW)"), margin: {l: 64, r: 25, t: 45, b: 75}, annotations: [titleNote(`${tempName(t)} · ${rate} MHz · ${cap} pF — ${r.power_cycles} complete cycles; ΔEdec = ${fmt(r.reservoir_delta_fj, 4)} fJ`)]}));
    $("case-evidence").innerHTML = `<a href="${esc(r.result_href)}" target="_blank" rel="noopener">Original result and full run parameters ↗</a> · ${esc(r.case)}<br>Supply window ${fmt(r.power_start_us)}–${fmt(r.power_stop_us)} µs · ${r.power_cycles} complete cycles. Full transient ${fmt(scope.window_us[0])}–${fmt(scope.window_us[1])} µs; compact plot samples preserve time-bin extrema. Zoom is disabled; full-resolution traces remain local. Model SHA-256 <code>${esc(r.model_sha256)}</code>.`;
    await Promise.all(jobs);
    await linkTime('case',['case-overview','case-detail','case-ledger'],scope.window_us,r.id);
    status.caseReady = r.id;
  }
  async function architectures() {
    const data = [];
    for (const t of temps) {
      const dyn = D.cases.filter(r => r.temperature_k === t && r.frequency_hz === 1e7);
      const rows = D.static.filter(r => r.temperature_k === t);
      data.push({type: "scatter", mode: "markers", x: rows.map(r => r.power_plus_ports_uw), y: rows.map(r => r.mean_quantum_c * 1e15), name: `${tempName(t)} · continuous`, marker: {size: 10, color: tempColor(t), symbol: rows.map(r => r.deterministic_screens_pass ? "circle" : "x")}, customdata: rows.map(r => [`${r.candidate} / ${r.input_f * 1e12} pF`, r.feedback_commands, r.deterministic_screens_pass ? "Pass" : "Fail"]), hovertemplate: "%{customdata[0]}<br>%{x:.3f} µW · %{y:.4f} fC<br>%{customdata[1]} operations · %{customdata[2]}<extra>%{fullData.name}</extra>"});
      data.push({type: "scatter", mode: "markers", x: dyn.map(r => r.power_plus_ports_uw), y: dyn.map(r => r.mean_quantum_fc), name: `${tempName(t)} · dynamic`, marker: {size: 11, color: tempColor(t), symbol: dyn.map(r => r.passed ? "diamond" : "x")}, customdata: dyn.map(r => [`${r.detector_capacitance_f * 1e12} pF`, r.operations, r.passed ? "Pass" : "Fail"]), hovertemplate: "%{customdata[0]}<br>%{x:.3f} µW · %{y:.4f} fC<br>%{customdata[1]} operations · %{customdata[2]}<extra>%{fullData.name}</extra>"});
    }
    await plot("architecture-comparison", data, {xaxis: axis("Source + positive interface work (µW)"), yaxis: axis("Mean physical quantum (fC)"), annotations: [titleNote("10 MHz · all three detector loads · crosses retain failures")]});
  }
  async function waveforms() {
    const t = +$("wave-temp").value;
    const selected = [...document.querySelectorAll("#wave-rates input:checked")].map(x => +x.value);
    status.waveRates = selected;
    const rows = D.waveforms.filter(r => r.temperature_k === t && selected.includes(r.frequency_hz / 1e6)).sort((a, b) => a.frequency_hz - b.frequency_hz);
    const current = [], charge = [];
    for (const r of rows) {
      const rate = r.frequency_hz / 1e6, color = rateColor[rate], key = `${rate} MHz`;
      current.push(line(r.time_us, r.decoded_na, `${key} · decoded`, color, {legendgroup: key}));
      current.push(line(r.time_us, r.reference_na, `${key} · filtered detector`, color, {legendgroup: key, line: {color, width: 1, dash: "dot"}}));
      const end = r.time_us.map(x => x + .5 / rate);
      charge.push(line(end, r.decoded_fc, key, color, {line: {color, width: 1.9, shape: "hv"}}));
    }
    if (rows.length) {const r = rows.find(x => x.frequency_hz === 1e7) || rows[0]; charge.unshift(line(r.time_us.map(x => x + .5e6 / r.frequency_hz), r.input_fc, "Detector charge (cycle ends)", C.ink));}
    const narrow = $("wave-current").clientWidth < 560;
    const legendHeight = narrow ? 28 * selected.length + 18 : selected.length > 3 ? 90 : 65;
    await Promise.all([
      plot("wave-current", current, {xaxis: axis("Time (µs)"), yaxis: axis("Causally filtered current (nA)"), margin: {l: 63, r: 25, t: legendHeight, b: 50}, legend: {orientation: "h", x: 0, y: 1.03, yanchor: "bottom", font: {size: 9}}, annotations: rows.length ? [] : [{text: "Select at least one measured rate", showarrow: false, xref: "paper", yref: "paper", x: .5, y: .5}]}),
      plot("wave-charge", charge, {xaxis: axis("Cycle-end time (µs)"), yaxis: axis("Integrated charge (fC)"), margin: {l: 63, r: 25, t: narrow ? 105 : 58, b: 50}, legend: {orientation: "h", x: 0, y: 1.03, yanchor: "bottom", font: {size: 9}}})
    ]);
    await waveLogic();
    const all = D.waveforms.slice().sort((a, b) => b.temperature_k - a.temperature_k || a.frequency_hz - b.frequency_hz);
    table("wave-table", ["Model", "Clock", "Bin", "Counts", "Decoded Q", "Filtered RMS", "Bin-Q RMS", "Filter delay", "Source + ports", "Raw q / quiet"], all.map(r => [tempName(r.temperature_k), `${r.frequency_hz / 1e6} MHz`, `${fmt(1e9 / r.frequency_hz, 0)} ns`, r.feedback_commands, `${fmt(r.decoded_charge_c * 1e15)} fC`, `${fmt(r.waveform_error_relative_rms * 100, 2)}%`, `${fmt(r.clock_bin_charge_error_rms_c * 1e15)} fC`, `${fmt(r.filter_group_delay_s * 1e6, 2)} µs`, `${fmt(r.power_plus_ports_uw)} µW`, `${yes(r.all_delivered_quanta_met)} / ${yes(r.quiet_tail_in_expected_charge_band)}`]), "All ten deterministic structured-event cases; RMS uses the full retained record and the recorded causal filter.");
  }
  let waveLogicRequest = 0;
  async function waveLogic() {
    const temperature = +$('wave-temp').value, rate = +$('wave-logic-rate').value;
    const row = D.waveforms.find(r => r.temperature_k === temperature && r.frequency_hz === rate*1e6);
    const request = ++waveLogicRequest, scope = await loadScope(row.scope_id);
    if (request !== waveLogicRequest) return;
    await logicScope('wave-logic',scope);
    await linkTime('wave',['wave-current','wave-charge','wave-logic'],scope.window_us,row.scope_id);
    $('wave-logic-evidence').textContent = `${tempName(temperature)} · ${rate} MHz · full ${scope.window_us[0]}–${scope.window_us[1]} µs native record. Compact overview with time-bin extrema; full-resolution traces remain local. CLK ref. is the diagnostic clock in this ideal-phase reference. Zoom is disabled.`;
    status.waveLogicReady = row.scope_id;
  }
  async function waveMetrics() {
    const data = [];
    for (const t of temps) {
      const rows = D.waveforms.filter(r => r.temperature_k === t).sort((a, b) => a.frequency_hz - b.frequency_hz);
      data.push(line(rows.map(r => r.frequency_hz / 1e6), rows.map(r => r.waveform_error_relative_rms * 100), `${tempName(t)} · filtered current`, tempColor(t), {mode: "lines+markers"}));
      data.push(line(rows.map(r => r.frequency_hz / 1e6), rows.map(r => r.clock_bin_charge_error_rms_c * 1e15), `${tempName(t)} · bin charge`, tempColor(t), {mode: "lines+markers", yaxis: "y2", line: {color: tempColor(t), width: 1.5, dash: "dot"}}));
    }
    await plot("wave-metrics", data, {xaxis: freqAxis(), yaxis: axis("Filtered current RMS / reference RMS (%)"), yaxis2: {...axis("Individual bin-charge RMS error (fC)"), overlaying: "y", side: "right"}, margin: {l: 64, r: 66, t: 70, b: 50}});
  }
  async function spectra() {
    await Promise.all([
      plot("gain-plot", D.spectra.map(r => line(r.frequency_hz, r.gain_db, tempName(r.temperature_k), tempColor(r.temperature_k))), {xaxis: {...axis("Analog frequency (Hz)"), type: "log"}, yaxis: axis("Normalized charge response (dB)"), shapes: [{type: "line", x0: 100, x1: 2.5e8, y0: -3, y1: -3, line: {color: C.gray, dash: "dot", width: 1}}], margin: {l: 58, r: 17, t: 52, b: 50}}),
      plot("spectrum-plot", D.spectra.map(r => line(r.noise_frequency_hz, r.output_asd_uv, tempName(r.temperature_k), tempColor(r.temperature_k))), {xaxis: {...axis("Analog frequency (Hz)"), type: "log"}, yaxis: {...axis("Differential output ASD (µV/√Hz)"), type: "log"}, margin: {l: 65, r: 17, t: 52, b: 50}})
    ]);
    table("spectrum-table", ["Model", "−3 dB", "LF differential gain", "Output RMS", "Charge equivalent", "Electron equivalent", "Variance >50 MHz"], D.spectra.map(r => [tempName(r.temperature_k), `${fmt(r.first_3db_crossing_hz / 1e6, 2)} MHz`, fmt(r.low_frequency_differential_gain), `${fmt(r.finite_band_output_noise_rms_v * 1e3)} mV`, `${fmt(r.charge_noise_via_ideal_Cf_and_low_frequency_gain_c_rms * 1e15)} fC`, `${fmt(r.charge_noise_via_ideal_Cf_and_low_frequency_gain_c_rms / 1.602176634e-19, 0)} e⁻`, `${fmt(r.variance_above_clock_within_sweep_fraction * 100, 4)}%`]), "Continuous-path precharge fixture, integrated only over the retained 100 Hz–248.79 MHz band.");
  }
  async function noise() {
    const t = +$("noise-temp").value, rows = D.noise.filter(r => r.temperature_k === t), charge = [], current = [], pulses = [];
    const ref = rows[0], periodUs = 1e6 / ref.frequency_hz;
    charge.push(line(ref.time_us.map(x => x + periodUs), ref.input_fc, "Detector charge", C.ink));
    current.push(line(ref.time_us.map(x => x + periodUs / 2), ref.reference_na, "Filtered detector", C.ink));
    for (const r of rows) {
      charge.push(line(r.time_us.map(x => x + periodUs), r.decoded_fc, noiseName[r.noise_mode], noiseColor[r.noise_mode], {line: {color: noiseColor[r.noise_mode], width: 1.7, shape: "hv"}}));
      current.push(line(r.time_us.map(x => x + periodUs / 2), r.decoded_na, noiseName[r.noise_mode], noiseColor[r.noise_mode]));
      pulses.push({type: "scatter", mode: "markers", x: r.event_cycle_start_s.map(x => x * 1e6), y: r.pulse_fc, name: noiseName[r.noise_mode], marker: {size: 7, symbol: {off: "circle", analog: "diamond", all: "cross"}[r.noise_mode], color: noiseColor[r.noise_mode]}, hovertemplate: "%{x:.2f} µs · %{y:.5f} fC<extra>%{fullData.name}</extra>"});
    }
    const shade = [{type: "rect", x0: 4.5, x1: 18, y0: 0, y1: 1, yref: "paper", fillcolor: "#147d82", opacity: .045, line: {width: 0}, layer: "below"}];
    const gain = D.calibration[t === 77 ? "77.0" : "298.15"].effective_quantum_c * 1e15;
    await Promise.all([
      plot("noise-charge", charge, {xaxis: axis("Cycle-end time (µs)"), yaxis: axis("Integrated charge (fC)"), shapes: shade}),
      plot("noise-current", current, {xaxis: axis("Bin-center time (µs)"), yaxis: axis("Causally filtered current (nA)"), shapes: shade}),
      plot("noise-pulses", pulses, {xaxis: axis("Cycle start (µs)"), yaxis: {...axis("Delivered physical charge (fC)"), range: [.47, .545]}, shapes: [{type: "rect", x0: 4, x1: 22, y0: .475, y1: .525, fillcolor: C.green, opacity: .06, line: {width: 0}, layer: "below"}, {type: "line", x0: 4, x1: 22, y0: .525, y1: .525, line: {color: C.red, dash: "dot", width: 1}}, {type: "line", x0: 4, x1: 22, y0: gain, y1: gain, line: {color: C.blue, dash: "dash", width: 1}}], annotations: [{text: "Fixed decoder gain", x: 21.5, y: gain, yshift: -10, showarrow: false, xanchor: "right", font: {color: C.blue, size: 10}}, {text: "Raw upper limit", x: 21.5, y: .525, yshift: 10, showarrow: false, xanchor: "right", font: {color: C.red, size: 10}}]})
    ]);
    table("noise-table", ["Model", "Sources", "Counts", "Focus RMS", "Full RMS", "100 ns Q RMS", "Physical q RMS / gain", "Raw q", "Source + ports"], D.noise.map(r => [tempName(r.temperature_k), noiseName[r.noise_mode], r.counts, `${fmt(r.filtered_reconstruction.focus_error_relative_rms * 100, 2)}%`, `${fmt(r.filtered_reconstruction.error_relative_rms * 100, 2)}%`, `${fmt(r.charge_window_errors[0].focus_rms_error_c * 1e15)} fC`, `${fmt(r.physical_quantum_statistics.rms_relative_to_frozen_gain * 100, 2)}%`, yes(r.all_delivered_quanta_met), `${fmt(r.source_draw_with_positive_external_port_energy_w * 1e6)} µW`]), "Focus = 4.5–18 µs; full = 4–22 µs. No gain or timing adjustment per noise field.");
  }
  async function interference() {
    const data = [];
    for (const kind of ["continuous", "dynamic"]) {
      const rows = D.interference.filter(r => r.kind === kind && r.comparator_seed_a === 2.5e-7).sort((a, b) => b.temperature_k - a.temperature_k);
      const color = kind === "dynamic" ? C.warm : C.teal;
      data.push({type: "bar", x: rows.map(r => tempName(r.temperature_k)), y: rows.map(r => r.sensor_node_ripple_v * 1e6), name: kind === "dynamic" ? "Dynamic" : "Continuous", legendgroup: kind, marker: {color}, offsetgroup: kind});
      data.push({type: "bar", x: rows.map(r => tempName(r.temperature_k)), y: rows.map(r => r.gate_positive_lobe_per_cycle_c * 1e15), xaxis: "x2", yaxis: "y2", name: kind, legendgroup: kind, showlegend: false, marker: {color}, offsetgroup: kind});
    }
    await plot("interference-plot", data, {barmode: "group", xaxis: {domain: [0, .42], ...axis("")}, xaxis2: {domain: [.6, 1], anchor: "y2", ...axis("")}, yaxis: {...axis("Quiet SUM ripple (µV p–p)"), type: "log"}, yaxis2: {...axis("Positive gate charge / cycle (fC)"), anchor: "x2", type: "log"}, margin: {l: 65, r: 25, t: 58, b: 50}});
    const sens = [];
    for (const [label, report] of [["Core source refresh", D.bias_sensitivity], ["200 → 50 MHz carrier", D.band_sensitivity]]) for (const r of report.rows) {
      sens.push([label, tempName(r.temperature_k), `${r.reference.counts} → ${r.variant.counts}`, r.same_event_bits ? "Identical" : `${r.different_cycle_starts_s.length} differing cycle bins`, `${fmt(r.reference.event_filtered_relative_RMS * 100, 2)} → ${fmt(r.variant.event_filtered_relative_RMS * 100, 2)}%`, `${fmt(r.source_power_relative_change * 100, 4)}%`]);
    }
    table("sensitivity-table", ["Matched variation", "Model", "Counts", "Bitstream", "Focus RMS", "Power change"], sens);
  }
  async function energy() {
    const rows = temps.map(t => ({idle: D.stress_energy.find(r => r.temperature_k === t && r.case === "idle"), active: D.stress_energy.find(r => r.temperature_k === t && r.case === "repeated")}));
    // Use exact recorded case names; stop visibly if the evidence registry changes.
    for (const r of rows) if (!r.idle || !r.active) throw new Error("Matched idle/repeated evidence missing");
    const x = temps.map(tempName), data = [];
    for (const [key, label, color] of [["idle", "Idle supply", C.gray], ["active", "Repeated-event supply", C.teal]]) data.push({type: "bar", x, y: rows.map(r => r[key].supply_power_w * 1e6), name: label, marker: {color}, offsetgroup: key});
    data.push({type: "bar", x, y: rows.map(r => r.active.incremental_source_energy_per_operation_j * 1e12), name: "Incremental energy / operation", marker: {color: C.warm}, xaxis: "x2", yaxis: "y2"});
    await plot("energy-plot", data, {barmode: "group", xaxis: {...axis(""), domain: [0, .43]}, yaxis: {...axis("Supply draw (µW)"), range: [0, 24]}, xaxis2: {...axis(""), domain: [.63, 1], anchor: "y2"}, yaxis2: {...axis("Matched-idle incremental energy (pJ/op)"), anchor: "x2"}, margin: {l: 60, r: 25, t: 65, b: 50}});
    table("energy-table", ["Model", "Idle supply", "Active supply", "Operations", "Total window energy / op", "Matched-idle incremental / op", "ΔE decoupling"], rows.map((r, i) => [tempName(temps[i]), `${fmt(r.idle.supply_power_w * 1e6, 4)} µW`, `${fmt(r.active.supply_power_w * 1e6, 4)} µW`, r.active.operations, `${fmt(r.active.source_energy_per_operation_j * 1e12, 3)} pJ`, `${fmt(r.active.incremental_source_energy_per_operation_j * 1e12, 4)} pJ`, `${fmt(r.active.decoupling_energy_change_j * 1e15, 5)} fJ`]), "A 20 µs supply window and five operations. The incremental diagnostic does not replace total source draw.");
  }
  async function recovery() {
    const startup = D.startup.map((r, i) => ({type: "bar", x: [`${tempName(r.temperature_k)}${i === 2 ? " / 500 ps step" : " / 1 ns step"}`], y: [r.first_100_cycle_confirmation_s * 1e6], name: tempName(r.temperature_k), showlegend: false, marker: {color: tempColor(r.temperature_k)}, customdata: [[r.training_counts_to_confirmation, r.background_charge_to_confirmation_c * 1e15]], hovertemplate: "%{y:.3f} µs<br>%{customdata[0]} training counts to readiness<br>%{customdata[1]:.3f} fC background<extra>%{x}</extra>"}));
    const stress = temps.map(t => {
      const rows = D.stress.filter(r => r.temperature_k === t);
      return {type: "scatter", mode: "markers", x: rows.map((_, i) => i + 1), y: rows.map(r => r.charge_balance_error_c * 1e15), name: tempName(t), marker: {color: tempColor(t), size: 8, symbol: rows.map(r => r.deterministic_screens_pass ? "circle" : "x")}, customdata: rows.map(r => [r.case_name, r.deterministic_screens_pass ? "Original pass" : "Original failure", r.feedback_commands]), hovertemplate: "%{customdata[0]}<br>Ledger %{y:.6f} fC<br>%{customdata[2]} operations · %{customdata[1]}<extra>%{fullData.name}</extra>"};
    });
    const cur = [];
    for (const t of temps) {
      const rows = D.current.filter(r => r.temperature_k === t);
      cur.push({type: "scatter", mode: "markers+lines", x: rows.map(r => r.input_current_a * 1e9), y: rows.map(r => r.feedback_current_a * 1e9), name: tempName(t), marker: {size: 11, color: tempColor(t), symbol: rows.map(r => r.active_inventory_bounded ? "circle" : "x"), line: {color: rows.map(r => r.final_charge_and_control_screens_pass ? C.green : C.red), width: 2}}, line: {color: tempColor(t), width: 1}, customdata: rows.map(r => [r.active_inventory_bounded ? "Active inventory bounded" : "Active inventory exceeded", r.final_charge_and_control_screens_pass ? "Final recovery passed" : "Final recovery failed", r.active_sampled_output_min_v * 1e3, r.active_sampled_output_max_v * 1e3]), hovertemplate: "Input %{x:.3f} nA · feedback %{y:.3f} nA<br>%{customdata[0]}<br>%{customdata[1]}<br>Active CSA %{customdata[2]:.2f}–%{customdata[3]:.2f} mV<extra>%{fullData.name}</extra>"});
    }
    await Promise.all([
      plot("startup-plot", startup, {yaxis: axis("100-cycle readiness confirmation (µs)"), margin: {l: 65, r: 25, t: 28, b: 70}}),
      plot("stress-plot", stress, {xaxis: {...axis("Stress case index · hover for named condition"), dtick: 2}, yaxis: axis("Physical ledger residual (fC)"), shapes: [.1, -.1].map(y => ({type: "line", x0: 1, x1: 23, y0: y, y1: y, line: {color: C.red, dash: "dot", width: 1}})), annotations: [{text: "Cold 100 aF · original failure retained", x: 23, y: .103338, showarrow: true, ax: -130, ay: -22, font: {color: C.red, size: 10}}]}),
      plot("current-plot", cur, {xaxis: axis("Finite input plateau (nA)"), yaxis: axis("Mean active feedback current (nA)"), shapes: [{type: "line", x0: 0, x1: 6.3, y0: 5, y1: 5, line: {color: C.gray, dash: "dash", width: 1}}], annotations: [{text: "Nominal 5 nA service capacity", x: 2, y: 5, yshift: 10, showarrow: false, font: {color: C.muted, size: 10}}, titleNote("Circle = bounded active inventory · border green/red = final recovery pass/fail")]})
    ]);
    const timing = temps.map(t => {
      const rows = D.timing.filter(r => r.temperature_k === t);
      return {type: "scatter", mode: "markers", x: rows.map(r => r.input_lead_s * 1e9), y: rows.map(r => r.capture_close_fraction + (t === 77 ? .002 : -.002)), name: tempName(t), marker: {size: 11, color: tempColor(t), symbol: rows.map(r => r.requested_new_bits_match ? "circle" : "x")}, customdata: rows.map(r => [r.capture_close_fraction, r.requested_new_bits_match ? "Requested bits match" : "Requested bits differ"]), hovertemplate: "%{x:.1f} ns input lead<br>Capture close %{customdata[0]:.3f} cycle<br>%{customdata[1]}<extra>%{fullData.name}</extra>"};
    });
    await plot("timing-plot", timing, {xaxis: axis("Input lead before EVAL (ns)"), yaxis: axis("Capture close / period"), annotations: [titleNote("Temperatures offset vertically by ±0.002 for visibility; hover reports actual fraction")]});
  }
  const latestLoads = new Map();
  function loadLatest(group, id, path) {
    if (window[group]?.[id]) return Promise.resolve(window[group][id]);
    if (!latestLoads.has(path)) latestLoads.set(path, new Promise((resolve, reject) => {
      const tag = document.createElement('script'); tag.src = path;
      tag.onload = () => window[group]?.[id] ? resolve(window[group][id]) : reject(new Error('Missing local data ' + id));
      tag.onerror = () => reject(new Error('Cannot load ' + path)); document.head.append(tag);
    }));
    return latestLoads.get(path);
  }
  const clockAllocation = (r, channels) => r.core_plus_references_uw + (r.generator_uw + r.positive_shared_ports_uw) / channels + r.bank_uw / r.channels_per_bank;
  let clockRequest = 0, detectorRequest = 0;
  async function clocks() {
    const temperature = +$('clock-temp').value, rate = +$('clock-rate').value, channels = +$('clock-channels').value;
    const row = D.latest.clock.find(r => r.temperature_k === temperature && r.frequency_hz === rate * 1e6);
    const request = ++clockRequest;
    const scope = await loadScope(row.id);
    if (request !== clockRequest) return;
    const equivalent = clockAllocation(row, channels);
    $('clock-scorecard').innerHTML = [
      ['Loaded clock targets', row.timing_targets_met ? 'Pass' : 'Miss', `${fmt(row.maximum_edge_error_ps, 2)} ps largest edge error`, row.timing_targets_met],
      ['PHASE high interval', `${fmt(row.phase_width_ns, 4)} ns`, 'Measured 50% crossings; target 4 ns', true],
      ['Raw shared source', `${fmt(row.generator_uw, 2)} µW`, `Plus ${fmt(row.bank_uw, 2)} µW for one bank`, true],
      ['Assumed per-channel heat', `${fmt(equivalent, 2)} µW`, `${channels} chip channels / ${row.channels_per_bank} per bank; backend excluded`, equivalent <= 24]
    ].map(([label,value,note,ok]) => `<div class="score"><span>${esc(label)}</span><strong class="${ok?'pass':'fail'}">${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
    const selected = D.latest.clock.filter(r => r.temperature_k === temperature).sort((a,b) => a.frequency_hz-b.frequency_hz);
    const x = selected.map(r => r.frequency_hz/1e6);
    const narrow = $('clock-heat').clientWidth < 560;
    await Promise.all([
      logicScope('clock-detail',scope),
      plot('clock-heat', [line(x,selected.map(r=>r.generator_uw),'Raw generator',C.warm,{mode:'lines+markers'}),
        line(x,selected.map(r=>r.bank_uw),'One loaded bank',C.blue,{mode:'lines+markers'}),
        line(x,selected.map(r=>clockAllocation(r,channels)),`Per channel / assumed ${channels}`,C.teal,{mode:'lines+markers',xaxis:'x2',yaxis:'y2'})],
        {xaxis:{...freqAxis(),domain:narrow?[0,1]:[0,.43]},xaxis2:{...freqAxis(),domain:narrow?[0,1]:[.62,1],anchor:'y2'},
         yaxis:{...axis('Raw shared source (µW)'),domain:narrow?[.61,1]:[0,1]},
         yaxis2:{...axis('Allocated subsystem (µW/ch)'),domain:narrow?[0,.39]:[0,1],anchor:'x2'},
         shapes:[{type:'line',x0:1,x1:50,xref:'x2',y0:24,y1:24,yref:'y2',line:{color:C.red,dash:'dash',width:1}}],
         margin:{l:66,r:30,t:narrow?85:65,b:50},legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:10}}})
    ]);
    await linkTime('clock',['clock-detail'],scope.window_us,row.id);
    table('clock-table',['Model','MHz','PHASE','Edge error','Counts / 2 fC','Quiet band','Raw generator','One bank',`Equivalent / ${channels}`],
      D.latest.clock.slice().sort((a,b)=>b.temperature_k-a.temperature_k||a.frequency_hz-b.frequency_hz).map(r=>[
        tempName(r.temperature_k),r.frequency_hz/1e6,`${fmt(r.phase_width_ns,4)} ns`,`${fmt(r.maximum_edge_error_ps,2)} ps`,r.counts,
        r.quiet_recovered?'Pass':'Retained miss',`${fmt(r.generator_uw,2)} µW`,`${fmt(r.bank_uw,2)} µW`,`${fmt(clockAllocation(r,channels),2)} µW/ch`]),
      'Ten loaded physical timing points. Timing success and analog quiet-state recovery are separate screens; values above 24 µW remain exploratory candidates.');
    table('clock-width-table',['Model','Requested','Measured','Words A / B / C / D / E / F','Timing'],D.latest.widths.map(r=>[
      tempName(r.temperature_k),`${r.requested_ns} ns`,`${fmt(r.measured_ns,4)} ns`,r.words.join(' / '),r.passed?'Pass':'Miss']),
      'Independent pulse-width settings at 10 MHz; hardware-current and decoder calibration must match the width.');
    table('clock-mode-table',['Model','MHz','A','B','C','D','E','F'],D.latest.clock_modes.map(r=>[
      tempName(r.temperature_k),r.frequency_hz/1e6,...r.trim_words]),'Six ten-bit internal configuration words. Bits 9/8 bypass resistor segments; bits 7:0 select timing capacitors.');
    $('clock-evidence').innerHTML = `<a href="${esc(row.result_href)}" target="_blank" rel="noopener">Selected native measurement and complete-cycle source ledger ↗</a> · Model <code>${esc(row.model_sha256)}</code>.<br>Assumed sharing: Pchannel + Pgenerator/Nchip + Pbank/${row.channels_per_bank}, with positive reference/control work retained. The generator was measured with seven other bank-input capacitors; changing Nchip here keeps that fanout fixed.`;
    status.clockReady = `${temperature}-${rate}-${channels}`;
  }
  async function detector() {
    const temperature = +$('detector-temp').value;
    const row = D.latest.events.find(r=>r.temperature_k===temperature);
    const request = ++detectorRequest;
    const [obj,scope] = await Promise.all([loadLatest('QPIX_DETECTOR',row.id,`data/${row.id}.js`),loadScope(row.id)]);
    if (request !== detectorRequest) return;
    const q=obj.charge,b=obj.bins,o=obj.overview,rt=obj.rtd,input=D.latest.input;
    const totalChannels=row.allocation.channels_per_bank*row.allocation.banks_per_chip;
    $('detector-scorecard').innerHTML = [
      ['Recorded operations',String(row.counts),`${fmt(row.input_charge_c*1e15,4)} fC in the acquisition window`,true],
      ['Independent decoder gain',`${fmt(row.effective_quantum_c*1e15,5)} fC`,`${row.calibration.counts} calibration operations; no event gain fit`,true],
      ['Integrated count error',`${fmt(row.integrated_error_c*1e15,4)} fC`,'Final residual remains separate from count-only charge',true],
      ['Implemented heat / channel',`${fmt(row.equivalent_uw,3)} µW`,`${totalChannels} assumed chip channels; all seven supplies included`,row.equivalent_uw<=24]
    ].map(([label,value,note,ok])=>`<div class="score"><span>${esc(label)}</span><strong class="${ok?'pass':'fail'}">${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
    const mobile=$('detector-current').clientWidth<560;
    const range=scope.window_us;
    const current=[line(input.time_us,input.current_na,'Original input',C.gray,{line:{color:C.gray,width:1}}),
      line(b.time_us,b.reference_na,'Same-filter input',C.ink,{line:{color:C.ink,width:1.4,dash:'dot'}}),
      line(b.time_us,b.decoded_na,'Calibrated bits + causal filter',C.teal)];
    const charge=[line(q.time_us,q.input_fc,'Input integral',C.ink),
      line(q.time_us,q.decoded_fc,'Calibrated counts',C.blue,{line:{color:C.blue,width:1.8,shape:'hv'}}),
      line(q.time_us,q.feedback_fc,'Physical feedback probe',C.teal,{line:{color:C.teal,width:1.3,dash:'dot'}}),
      line(q.time_us,q.storage_fc,'Stored residual',C.warm,{xaxis:'x2',yaxis:'y2'}),
      line(q.time_us,q.decoded_fc.map((v,i)=>v-q.input_fc[i]),'Counts − input',C.blue,{xaxis:'x2',yaxis:'y2',line:{color:C.blue,width:1.1}}),
      line(q.time_us,q.gate_fc,'Gate/displacement',C.gray,{xaxis:'x2',yaxis:'y2'}),
      line(q.time_us,q.closure_fc,'Physical ledger residual',C.red,{xaxis:'x2',yaxis:'y2',line:{color:C.red,width:1.1,dash:'dot'}})];
    const intervalX=[],intervalDecoded=[],intervalTruth=[];
    rt.start_us.forEach((at,i)=>{intervalX.push(at,rt.stop_us[i],null);intervalDecoded.push(rt.decoded_na[i],rt.decoded_na[i],null);intervalTruth.push(rt.reference_na[i],rt.reference_na[i],null);});
    await Promise.all([
      plot('detector-current',current,{xaxis:{...axis('Time (µs)'),range},yaxis:axis('Current (nA)'),margin:{l:62,r:25,t:mobile?85:55,b:50},legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:10}}}),
      plot('detector-charge',charge,{xaxis:{...axis(''),range,showticklabels:false},xaxis2:{...axis('Cycle-boundary time (µs)'),range,matches:'x',anchor:'y2'},
        yaxis:{...axis('Integrated charge (fC)'),domain:[.41,1]},yaxis2:{...axis('Residual / error (fC)'),domain:[0,.25],anchor:'x2'},margin:{l:70,r:25,t:mobile?145:100,b:50},legend:{orientation:'h',x:0,y:1.03,yanchor:'bottom',font:{size:9}}}),
      plot('detector-state',[line(o.time_us,o.output_mv,'CSA output',C.teal),line(o.time_us,o.sum_shift_uv,'SUM − 0.9 V',C.warm,{yaxis:'y2'}),
        line(o.time_us,o.input_na,'Native input current',C.ink,{xaxis:'x2',yaxis:'y3'}),line(o.time_us,o.feedback_na,'Feedback-current pulses',C.blue,{xaxis:'x2',yaxis:'y4',line:{color:C.blue,width:1}})],
        {xaxis:{...axis(''),range,showticklabels:false},xaxis2:{...axis('Native time (µs)'),range,matches:'x',anchor:'y3'},yaxis:{...axis('CSA output (mV)'),domain:[.4,1]},yaxis2:{...axis('SUM shift (µV)'),overlaying:'y',side:'right'},yaxis3:{...axis('Input (nA)'),domain:[0,.25],anchor:'x2'},yaxis4:{...axis('Feedback (nA)'),overlaying:'y3',side:'right',anchor:'x2'},margin:{l:66,r:65,t:mobile?120:75,b:50},legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:10}}}),
      plot('detector-rtd',[line(input.time_us,input.current_na,'Original input',C.gray,{line:{color:C.gray,width:1}}),
        line(intervalX,intervalTruth,'Input mean over the same interval',C.ink,{line:{color:C.ink,width:1,dash:'dot'}}),
        line(intervalX,intervalDecoded,'Qcal / reset-time interval',C.blue,{line:{color:C.blue,width:1.8}})],{xaxis:{...axis('Operation-aperture interval (µs)'),range},yaxis:axis('Interval current estimate (nA)'),margin:{l:64,r:25,t:mobile?105:75,b:50},legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:10}}}),
      logicScope('detector-detail',scope)
    ]);
    await linkTime('detector',['detector-current','detector-detail','detector-charge','detector-state','detector-rtd'],scope.window_us,row.id);
    table('detector-table',['Model','Known calibration Q','Calibration counts / quiet','Calibration storage ΔQ','Frozen Qcal','Event counts','Count Q error','Bin-Q RMS','Filtered RMS','Core / shared equivalent'],
      D.latest.events.map(r=>[tempName(r.temperature_k),`${fmt(r.calibration.known_charge_c*1e15,4)} fC`,`${r.calibration.counts} / ${r.calibration.quiet_tail_in_expected_charge_band?'pass':'retained miss'}`,`${fmt(r.calibration.endpoint_storage_change_c*1e15,4)} fC`,`${fmt(r.effective_quantum_c*1e15,5)} fC`,r.counts,`${fmt(r.integrated_error_c*1e15,4)} fC`,`${fmt(r.clock_bin_error_rms_c*1e15,4)} fC`,`${fmt(r.filtered_error_relative_rms*100,2)}%`,`${fmt(r.core_uw,3)} / ${fmt(r.equivalent_uw,3)} µW/ch`]),
      'Full unscaled physical event at 10 MHz. RMS compares the same fixed causal filter in the declared event/recovery window; it is not an ENC or random-noise measurement. Shared heat assumes eight banks of sixteen channels.');
    table('detector-power',['Model','Window (µs)','Cycles','Commands','Raw seven-source + ports','Assumed per channel','Energy / operation','Raw reservoir ΔE'],
      D.latest.events.flatMap(r=>Object.entries(r.source_power_windows).map(([name,w])=>[
        tempName(r.temperature_k),`${name==='late_idle'?'Late idle':'Event + recovery'}: ${fmt(w.window_s[0]*1e6,3)}–${fmt(w.window_s[1]*1e6,3)}`,w.cycles,w.feedback_commands,
        `${fmt(w.whole_fixture_source_plus_positive_ports_w*1e6,3)} µW`,`${fmt(w.illustrative_per_channel_power_w*1e6,3)} µW/ch`,
        w.illustrative_energy_per_replenishment_j===null?'—':`${fmt(w.illustrative_energy_per_replenishment_j*1e12,3)} pJ/ch`,
        `${fmt(Object.values(w.domains).reduce((s,v)=>s+v.decoupling_energy_change_j,0)*1e15,5)} fJ`])),
      'Complete-clock windows with explicit VDD–VSS reservoirs; allocation does not subtract stored-energy changes or baseline power.');
    $('detector-evidence').innerHTML=`<a href="${esc(row.result_href)}" target="_blank" rel="noopener">Complete native event measurement ↗</a> · <a href="${esc(row.calibration_href)}" target="_blank" rel="noopener">Independent calibration ↗</a><br>Ledger ${fmt(row.final_physical_ledger_error_c*1e15,6)} fC; maximum cycle-boundary residual ${fmt(row.physical_ledger_error_max_c*1e15,5)} fC. Supply window ${fmt(row.power_window_us[0],4)}–${fmt(row.power_window_us[1],4)} µs / ${row.power_cycles} complete cycles; ΔEdec ${fmt(row.reservoir_delta_fj,5)} fJ. Raw generator ${fmt(row.generator_uw,3)} µW and one bank ${fmt(row.bank_uw,3)} µW; all seven fixture sources plus positive interface work ${fmt(row.whole_fixture_plus_ports_uw,3)} µW before channel sharing. ΔEdec above is the full fixture reservoir change. Clock sequence/order/level screen ${row.clock_sequence_pass?'passes':'misses'}; CSA output ${fmt(row.output_range_mv[0],3)}–${fmt(row.output_range_mv[1],3)} mV. Longest consecutive EVENT sequence ${row.longest_consecutive_event_cycles} cycles; calibrated one-operation-per-cycle capacity ${fmt(row.maximum_replenishment_current_a*1e9,3)} nA. Model <code>${esc(row.model_sha256)}</code>.<br>Display ${o.display_points.toLocaleString()} of ${o.native_points.toLocaleString()} native transient points, retaining per-bin extrema. Source SHA-256 <code>${esc(D.latest.event_source.sha256)}</code>.`;
    status.detectorReady=temperature;
  }
  function latestGallery() {
    const names=['clock_delay_section','clock_cap_bank','clock_cap_bit','clock_schmitt','clock_start_edge','clock_launch_latch'];
    $('clock-gallery').innerHTML=names.map(name=>`<a class="schematic-card" href="figures/${name}.svg" target="_blank" rel="noopener"><img src="figures/${name}.svg" alt="${esc(name.replaceAll('_',' '))}" loading="lazy"><span>${esc(name.replaceAll('_',' '))} ↗</span></a>`).join('');
  }

  async function nativeClocks() {
    const study = D.native_clock, select = $('native-clock-case');
    if (!select.options.length) {
      study.cases.forEach(r => select.add(new Option(`${r.title} / ${tempName(r.temperature_k)} / ${r.frequency_mhz} MHz`, r.id)));
      select.value = study.cases.at(-1).id;
    }
    const row = study.cases.find(r => r.id === select.value), a = row.assessment, e = a.energy;
    const names = Object.keys(row.scope), gap = 2.6;
    const colors = [C.ink,C.gray,C.red,C.cold,C.teal,C.warm];
    const signals = names.map((name,i) => {
      const s = row.scope[name], offset = (names.length-1-i)*gap;
      return line(s.time_us, s.value.map(v=>v+offset), name, colors[i], {
        showlegend:false, customdata:s.value, line:{color:colors[i],width:1.5,simplify:false},
        hovertemplate:`${name} %{customdata:.5f} V<br>%{x:.9f} µs<extra></extra>`});
    });
    $('native-clock-logic').style.height = '570px';
    const powerWindow = [e.start_s*1e6,e.stop_s*1e6];
    const shade = {type:'rect',xref:'x',x0:powerWindow[0],x1:powerWindow[1],yref:'paper',y0:0,y1:1,
      fillcolor:'#147d8210',line:{width:0},layer:'below'};
    const cycles = a.cycles.filter(r=>r.edges_ns), mean = [], minus = [], plus = [];
    for (let i=0;i<6;i++) {
      if (!cycles.length) {mean.push(null); minus.push(0); plus.push(0); continue;}
      const values = cycles.map(r=>r.edge_errors_ns[i]), m = values.reduce((a,b)=>a+b,0)/values.length;
      mean.push(m); minus.push(m-Math.min(...values)); plus.push(Math.max(...values)-m);
    }
    const labels = ['EVAL ↑','CAPTURE ↑','CAPTURE ↓','EVAL ↓','PHASE ↑','PHASE ↓'];
    await Promise.all([
      plot('native-clock-logic',signals,{
        xaxis:{...axis('Time (µs)'),range:row.window_us},
        yaxis:{...axis(''),fixedrange:true,tickmode:'array',showgrid:false,zeroline:false,
          tickvals:names.map((_,i)=>(names.length-1-i)*gap+row.vdd_v/2),ticktext:names,
          range:[-.15,(names.length-1)*gap+row.vdd_v+.2]},
        margin:{l:90,r:25,t:25,b:55},shapes:[shade]}),
      plot('native-clock-energy',[
        line(row.supply.time_us,row.supply.power_uw,'VDD source power',C.warm),
        line(row.supply.time_us,row.supply.cumulative_energy_pj,'Cumulative VDD work',C.teal,{xaxis:'x2',yaxis:'y2'})],{
        xaxis:{...axis(''),range:row.window_us,showticklabels:false,anchor:'y'},
        xaxis2:{...axis('Time (µs)'),range:row.window_us,matches:'x',anchor:'y2'},
        yaxis:{...axis('Source power (µW)'),domain:[.56,1]},
        yaxis2:{...axis('Energy (pJ)'),domain:[0,.38],anchor:'x2'},shapes:[shade],margin:{l:85,r:25,t:55,b:55}}),
      plot('native-clock-errors',[{type:'scatter',mode:'markers',x:labels,y:mean,marker:{color:C.teal,size:9},
        error_y:{type:'data',symmetric:false,array:plus,arrayminus:minus,color:C.teal},showlegend:false,
        hovertemplate:'%{x}<br>Mean error %{y:.5f} ns<extra></extra>'}],{
        xaxis:axis('Measured edge'),yaxis:axis('Target error (ns)'),shapes:[-1,1].map(sign=>({type:'line',
          xref:'paper',x0:0,x1:1,y0:sign*row.edge_tolerance_ns,y1:sign*row.edge_tolerance_ns,
          line:{color:C.red,width:1,dash:'dash'}}))})
    ]);
    await linkTime('native-clock',['native-clock-logic','native-clock-energy'],row.window_us,row.id);
    $('native-clock-scorecard').innerHTML = [
      ['Native timing screen',row.passed?'Pass':'Retained miss',`${fmt(a.maximum_edge_error_ns,3)} ns maximum edge error`,row.passed],
      ['PHASE width error',`${fmt(a.maximum_width_error_ns,3)} ns`,`Target ${fmt(row.requested_phase_width_ns,1)} ns`,a.maximum_width_error_ns<=row.width_tolerance_ns],
      ['Complete generator supply',`${fmt(e.supply_average_uw,2)} µW`,`${e.complete_cycles} complete cycles; reservoir retained`,true],
      ['External positive work',`${fmt(e.positive_input_boundary_average_uw,3)} µW`,`${fmt(e.energy_per_clock_pj,3)} pJ/clock including boundary work`,true]
    ].map(([label,value,note,ok])=>`<div class="score"><span>${esc(label)}</span><strong class="${ok?'pass':'fail'}">${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
    table('native-clock-table',['Completed case','Model','MHz','Solver','Words A–F','Edge error','Final PHASE width','VDD','Positive controls','Total work','Timing'],
      study.cases.map(r=>[esc(r.title),tempName(r.temperature_k),r.frequency_mhz,`${esc(r.execution.mode)} (${r.execution.threads} requested)`,`<code>${r.trim_words.join(' / ')}</code>`,
        `${fmt(r.assessment.maximum_edge_error_ns,3)} ns`,`${fmt(r.assessment.cycles.filter(c=>c.phase_width_ns!==undefined).at(-1)?.phase_width_ns,3)} ns`,
        `${fmt(r.assessment.energy.supply_average_uw,2)} µW`,`${fmt(r.assessment.energy.positive_input_boundary_average_uw,3)} µW`,
        `${fmt(r.assessment.energy.supply_plus_positive_boundary_average_uw,2)} µW`,r.passed?'Pass':'Retained miss']));
    table('native-physical-table',['Native cell','Ports','LVS instances','Property errors','Raw DRC findings','Extraction'],
      study.physical.map(r=>[`<code>${esc(r.cell)}</code>`,r.matched_ports,r.matched_instances,0,r.drc_raw_results,'3 stages complete']));
    $('native-clock-gallery').innerHTML = study.figures.filter(n=>!n.includes('-phase.')).map(name=>`<a class="schematic-card" href="figures/${esc(name)}" target="_blank" rel="noopener"><img src="figures/${esc(name)}" alt="${esc(name.replace('.svg','').replaceAll('-',' '))}" loading="lazy"><span>${esc(name.replace('native-clock-','').replace('.svg',''))} ↗</span></a>`).join('');
    $('native-clock-evidence').innerHTML = `<a href="${esc(row.result_href)}" target="_blank" rel="noopener">Verified native assessment and full source ledger ↗</a> · Input <code>${esc(row.input_sha256)}</code>.<br>Raw one-generator budget; channel count and complete-chip digital overhead are not allocated here. Native samples: ${row.native_points.toLocaleString()}. Informational solver notices: ${esc(row.notices.join(' '))}`;
    status.nativeClockReady = row.id;
  }

  async function nativeMom() {
    const rows=D.native_clock.mom,q=D.native_clock.mom_qualification;
    const names=['Factory schematic','Original PEX · duplicated device C','Corrected PEX · device C once'];
    const colors=[C.teal,C.red,C.blue],traces=[];
    rows.forEach((r,i)=>{
      traces.push(line(r.time_ns,r.current_ua,names[i],colors[i],{legendgroup:String(i)}));
      traces.push(line(r.time_ns,r.charge,names[i],colors[i],{xaxis:'x2',yaxis:'y2',legendgroup:String(i),showlegend:false}));
    });
    await plot('native-mom-charge',traces,{
      xaxis:{...axis(''),range:[0,6],showticklabels:false,anchor:'y'},
      xaxis2:{...axis('Time (ns)'),range:[0,6],matches:'x',anchor:'y2'},
      yaxis:{...axis('PLUS current (µA)'),domain:[.56,1]},
      yaxis2:{...axis('Delivered charge (fC)'),domain:[0,.38],anchor:'x2'},
      shapes:[{type:'rect',xref:'x',x0:.5,x1:3,yref:'paper',y0:0,y1:1,fillcolor:'#147d8210',line:{width:0},layer:'below'}],
      margin:{l:85,r:25,t:75,b:55}});
    table('native-mom-table',['Representation','Charge / 0.9 V step','Effective capacitance'],rows.map((r,i)=>[
      esc(names[i]),`${fmt(r.charge_fc,6)} fC`,`${fmt(r.capacitance_ff,6)} fF`]));
    $('native-mom-coupling').textContent=`Unchanged two-unit layout: A–B coupling ${fmt(q.coupling.external_coupling_before_ff,6)} fF before and ${fmt(q.coupling.external_coupling_after_ff,6)} fF after correction. Compact model plus remaining external geometry reproduces the corrected unit charge within 0.0001 fF. The standalone unit's unbound VSS extractor reference is treated as floating in that matrix comparison; the paired control and full generator have explicit VSS.`;
  }

  async function math() {
    if (!window.MathJax?.startup?.promise) throw new Error("MathJax CDN did not load");
    await MathJax.startup.promise;
    await MathJax.typesetPromise([$("report")]);
    status.math = true;
  }
  function navigation() {
    const links = [...document.querySelectorAll("nav a")];
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        links.forEach(a => a.classList.toggle("active", a.hash === "#" + e.target.id));
      }
    }, {rootMargin: "-5% 0px -65% 0px"});
    document.querySelectorAll("main > section, main > header").forEach(n => observer.observe(n));
    document.querySelectorAll("details").forEach(n => n.addEventListener("toggle", () => {if (n.open) n.querySelectorAll(".js-plotly-plot").forEach(p => Plotly.Plots.resize(p));}));
    for (const id of ["case-temp", "case-cap", "case-rate"]) $(id).addEventListener("change", () => updateCase().catch(e => fail(e, "case-overview")));
    $("case-reset").addEventListener("click", () => resetTime('case'));
    $("wave-temp").addEventListener("change", () => waveforms().catch(e => fail(e, "wave-current")));
    $("wave-rates").addEventListener("change", () => waveforms().catch(e => fail(e, "wave-current")));
    $('wave-logic-rate').addEventListener('change',()=>waveLogic().catch(e=>fail(e,'wave-logic')));
    $('wave-reset').addEventListener('click',()=>resetTime('wave'));
    $("noise-temp").addEventListener("change", () => noise().catch(e => fail(e, "noise-charge")));
    for (const id of ['clock-temp','clock-rate','clock-channels']) $(id).addEventListener('change',()=>clocks().catch(e=>fail(e,'clock-detail')));
    $('clock-reset').addEventListener('click',()=>resetTime('clock'));
    $('native-clock-case').addEventListener('change',()=>nativeClocks().catch(e=>fail(e,'native-clock-logic')));
    $('native-clock-reset').addEventListener('click',()=>resetTime('native-clock'));
    $('detector-temp').addEventListener('change',()=>detector().catch(e=>fail(e,'detector-current')));
    $('detector-reset').addEventListener('click',()=>resetTime('detector'));
    let resizing;
    window.addEventListener("resize", () => {clearTimeout(resizing); resizing = setTimeout(() => {
      if (plots.has("envelope-plot")) Plotly.relayout("envelope-plot", matrixLayout());
      if (plots.has("case-detail")) updateCase().catch(e => fail(e, "case-detail"));
      if (plots.has("wave-current")) waveforms().catch(e => fail(e, "wave-current"));
      if (plots.has("clock-heat")) clocks().catch(e => fail(e, "clock-heat"));
      if (plots.has("detector-current")) detector().catch(e => fail(e, "detector-current"));
    }, 180);});
    window.addEventListener("beforeprint", () => plots.forEach(id => Plotly.Plots.resize($(id))));
  }
  async function main() {
    if (!D) throw new Error("Local measurement data did not load");
    sourceLinks();
    latestGallery();
    if (!window.Plotly) throw new Error("Plotly CDN did not load. Internet access is needed for interactive plots; narrative and local vector schematics remain available.");
    navigation();
    const jobs = [["envelope-plot", envelope], ["case-overview", updateCase], ["architecture-comparison", architectures], ["wave-current", waveforms], ["wave-metrics", waveMetrics], ["gain-plot", spectra], ["noise-charge", noise], ["interference-plot", interference], ["energy-plot", energy], ["startup-plot", recovery], ["clock-detail", clocks], ["native-clock-logic", nativeClocks], ["native-mom-charge", nativeMom], ["detector-current", detector], ["equation typesetting", math]];
    await Promise.all(jobs.map(async ([name, fn]) => {try {await fn();} catch (error) {fail(error, name);}}));
    status.ready = true;
    $("runtime-status").textContent = status.errors.length ? `Loaded with ${status.errors.length} issue(s): ${status.errors.join("; ")}` : `${plots.size} interactive SVG figures · MathJax vector equations · local measurement data · Plotly ${Plotly.version}`;
  }
  main().catch(error => {fail(error, "runtime-status"); status.ready = true;});
})();
