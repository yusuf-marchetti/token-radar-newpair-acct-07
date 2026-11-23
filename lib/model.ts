// New-pair radar: find the pre-token protocol whose token would be worth the
// most, with the emphasis on pairs that are NEW — recently listed, already
// large, and surging. A "new pair" is a protocol that behaves like a token
// pair that just caught a bid: it appeared recently, its TVL is already
// substantial, and its seven-day growth is steep. The board ranks those
// first, because a launch into a hot, young market is worth more than the
// same TVL sitting flat for years.
//
// The value model uses only the snapshot's own figures. No protocol name is
// ever special-cased; the same function scores every row:
//
//   peer     = the category's own live-token multiple: the median
//              market-cap / TVL of the protocols in the same category that
//              already record a token, clamped to [0.15, 5]. A category
//              with no live-token peer falls back to the global median.
//              (This is what separates the board from the market: pre-token
//              protocols are priced at the multiple their own category's
//              traded tokens already carry.)
//   growth   = change_7d as a fraction (the snapshot carries it in per
//              cent: +20 means +20%, so divide by 100), null when unreported
//              (read as 0)
//   momentum = 1 + 0.5 * clamp(growth, -0.50, 2.00)
//   age      = days from listed_at to the snapshot's as_of, null when unknown
//   fresh    = exp(-age / 540) for a known age, 0.45 when unknown
//   tilt     = 0.45 + 0.55 * fresh          (newer lists tilt the value up)
//   ignition = 1.5 when age <= 180 days and growth >= +20%, else 1.0
//              (the new-pair breakout: young AND surging)
//   implied  = max(1, round(tvl_usd * peer * momentum * tilt * ignition))
//
// The board ranks genuine subjects only, by the house's own watchlist rule:
// a protocol whose category is Bridge, Canonical Bridge, Liquid Staking,
// Liquid Restaking, Restaked BTC or CEX, whose name ends in a version
// marker, carries a whole word wrapped, staked or staking, or begins with
// an exchange's name is a wrapped, staked or bridged product of a token
// that already trades — WBTC, USDT0 and the exchange bridges are off the
// board for exactly this reason, however large their TVL. The watchlist
// itself passes this rule by construction, so it is always covered.
//
// A protocol is pre-token when the snapshot records no token for it: its
// market cap, CoinGecko id and symbol are all null. The board holds up to
// 200 rows: every slug on the snapshot's watchlist (the floor, never the
// ceiling), plus the highest-scoring other genuine pre-token protocols.
// This snapshot holds 197 genuine subjects, so the board holds 197 rows.
// Live-token protocols are never ranked; the dashboard shows the largest
// of them apart, as the market's own values, under "Already trading".

/** One protocol entry, exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The four factors behind one row's implied value, for the detail view. */
export interface ValueFactors {
  peer_multiple: number;
  momentum: number;
  freshness_tilt: number;
  ignition: number;
}

/** One ranked board row. Extra keys are allowed by the gate. */
export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  new_pair: boolean;
  watchlist: boolean;
  factors: ValueFactors;
}

/** A live-token protocol, shown apart from the board, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
}

/** Everything the dashboard renders, written out as data.js. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  model_version: string;
  model_text: string;
  counts: { protocols: number; pre_token: number; watchlist: number; new_pairs: number; board_rows: number };
  peer_multiples: Record<string, number>;
  rows: BoardRow[];
  live: LiveRow[];
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'new-pair-1';

/** Categories that mark a wrapped, staked or bridged product, never a subject. */
const WRAPPED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Names that begin with an exchange's name are that exchange's product. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A version marker at the end of the name: a space followed by V2, v2, 2.0 or the like. */
const VERSION_MARKER = /\s(V|v)?\d+(\.\d+)*$/;

/**
 * True when a protocol is a genuine radar subject: it records no token and
 * it is not a wrapped, staked or bridged product of a token that already
 * trades, by the same rule the house used for the watchlist.
 */
export function isBoardEligible(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (EXCHANGE_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  return true;
}

/** The most rows the board holds (it holds every eligible subject up to this). */
export const BOARD_ROWS = 200;

/** How many live-token protocols the "Already trading" strip carries. */
export const LIVE_ROWS = 24;

/** Peer multiple clamp, so one outlier category cannot run the board. */
const PEER_CLAMP: [number, number] = [0.15, 5];

/** Freshness decay: exp(-age / FRESHNESS_TAU). */
const FRESHNESS_TAU = 540;

/** Freshness when listed_at is unknown. */
const UNKNOWN_FRESHNESS = 0.45;

/** The new-pair breakout: at most this old, at least this much 7d growth (per cent). */
const IGNITION_MAX_AGE_DAYS = 180;
const IGNITION_MIN_GROWTH_PCT = 20;
const IGNITION_MULTIPLE = 1.5;

/** One-line statement of the model, shown on the dashboard. */
export const MODEL_TEXT =
  'New-pair radar: implied value = TVL x the category’s live-token multiple (median mcap/TVL of its traded peers) ' +
  'x momentum (1 + 0.5 x 7d growth in per cent / 100, clamped to -50%/+200%) x a freshness tilt for recently listed protocols ' +
  'x 1.5 when a protocol listed in the last 180 days is up 20% or more in 7 days — the new-pair breakout. ' +
  'Wrapped, staked and bridged products of tokens that already trade are off the board, by the same rule the watchlist uses.';

/** Clamp a number into [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Days from listed_at to as_of, or null when listed_at is missing or unparsable. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(listed) || !Number.isFinite(as)) return null;
  const days = Math.floor((as - listed) / 86_400_000);
  return days < 0 ? 0 : days;
}

/** True when the snapshot records no token for this protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The live-token multiple per category: the median market-cap / TVL of the
 * protocols in that category that already record a token. Categories with
 * no traded peer fall back to the global median. Every multiple is clamped.
 */
export function peerMultiples(protocols: SnapshotProtocol[]): Map<string, number> {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const global = all.length > 0 ? clamp(median(all), PEER_CLAMP[0], PEER_CLAMP[1]) : 1;
  const out = new Map<string, number>();
  for (const [key, ratios] of byCategory) {
    out.set(key, clamp(median(ratios), PEER_CLAMP[0], PEER_CLAMP[1]));
  }
  out.set('__global__', global);
  return out;
}

/** Score one pre-token protocol: its implied value, its factors, its badge. */
export function scoreProtocol(
  p: SnapshotProtocol,
  multiples: Map<string, number>,
  asOf: string,
): { implied: number; factors: ValueFactors; newPair: boolean; age: number | null } {
  const peer = multiples.get(p.category ?? 'Uncategorized') ?? multiples.get('__global__') ?? 1;
  // change_7d arrives in per cent (+20 means +20%): work with the fraction.
  const growthPct = p.change_7d ?? 0;
  const growth = growthPct / 100;
  const momentum = 1 + 0.5 * clamp(growth, -0.5, 2.0);
  const age = ageDays(p.listed_at, asOf);
  const fresh = age === null ? UNKNOWN_FRESHNESS : Math.exp(-age / FRESHNESS_TAU);
  const tilt = 0.45 + 0.55 * fresh;
  const newPair = age !== null && age <= IGNITION_MAX_AGE_DAYS && growthPct >= IGNITION_MIN_GROWTH_PCT;
  const ignition = newPair ? IGNITION_MULTIPLE : 1;
  const implied = Math.max(1, Math.round(p.tvl_usd * peer * momentum * tilt * ignition));
  return { implied, factors: { peer_multiple: peer, momentum, freshness_tilt: tilt, ignition }, newPair, age };
}

// ---------------------------------------------------------------- farm plans

/** Position size by TVL tier, so the plan's dollars fit the protocol. */
function positionSize(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000_000) return '$10,000';
  if (tvlUsd >= 250_000_000) return '$5,000';
  if (tvlUsd >= 100_000_000) return '$2,000';
  if (tvlUsd >= 50_000_000) return '$1,000';
  return '$500';
}

/** Gas wording by chain, so the cost line is honest per network. */
function gasNote(chains: string[]): string {
  const first = chains[0] ?? 'Ethereum';
  if (first === 'Solana') return 'a few cents per transaction on Solana';
  if (first === 'Ethereum') return 'about $10–$40 per transaction on Ethereum mainnet';
  if (['Arbitrum', 'Base', 'Optimism', 'Polygon', 'Blast', 'Linea', 'Scroll', 'zkSync Era'].includes(first)) {
    return `under $1 per transaction on ${first}`;
  }
  if (first === 'Bitcoin') return 'about $1–$5 per transaction in network fees';
  return 'a few dollars per transaction in gas';
}

/** The core action for a category: what "farming" it actually means. */
const CORE_ACTION: Record<string, string> = {
  Dexs: 'swap through the pools and add liquidity to the deepest pair',
  Lending: 'supply collateral and borrow against it, keeping the loan-to-value under 60%',
  Yield: 'deposit into the highest-yield vault and let the yield compound',
  'Yield Aggregator': 'deposit into the auto-compounding vault and let it rotate strategies',
  Derivatives: 'open a small perpetual position with 2x leverage at most and a stop-loss set',
  CDP: 'lock collateral and mint the stablecoin, keeping the collateral ratio above 200%',
  Restaking: 'restake liquid staking tokens with an operator and delegate to an actively validated service',
  'Liquid Restaking': 'mint the restaked token and hold it while the points accrue',
  'Liquid Staking': 'stake and hold the liquid staking token, then use it as collateral elsewhere',
  RWA: 'buy into the tokenised asset offering and hold through the lock-up window',
  Bridge: 'bridge assets across the supported chains in both directions each week',
  'Canonical Bridge': 'bridge assets in through the official bridge and keep a balance on the destination chain',
  'Cross Chain Bridge': 'bridge assets across the supported chains in both directions each week',
  Launchpad: 'stake the launchpad token and apply for each allocation round',
  Farm: 'stake LP tokens in the farm and harvest the rewards weekly',
  'Liquidity Manager': 'deposit into the managed liquidity vault and let it rebalance the range',
  'Leveraged Farming': 'open a leveraged farm at 2x at most and watch the liquidation price daily',
  'Basis Trading': 'deposit into the basis vault and hold through the funding cycle',
  'Staking Pool': 'stake in the pool and keep the stake bonded for the full epoch',
  Synthetics: 'mint the synthetic asset against collateral and hold the position',
  Indexes: 'buy the index token and hold it as the basket rebalances',
  'Token Locker': 'lock tokens in the locker for the longest term that still lets you exit',
  'Risk Curators': 'deposit into the curated vault matching your risk band',
  'Onchain Capital Allocator': 'allocate to the vault and review its monthly rebalancing report',
  CEX: 'use the exchange account for spot trades and keep a balance for fee discounts',
  Chain: 'bridge in, use the chain’s flagship apps, and keep a native-token balance for gas',
  'Anchor BTC': 'deposit BTC into the vault and hold the receipt token',
  'Decentralized BTC': 'mint the BTC-backed asset and use it in the lending markets',
  'Restaked BTC': 'restake BTC through the vault and delegate to an operator',
  CeDeFi: 'deposit into the CeDeFi vault and track its weekly yield report',
};

/** Build the farm plan for one protocol: 4 concrete steps, costs and time. */
export function farmSteps(p: SnapshotProtocol): string[] {
  const name = p.name;
  const chain = p.chains[0] ?? 'Ethereum';
  const chains = p.chains.length > 1 ? `${p.chains.slice(0, 3).join(', ')}${p.chains.length > 3 ? ` and ${p.chains.length - 3} more` : ''}` : chain;
  const size = positionSize(p.tvl_usd);
  const gas = gasNote(p.chains);
  const action = CORE_ACTION[p.category ?? ''] ?? 'use the protocol’s core feature with a real position';
  const steps = [
    `Set up a wallet on ${chain} and bridge about ${size} in; keep a separate small balance for gas, at ${gas}, so a stuck transaction never strands the position.`,
    `On ${name}, ${action}: start with half the ${size} position, confirm the transaction and the position receipt, then add the second half once the first shows up in the dashboard.`,
    `Come back weekly for 4–8 weeks and repeat the core action: top the position up, harvest or compound anything it earned, and log each visit; each visit takes about 15 minutes plus ${gas}.`,
    `Track ${name}’s TVL and its category on the radar every week; if a token launches, check the claim window in the first week, claim anything the position earned, and only then decide whether to keep, sell or add to it.`,
  ];
  void chains;
  return steps;
}

// ---------------------------------------------------------------- the board

/** Parse and lightly validate the snapshot document. */
export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (!doc || typeof doc !== 'object') throw new Error('snapshot is not a JSON object');
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new Error('snapshot holds no protocols or watchlist array');
  }
  return doc;
}

/** Build the ranked board, the live strip and the dashboard payload. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const multiples = peerMultiples(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const scored: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isBoardEligible(p)) continue;
    const { implied, factors, newPair, age } = scoreProtocol(p, multiples, snapshot.as_of);
    scored.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(p),
      new_pair: newPair,
      watchlist: watch.has(p.slug),
      factors: {
        peer_multiple: Math.round(factors.peer_multiple * 1000) / 1000,
        momentum: Math.round(factors.momentum * 1000) / 1000,
        freshness_tilt: Math.round(factors.freshness_tilt * 1000) / 1000,
        ignition: factors.ignition,
      },
    });
  }
  // Highest implied value first; TVL breaks ties; slug keeps it deterministic.
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const picked: BoardRow[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    if (row.watchlist) {
      picked.push(row);
      seen.add(row.slug);
    }
  }
  for (const row of scored) {
    if (picked.length >= BOARD_ROWS) break;
    if (seen.has(row.slug)) continue;
    picked.push(row);
    seen.add(row.slug);
  }
  // Rank by implied value, never by pick order.
  picked.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  picked.forEach((row, i) => {
    row.rank = i + 1;
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd ?? 0,
    }));

  const peerPlain: Record<string, number> = {};
  for (const [key, value] of multiples) {
    if (key !== '__global__') peerPlain[key] = Math.round(value * 1000) / 1000;
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model_text: MODEL_TEXT,
    counts: {
      protocols: snapshot.protocols.length,
      pre_token: scored.length,
      watchlist: snapshot.watchlist.length,
      new_pairs: picked.filter((r) => r.new_pair).length,
      board_rows: picked.length,
    },
    peer_multiples: peerPlain,
    rows: picked,
    live,
  };
  return { board: picked, radar };
}

/** The gate's own shape, checked before anything is written out. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, not 100 to 4000`;
  const slugs = new Set<string>();
  for (const row of board) {
    if (slugs.has(row.slug)) return `slug ${row.slug} appears twice`;
    slugs.add(row.slug);
    if (!snapshot.protocols.some((p) => p.slug === row.slug)) return `slug ${row.slug} is not in the snapshot`;
    if (typeof row.name !== 'string' || row.name.trim() === '') return `row ${row.slug} has no name`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has no positive whole implied value`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} holds ${row.farm_steps.length} farm steps, not 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${row.slug} has a farm step of ${trimmed.length} characters, not 20 to 600`;
      }
    }
  }
  const ranks = [...board.map((r) => r.rank)].sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not exactly 1 to ${board.length}`;
  }
  const ordered = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.implied_value_usd > ordered[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${ordered[i - 1]!.rank} to rank ${ordered[i]!.rank}`;
    }
  }
  if (new Set(board.map((r) => r.implied_value_usd)).size < 2) return 'every implied value is the same';
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: window.RADAR, nothing else. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
