export const MAX_AVATAR_BYTES = 256 * 1024;
export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** The type of an image from its own first bytes. The client's Content-Type is never trusted. */
export function sniffImage(b: Uint8Array): ImageType | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'; // "RIFF" .... "WEBP"
  return null;
}
