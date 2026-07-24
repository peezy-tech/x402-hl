export function canonicalizeTransactionIdentifier(value: string): string {
  return value.trim().replace(/[A-Z]/g, character => character.toLowerCase());
}
