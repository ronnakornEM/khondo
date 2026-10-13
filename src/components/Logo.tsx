export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0f766e" />
      <path d="M18 50V16h8v13l13-13h10L34 31l16 19H40L29 36l-3 3v11z" fill="#fff" />
      <rect x="40" y="14" width="6" height="6" rx="1" fill="#fbbf24" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <LogoMark />
      <span className="text-xl">Khondo</span>
    </span>
  );
}
