import Icon from './Icon.jsx';

const AVATAR_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAafzRBgAFIXSL2n7cLOI9H3Q-b0m55fU4QyPYokdA9pmjYP9JFbHZgOwOHT0YUqJumRsJRr2TDxGNFJsbhlGV9kKBYKMf-Y6YB0pipXoGeleCbuEx4u22EX1UdxTBSpYISk7XYq5Xw1AbsYV6wbXX6lXKXbVkkGSBi6PRvCqIlJLlqRWbmmC0NBEQKLtaTVyz-sh8dYjShD-w3ibPuqnFvvsxaCzzdxoPpx19CuQAC';

export default function Header({ title, subtitle, onBack, onNotify }) {
  return (
    <header className="fixed top-0 inset-x-0 z-40 mx-auto max-w-md bg-surface/85 backdrop-blur-xl pt-[env(safe-area-inset-top)] shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-16 px-margin flex items-center justify-between">
        <div className="flex items-center gap-space-sm min-w-0">
          {onBack ? (
            <button
              type="button"
              aria-label="Voltar"
              onClick={onBack}
              className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center hover:bg-surface-container active:bg-surface-container-high"
            >
              <Icon name="arrow_back" className="text-[24px]" />
            </button>
          ) : (
            <LogoMark />
          )}
          <div className="flex flex-col min-w-0">
            {subtitle && <span className="text-xs text-on-surface-variant truncate">{subtitle}</span>}
            <h1 className="text-[15px] font-bold truncate max-w-[170px]">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-space-sm">
          {onNotify && (
            <button
              type="button"
              aria-label="Notificações"
              onClick={onNotify}
              className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container"
            >
              <Icon name="notifications" className="text-[24px]" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error" />
            </button>
          )}
          <img alt="Perfil" src={AVATAR_URL} className="w-8 h-8 rounded-full object-cover" />
        </div>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center text-[11px] font-extrabold tracking-tight">
      SOS
    </div>
  );
}
