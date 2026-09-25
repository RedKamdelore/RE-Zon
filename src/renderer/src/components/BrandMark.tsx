/** «Этикетка»: компактное написание имени для навигационной панели. */
export default function BrandMark() {
  return <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <rect x="4" y="5" width="92" height="90" rx="5" fill="none" stroke="var(--accent)" strokeWidth="3" />
    <g fill="currentColor" fontFamily="Arial, sans-serif" fontWeight="700">
      <text x="15" y="46" fontSize="37">RE:</text>
      <text x="15" y="80" fontSize="31">ZON</text>
    </g>
  </svg>
}
