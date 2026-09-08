import { useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';

type FileStatus = 'ready' | 'converted' | 'error';
type ActiveTool = 'convert' | 'resync';

type SubtitleItem = {
  id: string;
  file: File;
  name: string;
  extension: string;
  encoding: string;
  text: string;
  convertedText?: string;
  status: FileStatus;
  error?: string;
};

type ResyncItem = {
  id: string;
  file: File;
  name: string;
  extension: string;
  encoding: string;
  text: string;
  shiftedText?: string;
  timingCount?: number;
  readError?: string;
  error?: string;
};

type ShiftResult = {
  text: string;
  timingCount: number;
  error?: string;
};

type PreviewState = {
  name: string;
  text: string;
};

const ACCEPTED = '.srt,.sub,.ass,.ssa,.vtt,.smi,.txt';
const RESYNC_ACCEPTED = '.srt,.sub,.ass,.ssa,.vtt,.smi';
const MAX_OFFSET_MS = 86_400_000;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set([
  'srt',
  'sub',
  'ass',
  'ssa',
  'vtt',
  'smi',
  'txt',
]);

const RESYNC_EXTENSIONS = new Set([
  'srt',
  'sub',
  'ass',
  'ssa',
  'vtt',
  'smi',
]);

function extensionOf(name: string) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'txt';
}

function decode(bytes: Uint8Array, encoding: string) {
  return new TextDecoder(encoding).decode(bytes);
}

function utf8IsValid(bytes: Uint8Array) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function detectUtf16WithoutBom(bytes: Uint8Array) {
  const sampleLength = Math.min(bytes.length - (bytes.length % 2), 4096);
  if (sampleLength < 8) return null;

  let evenZeros = 0;
  let oddZeros = 0;
  const pairs = sampleLength / 2;

  for (let i = 0; i < sampleLength; i += 2) {
    if (bytes[i] === 0) evenZeros += 1;
    if (bytes[i + 1] === 0) oddZeros += 1;
  }

  const evenRatio = evenZeros / pairs;
  const oddRatio = oddZeros / pairs;

  if (oddRatio > 0.3 && evenRatio < 0.1) return 'utf-16le';
  if (evenRatio > 0.3 && oddRatio < 0.1) return 'utf-16be';
  return null;
}

function textScore(text: string) {
  let score = 0;
  const romanian =
    text.match(/[ăâîșțĂÂÎȘȚşţŞŢ]/g)?.length ?? 0;
  const broken =
    text.match(/ÅŸ|Å£|Åž|Å¢|Äƒ|Ä‚|Ã¢|Ã‚|Ã®|ÃŽ|�/g)?.length ?? 0;
  const controls =
    text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0;

  score += romanian * 5;
  score -= broken * 8;
  score -= controls * 10;
  return score;
}

function detectAndDecode(bytes: Uint8Array) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return {
      encoding: 'UTF-8',
      text: decode(bytes.slice(3), 'utf-8'),
    };
  }

  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xfe
  ) {
    return {
      encoding: 'UTF-16LE',
      text: decode(bytes.slice(2), 'utf-16le'),
    };
  }

  if (
    bytes.length >= 2 &&
    bytes[0] === 0xfe &&
    bytes[1] === 0xff
  ) {
    return {
      encoding: 'UTF-16BE',
      text: decode(bytes.slice(2), 'utf-16be'),
    };
  }

  const utf16WithoutBom = detectUtf16WithoutBom(bytes);
  if (utf16WithoutBom) {
    return {
      encoding: utf16WithoutBom === 'utf-16le' ? 'UTF-16LE' : 'UTF-16BE',
      text: decode(bytes, utf16WithoutBom),
    };
  }

  if (utf8IsValid(bytes)) {
    return {
      encoding: 'UTF-8',
      text: decode(bytes, 'utf-8'),
    };
  }

  const candidates = [
    { label: 'Windows-1250', decoder: 'windows-1250' },
    { label: 'ISO-8859-2', decoder: 'iso-8859-2' },
    { label: 'Windows-1252', decoder: 'windows-1252' },
  ];

  const decoded = candidates
    .map((candidate) => {
      try {
        const text = decode(bytes, candidate.decoder);
        return {
          encoding: candidate.label,
          text,
          score: textScore(text),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as {
    encoding: string;
    text: string;
    score: number;
  }[];

  decoded.sort((a, b) => b.score - a.score);

  return (
    decoded[0] ?? {
      encoding: 'Windows-1250',
      text: decode(bytes, 'windows-1250'),
    }
  );
}

function isProbablyBinaryText(text: string) {
  if (!text) return false;

  const controls =
    text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0;

  return controls > Math.max(8, Math.floor(text.length * 0.02));
}

function repairRomanianCharacters(text: string) {
  const replacements: Array<[string, string]> = [
    ['ÅŸ', 'ș'],
    ['Å£', 'ț'],
    ['Åž', 'Ș'],
    ['Å¢', 'Ț'],
    ['Äƒ', 'ă'],
    ['Ä‚', 'Ă'],
    ['Ã¢', 'â'],
    ['Ã‚', 'Â'],
    ['Ã®', 'î'],
    ['ÃŽ', 'Î'],
    ['ş', 'ș'],
    ['ţ', 'ț'],
    ['Ş', 'Ș'],
    ['Ţ', 'Ț'],
  ];

  let result = text;
  for (const [bad, good] of replacements) {
    result = result.split(bad).join(good);
  }
  return result;
}

function convertItem(item: SubtitleItem): SubtitleItem {
  if (item.status === 'error') return item;

  return {
    ...item,
    convertedText: repairRomanianCharacters(item.text),
    status: 'converted',
  };
}

function pad(value: number, length = 2) {
  return Math.max(0, Math.trunc(value)).toString().padStart(length, '0');
}

function timestampToMs(
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
) {
  return (
    hours * 3_600_000 +
    minutes * 60_000 +
    seconds * 1000 +
    milliseconds
  );
}

function shiftedMs(value: number, offsetMs: number) {
  return Math.max(0, Math.round(value + offsetMs));
}

function formatSrtTimestamp(value: number) {
  const ms = Math.max(0, Math.round(value));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const milliseconds = ms % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

function formatVttTimestamp(value: number, forceHours: boolean) {
  const ms = Math.max(0, Math.round(value));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const milliseconds = ms % 1000;

  if (forceHours || hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}

function formatAssTimestamp(value: number) {
  const centisecondsTotal = Math.max(0, Math.round(value / 10));
  const hours = Math.floor(centisecondsTotal / 360_000);
  const minutes = Math.floor((centisecondsTotal % 360_000) / 6000);
  const seconds = Math.floor((centisecondsTotal % 6000) / 100);
  const centiseconds = centisecondsTotal % 100;
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

function formatSubViewerTimestamp(
  value: number,
  precision: number,
  separator: string,
) {
  const unit = precision === 2 ? 10 : 1;
  const rounded = Math.max(0, Math.round(value / unit) * unit);
  const hours = Math.floor(rounded / 3_600_000);
  const minutes = Math.floor((rounded % 3_600_000) / 60_000);
  const seconds = Math.floor((rounded % 60_000) / 1000);
  const milliseconds = rounded % 1000;
  const fraction = precision === 2 ? Math.round(milliseconds / 10) : milliseconds;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(
    fraction,
    precision,
  )}`;
}

function shiftSrt(text: string, offsetMs: number): ShiftResult {
  let timingCount = 0;

  const shifted = text.replace(
    /^(\s*)(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})(\s*-->\s*)(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})([^\r\n]*)$/gm,
    (_match, lead, sh, sm, ss, sms, arrow, eh, em, es, ems, suffix) => {
      timingCount += 2;
      const start = timestampToMs(+sh, +sm, +ss, +sms);
      const end = timestampToMs(+eh, +em, +es, +ems);

      return `${lead}${formatSrtTimestamp(
        shiftedMs(start, offsetMs),
      )}${arrow}${formatSrtTimestamp(shiftedMs(end, offsetMs))}${suffix}`;
    },
  );

  return { text: shifted, timingCount };
}

function shiftVtt(text: string, offsetMs: number): ShiftResult {
  let timingCount = 0;

  const shifted = text.replace(
    /^(\s*)(?:(\d+):)?([0-5]?\d):([0-5]\d)\.(\d{3})(\s+-->\s+)(?:(\d+):)?([0-5]?\d):([0-5]\d)\.(\d{3})([^\r\n]*)$/gm,
    (_match, lead, sh, sm, ss, sms, arrow, eh, em, es, ems, suffix) => {
      timingCount += 2;
      const startHasHours = sh !== undefined;
      const endHasHours = eh !== undefined;
      const start = timestampToMs(startHasHours ? +sh : 0, +sm, +ss, +sms);
      const end = timestampToMs(endHasHours ? +eh : 0, +em, +es, +ems);

      return `${lead}${formatVttTimestamp(
        shiftedMs(start, offsetMs),
        startHasHours,
      )}${arrow}${formatVttTimestamp(
        shiftedMs(end, offsetMs),
        endHasHours,
      )}${suffix}`;
    },
  );

  return { text: shifted, timingCount };
}

function shiftAss(text: string, offsetMs: number): ShiftResult {
  let timingCount = 0;

  const shifted = text.replace(
    /^(Dialogue:\s*[^,\r\n]*,)(\d+):([0-5]\d):([0-5]\d)\.(\d{2}),(\d+):([0-5]\d):([0-5]\d)\.(\d{2})(,.*)$/gim,
    (_match, prefix, sh, sm, ss, sc, eh, em, es, ec, suffix) => {
      timingCount += 1;
      const start = timestampToMs(+sh, +sm, +ss, +sc * 10);
      const end = timestampToMs(+eh, +em, +es, +ec * 10);

      return `${prefix}${formatAssTimestamp(
        shiftedMs(start, offsetMs),
      )},${formatAssTimestamp(shiftedMs(end, offsetMs))}${suffix}`;
    },
  );

  return { text: shifted, timingCount };
}

function shiftSmi(text: string, offsetMs: number): ShiftResult {
  let timingCount = 0;

  const shifted = text.replace(/<SYNC\b[^>]*>/gi, (tag) => {
    let changed = false;
    const nextTag = tag.replace(
      /(\bSTART\s*=\s*["']?)(\d+)(["']?)/i,
      (_match, prefix, value, suffix) => {
        changed = true;
        return `${prefix}${shiftedMs(+value, offsetMs)}${suffix}`;
      },
    );

    if (changed) timingCount += 1;
    return nextTag;
  });

  return { text: shifted, timingCount };
}

function embeddedMicroDvdFps(text: string) {
  const match = text.match(/^\{1\}\{1\}\s*(\d+(?:[.,]\d+)?)\s*$/m);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 && value <= 240 ? value : null;
}

function shiftMicroDvd(
  text: string,
  offsetMs: number,
  fallbackFps: number,
): ShiftResult {
  const fps = embeddedMicroDvdFps(text) ?? fallbackFps;

  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) {
    return {
      text,
      timingCount: 0,
      error: 'FPS trebuie să fie un număr valid între 0 și 240.',
    };
  }

  const frameOffset = Math.round((offsetMs * fps) / 1000);
  let timingCount = 0;

  const shifted = text.replace(
    /^\{(\d+)\}\{(\d+)\}([^\r\n]*)$/gm,
    (fullLine, start, end, tail) => {
      const isFpsMetadata =
        +start === 1 &&
        +end === 1 &&
        /^\s*\d+(?:[.,]\d+)?\s*$/.test(tail);

      if (isFpsMetadata) return fullLine;

      timingCount += 1;
      const nextStart = Math.max(0, +start + frameOffset);
      const nextEnd = Math.max(0, +end + frameOffset);
      return `{${nextStart}}{${nextEnd}}${tail}`;
    },
  );

  return { text: shifted, timingCount };
}

function shiftSubViewer(text: string, offsetMs: number): ShiftResult {
  let timingCount = 0;

  const shifted = text.replace(
    /^(\s*)(\d+):([0-5]\d):([0-5]\d)([.,])(\d{2,3}),(\d+):([0-5]\d):([0-5]\d)([.,])(\d{2,3})([^\r\n]*)$/gm,
    (_match, lead, sh, sm, ss, sSep, sFrac, eh, em, es, eSep, eFrac, suffix) => {
      timingCount += 2;
      const startPrecision = sFrac.length;
      const endPrecision = eFrac.length;
      const startMs = startPrecision === 2 ? +sFrac * 10 : +sFrac;
      const endMs = endPrecision === 2 ? +eFrac * 10 : +eFrac;
      const start = timestampToMs(+sh, +sm, +ss, startMs);
      const end = timestampToMs(+eh, +em, +es, endMs);

      return `${lead}${formatSubViewerTimestamp(
        shiftedMs(start, offsetMs),
        startPrecision,
        sSep,
      )},${formatSubViewerTimestamp(
        shiftedMs(end, offsetMs),
        endPrecision,
        eSep,
      )}${suffix}`;
    },
  );

  return { text: shifted, timingCount };
}

function shiftSub(text: string, offsetMs: number, fps: number): ShiftResult {
  if (/^\{\d+\}\{\d+\}/m.test(text)) {
    return shiftMicroDvd(text, offsetMs, fps);
  }

  if (
    /^\s*\d+:[0-5]\d:[0-5]\d[.,]\d{2,3},\d+:[0-5]\d:[0-5]\d[.,]\d{2,3}/m.test(
      text,
    )
  ) {
    return shiftSubViewer(text, offsetMs);
  }

  return {
    text,
    timingCount: 0,
    error:
      'Acest .sub nu pare MicroDVD sau SubViewer text. Fișierele VobSub .sub/.idx bazate pe imagini nu pot fi resincronizate aici.',
  };
}

function shiftSubtitleText(
  text: string,
  extension: string,
  offsetMs: number,
  fps: number,
): ShiftResult {
  switch (extension) {
    case 'srt':
      return shiftSrt(text, offsetMs);
    case 'vtt':
      return shiftVtt(text, offsetMs);
    case 'ass':
    case 'ssa':
      return shiftAss(text, offsetMs);
    case 'smi':
      return shiftSmi(text, offsetMs);
    case 'sub':
      return shiftSub(text, offsetMs, fps);
    default:
      return {
        text,
        timingCount: 0,
        error: 'Format neacceptat pentru resync.',
      };
  }
}

function safeArchiveName(name: string) {
  const cleaned = name.replace(/[\\/]/g, '_').trim();
  return cleaned || 'subtitle.txt';
}

function uniqueArchiveName(name: string, used: Set<string>) {
  const safeName = safeArchiveName(name);
  if (!used.has(safeName)) {
    used.add(safeName);
    return safeName;
  }

  const dot = safeName.lastIndexOf('.');
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot) : '';

  let index = 2;
  let candidate = `${base} (${index})${ext}`;

  while (used.has(candidate)) {
    index += 1;
    candidate = `${base} (${index})${ext}`;
  }

  used.add(candidate);
  return candidate;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resyncInputRef = useRef<HTMLInputElement>(null);

  const [activeTool, setActiveTool] = useState<ActiveTool>('convert');
  const [items, setItems] = useState<SubtitleItem[]>([]);
  const [autoConvert, setAutoConvert] = useState(true);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const [resyncItems, setResyncItems] = useState<ResyncItem[]>([]);
  const [offsetInput, setOffsetInput] = useState('0');
  const [fpsInput, setFpsInput] = useState('23.976');
  const [resyncMessage, setResyncMessage] = useState('');

  const convertedCount = useMemo(
    () => items.filter((item) => item.status === 'converted').length,
    [items],
  );

  const hasReadyItems = useMemo(
    () => items.some((item) => item.status === 'ready'),
    [items],
  );

  const shiftedCount = useMemo(
    () => resyncItems.filter((item) => item.shiftedText !== undefined).length,
    [resyncItems],
  );

  const hasSubForResync = useMemo(
    () => resyncItems.some((item) => item.extension === 'sub'),
    [resyncItems],
  );

  async function addFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    const valid = selected.filter((file) =>
      ACCEPTED_EXTENSIONS.has(extensionOf(file.name)),
    );
    const rejected = selected.filter(
      (file) => !ACCEPTED_EXTENSIONS.has(extensionOf(file.name)),
    );

    const newItems = await Promise.all(
      valid.map(async (file): Promise<SubtitleItem> => {
        if (file.size > MAX_FILE_SIZE) {
          return {
            id: `${file.name}-${Math.random()}`,
            file,
            name: file.name,
            extension: extensionOf(file.name),
            encoding: 'Necunoscut',
            text: '',
            status: 'error',
            error: 'Fișierul depășește limita de 50 MB.',
          };
        }

        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const result = detectAndDecode(bytes);

          if (isProbablyBinaryText(result.text)) {
            return {
              id: `${file.name}-${Math.random()}`,
              file,
              name: file.name,
              extension: extensionOf(file.name),
              encoding: result.encoding,
              text: '',
              status: 'error',
              error: 'Fișierul pare binar și nu este o subtitrare text compatibilă.',
            };
          }

          const item: SubtitleItem = {
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
            file,
            name: file.name,
            extension: extensionOf(file.name),
            encoding: result.encoding,
            text: result.text,
            status: 'ready',
          };

          return autoConvert ? convertItem(item) : item;
        } catch {
          return {
            id: `${file.name}-${Math.random()}`,
            file,
            name: file.name,
            extension: extensionOf(file.name),
            encoding: 'Necunoscut',
            text: '',
            status: 'error',
            error: 'Fișierul nu a putut fi citit.',
          };
        }
      }),
    );

    if (rejected.length) {
      const rejectedItems: SubtitleItem[] = rejected.map((file) => ({
        id: `${file.name}-${Math.random()}`,
        file,
        name: file.name,
        extension: extensionOf(file.name),
        encoding: 'Necunoscut',
        text: '',
        status: 'error',
        error: 'Format neacceptat.',
      }));
      setItems((current) => [...current, ...newItems, ...rejectedItems]);
      return;
    }

    setItems((current) => [...current, ...newItems]);
  }

  async function addResyncFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    const valid = selected.filter((file) =>
      RESYNC_EXTENSIONS.has(extensionOf(file.name)),
    );

    if (!valid.length) {
      setResyncMessage(
        'Alege un fișier .srt, .sub, .ass, .ssa, .vtt sau .smi.',
      );
      return;
    }

    const newItems = await Promise.all(
      valid.map(async (file): Promise<ResyncItem> => {
        if (file.size > MAX_FILE_SIZE) {
          const error = 'Fișierul depășește limita de 50 MB.';
          return {
            id: `${file.name}-${Math.random()}`,
            file,
            name: file.name,
            extension: extensionOf(file.name),
            encoding: 'Necunoscut',
            text: '',
            readError: error,
            error,
          };
        }

        try {
          const buffer = await file.arrayBuffer();
          const result = detectAndDecode(new Uint8Array(buffer));

          if (isProbablyBinaryText(result.text)) {
            const error =
              'Fișierul pare binar. VobSub .sub/.idx bazat pe imagini nu este compatibil cu resync text.';
            return {
              id: `${file.name}-${Math.random()}`,
              file,
              name: file.name,
              extension: extensionOf(file.name),
              encoding: result.encoding,
              text: '',
              readError: error,
              error,
            };
          }

          return {
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
            file,
            name: file.name,
            extension: extensionOf(file.name),
            encoding: result.encoding,
            text: result.text,
          };
        } catch {
          return {
            id: `${file.name}-${Math.random()}`,
            file,
            name: file.name,
            extension: extensionOf(file.name),
            encoding: 'Necunoscut',
            text: '',
            readError: 'Fișierul nu a putut fi citit.',
            error: 'Fișierul nu a putut fi citit.',
          };
        }
      }),
    );

    setResyncMessage('');
    setResyncItems((current) => [...current, ...newItems]);
  }

  function convertAll() {
    setItems((current) => current.map((item) => convertItem(item)));
  }

  function handleAutoConvertChange(enabled: boolean) {
    setAutoConvert(enabled);
    if (enabled) {
      setItems((current) =>
        current.map((item) =>
          item.status === 'ready' ? convertItem(item) : item,
        ),
      );
    }
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function clearAll() {
    setItems([]);
    setPreview(null);
  }

  function downloadItem(item: SubtitleItem) {
    const text = item.convertedText ?? item.text;
    const bytes = new TextEncoder().encode(text);
    downloadBlob(
      new Blob([bytes], { type: 'text/plain;charset=utf-8' }),
      item.name,
    );
  }

  function exportZip() {
    const converted = items.filter((item) => item.status === 'converted');
    if (!converted.length) return;

    const archive: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    converted.forEach((item) => {
      const name = uniqueArchiveName(item.name, usedNames);
      archive[name] = new TextEncoder().encode(
        item.convertedText ?? item.text,
      );
    });

    downloadBlob(
      new Blob([zipSync(archive, { level: 6 })], {
        type: 'application/zip',
      }),
      'SubUTF8.zip',
    );
  }

  function resetResyncResults() {
    setResyncItems((current) =>
      current.map((item) => ({
        ...item,
        shiftedText: undefined,
        timingCount: undefined,
        error: item.readError,
      })),
    );
    setResyncMessage('');
  }

  function updateOffset(value: string) {
    setOffsetInput(value);
    resetResyncResults();
  }

  function adjustOffset(delta: number) {
    const current = Number(offsetInput);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(
      -MAX_OFFSET_MS,
      Math.min(MAX_OFFSET_MS, Math.trunc(base + delta)),
    );
    updateOffset(String(next));
  }

  function updateFps(value: string) {
    setFpsInput(value);
    resetResyncResults();
  }

  function applyResync() {
    if (offsetInput.trim() === '') {
      setResyncMessage('Introdu offsetul în milisecunde.');
      return;
    }

    const offset = Number(offsetInput);
    const fps = Number(fpsInput);

    if (!Number.isFinite(offset) || !Number.isInteger(offset)) {
      setResyncMessage('Offsetul trebuie introdus în milisecunde întregi.');
      return;
    }

    if (Math.abs(offset) > MAX_OFFSET_MS) {
      setResyncMessage('Offsetul maxim permis este ±24 de ore.');
      return;
    }

    if (!resyncItems.length) {
      setResyncMessage('Alege mai întâi cel puțin o subtitrare.');
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    const nextItems = resyncItems.map((item) => {
      if (item.readError) {
        failureCount += 1;
        return item;
      }

      const result = shiftSubtitleText(
        item.text,
        item.extension,
        offset,
        fps,
      );

      if (result.error || result.timingCount === 0) {
        failureCount += 1;
        return {
          ...item,
          shiftedText: undefined,
          timingCount: undefined,
          error:
            result.error ??
            'Nu am găsit marcaje de timp compatibile în acest fișier.',
        };
      }

      successCount += 1;
      return {
        ...item,
        shiftedText: result.text,
        timingCount: result.timingCount,
        error: undefined,
      };
    });

    setResyncItems(nextItems);

    if (successCount > 0) {
      setResyncMessage(
        `Offset aplicat: ${offset > 0 ? '+' : ''}${offset} ms${
          failureCount ? ` · ${failureCount} fișier(e) cu eroare` : ''
        }.`,
      );
    } else {
      setResyncMessage('Nu am putut resincroniza fișierele selectate.');
    }
  }

  function removeResyncItem(id: string) {
    setResyncItems((current) =>
      current.filter((item) => item.id !== id),
    );
  }

  function clearResync() {
    setResyncItems([]);
    setResyncMessage('');
    setPreview(null);
  }

  function downloadResyncItem(item: ResyncItem) {
    if (item.shiftedText === undefined) return;
    const bytes = new TextEncoder().encode(item.shiftedText);
    downloadBlob(
      new Blob([bytes], { type: 'text/plain;charset=utf-8' }),
      item.name,
    );
  }

  function exportResyncZip() {
    const shifted = resyncItems.filter(
      (item) => item.shiftedText !== undefined,
    );
    if (!shifted.length) return;

    const archive: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    shifted.forEach((item) => {
      const name = uniqueArchiveName(item.name, usedNames);
      archive[name] = new TextEncoder().encode(item.shiftedText!);
    });

    downloadBlob(
      new Blob([zipSync(archive, { level: 6 })], {
        type: 'application/zip',
      }),
      'SubUTF8-Resync.zip',
    );
  }

  return (
    <main className="shell">
      <header className="heroHeader">
        <div className="brandBlock">
          <img
            src="/logo-subutf8.png"
            alt="SubUTF8 by alexlab.media"
            className="brandLogo"
          />
          <p className="heroDescription">
            Convertește subtitrările în UTF-8, repară caracterele
            românești afișate greșit și procesează mai multe fișiere
            direct pe dispozitiv.
          </p>
          <p className="heroDescriptionEn">
            Convert subtitle files to UTF-8, repair broken Romanian
            characters, and process multiple files instantly — entirely
            on your device.
          </p>
        </div>
        <div className="privacy">◉ Procesare locală</div>
      </header>

      <nav className="toolTabs" aria-label="Instrumente SubUTF8">
        <button
          type="button"
          className={activeTool === 'convert' ? 'active' : ''}
          aria-pressed={activeTool === 'convert'}
          onClick={() => setActiveTool('convert')}
        >
          Conversie UTF-8
        </button>
        <button
          type="button"
          className={activeTool === 'resync' ? 'active' : ''}
          aria-pressed={activeTool === 'resync'}
          onClick={() => setActiveTool('resync')}
        >
          Decalare
        </button>
      </nav>

      {activeTool === 'convert' ? (
        <>
          <section
            className="card drop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length) {
                addFiles(event.dataTransfer.files);
              }
            }}
          >
            <label className="toggle autoToggleCompact">
              <strong>Conversie automată</strong>
              <input
                type="checkbox"
                checked={autoConvert}
                onChange={(event) =>
                  handleAutoConvertChange(event.target.checked)
                }
              />
              <i />
            </label>

            <div className="icon">↥</div>
            <h2>Importă subtitrări</h2>
            <p>
              .srt .sub .ass .ssa .vtt .smi .txt · poți selecta mai
              multe fișiere
            </p>

            <button
              className="primary filePickerButton"
              onClick={() => inputRef.current?.click()}
            >
              Alege fișiere
            </button>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </section>

          {items.length > 0 && (
            <>
              <section className="card">
                <div className="sectionTitle">
                  <div>
                    <h2>Fișiere</h2>
                    <span>
                      {items.length}{' '}
                      {items.length === 1 ? 'selectat' : 'selectate'}
                    </span>
                  </div>
                  <button className="textButton" onClick={clearAll}>
                    Șterge tot
                  </button>
                </div>

                <div className="rows">
                  {items.map((item) => (
                    <div className="row" key={item.id}>
                      <div className="fileIcon">
                        {item.extension.toUpperCase()}
                      </div>
                      <div className="meta">
                        <strong>{item.name}</strong>
                        <span title={item.error}>
                          {item.error ?? `Detectat: ${item.encoding}`}
                        </span>
                      </div>
                      <div className={`status ${item.status}`}>
                        {item.status === 'converted'
                          ? `${item.encoding} → UTF-8 ✓`
                          : item.status === 'error'
                            ? '!'
                            : 'Pregătit'}
                      </div>
                      <button
                        className="round"
                        aria-label={`Șterge ${item.name}`}
                        onClick={() => removeItem(item.id)}
                      >
                        ×
                      </button>

                      {item.status === 'converted' && (
                        <>
                          <button
                            className="small"
                            onClick={() =>
                              setPreview({
                                name: item.name,
                                text: item.convertedText ?? item.text,
                              })
                            }
                          >
                            Preview
                          </button>
                          <button
                            className="small"
                            onClick={() => downloadItem(item)}
                          >
                            Descarcă
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="card controls">
                <div className="fileNameNotice">
                  <strong>Atenție:</strong> fișierele convertite vor
                  păstra același nume ca fișierele originale. Verifică să
                  nu le suprascrii accidental atunci când le salvezi.
                </div>
                {!autoConvert && hasReadyItems && (
                  <button className="primary wide" onClick={convertAll}>
                    Convertește toate în UTF-8
                  </button>
                )}
                {convertedCount > 1 && (
                  <button className="secondary wide" onClick={exportZip}>
                    Descarcă toate ca ZIP
                  </button>
                )}
              </section>
            </>
          )}
        </>
      ) : (
        <>
          <section
            className="card resyncDrop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length) {
                addResyncFiles(event.dataTransfer.files);
              }
            }}
          >
            <div className="resyncIcon">↔</div>
            <h2>Ajustare timp subtitrare</h2>
            <p>
              Mută toate marcajele de timp înainte sau înapoi cu un
              offset în milisecunde.
            </p>
            <button
              className="primary filePickerButton"
              onClick={() => resyncInputRef.current?.click()}
            >
              Alege subtitrări
            </button>
            <input
              ref={resyncInputRef}
              type="file"
              accept={RESYNC_ACCEPTED}
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) {
                  addResyncFiles(event.target.files);
                }
                event.target.value = '';
              }}
            />
          </section>

          <section className="card resyncControls">
            <div className="offsetHeader">
              <div>
                <h2>Offset</h2>
                <span>+ = mai târziu</span>
                <span>− = mai devreme</span>
              </div>
              <strong>1 secundă = 1000 ms</strong>
            </div>

            <div className="offsetInputWrap">
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min={-MAX_OFFSET_MS}
                max={MAX_OFFSET_MS}
                value={offsetInput}
                aria-label="Offset în milisecunde"
                onChange={(event) => updateOffset(event.target.value)}
              />
              <span>ms</span>
            </div>

            <div className="offsetQuick" aria-label="Ajustări rapide">
              {[-1000, -500, -100, 100, 500, 1000].map((delta) => (
                <button
                  type="button"
                  key={delta}
                  onClick={() => adjustOffset(delta)}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </button>
              ))}
            </div>

            {hasSubForResync && (
              <label className="fpsField">
                <span>FPS pentru .sub MicroDVD</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  max="240"
                  step="0.001"
                  value={fpsInput}
                  onChange={(event) => updateFps(event.target.value)}
                />
              </label>
            )}

            <button
              className="primary wide"
              disabled={!resyncItems.length}
              onClick={applyResync}
            >
              Aplică sincronizarea
            </button>

            {resyncMessage && (
              <div
                className={`resyncMessage ${
                  resyncMessage.startsWith('Offset aplicat:')
                    ? 'success'
                    : ''
                }`}
                role="status"
              >
                {resyncMessage}
              </div>
            )}
          </section>

          {resyncItems.length > 0 && (
            <section className="card">
              <div className="sectionTitle">
                <div>
                  <h2>Fișiere</h2>
                  <span>
                    {resyncItems.length}{' '}
                    {resyncItems.length === 1 ? 'selectat' : 'selectate'}
                  </span>
                </div>
                <button className="textButton" onClick={clearResync}>
                  Șterge tot
                </button>
              </div>

              <div className="rows">
                {resyncItems.map((item) => (
                  <div className="row" key={item.id}>
                    <div className="fileIcon">
                      {item.extension.toUpperCase()}
                    </div>
                    <div className="meta">
                      <strong>{item.name}</strong>
                      <span
                        className={item.error ? 'resyncErrorText' : ''}
                        title={item.error}
                      >
                        {item.error
                          ? item.error
                          : item.shiftedText !== undefined
                            ? `${item.timingCount ?? 0} marcaje ajustate`
                            : `Detectat: ${item.encoding}`}
                      </span>
                    </div>
                    <div
                      className={`status ${
                        item.error
                          ? 'error'
                          : item.shiftedText !== undefined
                            ? 'converted'
                            : ''
                      }`}
                    >
                      {item.error
                        ? '!'
                        : item.shiftedText !== undefined
                          ? 'Resync ✓'
                          : 'Pregătit'}
                    </div>
                    <button
                      className="round"
                      aria-label={`Șterge ${item.name}`}
                      onClick={() => removeResyncItem(item.id)}
                    >
                      ×
                    </button>

                    {item.shiftedText !== undefined && (
                      <>
                        <button
                          className="small"
                          onClick={() =>
                            setPreview({
                              name: item.name,
                              text: item.shiftedText!,
                            })
                          }
                        >
                          Preview
                        </button>
                        <button
                          className="small"
                          onClick={() => downloadResyncItem(item)}
                        >
                          Descarcă
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {shiftedCount > 1 && (
                <button className="secondary wide" onClick={exportResyncZip}>
                  Descarcă toate ca ZIP
                </button>
              )}
            </section>
          )}

          <div className="resyncHint">
            Pentru .sub MicroDVD, offsetul în ms este convertit în cadre.
            Fișierele .sub/.idx VobSub și .sup sunt bazate pe imagini și nu
            sunt incluse.
          </div>
        </>
      )}

      <section className="supportCard">
        <div className="supportIcon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </div>
        <div className="supportContent">
          <div className="supportLabel">Susține SubUTF8</div>
          <h3>Îți este util SubUTF8?</h3>
          <p>
            Dacă folosești des SubUTF8 și îl consideri util, poți susține
            proiectul cu orice sumă dorești. Orice apreciere contează.
          </p>
          <a
            className="paypalButton"
            href="https://www.paypal.me/AlexandruCiobanu00"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="beerIcon" aria-hidden="true">
              🍺
            </span>
            Fă-mi cinste cu o bere
          </a>
        </div>
      </section>

      <section className="note">
        <strong>100% privat.</strong> Fișierele sunt procesate local pe
        dispozitiv și nu sunt încărcate pe niciun server.
      </section>

      <footer>
        SubUTF8 · pentru subtitrări text. Fișierele .sub/.idx și .sup bazate
        pe imagini necesită OCR și nu sunt incluse.
      </footer>

      {preview && (
        <div className="modal" onClick={() => setPreview(null)}>
          <div
            className="sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grab" />
            <div className="sectionTitle">
              <div>
                <h2>Preview</h2>
                <span>{preview.name}</span>
              </div>
              <button className="textButton" onClick={() => setPreview(null)}>
                Închide
              </button>
            </div>
            <pre>{preview.text}</pre>
          </div>
        </div>
      )}
    </main>
  );
}
