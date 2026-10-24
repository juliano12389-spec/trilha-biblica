import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { formatBRL } from '../format.js';
import { METODOS_PLANO, PLANO_LIBERDADE } from '../data.js';

export default function Plano() {
  const [metodo, setMetodo] = useState('bola_de_neve');
  const info = METODOS_PLANO[metodo];
  const liberdade = PLANO_LIBERDADE;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 mt-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary">
          <Icon name="verified" className="text-[16px]" />
          SEU ROTEIRO DE VITÓRIA
        </span>
        <h2 className="text-[26px] leading-tight font-bold">Plano de Quitação Acelerada</h2>
        <p className="text-sm text-on-surface-variant">
          Compare métodos comprovados e descubra exatamente o mês em que você estará 100% livre de dívidas.
        </p>
      </section>

      <section className="rounded-2xl bg-surface-container p-2 flex flex-col gap-2">
        <div role="tablist" className="grid grid-cols-2 gap-1">
          {Object.entries(METODOS_PLANO).map(([id, m]) => {
            const ativo = id === metodo;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={ativo}
                onClick={() => setMetodo(id)}
                className={`rounded-xl py-2.5 px-2 flex flex-col items-center gap-0.5 transition-colors ${
                  ativo ? 'bg-surface-container-lowest shadow-sm text-primary' : 'text-secondary'
                }`}
              >
                <span className="flex items-center gap-1.5 font-bold">
                  <Icon name={id === 'bola_de_neve' ? 'ac_unit' : 'landslide'} className="text-[18px]" />
                  {m.label}
                </span>
                <span className="text-xs">{m.sub}</span>
              </button>
            );
          })}
        </div>
        <p className="rounded-xl bg-primary-fixed/50 text-sm px-4 py-3 flex gap-2 items-start">
          <Icon name="tips_and_updates" className="text-[18px] mt-0.5 text-primary" />
          <span>
            <strong>{info.dicaTitulo}</strong> {info.dica}
          </span>
        </p>
      </section>

      <section className="rounded-2xl bg-primary-container text-on-primary p-6 flex flex-col gap-5 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed text-on-primary-fixed px-3 py-1 text-xs font-semibold">
            <Icon name="flag" className="text-[16px]" />
            Liberdade Estimada
          </span>
          <span className="text-xs text-on-primary-container">Plano Ativo</span>
        </div>
        <div>
          <p className="text-[36px] leading-tight font-bold">{liberdade.mes}</p>
          <p className="text-on-primary-container">em exatamente {liberdade.meses} meses de disciplina</p>
        </div>
        <div className="rounded-xl bg-white/10 p-4 flex items-center gap-3">
          <Icon name="savings" className="text-[24px] text-primary-fixed" />
          <div>
            <p className="text-xs text-primary-fixed">Economia prevista em juros futuros</p>
            <p className="text-lg font-bold">{formatBRL(liberdade.economiaJuros)}</p>
          </div>
        </div>
        <div className="rounded-xl bg-white/10 p-4 flex items-center gap-3">
          <Icon name="bolt" className="text-[22px] text-primary-fixed" />
          <p className="text-sm">
            Com um aporte de <strong>{formatBRL(liberdade.aporteMensal)}/mês</strong>, você quita{' '}
            <strong>{liberdade.mesesAntes} meses antes!</strong>
          </p>
        </div>
      </section>
    </div>
  );
}
