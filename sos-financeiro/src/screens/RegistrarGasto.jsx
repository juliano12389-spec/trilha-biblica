import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { formatBRL, centsToInput, inputToCents } from '../format.js';
import { GASTO_EXEMPLO, TRANSCRICAO_EXEMPLO } from '../data.js';

const MODOS = [
  { id: 'voz', label: 'Voz IA', icon: 'mic' },
  { id: 'comprovante', label: 'Comprovante', icon: 'document_scanner' },
  { id: 'manual', label: 'Manual', icon: 'edit_note' },
];

export default function RegistrarGasto({ saldo, recentes, onConfirmar, onDesfazer, onNotify }) {
  const [modo, setModo] = useState('voz');
  const [ouvindo, setOuvindo] = useState(true);
  const [gasto, setGasto] = useState({ valor: GASTO_EXEMPLO.valor, descricao: GASTO_EXEMPLO.descricao });
  const [salvo, setSalvo] = useState(false);
  const [comprovante, setComprovante] = useState(null);
  const arquivoRef = useRef(null);

  const confirmar = () => {
    if (gasto.valor <= 0) return onNotify('Informe um valor para registrar');
    onConfirmar({ ...gasto, categoria: GASTO_EXEMPLO.categoria, metodo: 'Pix' });
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2400);
  };

  const alternarEscuta = () => {
    setOuvindo((v) => !v);
    if (ouvindo) onNotify('Áudio pausado. Toque no microfone para continuar.');
  };

  const onArquivo = (e) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) setComprovante(arquivo.name);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col w-full pb-8">
      <section className="flex flex-col gap-1 mt-2 mb-4">
        <span className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-semibold">
          <Icon name="smart_toy" className="text-[16px]" />
          IA Conectada &amp; Ativa
        </span>
        <h2 className="text-[22px] font-bold">Registrar Gasto sem Complicação</h2>
        <p className="text-sm text-on-surface-variant">Fale naturalmente ou fotografe seu recibo. Nós organizamos cada centavo para você.</p>
      </section>

      <div role="tablist" className="grid grid-cols-3 p-1 rounded-xl bg-surface-container mb-5 text-center">
        {MODOS.map((m) => {
          const ativo = m.id === modo;
          return (
            <button
              key={m.id}
              role="tab"
              type="button"
              aria-selected={ativo}
              onClick={() => setModo(m.id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs transition-all ${
                ativo ? 'bg-surface-container-lowest text-primary font-bold shadow-sm' : 'text-secondary font-medium'
              }`}
            >
              <Icon name={m.icon} className="text-[18px]" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {modo === 'voz' && (
        <div className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-surface-container-low to-surface-container-lowest p-6 flex flex-col items-center text-center shadow-sm">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
              {ouvindo && <div className="w-48 h-48 rounded-full bg-primary-fixed animate-ping [animation-duration:2s]" />}
              <div className="w-36 h-36 rounded-full bg-primary-fixed-dim opacity-70" />
            </div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-primary-container text-on-primary">
                <span className={`w-2 h-2 rounded-full bg-primary-fixed ${ouvindo ? 'animate-pulse' : ''}`} />
                <span className="text-[11px] font-semibold tracking-wide uppercase">{ouvindo ? 'Ouvindo você...' : 'Áudio pausado'}</span>
              </div>
              <button
                type="button"
                aria-label="Microfone de captação inteligente"
                onClick={alternarEscuta}
                className="relative w-24 h-24 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center active:scale-95 transition-transform"
              >
                <Icon name="mic" filled className="text-[42px]" />
                <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shadow-md">
                  <Icon name="graphic_eq" className="text-[16px]" />
                </span>
              </button>
            </div>
            <div className="relative z-10 mt-4 max-w-sm">
              <p className="text-[11px] text-secondary uppercase tracking-wider mb-1">Transcrição Inteligente</p>
              <p className="text-base font-semibold italic bg-surface-container-high/50 px-4 py-2.5 rounded-xl">
                “{TRANSCRICAO_EXEMPLO}”
              </p>
            </div>
          </div>
          <Offline />
          <DadosIdentificados gasto={gasto} />
        </div>
      )}

      {modo === 'comprovante' && (
        <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-surface-container-lowest text-center shadow-sm gap-3">
          <span className="w-16 h-16 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
            <Icon name="add_a_photo" className="text-[32px]" />
          </span>
          <h3 className="font-bold">Escanear Nota ou Comprovante</h3>
          <p className="text-sm text-on-surface-variant max-w-xs">Aponte para o comprovante Pix ou nota do mercado.</p>
          <input ref={arquivoRef} type="file" accept="image/*" capture="environment" onChange={onArquivo} className="hidden" />
          <div className="flex flex-col w-full gap-2 mt-2">
            <button type="button" onClick={() => arquivoRef.current?.click()} className="h-12 rounded-xl bg-primary-container text-on-primary font-semibold flex items-center justify-center gap-2">
              <Icon name="photo_camera" className="text-[20px]" />
              Abrir Câmera
            </button>
            <button type="button" onClick={() => arquivoRef.current?.click()} className="h-11 rounded-xl bg-surface-container-low text-secondary text-sm font-semibold flex items-center justify-center gap-2">
              <Icon name="upload_file" className="text-[18px]" />
              Escolher da Galeria
            </button>
          </div>
          {comprovante && (
            <div className="flex items-center gap-3 w-full p-2.5 mt-2 rounded-xl bg-surface-container text-left">
              <span className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <Icon name="receipt" className="text-[20px] text-secondary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{comprovante}</p>
                <p className="text-[11px] text-on-surface-variant">Anexado. Revise o valor no modo Manual.</p>
              </div>
              <Icon name="check_circle" filled className="text-[20px] text-surface-tint" />
            </div>
          )}
        </div>
      )}

      {modo === 'manual' && (
        <div className="flex flex-col gap-3 p-4 rounded-2xl bg-surface-container-lowest shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-secondary">Valor do Gasto</span>
            <div className="flex items-center px-3.5 h-12 rounded-xl bg-surface-container-low">
              <span className="font-bold mr-2">R$</span>
              <input
                inputMode="numeric"
                placeholder="0,00"
                value={centsToInput(gasto.valor)}
                onChange={(e) => setGasto({ ...gasto, valor: inputToCents(e.target.value) })}
                className="w-full bg-transparent font-bold outline-none"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-secondary">Descrição</span>
            <input
              type="text"
              value={gasto.descricao}
              onChange={(e) => setGasto({ ...gasto, descricao: e.target.value })}
              className="px-3.5 h-12 rounded-xl bg-surface-container-low text-sm outline-none"
            />
          </label>
        </div>
      )}

      <div className="flex flex-col gap-2 mt-5">
        <button
          type="button"
          onClick={confirmar}
          disabled={salvo}
          className={`w-full h-14 rounded-xl text-on-primary font-bold flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all disabled:opacity-100 ${
            salvo ? 'bg-surface-tint' : 'bg-primary'
          }`}
        >
          <Icon name={salvo ? 'done_all' : 'check'} className="text-[22px]" />
          <span>{salvo ? 'Gasto Registrado!' : 'Confirmar e Deduzir do Saldo Livre'}</span>
        </button>
        <p className="flex items-center justify-center gap-1.5 text-sm text-on-surface-variant text-center">
          <Icon name="shield_with_heart" className="text-[16px] text-surface-tint" />
          {salvo ? 'Seu saldo seguro para o mês agora é' : 'Seu saldo seguro para o mês passará para'} <strong className="text-primary">{formatBRL(salvo ? saldo : saldo - gasto.valor)}</strong>.
        </p>
      </div>

      <section className="flex flex-col gap-2.5 mt-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon name="history" className="text-[20px] text-secondary" />
            <h3 className="font-bold">Lançados Recentemente</h3>
          </div>
          <span className="text-[11px] text-secondary">Hoje</span>
        </div>
        <div className="flex flex-col gap-2">
          {recentes.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-lowest shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-surface-tint shrink-0">
                  <Icon name={item.icon} className="text-[20px]" />
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold truncate">{item.titulo}</span>
                  <span className="text-xs text-secondary truncate">{item.sub}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold">- {formatBRL(item.valor)}</span>
                  <span className="text-[10px] text-surface-tint">{item.metodo}</span>
                </div>
                <button
                  type="button"
                  title="Desfazer lançamento"
                  aria-label="Desfazer lançamento"
                  onClick={() => onDesfazer(item)}
                  className="p-1.5 rounded-lg text-secondary hover:bg-surface-container"
                >
                  <Icon name="undo" className="text-[18px]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Offline() {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-surface-container-low text-on-surface-variant">
      <Icon name="offline_bolt" className="text-[20px] text-secondary" />
      <p className="text-xs leading-snug">
        <strong className="font-semibold text-on-surface">Modo Offline ativo:</strong> o registro será sincronizado com proteção assim que reconectar.
      </p>
    </div>
  );
}

function DadosIdentificados({ gasto }) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between pb-1">
        <span className="font-bold">Dados Identificados</span>
        <span className="text-[11px] text-surface-tint bg-primary-fixed/40 px-2.5 py-0.5 rounded-full font-semibold">99.4% precisão</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Campo label="Valor Extraído">
          <span className="text-lg font-bold text-primary">{formatBRL(gasto.valor)}</span>
          <span className="text-[10px] text-outline mt-0.5">(armazenado: {gasto.valor} centavos)</span>
        </Campo>
        <Campo label="Categoria">
          <span className="self-start mt-1 px-2 py-0.5 rounded-md bg-primary-fixed text-on-primary-fixed text-xs font-bold">{GASTO_EXEMPLO.categoria}</span>
          <span className="text-[10px] text-on-surface-variant mt-1">{GASTO_EXEMPLO.subcategoria}</span>
        </Campo>
        <Campo label="Data do Lançamento">
          <span className="text-sm font-semibold mt-1">Hoje, {new Date().toTimeString().slice(0, 5)}</span>
          <span className="text-[10px] text-outline mt-0.5">Automático do dispositivo</span>
        </Campo>
        <Campo label="Forma de Pagamento">
          <span className="flex items-center gap-1 text-sm font-semibold mt-1">
            <Icon name="payments" className="text-[18px] text-surface-tint" />
            {GASTO_EXEMPLO.metodo}
          </span>
          <span className="text-[10px] text-outline mt-0.5">Conta Corrente Principal</span>
        </Campo>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div className="flex flex-col p-3 rounded-xl bg-surface-container-low">
      <span className="text-[11px] text-secondary">{label}</span>
      {children}
    </div>
  );
}
