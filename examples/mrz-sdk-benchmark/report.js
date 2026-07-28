// report.js - Self-contained HTML report generation for MRZ benchmark results.
// Generates a dark-themed dashboard matching the Python benchmark report format.

const ReportGenerator = (() => {

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pct(v) {
  return (v * 100).toFixed(2) + '%';
}

function ms(v) {
  return v.toFixed(1) + ' ms';
}

function rateColor(rate) {
  if (rate >= 0.9) return '#10b981';
  if (rate >= 0.6) return '#f59e0b';
  return '#ef4444';
}

function tagHtml(exact, success) {
  if (exact) return '<span class="tag tag-pass">PASS</span>';
  if (success) return '<span class="tag tag-miss">MISS</span>';
  return '<span class="tag tag-fail">FAIL</span>';
}

function matchBarHtml(rate) {
  const color = rateColor(rate);
  const w = Math.round(rate * 100);
  return `<span class="match-bar"><span class="match-bar-fill" style="width:${w}%;background:${color}"></span></span>`;
}

// Build timing histogram SVG (24 bins)
function histogramSvg(times, color, width = 600, height = 160) {
  if (!times.length) return '';
  const bins = 24;
  const max = Math.max(...times);
  const min = Math.min(...times);
  const range = max - min || 1;
  const counts = new Array(bins).fill(0);
  for (const t of times) {
    let idx = Math.floor((t - min) / range * bins);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);
  const barW = (width - 60) / bins;
  const chartH = height - 40;

  let bars = '';
  for (let i = 0; i < bins; i++) {
    const h = maxCount > 0 ? (counts[i] / maxCount) * chartH : 0;
    const x = 50 + i * barW;
    const y = chartH - h + 10;
    bars += `<rect x="${x}" y="${y}" width="${barW - 2}" height="${h}" fill="${color}" opacity="0.8" rx="1"/>`;
  }

  const labels = [min.toFixed(0), ((min + max) / 2).toFixed(0), max.toFixed(0)];
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="50" y="${height - 5}" fill="#9ca3af" font-size="10">${labels[0]} ms</text>
    <text x="${width / 2}" y="${height - 5}" fill="#9ca3af" font-size="10" text-anchor="middle">${labels[1]} ms</text>
    <text x="${width - 10}" y="${height - 5}" fill="#9ca3af" font-size="10" text-anchor="end">${labels[2]} ms</text>
    ${bars}
  </svg>`;
}

// Build comparison bar chart SVG
function comparisonBarSvg(vendors, metric, label, formatFn, width = 500) {
  const barH = 32;
  const gap = 16;
  const labelW = 100;
  const chartW = width - labelW - 60;
  const height = vendors.length * (barH + gap) + 20;
  const maxVal = Math.max(...vendors.map(v => v.value)) || 1;

  let bars = '';
  vendors.forEach((v, i) => {
    const y = 10 + i * (barH + gap);
    const w = (v.value / maxVal) * chartW;
    bars += `<text x="${labelW - 8}" y="${y + barH / 2 + 4}" fill="#e5e7eb" font-size="12" text-anchor="end">${escHtml(v.name)}</text>`;
    bars += `<rect x="${labelW}" y="${y}" width="${Math.max(w, 2)}" height="${barH}" fill="${v.color}" rx="4" opacity="0.85"/>`;
    bars += `<text x="${labelW + w + 8}" y="${y + barH / 2 + 4}" fill="#e5e7eb" font-size="11">${formatFn(v.value)}</text>`;
  });

  return `<div style="margin-bottom:20px">
    <div style="font-size:13px;font-weight:600;color:#e5e7eb;margin-bottom:8px">${escHtml(label)}</div>
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>
  </div>`;
}

// Generate the full HTML report
function generate(benchmarkData) {
  const { vendors, images, hasGroundTruth, startedAt, finishedAt, runs } = benchmarkData;
  const vendorCount = vendors.length;
  const isComparison = vendorCount > 1;

  // Build summary cards
  let cardsHtml = '';
  for (const vendor of vendors) {
    const s = vendor.summary;
    cardsHtml += `<div class="vendor-card" style="border-top-color:${vendor.color}">
      <div class="vendor-card-title" style="color:${vendor.color}">${escHtml(vendor.name)}${vendor.version ? ' <span style="font-size:11px;color:#9ca3af">(' + escHtml(vendor.version) + ')</span>' : ''}</div>
      <div class="metric-grid">
        ${hasGroundTruth ? `<div class="metric-item"><div class="metric-label">Exact Accuracy</div><div class="metric-value">${pct(s.exact_accuracy)}</div><div class="metric-sub">${s.exact_count}/${s.total_images}</div></div>` : ''}
        <div class="metric-item"><div class="metric-label">Success Rate</div><div class="metric-value">${pct(s.success_rate)}</div><div class="metric-sub">${s.success_count}/${s.total_images}</div></div>
        ${hasGroundTruth ? `<div class="metric-item"><div class="metric-label">Avg Match Rate</div><div class="metric-value">${pct(s.average_match_rate)}</div></div>` : ''}
        <div class="metric-item"><div class="metric-label">Avg Time</div><div class="metric-value">${ms(s.avg_ms)}</div><div class="metric-sub">P50: ${ms(s.p50_ms)} | P95: ${ms(s.p95_ms)}</div></div>
        <div class="metric-item"><div class="metric-label">Min / Max</div><div class="metric-value">${ms(s.min_ms)}</div><div class="metric-sub">Max: ${ms(s.max_ms)}</div></div>
        <div class="metric-item"><div class="metric-label">Total Elapsed</div><div class="metric-value">${(s.total_wall_ms / 1000).toFixed(1)}s</div></div>
      </div>
    </div>`;
  }

  // Build comparison charts
  let comparisonHtml = '';
  if (isComparison) {
    if (hasGroundTruth) {
      const accData = vendors.map(v => ({ name: v.name, value: v.summary.exact_accuracy, color: v.color }));
      comparisonHtml += comparisonBarSvg(accData, 'accuracy', 'Exact Accuracy Comparison', pct);
      const matchData = vendors.map(v => ({ name: v.name, value: v.summary.average_match_rate, color: v.color }));
      comparisonHtml += comparisonBarSvg(matchData, 'match', 'Average Match Rate Comparison', pct);
    }
    const speedData = vendors.map(v => ({ name: v.name, value: v.summary.avg_ms, color: v.color }));
    comparisonHtml += comparisonBarSvg(speedData, 'speed', 'Average Time Comparison (lower is better)', ms);
  }

  // Build histograms
  let histHtml = '';
  for (const vendor of vendors) {
    const times = vendor.results.map(r => r.scanMs).filter(t => t > 0);
    histHtml += `<div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:${vendor.color};margin-bottom:4px">${escHtml(vendor.name)} - Timing Distribution</div>
      ${histogramSvg(times, vendor.color)}
    </div>`;
  }

  // Build per-image detail table
  let tableHtml = '';
  if (isComparison) {
    // Comparison table: one row per image, columns for each vendor
    let headerCols = '<th>#</th><th>Image</th>';
    for (const v of vendors) {
      headerCols += `<th style="color:${v.color}">${escHtml(v.name)} Status</th>`;
      if (hasGroundTruth) headerCols += `<th style="color:${v.color}">Match</th>`;
      headerCols += `<th style="color:${v.color}">Time</th>`;
    }
    if (hasGroundTruth) headerCols += '<th>Ground Truth</th>';

    let rows = '';
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let cols = `<td>${i + 1}</td><td class="img-path">${escHtml(img.key)}</td>`;
      for (const v of vendors) {
        const r = v.results[i];
        if (!r) {
          cols += '<td>-</td>';
          if (hasGroundTruth) cols += '<td>-</td>';
          cols += '<td>-</td>';
          continue;
        }
        cols += `<td>${tagHtml(r.exact_match, r.success)}</td>`;
        if (hasGroundTruth) {
          cols += `<td>${(r.match_rate * 100).toFixed(1)}% ${matchBarHtml(r.match_rate)}</td>`;
        }
        cols += `<td>${r.scanMs.toFixed(0)} ms</td>`;
      }
      if (hasGroundTruth) {
        const truth = img.truth || '';
        cols += `<td class="mrz-text" title="${escHtml(truth)}">${escHtml(truth.slice(0, 60))}${truth.length > 60 ? '...' : ''}</td>`;
      }
      rows += `<tr>${cols}</tr>`;
    }
    tableHtml = `<table class="detail-table"><thead><tr>${headerCols}</tr></thead><tbody>${rows}</tbody></table>`;
  } else {
    // Single vendor table with MRZ text
    const v = vendors[0];
    let headerCols = '<th>#</th><th>Image</th><th>Status</th>';
    if (hasGroundTruth) headerCols += '<th>Match</th><th>Match Bar</th>';
    headerCols += '<th>Time (ms)</th><th>Recognized MRZ</th>';
    if (hasGroundTruth) headerCols += '<th>Ground Truth</th>';

    let rows = '';
    for (let i = 0; i < v.results.length; i++) {
      const r = v.results[i];
      const img = images[i];
      let cols = `<td>${i + 1}</td><td class="img-path">${escHtml(img.key)}</td>`;
      cols += `<td>${tagHtml(r.exact_match, r.success)}</td>`;
      if (hasGroundTruth) {
        cols += `<td>${(r.match_rate * 100).toFixed(1)}%</td>`;
        cols += `<td>${matchBarHtml(r.match_rate)}</td>`;
      }
      cols += `<td>${r.scanMs.toFixed(0)}</td>`;
      const recognized = r.mrzText || '';
      cols += `<td class="mrz-text" title="${escHtml(recognized)}">${escHtml(recognized.slice(0, 64))}${recognized.length > 64 ? '...' : ''}</td>`;
      if (hasGroundTruth) {
        const truth = img.truth || '';
        cols += `<td class="mrz-text" title="${escHtml(truth)}">${escHtml(truth.slice(0, 64))}${truth.length > 64 ? '...' : ''}</td>`;
      }
      rows += `<tr>${cols}</tr>`;
    }
    tableHtml = `<table class="detail-table"><thead><tr>${headerCols}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  const title = isComparison ? 'MRZ Benchmark Comparison Report' : `MRZ Benchmark Report - ${vendors[0].name}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<style>
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #111827;
  color: #e5e7eb;
  margin: 0;
  padding: 24px;
  line-height: 1.5;
}
.hero {
  text-align: center;
  margin-bottom: 32px;
}
.hero h1 {
  font-size: 1.8rem;
  margin: 0 0 12px;
  color: #f9fafb;
}
.hero-pills {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.pill {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 20px;
  padding: 4px 14px;
  font-size: 0.8rem;
  color: #9ca3af;
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.vendor-card {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 16px;
  border-top: 4px solid #6b7280;
}
.vendor-card-title {
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 12px;
}
.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.metric-item {
  padding: 8px;
  background: #111827;
  border-radius: 6px;
}
.metric-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9ca3af;
}
.metric-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #f9fafb;
}
.metric-sub {
  font-size: 0.7rem;
  color: #6b7280;
}
.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 24px 0 12px;
  color: #f9fafb;
}
.detail-table-wrapper {
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid #374151;
  border-radius: 8px;
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.detail-table th {
  background: #1f2937;
  padding: 10px 8px;
  text-align: left;
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #9ca3af;
  border-bottom: 2px solid #374151;
  position: sticky;
  top: 0;
  z-index: 1;
}
.detail-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #1f2937;
  vertical-align: top;
}
.detail-table tr:hover td {
  background: #1f2937;
}
.tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
}
.tag-pass { background: #064e3b; color: #6ee7b7; }
.tag-miss { background: #78350f; color: #fcd34d; }
.tag-fail { background: #7f1d1d; color: #fca5a5; }
.match-bar {
  display: inline-block;
  width: 50px;
  height: 5px;
  background: #374151;
  border-radius: 3px;
  overflow: hidden;
  vertical-align: middle;
}
.match-bar-fill {
  height: 100%;
  border-radius: 3px;
}
.mrz-text {
  font-family: "Cascadia Code", "Fira Code", monospace;
  font-size: 0.68rem;
  word-break: break-all;
  max-width: 260px;
  color: #9ca3af;
}
.img-path {
  font-size: 0.72rem;
  color: #d1d5db;
  white-space: nowrap;
}
</style>
</head>
<body>
<div class="hero">
  <h1>${escHtml(title)}</h1>
  <div class="hero-pills">
    <span class="pill">Images: ${images.length}</span>
    <span class="pill">Runs: ${runs}</span>
    <span class="pill">Started: ${escHtml(startedAt)}</span>
    <span class="pill">Finished: ${escHtml(finishedAt)}</span>
    <span class="pill">Ground Truth: ${hasGroundTruth ? 'Yes' : 'No'}</span>
  </div>
</div>

<div class="summary-cards">${cardsHtml}</div>

${comparisonHtml ? `<div class="section-title">Comparison</div>${comparisonHtml}` : ''}

<div class="section-title">Timing Distribution</div>
${histHtml}

<div class="section-title">Per-Image Details</div>
<div class="detail-table-wrapper">${tableHtml}</div>

</body>
</html>`;
}

return { generate };
})();
