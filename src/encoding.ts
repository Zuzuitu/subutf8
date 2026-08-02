import iconv from 'iconv-lite'
import { Buffer } from 'buffer'

export type DetectedEncoding = 'UTF-8'|'UTF-8 BOM'|'UTF-16LE'|'UTF-16BE'|'Windows-1250'|'Windows-1252'|'ISO-8859-2'

const candidates: Array<{label: DetectedEncoding; codec: string}> = [
  { label: 'Windows-1250', codec: 'windows-1250' },
  { label: 'ISO-8859-2', codec: 'iso-8859-2' },
  { label: 'Windows-1252', codec: 'windows-1252' }
]

function hasUTF8BOM(bytes: Uint8Array) { return bytes.length >= 3 && bytes[0]===0xef && bytes[1]===0xbb && bytes[2]===0xbf }
function hasUTF16LEBOM(bytes: Uint8Array) { return bytes.length >= 2 && bytes[0]===0xff && bytes[1]===0xfe }
function hasUTF16BEBOM(bytes: Uint8Array) { return bytes.length >= 2 && bytes[0]===0xfe && bytes[1]===0xff }

function isValidUtf8(bytes: Uint8Array): boolean {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true } catch { return false }
}

function scoreRomanian(text: string): number {
  let score = 0
  const good = (text.match(/[ăâîșțĂÂÎȘȚ]/g) || []).length
  const mojibake = (text.match(/Ã.|Â.|�/g) || []).length
  const controls = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length
  const common = (text.match(/\b(și|să|în|este|cu|nu|un|o|de|la|pe|pentru|care|mai|din|ce|te|îți)\b/gi) || []).length
  score += good * 5 + common * 2
  score -= mojibake * 8 + controls * 15
  return score
}

export function repairRomanianMojibake(input: string): string {
  const replacements: Record<string,string> = {
    'ÅŸ':'ș','Åž':'Ș','Å£':'ț','Å¢':'Ț','Äƒ':'ă','Ä‚':'Ă','Ã®':'î','ÃŽ':'Î','Ã¢':'â','Ã‚':'Â',
    'ş':'ș','Ş':'Ș','ţ':'ț','Ţ':'Ț'
  }
  let out = input
  for (const [bad, good] of Object.entries(replacements)) out = out.split(bad).join(good)
  return out
}

export function decodeSubtitle(bytes: Uint8Array): {text:string; encoding:DetectedEncoding} {
  if (hasUTF8BOM(bytes)) return { text: new TextDecoder('utf-8').decode(bytes.slice(3)), encoding:'UTF-8 BOM' }
  if (hasUTF16LEBOM(bytes)) return { text: iconv.decode(Buffer.from(bytes.slice(2)), 'utf16-le'), encoding:'UTF-16LE' }
  if (hasUTF16BEBOM(bytes)) return { text: iconv.decode(Buffer.from(bytes.slice(2)), 'utf16-be'), encoding:'UTF-16BE' }
  if (isValidUtf8(bytes)) return { text: new TextDecoder('utf-8').decode(bytes), encoding:'UTF-8' }

  let best = { text:'', encoding:'Windows-1250' as DetectedEncoding, score:-Infinity }
  for (const c of candidates) {
    const text = iconv.decode(Buffer.from(bytes), c.codec)
    const score = scoreRomanian(text)
    if (score > best.score) best = { text, encoding:c.label, score }
  }
  return { text: best.text, encoding: best.encoding }
}

export function toUtf8Blob(text: string): Blob {
  return new Blob([new TextEncoder().encode(text)], {type:'text/plain;charset=utf-8'})
}
