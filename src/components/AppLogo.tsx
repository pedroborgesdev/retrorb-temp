/** Local brand artwork, also available when the app is offline. */
export type AppLogoVariant = 'retrorb' | 'retrorb-extended' | 'retrorb-typography';

export function AppLogo({
  className = 'size-8',
  decorative = false,
  variant = 'retrorb',
  size = 256,
}: {
  className?: string;
  decorative?: boolean;
  variant?: AppLogoVariant;
  size?: 256 | 512;
}) {
  const src = `${import.meta.env.BASE_URL}icons/${variant}-${size}.png`;
  return <img
    src={src}
    sizes="(min-width: 768px) 176px, 44px"
    alt={decorative ? '' : 'RetroOrb'}
    draggable={false}
    className={`shrink-0 object-contain ${className}`}
  />;
}
