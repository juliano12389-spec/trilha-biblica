import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { formatBRL } from '../format.js';
import { DIVIDAS, FILTROS_DIVIDAS } from '../data.js';

const ICONES_TIPO = {
  Cartão: 'credit_card',
  Empréstimo: 'account_balance',
  Financiamento: 'directions_car',
  'Cheque especial': 'money_off',
};

export default function Dividas({ onNotify }) {
  const [filtro, setFiltro] = useState('todas');

  const dividas = useMemo(() => {
    const ordenadas = [...DIVIDAS].sort((a, b) => (b.taxaMensal ?? 0) - (a.taxaMensal ?? 0));
    if (filtro === 'todas' || filtro === 'ranking') return ordenadas;
    return ordenadas.filter((d) => d.tipo === filtro);
  }, [filtro]);

  const total = DIVIDAS.reduce((soma, d) => soma + d.saldo, 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-primary-container text-on-primary p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            <Icon name="monitor_heart" className="text-[16px]" />
            Diagnóstico Ativo
          </span>
          <button type="button" onClick={onNotify} className="text-xs text-primary-fixed flex items-center gap-1">
            Como calculamos? <Icon name="help" className="text-[16px]" />
          </button>
        </div>
        <div>
          <p className="text-sm text-primary-fixed/80">Total em aberto organizado</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[30px] font-bold leading-tight">{formatBRL(total)}</span>
            <span className="text-xs rounded-full bg-white/10 px-2 py-0.5">{DIVIDAS.length} ativas</span>
          </div>
        </div>
        <div className="border-t border-white/10 pt-3 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-tertiary-fixed-dim/20 text-tertiary-fixed flex items-center justify-center shrink-0">
              <Icon name="trending_up" className="text-[20px]" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-primary-fixed/80 truncate">Impacto estimado de juros este mês</p>
              <p className="font-semibold text-tertiary-fixed">R$ 684,20</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-primary-fixed/80">Foco de corte:</p>
            <p className="font-semibold">Cartão Nubank</p>
          </div>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto -mx-margin px-margin pb-1">
        {FILTROS_DIVIDAS.map((f) => {
          const count = f.id === 'todas' ? DIVIDAS.length : DIVIDAS.filter((d) => d.tipo === f.id).length;
          const ativo = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={ativo}
              className={`shrink-0 h-9 px-4 rounded-full text-sm font-semibold flex items-center gap-1.5 ${
                ativo ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary'
              }`}
            >
              {f.id === 'ranking' && <Icon name="local_fire_department" className="text-[16px]" />}
              {f.label}
              {f.id === 'todas' && <span className="text-xs bg-white/20 rounded-full px-1.5">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold">Prioridade de Alívio</h2>
          <p className="text-xs text-on-surface-variant">Ordenadas pelo custo financeiro</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {dividas.map((divida) => (
          <DividaCard key={divida.id} divida={divida} onNotify={onNotify} />
        ))}
      </div>
    </div>
  );
}

function DividaCard({ divida, onNotify }) {
  const { nome, tipo, saldo, taxaMensal, rotativo, alerta, parcela, parcelaAtual, parcelasTotal, vencimento, diasRestantes } = divida;

  return (
    <article className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-12 h-12 rounded-xl bg-surface-container-low text-primary flex items-center justify-center shrink-0">
          <Icon name={ICONES_TIPO[tipo]} className="text-[22px]" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold">{nome}</h3>
            {rotativo && <span className="text-[10px] font-bold tracking-wide rounded bg-tertiary-fixed text-on-tertiary-fixed-variant px-1.5 py-0.5">ROTATIVO</span>}
          </div>
          {vencimento && (
            <p className="text-sm text-secondary">
              {vencimento} <span className="text-error">(em {diasRestantes} dias)</span>
            </p>
          )}
          {parcela && (
            <p className="text-sm text-secondary">
              Parcela: <strong className="text-on-surface">{formatBRL(parcela)}</strong> • {parcelaAtual}/{parcelasTotal}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold">{formatBRL(saldo)}</p>
          {taxaMensal && <p className="text-xs text-error">↗ {String(taxaMensal).replace('.', ',')}% ao mês</p>}
        </div>
      </div>

      {alerta && (
        <div className="rounded-xl bg-error-container/50 p-3 flex gap-2.5 text-sm text-on-error-container">
          <Icon name="lightbulb" className="text-[20px] shrink-0" />
          <p>
            <span className="block font-semibold text-error">Alerta de Ouro da Mentoria</span>
            Se pagar apenas o mínimo ({formatBRL(alerta.minimo)}), em 6 meses você terá pago cerca de{' '}
            <strong>{formatBRL(alerta.jurosSeisMeses)} só de juros</strong>. Priorize negociar este saldo!
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onNotify('Negociação ainda não está conectada')} className="h-11 rounded-xl bg-surface-container text-on-surface text-sm font-semibold flex items-center justify-center gap-1.5">
          <Icon name="handshake" className="text-[18px]" />
          Negociar
        </button>
        <button type="button" onClick={() => onNotify('Pagamento ainda não está conectado')} className="h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center justify-center gap-1.5">
          <Icon name="payments" className="text-[18px]" />
          Registrar Pago
        </button>
      </div>
    </article>
  );
}
