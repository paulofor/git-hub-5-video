import { NavLink } from 'react-router-dom';
import { ReactNode, useState } from 'react';
import clsx from 'clsx';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/blueprints', label: 'Blueprints' },
  { to: '/prompts', label: 'Prompts' },
  { to: '/prompt-hints', label: 'Itens do Prompt' },
  { to: '/environments', label: 'Ambientes' },
  { to: '/problems', label: 'Problemas' },
  { to: '/logs', label: 'Interpretador de Logs' },
  { to: '/codex', label: 'Codex' },
  { to: '/codex/models', label: 'Modelos Codex' },
  { to: '/summaries', label: 'Summaries' },
  { to: '/audit', label: 'Audit Log' }
];

export default function ShellLayout({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  return (
    <div className={clsx('min-h-screen', dark ? 'dark' : '')}>
      <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
        <aside className="w-60 bg-white/80 dark:bg-slate-950/40 backdrop-blur border-r border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">AI Hub 3</h1>
            <button
              onClick={() => setDark((prev) => !prev)}
              className="text-xs px-2 py-1 border rounded-md border-slate-300 dark:border-slate-700"
            >
              {dark ? 'Claro' : 'Escuro'}
            </button>
          </div>
          <nav className="space-y-2">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  clsx(
                    'block rounded-md px-3 py-2 text-sm font-medium',
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800'
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
