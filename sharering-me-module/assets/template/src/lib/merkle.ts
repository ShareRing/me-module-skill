/**
 * A plain binary Merkle tree over leaf hashes, so one transaction can seal a whole session.
 *
 * node = sha256(0x01 || left || right). Leaves are already domain-separated by their own prefix
 * (see leafHash below). An odd node at the end of a level is promoted unchanged. A tree of one leaf has
 * that leaf as its root.
 */
import { concat, fromHex, sha256, toHex, utf8 } from './bytes.ts';

export type ProofStep = { s: 'L' | 'R'; h: string };

const NODE = new Uint8Array([1]);

async function node(left: string, right: string): Promise<string> {
  return toHex(await sha256(concat(NODE, fromHex(left), fromHex(right))));
}

export async function buildTree(leaves: string[]): Promise<{ root: string; proofs: ProofStep[][] }> {
  if (!leaves.length) throw new Error('no leaves');
  const proofs: ProofStep[][] = leaves.map(() => []);
  // Which current-level node each leaf sits under.
  let pos = leaves.map((_, i) => i);
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? await node(level[i], level[i + 1]) : level[i]);
    }
    pos = pos.map((p, leaf) => {
      const sibling = p ^ 1;
      if (sibling < level.length) proofs[leaf].push({ s: p & 1 ? 'L' : 'R', h: level[sibling] });
      return p >> 1;
    });
    level = next;
  }
  return { root: level[0], proofs };
}

export async function rootFromProof(leaf: string, proof: ProofStep[]): Promise<string> {
  let h = leaf;
  for (const step of proof) h = step.s === 'L' ? await node(step.h, h) : await node(h, step.h);
  return h;
}

/** JSON with sorted keys and undefined dropped: the same record always hashes the same. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}

/** A leaf for `record`, domain-separated by `tag` (e.g. "myproduct:v1:") so it can't collide with other uses. */
export async function leafHash(tag: string, record: unknown): Promise<string> {
  return toHex(await sha256(utf8(tag + stableStringify(record))));
}
