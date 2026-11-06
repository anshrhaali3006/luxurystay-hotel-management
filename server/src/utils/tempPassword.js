import crypto from 'node:crypto';

// No look-alike characters (I, l, O, o, 0, 1) so a temporary password is easy to read out or type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const LIMIT = 256 - (256 % ALPHABET.length); // rejection sampling keeps every character equally likely

/** Random temporary password from a cryptographically secure source. */
export function generateTempPassword(length = 14) {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      if (byte < LIMIT) out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
