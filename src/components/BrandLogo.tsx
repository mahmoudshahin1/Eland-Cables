type BrandLogoProps = {
  /** Sizing/height classes for the logo image itself (e.g. `h-8`, `h-20 w-auto`). */
  className?: string;
  alt?: string;
  /**
   * Surface the logo sits on. Kept for call-site compatibility.
   * The current official lockup (`/logo.png`) ships with its own black plate,
   * so no extra light chip is applied on dark chrome.
   */
  onDark?: boolean;
  /** @deprecated Unused — lockup includes its own plate. Kept for API compatibility. */
  chipClassName?: string;
};

/** Official Energya Cables lockup from /public/logo.png (used unmodified). */
export function BrandLogo({
  className = 'h-10',
  alt = 'Energya Cables',
}: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      draggable={false}
      className={`w-auto object-contain ${className}`}
    />
  );
}
