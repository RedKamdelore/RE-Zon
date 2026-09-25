export function AtlasIcon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    compass: <><circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/></>,
    collection: <><rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><path d="m17 5 3-1 3 15-3 1Z"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    sources: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M17.5 10V6.5H14M6.5 14v3.5H10"/></>,
    wave: <path d="M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4"/>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--bg-app)"/><circle cx="15" cy="17" r="3" fill="var(--bg-app)"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>, plus: <path d="M12 5v14M5 12h14"/>,
    folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>,
    pin: <><path d="m9 3 10 10-4 1-3 4-6-6 4-3Z"/><path d="m7 17-4 4"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list: <path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.wave}</svg>
}
