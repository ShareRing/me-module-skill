/**
 * The few protobuf messages ShareProtect needs, by hand, so neither the module nor the public
 * site has to bundle @shareledgerjs/client (and its node polyfills) just to write and read a memo.
 * test/proto.test.ts checks the output byte-for-byte against @shareledgerjs/client's registry.
 */
import { concat, fromUtf8, utf8 } from './bytes.ts';

export const MSG_SEND = '/cosmos.bank.v1beta1.MsgSend';

// --- writing -----------------------------------------------------------------

function varint(n: number): Uint8Array {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return new Uint8Array(out);
}

/** A length-delimited field (wire type 2). Empty strings are omitted, as proto3 does. */
function field(no: number, value: Uint8Array | string): Uint8Array {
  const bytes = typeof value === 'string' ? utf8(value) : value;
  if (!bytes.length) return new Uint8Array();
  return concat(varint((no << 3) | 2), varint(bytes.length), bytes);
}

export interface SendArgs { from: string; to: string; amount: string; denom: string; memo: string }

/** TxBody { messages: [Any(MsgSend)], memo } - the hex of this is what ShareRing Me signs. */
export function encodeSendTxBody({ from, to, amount, denom, memo }: SendArgs): Uint8Array {
  const coin = concat(field(1, denom), field(2, amount));
  const msg = concat(field(1, from), field(2, to), field(3, coin));
  const any = concat(field(1, MSG_SEND), field(2, msg));
  return concat(field(1, any), field(2, memo));
}

// --- reading -----------------------------------------------------------------

type Fields = Map<number, Uint8Array[]>;

/** Splits a message into its length-delimited fields; skips varint/fixed fields. */
function readFields(buf: Uint8Array): Fields {
  const out: Fields = new Map();
  let i = 0;
  const readVarint = () => {
    let shift = 0;
    let n = 0;
    for (;;) {
      if (i >= buf.length) throw new Error('truncated varint');
      const b = buf[i++];
      n += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return n;
      shift += 7;
    }
  };
  while (i < buf.length) {
    const key = readVarint();
    const no = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) readVarint();
    else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else if (wire === 2) {
      const len = readVarint();
      if (i + len > buf.length) throw new Error('truncated field');
      const list = out.get(no) ?? [];
      list.push(buf.subarray(i, i + len));
      out.set(no, list);
      i += len;
    } else throw new Error(`unsupported wire type ${wire}`);
  }
  return out;
}

const str = (f: Fields, no: number) => (f.get(no)?.[0] ? fromUtf8(f.get(no)![0]) : '');

export interface DecodedMsg { typeUrl: string; from?: string; to?: string }
export interface DecodedTx { memo: string; messages: DecodedMsg[] }

/** Decodes a TxRaw (as returned base64 by the RPC's /tx) down to its memo and message senders. */
export function decodeTxRaw(raw: Uint8Array): DecodedTx {
  const body = readFields(raw).get(1)?.[0];
  if (!body) throw new Error('no body');
  const b = readFields(body);
  const messages = (b.get(1) ?? []).map((anyBytes) => {
    const any = readFields(anyBytes);
    const typeUrl = str(any, 1);
    const value = any.get(2)?.[0];
    if (typeUrl === MSG_SEND && value) {
      const m = readFields(value);
      return { typeUrl, from: str(m, 1), to: str(m, 2) };
    }
    return { typeUrl };
  });
  return { memo: str(b, 2), messages };
}
