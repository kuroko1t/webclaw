/**
 * Tokenizer shared by the content script and the service worker for
 * type_text key handling. Must stay free of DOM dependencies.
 */
/**
 * Characters that are sent as real key presses instead of being inserted
 * as part of the value. Typing them through a value setter does nothing for
 * widgets that listen for keydown (chip/tag inputs, date pickers, forms):
 *   "\n" -> Enter, "\t" -> Tab, "," -> Comma (only for chip-like inputs).
 */
export type KeyToken = { kind: 'text'; text: string } | { kind: 'key'; key: 'Enter' | 'Tab' | ',' };

/** Split text into plain-text runs and special key presses. */
export function tokenizeKeys(text: string, commaAsKey: boolean): KeyToken[] {
  const tokens: KeyToken[] = [];
  let buf = '';
  const flush = () => {
    if (buf) tokens.push({ kind: 'text', text: buf });
    buf = '';
  };
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    if (ch === '\n' || ch === '\t' || (commaAsKey && ch === ',')) {
      flush();
      tokens.push({ kind: 'key', key: ch === '\n' ? 'Enter' : ch === '\t' ? 'Tab' : ',' });
    } else {
      buf += ch;
    }
  }
  flush();
  return tokens;
}

