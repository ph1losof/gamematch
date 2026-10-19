/**
 * The link's text format: "us=40&cpmA=18&src=cpmA.p.20261019,us.a". Params that differ from
 * Working assumptions, under their short keys, plus explicit sources (and dates) under "src".
 * Notes never travel in a link: they are often names and prices people don't want shared.
 * Every value is checked against its param row; bad entries are dropped and reported rather than
 * half-applied. stored-format.ts builds the session and saved scenarios on top of this.
 */
import { BY_SHORT, DEFAULTS, isValid, PARAMS, type Param, type Params, type Value } from './params';
import { type ProvenanceMap, VALUE_SOURCES, type ValueSource } from './provenance';

/** The hash key that carries provenance in a link; not a param short key. */
const PROVENANCE_KEY = 'src';

const SOURCE_CODE: Record<ValueSource, string> = { default: 'r', partner: 'p', assumption: 'a' };
const DATE_CODE = /^\d{8}$/; // 20261019

// ---------- one value ----------

const encodeValue = (p: Param, v: Value): string => {
  if (p.kind === 'bool') return v === true ? '1' : '0';
  return String(v);
};

/** A raw text value for `p`, or undefined if it isn't legal. */
function decodeValue(p: Param, raw: string): Value | undefined {
  const value = decodeKind(p, raw);
  return value !== undefined && isValid(p, value) ? value : undefined;
}

function decodeKind(p: Param, raw: string): Value | undefined {
  if (p.kind === 'list') return raw;
  if (p.kind === 'bool') return raw === '1' ? true : raw === '0' ? false : undefined;
  return raw.trim() === '' ? undefined : Number(raw);
}

// ---------- params and provenance ----------

/** "us=40&cpmA=18": params that differ from `base`, in table order. */
export function encodeHash(params: Params, base: Params = DEFAULTS): string {
  const q = new URLSearchParams();
  for (const p of PARAMS) {
    const v = params[p.key];
    if (v !== undefined && v !== base[p.key]) q.set(p.short, encodeValue(p, v));
  }
  return q.toString();
}

export type DecodedHash = { params: Params; rejected: string[] };

/** Params from a hash over `base`; unknown keys and illegal values are listed in `rejected`. */
export function decodeHash(hash: string, base: Params = DEFAULTS): DecodedHash {
  const params = { ...base };
  const rejected: string[] = [];
  for (const [short, raw] of new URLSearchParams(hash.replace(/^#/, ''))) {
    if (short === PROVENANCE_KEY) continue;
    const p = BY_SHORT.get(short);
    const v = p && decodeValue(p, raw);
    if (p && v !== undefined) params[p.key] = v;
    else rejected.push(short);
  }
  return { params, rejected };
}

/** "cpmA.p.20261019,us.a": explicit sources (and dates) by URL short key. */
export function encodeProvenance(provenance: ProvenanceMap): string {
  return PARAMS.flatMap((p) => {
    const x = provenance[p.key];
    if (!x) return [];
    const parts = [p.short, SOURCE_CODE[x.source]];
    if (x.date) parts.push(x.date.replaceAll('-', ''));
    return [parts.join('.')];
  }).join(',');
}

const sourceOfCode = (code: string): ValueSource | undefined =>
  VALUE_SOURCES.find((s) => SOURCE_CODE[s] === code);

export function decodeProvenance(raw: string): ProvenanceMap {
  const out: ProvenanceMap = {};
  for (const part of raw.split(',')) {
    const [short, code, date] = part.split('.');
    const p = short === undefined ? undefined : BY_SHORT.get(short);
    const source = code === undefined ? undefined : sourceOfCode(code);
    if (!p || !source) continue;
    out[p.key] =
      date !== undefined && DATE_CODE.test(date)
        ? { source, date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` }
        : { source };
  }
  return out;
}

/** The link's hash (without "#"): params and, if any, provenance. Empty at Working assumptions. */
export function encodeLink(params: Params, provenance: ProvenanceMap): string {
  const q = new URLSearchParams(encodeHash(params));
  const src = encodeProvenance(provenance);
  if (src) q.set(PROVENANCE_KEY, src);
  return q.toString();
}

export type DecodedLink = { params: Params; provenance: ProvenanceMap; rejected: string[] };

export function decodeLink(hash: string): DecodedLink {
  const { params, rejected } = decodeHash(hash);
  const src = new URLSearchParams(hash.replace(/^#/, '')).get(PROVENANCE_KEY);
  return { params, provenance: src === null ? {} : decodeProvenance(src), rejected };
}
