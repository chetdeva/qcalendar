/** One of the icons downloaded from the Figma design into public/images/auth. Decorative, so no alt text. */
export function Icon({ name, width, height, className }: { name: string; width: number; height: number; className?: string }) {
  return <img src={`/images/auth/${name}.svg`} alt="" width={width} height={height} className={className} aria-hidden />;
}
