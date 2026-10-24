import Icon from '../components/Icon.jsx';
import { formatBRL } from '../format.js';
import { ALERTA_FATURA, CUSTOS_FIXOS, PARCELAS_MES, PROGRESSO_MES, RENDA_LIQUIDA, RITMO_DIARIO } from '../data.js';

export default function Inicio({ saldo, onRegistrar, onNotify }) {
  const fatura = ALERTA_FATURA;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 mt-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary">
          <Icon name="spa" className="text-[16px]" />
          ALÍVIO &amp; DIRECIONAMENTO
        </span>
        <h2 className="text-[26px] leading-tight font-bold">Respira fundo, você está no controle hoje.</h2>
        <p className="text-sm text-on-surface-variant">Seus números traduzidos em passos seguros para o seu dia a dia.</p>
      </section>

      <section className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <Icon name="shield_with_heart" className="text-[20px]" />
            </span>
            <span className="font-semibold">Saldo Seguro do Mês</span>
          </div>
          <button type="button" onClick={onNotify} className="text-sm text-primary font-semibold flex items-center gap-0.5">
            Ver conta <Icon name="expand_more" className="text-[18px]" />
          </button>
        </div>

        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-sm text-on-surface-variant">R$</span>
            <span className="text-[40px] leading-none font-bold text-primary">{formatBRL(saldo).replace('R$', '').trim()}</span>
          </div>
          <p className="text-sm text-on-surface-variant mt-1">Disponível para gastar sem comprometer suas contas essenciais.</p>
        </div>

        <div className="rounded-xl bg-surface-container-low px-3 py-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Icon name="eco" className="text-[18px] text-surface-tint" />
            <span>
              Ritmo sugerido: <strong className="font-semibold">{formatBRL(RITMO_DIARIO)} / dia</strong> restante até dia 30
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
            <div className="h-full rounded-full bg-surface-tint" style={{ width: `${PROGRESSO_MES * 100}%` }} />
          </div>
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <LinhaResumo label="Renda líquida cadastrada" value={`+ ${formatBRL(RENDA_LIQUIDA)}`} />
          <LinhaResumo label="Custos essenciais fixos" value={`- ${formatBRL(CUSTOS_FIXOS)}`} />
          <LinhaResumo label="Parcelas & Quitações deste mês" value={`- ${formatBRL(PARCELAS_MES)}`} />
        </dl>
      </section>

      <section className="rounded-2xl bg-secondary-container/40 p-4 flex gap-3">
        <span className="w-10 h-10 shrink-0 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
          <Icon name="event_upcoming" className="text-[20px]" />
        </span>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide bg-white rounded px-1.5 py-0.5 text-secondary">Atenção gentil</span>
            <span className="text-xs text-secondary">Em {fatura.diasRestantes} dias</span>
          </div>
          <p className="font-semibold">
            {fatura.titulo} • {formatBRL(fatura.valor)}
          </p>
          <p className="text-sm text-on-surface-variant">
            Proteja seu bolso: pagar até o dia {fatura.diaLimite} evita os juros rotativos de 14,2% ao mês.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button type="button" onClick={onNotify} className="h-11 rounded-xl bg-primary text-on-primary text-sm font-semibold">
              Programar pagamento
            </button>
            <button type="button" onClick={onNotify} className="h-11 rounded-xl bg-surface-container-lowest text-primary text-sm font-semibold">
              Já paguei
            </button>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={onRegistrar}
        className="h-12 rounded-xl bg-surface-container-lowest shadow-sm text-primary font-semibold flex items-center justify-center gap-2"
      >
        <Icon name="receipt_long" className="text-[20px]" />
        Registrar gasto
      </button>
    </div>
  );
}

function LinhaResumo({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
