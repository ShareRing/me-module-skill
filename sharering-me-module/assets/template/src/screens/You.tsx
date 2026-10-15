import { useIdentity } from '../lib/bridge.ts';
import { useTrace } from '../lib/trace.ts';

export function You() {
  const id = useIdentity();
  // Your devtools on a phone: every bridge message this session, from the traced transport (main.tsx).
  const calls = useTrace();
  const rows: [string, string][] = [
    ['Wallet', id.address ?? 'Not available'],
    ['ID verified', id.idVerified ? 'yes' : 'no'],
    ['Device', id.model ?? 'Not available'],
    ['Country', id.country ?? 'Not available'],
    ['Time zone', id.timezone],
  ];
  return (
    <div className="page">
      <span className="srk-eyebrow">Account</span>
      <h1 className="display-m">Your <span className="srk-accent">identity.</span></h1>
      <div className="glass idcard">
        <span className="avatar">{id.avatar ? <img src={id.avatar} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}</span>
        <b>{id.idVerified ? 'ID-verified member' : 'ShareRing Me member'}</b>
      </div>
      <dl className="glass facts">
        {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd className={k === 'Wallet' ? 'mono' : ''}>{v}</dd></div>))}
      </dl>
      <span className="srk-eyebrow">Bridge calls this session</span>
      <p className="note">Every message this module exchanged with ShareRing Me, newest first. It stays on your phone.</p>
      <dl className="glass facts">
        {[...calls].reverse().slice(0, 40).map((c) => (
          <div key={c.id}>
            <dt className="mono">{c.type}</dt>
            <dd>{c.status === 'pending' ? 'waiting' : c.status === 'sent' ? 'sent' : c.status === 'error' ? `refused, ${c.ms} ms` : `${c.ms} ms`}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
