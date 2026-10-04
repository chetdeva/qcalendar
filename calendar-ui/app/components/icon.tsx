// Design icons live in public/icons as single-colour shapes. They are drawn as CSS masks so one file
// can take any state colour (selected, muted, accent) without a second asset.
const SIZE = {
  'arrow-right': [12, 12], close: [11.6667, 11.6667], 'gcal-badge': [11, 9],
  'header-add': [16.6667, 16.6667], mail: [15, 12], 'meet-toggle': [15, 12], 'office-hours': [13.3333, 13.3333],
  personal: [10.6667, 10.6667], 'plus-circle': [15, 15], restaurant: [9.375, 12.5],
  send: [15, 12.75], 'student-badge': [11.9167, 9.75], 'sync-chip': [10.6667, 10.6667], 'sync-toggle': [12, 12],
  tutoring: [14.6667, 12], 'verified-sync': [12.5, 12.8125], video: [14.1667, 11.3333],
} as const;

export type IconName = keyof typeof SIZE;

export function Icon({ name, color = 'currentColor' }: { name: IconName | string; color?: string }) {
  const [w, h] = SIZE[name as IconName] ?? [12, 12];
  const url = `url(/icons/${name}.svg)`;
  return (
    <span
      aria-hidden="true"
      className="ico"
      style={{ width: w, height: h, backgroundColor: color, maskImage: url, WebkitMaskImage: url }}
    />
  );
}
