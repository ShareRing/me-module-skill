/**
 * A starter screen in ShareRing's "cinema" style: scenes that carry their own ground and accent
 * (data-bg / data-accent), a product lockup, one big line with an accent phrase, glass cards and
 * fade-up reveals. Replace the copy and the cards with your module's own.
 */
import { copy, useIdentity } from '../lib/bridge.ts';
import { go } from '../lib/router.ts';
import { ProductGlyph } from '../ui/house.tsx';

const shr = (nshr: string) => `${(Number(BigInt(nshr)) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1 })} SHR`;

export function Home() {
  const id = useIdentity();
  return (
    <div className="home">
      <section className="scene" data-bg="#050A20" data-accent="#2CE5A7">
        <header className="top">
          <span className="lockup"><ProductGlyph size={32} /><b>__MODULE_NAME__</b></span>
          {id.balance && <span className="pill">{shr(id.balance)}</span>}
        </header>
        <span className="srk-eyebrow srk-reveal">A ShareRing Me module</span>
        <h1 className="display srk-reveal">__HEADLINE_A__ <span className="srk-accent">__HEADLINE_B__</span></h1>
        <p className="lede srk-reveal">__SHORT_DESCRIPTION__</p>
        <div className="actions srk-reveal">
          <button className="btn btn-primary" onClick={() => go('/you')}>Get started</button>
        </div>
      </section>

      <section className="scene" data-bg="#06142E" data-accent="#6E9BFF">
        <span className="srk-eyebrow srk-reveal">How it works</span>
        <h2 className="display-m srk-reveal">Verified people. <span className="srk-accent">Nothing to type.</span></h2>
        <div className="cards">
          {[
            ['Your identity, already verified', 'ShareRing Me holds a verified ID, so this module never asks for documents.'],
            ['Your wallet, one PIN away', 'Balances, signatures and payments on ShareLedger, approved in the app.'],
            ['Private by default', 'Only what you approve is shared, and only with this module.'],
          ].map(([t, d]) => (
            <div key={t} className="glass card srk-reveal"><b>{t}</b><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="scene" data-bg="#04182C" data-accent="#2CE5A7">
        <span className="srk-eyebrow srk-reveal">Your account</span>
        <h2 className="display-m srk-reveal">{id.address ? <>Connected to <span className="srk-accent">ShareRing Me.</span></> : 'Connecting to your wallet…'}</h2>
        {id.address && (
          <button className="glass addr srk-reveal" onClick={() => void copy(id.address!)}>
            <span className="mono">{id.address.slice(0, 16)}…{id.address.slice(-6)}</span><small>Tap to copy</small>
          </button>
        )}
      </section>
    </div>
  );
}
