import { useEffect, useState } from 'react';
import BottomNav from './components/BottomNav.jsx';
import Header from './components/Header.jsx';
import Icon from './components/Icon.jsx';
import Dividas from './screens/Dividas.jsx';
import Inicio from './screens/Inicio.jsx';
import Plano from './screens/Plano.jsx';
import RegistrarGasto from './screens/RegistrarGasto.jsx';
import { RECENTES_INICIAIS, SALDO_INICIAL } from './data.js';
import { formatBRL } from './format.js';

const TITULOS = {
  inicio: { title: 'Início', subtitle: 'Olá, Camila' },
  dividas: { title: 'Dívidas', subtitle: 'Olá, Camila' },
  plano: { title: 'Plano', subtitle: 'Olá, Camila' },
  registrar: { title: 'Registrar Gasto' },
};

export default function App() {
  const [rota, setRota] = useState('inicio');
  const [anterior, setAnterior] = useState('inicio');
  const [saldo, setSaldo] = useState(SALDO_INICIAL);
  const [recentes, setRecentes] = useState(RECENTES_INICIAIS);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const navegar = (destino) => {
    if (destino === rota) return;
    if (destino !== 'registrar') setAnterior(destino);
    setRota(destino);
  };

  const notificar = (mensagem) => setToast(mensagem);

  const registrarGasto = ({ valor, descricao, categoria, metodo }) => {
    const item = {
      id: `item-${Date.now()}`,
      titulo: descricao || 'Gasto sem descrição',
      sub: `${categoria.replace(/^\S+\s/, '')} • ${new Date().toTimeString().slice(0, 5)}`,
      icon: 'shopping_basket',
      valor,
      metodo,
    };
    setRecentes((lista) => [item, ...lista]);
    setSaldo((s) => s - valor);
    notificar(`Gasto de ${formatBRL(valor)} deduzido com sucesso!`);
  };

  const desfazer = (item) => {
    setRecentes((lista) => lista.filter((i) => i.id !== item.id));
    setSaldo((s) => s + item.valor);
    notificar('Lançamento desfeito com tranquilidade.');
  };

  const cabecalho = TITULOS[rota];

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-surface relative">
      <Header
        title={cabecalho.title}
        subtitle={rota === 'registrar' ? undefined : cabecalho.subtitle}
        onBack={rota === 'registrar' ? () => navegar(anterior) : undefined}
        onNotify={rota === 'registrar' ? undefined : () => notificar('Nenhuma notificação nova')}
      />

      <main className="pt-20 pb-28 px-margin">
        {rota === 'inicio' && <Inicio saldo={saldo} onRegistrar={() => navegar('registrar')} onNotify={notificar} />}
        {rota === 'dividas' && <Dividas onNotify={notificar} />}
        {rota === 'plano' && <Plano />}
        {rota === 'registrar' && (
          <RegistrarGasto
            saldo={saldo}
            recentes={recentes}
            onConfirmar={registrarGasto}
            onDesfazer={desfazer}
            onNotify={notificar}
          />
        )}
      </main>

      <BottomNav current={rota} onNavigate={navegar} />

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-inverse-surface text-inverse-on-surface shadow-lg text-xs font-medium max-w-[90vw]">
          <Icon name="task_alt" className="text-[18px] text-primary-fixed" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
