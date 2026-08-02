(() => {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (!isIOS || !isSafari || isStandalone) return;

  const DISMISS_KEY = "subutf8-install-banner-dismissed";

  // Dacă utilizatorul a ales "Mai târziu", nu mai afișăm bannerul 7 zile.
  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (dismissedAt && (Date.now() - dismissedAt) < sevenDays) return;

  const iconPath = "/apple-touch-icon.png";

  function openModal() {
    if (document.querySelector(".subutf8-install-modal")) return;

    const modal = document.createElement("div");
    modal.className = "subutf8-install-modal";
    modal.innerHTML = `
      <div class="subutf8-install-modal__sheet" role="dialog" aria-modal="true" aria-label="Cum instalez SubUTF8">
        <div class="subutf8-install-modal__head">
          <h2 class="subutf8-install-modal__title">Cum instalez SubUTF8</h2>
          <button class="subutf8-install-modal__close" aria-label="Închide">×</button>
        </div>

        <div class="subutf8-install-step">
          <div class="subutf8-install-step__num">1</div>
          <div class="subutf8-install-step__content">
            <strong>Apasă butonul Share</strong>
            <p>Apasă pictograma de partajare din bara Safari.</p>
          </div>
        </div>

        <div class="subutf8-install-step">
          <div class="subutf8-install-step__num">2</div>
          <div class="subutf8-install-step__content">
            <strong>Alege „Add to Home Screen”</strong>
            <p>Selectează „Add to Home Screen / Adaugă pe ecranul principal” și confirmă.</p>
          </div>
        </div>

        <div class="subutf8-install-tip">
          <strong>Sfat:</strong> bifează „Deschide ca aplicație web” pentru ca SubUTF8 să se deschidă ca aplicație, fără bara Safari.
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    modal.querySelector(".subutf8-install-modal__close").addEventListener("click", close);
  }

  function showBanner() {
    if (document.querySelector(".subutf8-install-banner")) return;

    const banner = document.createElement("div");
    banner.className = "subutf8-install-banner";
    banner.innerHTML = `
      <div class="subutf8-install-banner__top">
        <img src="${iconPath}" alt="SubUTF8" class="subutf8-install-banner__icon" />
        <div class="subutf8-install-banner__copy">
          <h3 class="subutf8-install-banner__title">Instalează SubUTF8 pe iPhone</h3>
          <p class="subutf8-install-banner__text">
            Adaugă aplicația pe ecranul principal pentru acces rapid și afișare fullscreen.
          </p>
        </div>
        <button class="subutf8-install-banner__close" aria-label="Închide">×</button>
      </div>

      <div class="subutf8-install-banner__actions">
        <button class="subutf8-install-banner__btn subutf8-install-banner__btn--later">Mai târziu</button>
        <button class="subutf8-install-banner__btn subutf8-install-banner__btn--install">Cum instalez</button>
      </div>
    `;

    document.body.appendChild(banner);

    const dismiss = () => {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      banner.remove();
    };

    banner.querySelector(".subutf8-install-banner__close").addEventListener("click", dismiss);
    banner.querySelector(".subutf8-install-banner__btn--later").addEventListener("click", dismiss);
    banner.querySelector(".subutf8-install-banner__btn--install").addEventListener("click", openModal);
  }

  // Mică întârziere ca pagina să se încarce normal înainte de banner.
  window.addEventListener("load", () => {
    setTimeout(showBanner, 900);
  });
})();
