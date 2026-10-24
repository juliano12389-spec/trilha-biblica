import Icon from './Icon.jsx';

const ITEMS = [
  { id: 'inicio', label: 'Início', icon: 'home' },
  { id: 'dividas', label: 'Dívidas', icon: 'account_balance_wallet' },
  { id: 'registrar', label: 'Registrar', icon: 'add' },
  { id: 'plano', label: 'Plano', icon: 'flag' },
];

export default function BottomNav({ current, onNavigate }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-md z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/40 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-4 h-16">
        {ITEMS.map((item) => {
          const active = item.id === current;
          const isRegistrar = item.id === 'registrar';
          return (
            <li key={item.id} className="flex">
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
              >
                {isRegistrar ? (
                  <span className="w-11 h-11 -mt-5 rounded-full bg-primary text-on-primary shadow-md flex items-center justify-center">
                    <Icon name="add" className="text-[26px]" />
                  </span>
                ) : (
                  <>
                    <Icon name={item.icon} filled={active} className="text-[22px]" />
                    <span className={active ? 'text-primary' : 'text-secondary'}>{item.label}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
