import { useMemo, useRef, useState } from 'react'
import { zipSync, strToU8 } from 'fflate'
import { decodeSubtitle, repairRomanianMojibake, toUtf8Blob, type DetectedEncoding } from './encoding'

type Item = {
  id: string
  file: File
  encoding?: DetectedEncoding
  text?: string
  converted?: string
  status: 'ready'|'converted'|'error'
  error?: string
}

const allowed = ['srt','sub','ass','ssa','vtt','smi','txt']

function ext(name:string){return name.split('.').pop()?.toLowerCase() || ''}
function downloadBlob(blob:Blob, name:string){const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

export default function App(){
  const [items,setItems]=useState<Item[]>([])
  const [repair,setRepair]=useState(true)
  const [preview,setPreview]=useState<Item|null>(null)
  const input=useRef<HTMLInputElement>(null)
  const convertedCount=useMemo(()=>items.filter(i=>i.status==='converted').length,[items])

  async function addFiles(list:FileList|File[]){
    const next:Item[]=[]
    for(const file of Array.from(list)){
      if(!allowed.includes(ext(file.name))) continue
      try{
        const bytes=new Uint8Array(await file.arrayBuffer())
        const decoded=decodeSubtitle(bytes)
        next.push({id:crypto.randomUUID(),file,encoding:decoded.encoding,text:decoded.text,status:'ready'})
      }catch(e){next.push({id:crypto.randomUUID(),file,status:'error',error:String(e)})}
    }
    setItems(prev=>[...prev,...next])
  }

  function convertAll(){
    setItems(prev=>prev.map(i=>{
      if(!i.text) return i
      const converted=repair ? repairRomanianMojibake(i.text) : i.text
      return {...i,converted,status:'converted'}
    }))
  }

  function save(i:Item){if(i.converted!=null) downloadBlob(toUtf8Blob(i.converted), i.file.name)}
  function exportZip(){
    const data:Record<string,Uint8Array>={}
    for(const i of items) if(i.converted!=null) data[i.file.name]=strToU8(i.converted)
    downloadBlob(new Blob([zipSync(data,{level:6})],{type:'application/zip'}),'SubUTF8-converted.zip')
  }

  return <main className="shell">
    <header className="heroHeader">
  <div className="brandBlock">
    <img
      src="/logo-subutf8.png"
      alt="SubUTF8 by alexlab.media"
      className="brandLogo"
    />

    <p className="heroDescription">
      Transformă subtitrările în UTF-8, repară caracterele românești afișate greșit
      și procesează mai multe fișiere direct pe dispozitiv.
    </p>

    <p className="heroDescriptionEn">
      Convert subtitle files to UTF-8, repair broken Romanian characters,
      and process multiple files instantly — entirely on your device.
    </p>
  </div>

  <div className="privacy">
    ◉ Procesare locală
  </div>
</header>

    <section className="card drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files)}}>
      <div className="icon">↥</div><h2>Importă subtitrări</h2><p>.srt .sub .ass .ssa .vtt .smi .txt · poți selecta mai multe fișiere</p>
      <button className="primary" onClick={()=>input.current?.click()}>Alege fișiere</button>
      <input ref={input} hidden type="file" multiple accept=".srt,.sub,.ass,.ssa,.vtt,.smi,.txt,text/plain" onChange={e=>e.target.files&&addFiles(e.target.files)} />
    </section>

    {items.length>0 && <section className="card">
      <div className="sectionTitle"><div><h2>Fișiere</h2><span>{items.length} selectate</span></div><button className="textButton" onClick={()=>setItems([])}>Șterge tot</button></div>
      <div className="rows">{items.map(i=><div className="row" key={i.id}>
        <div className="fileIcon">{ext(i.file.name).toUpperCase()}</div>
        <div className="meta"><strong>{i.file.name}</strong><span>{i.encoding ? `Detectat: ${i.encoding}` : i.error || 'Eroare'}</span></div>
        <div className={`status ${i.status}`}>
  {i.status === 'converted'
    ? `${i.encoding || 'Detectat'} → UTF-8 ✓`
    : i.status === 'error'
    ? '!'
    : 'Pregătit'}
</div>
        <button className="round" aria-label="Remove" onClick={()=>setItems(p=>p.filter(x=>x.id!==i.id))}>×</button>
        {i.status==='converted' && <><button className="small" onClick={()=>setPreview(i)}>Preview</button><button className="small" onClick={()=>save(i)}>Salvează</button></>}
      </div>)}</div>
    </section>}

    {items.length>0 && <section className="card controls">
      <label className="toggle"><div><strong>Repară diacritice românești</strong><span>Repară automat caracterele românești afișate greșit.</span></div><input type="checkbox" checked={repair} onChange={e=>setRepair(e.target.checked)}/><i/></label>
      <div className="fileNameNotice">
  <strong>Atenție:</strong> fișierele convertite vor păstra același nume ca fișierele originale.
  Verifică să nu le suprascrii accidental atunci când le salvezi.
</div>
      <button className="primary wide" onClick={convertAll}>
  Convertește toate în UTF-8
</button>
      {convertedCount>1 && <button className="secondary wide" onClick={exportZip}>Descarcă toate ca ZIP</button>}
    </section>}

    <section className="supportCard">
  <div className="supportIcon" aria-hidden="true">
    <svg
      viewBox="0 0 24 24"
      width="25"
      height="25"
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
      Dacă folosești des site-ul sau aplicația și consideri că proiectul
      merită susținut, poți dona orice sumă dorești. Este complet opțional,
      dar este o modalitate simplă de a-mi arăta că apreciezi munca depusă.
    </p>

    <a
      className="paypalButton"
      href="https://www.paypal.me/AlexandruCiobanu00"
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M7.1 3.2h6.1c3.8 0 6 1.9 6 5 0 4-3.2 6.4-7.6 6.4H9.8l-.9 5.2H5L7.1 3.2Z" />
      </svg>

      Donează prin PayPal
    </a>
  </div>
</section>
    
    <section className="note"><strong>100% privat.</strong> Fișierele sunt procesate local pe dispozitiv și nu sunt încărcate pe niciun server.</section>
    <footer>SubUTF8 · pentru subtitrări text. Fișierele .sub/.idx și .sup bazate pe imagini necesită OCR și nu sunt incluse.</footer>

    {preview && <div className="modal" onClick={()=>setPreview(null)}><div className="sheet" onClick={e=>e.stopPropagation()}><div className="grab"/><div className="sectionTitle"><h2>{preview.file.name}</h2><button className="round" onClick={()=>setPreview(null)}>×</button></div><pre>{preview.converted}</pre></div></div>}
  </main>
}
