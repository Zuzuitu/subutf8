import { useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';

type FileStatus = 'ready' | 'converted' | 'error';

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

const ACCEPTED =
  '.srt,.sub,.ass,.ssa,.vtt,.smi,.txt';

const ACCEPTED_EXTENSIONS = new Set([
  'srt',
  'sub',
  'ass',
  'ssa',
  'vtt',
  'smi',
  'txt',
]);

function extensionOf(name: string) {
  const parts = name.split('.');
  return parts.length > 1
    ? parts.pop()!.toLowerCase()
    : 'txt';
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

function textScore(text: string) {
  let score = 0;

  const romanian =
    text.match(/[ăâîșțĂÂÎȘȚşţŞŢ]/g)?.length ?? 0;

  const broken =
    text.match(
      /ÅŸ|Å£|Åž|Å¢|Äƒ|Ä‚|Ã¢|Ã‚|Ã®|ÃŽ|�/g,
    )?.length ?? 0;

  const controls =
    text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)
      ?.length ?? 0;

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

  if (utf8IsValid(bytes)) {
    return {
      encoding: 'UTF-8',
      text: decode(bytes, 'utf-8'),
    };
  }

  const candidates = [
    {
      label: 'Windows-1250',
      decoder: 'windows-1250',
    },
    {
      label: 'ISO-8859-2',
      decoder: 'iso-8859-2',
    },
    {
      label: 'Windows-1252',
      decoder: 'windows-1252',
    },
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

  const [items, setItems] = useState<SubtitleItem[]>([]);
  const [repairRomanian, setRepairRomanian] =
    useState(true);

  const [previewItem, setPreviewItem] =
    useState<SubtitleItem | null>(null);

  const convertedCount = useMemo(
    () =>
      items.filter(
        (item) => item.status === 'converted',
      ).length,
    [items],
  );

  async function addFiles(files: FileList | File[]) {
    const selected = Array.from(files);

    const valid = selected.filter((file) =>
      ACCEPTED_EXTENSIONS.has(extensionOf(file.name)),
    );

    const newItems = await Promise.all(
      valid.map(async (file): Promise<SubtitleItem> => {
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);

          const result = detectAndDecode(bytes);

          return {
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
            file,
            name: file.name,
            extension: extensionOf(file.name),
            encoding: result.encoding,
            text: result.text,
            status: 'ready',
          };
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

    setItems((current) => [...current, ...newItems]);
  }

  function convertAll() {
    setItems((current) =>
      current.map((item) => {
        if (item.status === 'error') {
          return item;
        }

        const convertedText = repairRomanian
          ? repairRomanianCharacters(item.text)
          : item.text;

        return {
          ...item,
          convertedText,
          status: 'converted',
        };
      }),
    );
  }

  function removeItem(id: string) {
    setItems((current) =>
      current.filter((item) => item.id !== id),
    );
  }

  function clearAll() {
    setItems([]);
    setPreviewItem(null);
  }

  function downloadItem(item: SubtitleItem) {
    const text =
      item.convertedText ?? item.text;

    const bytes = new TextEncoder().encode(text);

    const blob = new Blob([bytes], {
      type: 'text/plain;charset=utf-8',
    });

    downloadBlob(blob, item.name);
  }

  function exportZip() {
    const converted = items.filter(
      (item) => item.status === 'converted',
    );

    if (!converted.length) return;

    const archive: Record<string, Uint8Array> = {};

    converted.forEach((item) => {
      archive[item.name] = new TextEncoder().encode(
        item.convertedText ?? item.text,
      );
    });

    const zipped = zipSync(archive, {
      level: 6,
    });

    const blob = new Blob([zipped], {
      type: 'application/zip',
    });

    downloadBlob(blob, 'SubUTF8.zip');
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
            Convertește subtitrările în UTF-8, repară
            caracterele românești afișate greșit și
            procesează mai multe fișiere direct pe
            dispozitiv.
          </p>

          <p className="heroDescriptionEn">
            Convert subtitle files to UTF-8, repair broken
            Romanian characters, and process multiple files
            instantly — entirely on your device.
          </p>
        </div>

        <div className="privacy">
          ◉ Procesare locală
        </div>
      </header>

      <section
        className="card drop"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();

          if (event.dataTransfer.files.length) {
            addFiles(event.dataTransfer.files);
          }
        }}
      >
        <div className="icon">↥</div>

        <h2>Importă subtitrări</h2>

        <p>
          .srt .sub .ass .ssa .vtt .smi .txt · poți
          selecta mai multe fișiere
        </p>

        <button
          className="primary"
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
            if (event.target.files) {
              addFiles(event.target.files);
            }

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
                  {items.length === 1
                    ? 'selectat'
                    : 'selectate'}
                </span>
              </div>

              <button
                className="textButton"
                onClick={clearAll}
              >
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

                    <span>
                      Detectat: {item.encoding}
                    </span>
                  </div>

                  <div
                    className={`status ${item.status}`}
                  >
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
                          setPreviewItem(item)
                        }
                      >
                        Preview
                      </button>

                      <button
                        className="small"
                        onClick={() =>
                          downloadItem(item)
                        }
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
            <label className="toggle">
              <div>
                <strong>
                  Repară diacritice românești
                </strong>

                <span>
                  Repară automat caracterele românești
                  afișate greșit.
                </span>
              </div>

              <input
                type="checkbox"
                checked={repairRomanian}
                onChange={(event) =>
                  setRepairRomanian(
                    event.target.checked,
                  )
                }
              />

              <i />
            </label>

            <div className="fileNameNotice">
              <strong>Atenție:</strong> fișierele
              convertite vor păstra același nume ca
              fișierele originale. Verifică să nu le
              suprascrii accidental atunci când le
              salvezi.
            </div>

            <button
              className="primary wide"
              onClick={convertAll}
            >
              Convertește toate în UTF-8
            </button>

            {convertedCount > 1 && (
              <button
                className="secondary wide"
                onClick={exportZip}
              >
                Descarcă toate ca ZIP
              </button>
            )}
          </section>
        </>
      )}

      <section className="supportCard">
        <div
          className="supportIcon"
          aria-hidden="true"
        >
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
          <div className="supportLabel">
            Susține SubUTF8
          </div>

          <h3>Îți este util SubUTF8?</h3>

          <p>
            Dacă folosești des SubUTF8 și îl consideri
            util, poți susține proiectul cu orice sumă
            dorești. Orice apreciere contează.
          </p>

          <a
            className="paypalButton"
            href="https://www.paypal.me/AlexandruCiobanu00"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span
              className="beerIcon"
              aria-hidden="true"
            >
              🍺
            </span>

            Fă-mi cinste cu o bere
          </a>
        </div>
      </section>

      <section className="note">
        <strong>100% privat.</strong> Fișierele sunt
        procesate local pe dispozitiv și nu sunt
        încărcate pe niciun server.
      </section>

      <footer>
        SubUTF8 · pentru subtitrări text. Fișierele
        .sub/.idx și .sup bazate pe imagini necesită OCR
        și nu sunt incluse.
      </footer>

      {previewItem && (
        <div
          className="modal"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="sheet"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="grab" />

            <div className="sectionTitle">
              <div>
                <h2>Preview</h2>
                <span>{previewItem.name}</span>
              </div>

              <button
                className="textButton"
                onClick={() =>
                  setPreviewItem(null)
                }
              >
                Închide
              </button>
            </div>

            <pre>
              {previewItem.convertedText ??
                previewItem.text}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}
