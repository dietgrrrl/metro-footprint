import { NavLink, Outlet } from 'react-router';

export default function Layout() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md">
        <nav className="max-w-screen-2xl mx-auto px-5 h-13 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-3 group">
            <div className="relative w-7 h-7">
              <div className="absolute inset-0 rounded-full border-2 border-gold opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-[5px] rounded-full bg-gold" />
            </div>
            <span className="font-display text-xl font-700 tracking-[0.15em] text-ink uppercase">Axl's Metro Footprint</span>
          </NavLink>
          <div className="flex items-center gap-7">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `font-mono text-xs tracking-widest uppercase transition-colors ${isActive ? 'text-gold' : 'text-ink-faint hover:text-ink-dim'}`
              }
            >
              Explore
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `font-mono text-xs tracking-widest uppercase transition-colors ${isActive ? 'text-gold' : 'text-ink-faint hover:text-ink-dim'}`
              }
            >
              Admin
            </NavLink>
          </div>
        </nav>
      </header>
      <main className="pt-13">
        <Outlet />
      </main>
    </div>
  );
}
