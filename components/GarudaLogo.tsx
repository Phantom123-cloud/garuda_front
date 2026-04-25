export function GarudaLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="g-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3730a3" />
          <stop offset="100%" stopColor="#5b21b6" />
        </linearGradient>
        <linearGradient id="g-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c7d2fe" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="32" height="32" rx="7.5" fill="url(#g-bg)" />

      {/* Left wing — primary feather */}
      <path
        d="M15.5 19 C12 15.5 7.5 10.5 4 6.5 C8 10 12 14 15.5 19Z"
        fill="url(#g-wing)"
      />
      {/* Left wing — secondary feather */}
      <path
        d="M15.5 19 C11 17.5 6.5 16 4 12.5 C7 14.5 11 16.5 15.5 19Z"
        fill="white"
        fillOpacity="0.38"
      />

      {/* Right wing — primary feather */}
      <path
        d="M16.5 19 C20 15.5 24.5 10.5 28 6.5 C24 10 20 14 16.5 19Z"
        fill="white"
        fillOpacity="0.82"
      />
      {/* Right wing — secondary feather */}
      <path
        d="M16.5 19 C21 17.5 25.5 16 28 12.5 C25 14.5 21 16.5 16.5 19Z"
        fill="white"
        fillOpacity="0.3"
      />

      {/* Tail */}
      <path
        d="M13.8 20.5 Q16 25.5 18.2 20.5"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Head */}
      <circle cx="16" cy="14.5" r="2.9" fill="white" />

      {/* Beak — sharp left-facing tip */}
      <path
        d="M13.4 13.6 L15.2 14.5 L13.4 15.3"
        fill="white"
        fillOpacity="0.7"
      />
    </svg>
  );
}
