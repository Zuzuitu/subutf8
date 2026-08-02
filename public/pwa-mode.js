(() => {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (!standalone) return;

  document.documentElement.classList.add('subutf8-pwa');

  const applyPwaText = () => {
    const header = document.querySelector('header');
    if (!header) return false;

    // Descrierea principală în română – doar în PWA.
    const ro =
      header.querySelector('.heroDescription') ||
      header.querySelector('p');

    if (ro) {
      ro.textContent =
        'Convertește subtitrările în UTF-8, repară caracterele românești afișate greșit și procesează mai multe fișiere direct pe dispozitiv.';
    }

    // Descrierea mică în engleză – doar în PWA.
    let en = header.querySelector('.heroDescriptionEn');
    if (!en && ro) {
      en = document.createElement('p');
      en.className = 'heroDescriptionEn';
      ro.insertAdjacentElement('afterend', en);
    }
    if (en) {
      en.textContent =
        'Convert subtitles to UTF-8, repair broken Romanian characters, and process multiple files directly on your device.';
    }

    // Textul zonei de import, fără a elimina suportul multi-upload.
    const drop = document.querySelector('.drop');
    if (drop) {
      const p = drop.querySelector('p');
      if (p) {
        p.textContent =
          'Trage fișierele aici sau selectează-le manual · poți alege mai multe simultan';
      }
    }

    return true;
  };

  if (!applyPwaText()) {
    const observer = new MutationObserver(() => {
      if (applyPwaText()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 8000);
  }
})();
