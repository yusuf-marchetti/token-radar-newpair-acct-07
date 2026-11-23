// New-Pair Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the board, a detail view for every
// protocol, and the filters. No network: every byte it shows is in data.js.
//
// Routes, all in the hash so a screenshot can open each state directly:
//   #/            the board
//   #/p/<slug>    one protocol's detail view
//   #/f?new=1     the board with filters preset (new pairs only, here)
//
// The value model lives here in the open, next to the numbers it produces:
// implied value = TVL x the category's live-token multiple
//               x momentum (1 + 0.5 x 7d growth, clamped)
//               x a freshness tilt for recently listed protocols
//               x 1.5 for a new-pair breakout (listed in the last 180 days
//                 and up 20% or more in 7 days).

var DATA = window.RADAR;

function $(id) { return document.getElementById(id); }

/** Escape text for HTML: names come from the snapshot, never trusted raw. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** $1.23B, $456.7M, $12.3K, $999. */
function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** +12.3%, -4.1%, or n/a when the snapshot reports no change.
    change_7d arrives in per cent already (+20 means +20%). */
function pct(g) {
  if (g === null || g === undefined) return '<span class="flat">n/a</span>';
  var v = g;
  var cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
}

/** 12d, 3.2y, or an em dash when listed_at is unknown. */
function ageLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days < 365) return days + 'd';
  return (days / 365).toFixed(1) + 'y';
}

/** Read the route out of location.hash. */
function route() {
  var hash = window.location.hash.replace(/^#/, '');
  if (hash.indexOf('/p/') === 0) return { view: 'detail', slug: decodeURIComponent(hash.slice(3)) };
  if (hash.indexOf('/f') === 0) {
    var params = new URLSearchParams(hash.slice(2).replace(/^\?/, ''));
    return { view: 'filter', params: params };
  }
  return { view: 'board' };
}

var SORTS = {
  value: function (a, b) { return a.rank - b.rank; },
  tvl: function (a, b) { return b.tvl_usd - a.tvl_usd || a.rank - b.rank; },
  growth: function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d) || a.rank - b.rank; },
  newest: function (a, b) { return (a.age_days === null ? Infinity : a.age_days) - (b.age_days === null ? Infinity : b.age_days) || a.rank - b.rank; },
  name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.rank - b.rank; },
};

/** The board's rows after the current filters, in the current sort. */
function visibleRows() {
  var q = $('q').value.trim().toLowerCase();
  var chain = $('chain').value;
  var category = $('category').value;
  var onlyNew = $('onlyNew').checked;
  var onlyWatch = $('onlyWatch').checked;
  var rows = DATA.rows.filter(function (r) {
    if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
    if (chain && r.chains.indexOf(chain) === -1) return false;
    if (category && (r.category || 'Uncategorized') !== category) return false;
    if (onlyNew && !r.new_pair) return false;
    if (onlyWatch && !r.watchlist) return false;
    return true;
  });
  rows.sort(SORTS[$('sort').value] || SORTS.value);
  return rows;
}

function badges(r) {
  var out = '';
  if (r.new_pair) out += '<span class="badge new">NEW PAIR</span>';
  if (r.watchlist) out += '<span class="badge watch">WATCHLIST</span>';
  return out;
}

function renderBoard() {
  var rows = visibleRows();
  var html = rows.map(function (r) {
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="rank">' + r.rank + '</td>' +
      '<td><span class="name">' + esc(r.name) + '</span>' + badges(r) +
      '<span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || 'Uncategorized') + '</td>' +
      '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
      '<td class="money num">' + money(r.tvl_usd) + '</td>' +
      '<td class="pct num">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + ageLabel(r.age_days) + '</td>' +
      '<td class="money num"><b>' + money(r.implied_value_usd) + '</b></td>' +
      '</tr>';
  }).join('');
  $('rows').innerHTML = html;
  $('empty').classList.toggle('hidden', rows.length > 0);
  $('boardCount').textContent = rows.length + ' of ' + DATA.rows.length + ' rows';
  var title = 'The board';
  if ($('onlyNew').checked) title = 'New pairs — listed in the last 180 days and surging';
  else if ($('onlyWatch').checked) title = 'The watchlist — every protocol the snapshot flags';
  $('boardTitle').textContent = title;
}

function factorBar(label, value, max, amber) {
  var width = Math.max(2, Math.min(100, (value / max) * 100));
  return '<div class="factor"><span>' + label + '</span>' +
    '<span class="bar"><i class="' + (amber ? 'amber' : '') + '" style="width:' + width.toFixed(1) + '%"></i></span>' +
    '<span class="val">' + value.toFixed(2) + 'x</span></div>';
}

function renderDetail(slug) {
  var r = null;
  for (var i = 0; i < DATA.rows.length; i++) {
    if (DATA.rows[i].slug === slug) { r = DATA.rows[i]; break; }
  }
  var el = $('detail');
  if (!r) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  var f = r.factors;
  var formula = money(r.tvl_usd) + ' TVL x ' + f.peer_multiple.toFixed(2) + ' peer multiple x ' +
    f.momentum.toFixed(2) + ' momentum x ' + f.freshness_tilt.toFixed(2) + ' freshness' +
    (f.ignition > 1 ? ' x 1.50 new-pair ignition' : '') + ' = ' + money(r.implied_value_usd);
  el.innerHTML =
    '<div class="detail-head"><div><h2>' + esc(r.name) + badges(r) + '</h2>' +
    '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + ' · ' +
    esc(r.chains.join(', ')) + ' · rank #' + r.rank + ' of ' + DATA.rows.length + '</p></div>' +
    '<button class="back" type="button" id="backBtn">← Back to the board</button></div>' +
    '<div class="facts">' +
    '<div class="fact"><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
    '<div class="fact"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
    '<div class="fact"><span>7-day change</span><b>' + (r.change_7d === null ? 'n/a' : ((r.change_7d) > 0 ? '+' : '') + (r.change_7d).toFixed(1) + '%') + '</b></div>' +
    '<div class="fact"><span>Listed</span><b>' + (r.listed_at || 'unknown') + ' (' + ageLabel(r.age_days) + ' old)</b></div>' +
    '</div>' +
    '<div class="factors"><h3>Why this value</h3>' +
    factorBar('Peer multiple (' + esc(r.category || 'Uncategorized') + ')', f.peer_multiple, 5, false) +
    factorBar('Momentum (7d growth)', f.momentum, 2.5, false) +
    factorBar('Freshness tilt (recent listing)', f.freshness_tilt, 1, false) +
    factorBar('New-pair ignition', f.ignition, 1.5, f.ignition > 1) +
    '<div class="formula">' + esc(formula) + '</div></div>' +
    '<div class="steps"><h3>Farm plan — what to do about ' + esc(r.name) + '</h3><ol>' +
    r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
    '</ol></div>' +
    '<p class="note">' + esc(r.name) + ' records no token: the snapshot carries no market cap, ' +
    'CoinGecko id or symbol for it. That is the record, not proof it has none — a protocol on this ' +
    'board may still have a token its DefiLlama record does not carry.</p>';
  $('backBtn').addEventListener('click', function () {
    window.location.hash = '#/';
  });
  document.querySelectorAll('#rows tr').forEach(function (tr) {
    tr.classList.toggle('active', tr.getAttribute('data-slug') === slug);
  });
}

function renderLive() {
  var chips = DATA.live.map(function (p) {
    return '<div class="live-chip"><b>' + esc(p.name) + '</b> ' + esc(p.symbol || '') +
      '<span>mcap ' + money(p.mcap_usd) + ' · TVL ' + money(p.tvl_usd) + '</span></div>';
  }).join('');
  $('live').innerHTML = '<h2>Already trading — not ranked</h2>' +
    '<p class="muted">These protocols record a token, so the radar does not rank them. ' +
    'Their market caps are the market’s own values, shown so the board’s pre-token rows can be read against them.</p>' +
    '<div class="live-grid">' + chips + '</div>';
}

function renderMethod() {
  $('method').innerHTML = '<h2>How the radar scores</h2>' +
    '<p>' + esc(DATA.model_text) + '</p>' +
    '<ul>' +
    '<li><b>Peer multiple:</b> each category is priced at the median market-cap / TVL of its own protocols that already trade — ' +
    'a multiple the snapshot itself supplies, never a hardcoded list of names.</li>' +
    '<li><b>Freshness:</b> a protocol listed days ago tilts the value up; one listed years ago tilts it down. ' +
    'The tilt is <code>0.45 + 0.55 × exp(-age / 540)</code>.</li>' +
    '<li><b>New-pair breakout:</b> listed in the last 180 days and up 20% or more in 7 days earns a 1.5x ignition and the NEW PAIR badge.</li>' +
    '<li><b>Watchlist:</b> every protocol the snapshot flags is on the board; the board also carries pre-token protocols below the floor — the early rows this radar exists to find.</li>' +
    '</ul>';
}

function renderMeta() {
  $('meta').innerHTML = 'Snapshot as of <b>' + esc(DATA.as_of) + '</b><br>' +
    'Model <b>' + esc(DATA.model_version) + '</b> · Watchlist floor <b>' + money(DATA.floor_usd) + '</b>';
  var c = DATA.counts;
  $('stats').innerHTML =
    '<div class="stat"><b>' + c.protocols + '</b><span>protocols scanned</span></div>' +
    '<div class="stat"><b>' + c.pre_token + '</b><span>genuine pre-token subjects</span></div>' +
    '<div class="stat"><b>' + c.watchlist + '</b><span>on the watchlist</span></div>' +
    '<div class="stat hot"><b>' + c.new_pairs + '</b><span>new pairs on the board</span></div>' +
    '<div class="stat"><b>' + c.board_rows + '</b><span>rows on the board</span></div>';
  $('foot').textContent = 'Implied values are this entry’s own claims, computed from the sealed snapshot of ' +
    DATA.as_of + '; they are not predictions that a token will be issued. Board rows: ' + c.board_rows +
    '. Data: DefiLlama snapshot as sealed in the bounty kit.';
}

function fillSelects() {
  var chains = {};
  var cats = {};
  DATA.rows.forEach(function (r) {
    r.chains.forEach(function (c) { chains[c] = true; });
    cats[r.category || 'Uncategorized'] = true;
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('chain').appendChild(o);
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('category').appendChild(o);
  });
}

/** Apply a #/f preset (new, watch, chain, category, q, sort) to the controls. */
function applyPreset(params) {
  if (params.has('new')) $('onlyNew').checked = params.get('new') === '1';
  if (params.has('watch')) $('onlyWatch').checked = params.get('watch') === '1';
  if (params.has('chain')) $('chain').value = params.get('chain');
  if (params.has('category')) $('category').value = params.get('category');
  if (params.has('q')) $('q').value = params.get('q');
  if (params.has('sort')) $('sort').value = params.get('sort');
}

function render() {
  var r = route();
  // A detail route is a focused page: the board and its controls hide, so
  // the detail panel sits at the top with no scrolling needed.
  var isDetail = r.view === 'detail';
  $('controls').classList.toggle('hidden', isDetail);
  $('boardPanel').classList.toggle('hidden', isDetail);
  $('detail').classList.toggle('hidden', !isDetail);
  renderBoard();
  if (isDetail) renderDetail(r.slug);
  else $('detail').innerHTML = '';
  if (r.view === 'filter') applyPreset(r.params);
  renderBoard();
}

function init() {
  fillSelects();
  renderMeta();
  renderLive();
  renderMethod();
  ['q', 'chain', 'category', 'sort', 'onlyNew', 'onlyWatch'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });
  $('reset').addEventListener('click', function () {
    $('q').value = '';
    $('chain').value = '';
    $('category').value = '';
    $('sort').value = 'value';
    $('onlyNew').checked = false;
    $('onlyWatch').checked = false;
    window.location.hash = '#/';
    renderBoard();
  });
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      $('sort').value = key === 'name' ? 'value' : key;
      renderBoard();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) window.location.hash = '#/p/' + encodeURIComponent(tr.getAttribute('data-slug'));
  });
  window.addEventListener('hashchange', render);
  render();
}

init();
