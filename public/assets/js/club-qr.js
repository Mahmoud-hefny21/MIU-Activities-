// Club application QR for presidents: a printable PNG with the club logo in the middle and the club name below.
// Scanning it opens the club view (/?club=ID), where Apply already asks the student to sign in first.
(() => {
  'use strict';
  const SIZE = 1000, QR = 760;

  const loadImage = (src) => new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  // Draws the full card and returns the canvas. Error correction "H" keeps the code readable with the logo on top.
  async function drawClubQr(club) {
    await window.ensureQRCode();
    const link = new URL(`/?club=${encodeURIComponent(club.id)}`, location.origin).toString();
    const holder = document.createElement('div');
    new window.QRCode(holder, { text: link, width: QR, height: QR, colorDark: '#111827', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.H });
    const code = holder.querySelector('canvas') || holder.querySelector('img');
    if (code.tagName === 'IMG' && !code.complete) await new Promise((resolve) => { code.onload = resolve; });

    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE + 220;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#9f1d24'; context.fillRect(0, 0, canvas.width, 14);
    const offset = (SIZE - QR) / 2;
    context.drawImage(code, offset, offset + 10, QR, QR);

    // Logo badge in the centre (about 20% of the code, within what error correction H recovers).
    const badge = QR * 0.22, center = offset + QR / 2;
    context.fillStyle = '#ffffff';
    roundRect(context, center - badge / 2 - 10, center + 10 - badge / 2 - 10, badge + 20, badge + 20, 26); context.fill();
    const logo = await loadImage(club.image) || await loadImage('/assets/img/pics/logo.svg.png');
    if (logo) {
      context.save(); roundRect(context, center - badge / 2, center + 10 - badge / 2, badge, badge, 20); context.clip();
      const scale = Math.min(badge / logo.width, badge / logo.height);
      context.drawImage(logo, center - (logo.width * scale) / 2, center + 10 - (logo.height * scale) / 2, logo.width * scale, logo.height * scale);
      context.restore();
    }

    context.textAlign = 'center';
    context.fillStyle = '#111827'; context.font = '800 54px Inter, Arial, sans-serif';
    context.fillText(club.name, SIZE / 2, SIZE + 60, SIZE - 80);
    context.fillStyle = '#9f1d24'; context.font = '700 34px Inter, Arial, sans-serif';
    context.fillText('Scan to view the club and apply', SIZE / 2, SIZE + 115);
    context.fillStyle = '#64748b'; context.font = '500 26px Inter, Arial, sans-serif';
    context.fillText('MIU Activities · Sign in with your MIU account to apply', SIZE / 2, SIZE + 160);
    return { canvas, link };
  }

  async function open() {
    const account = (typeof state !== 'undefined' && state.clubAccount) || null;
    const club = account && (state.clubs || []).find((item) => item.id === account.id) || account;
    const dialog = document.getElementById('clubQrDialog');
    if (!club?.id || !dialog) return;
    const preview = dialog.querySelector('[data-club-qr-preview]'), note = dialog.querySelector('[data-club-qr-note]'), download = dialog.querySelector('[data-club-qr-download]');
    preview.replaceChildren(); note.textContent = 'Preparing your club QR…'; download.disabled = true;
    dialog.showModal();
    try {
      const { canvas, link } = await drawClubQr({ id: club.id, name: club.name, image: club.image });
      const image = document.createElement('img');
      let url;
      try { url = canvas.toDataURL('image/png'); } catch { url = ''; }
      if (!url) throw new Error('The QR could not be prepared. Please try again.');
      image.src = url; image.alt = `${club.name} application QR code`;
      preview.append(image);
      note.textContent = `Opens ${link}`;
      download.disabled = false;
      download.onclick = () => {
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `${club.name.replace(/[^\w\- ]+/g, '').trim() || 'club'} - application QR.png`;
        document.body.append(anchor); anchor.click(); anchor.remove();
      };
    } catch (error) { note.textContent = error.message || 'The QR could not be prepared.'; }
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-club-qr-open]')) { event.preventDefault(); void open(); }
    if (event.target.closest('[data-club-qr-close]')) document.getElementById('clubQrDialog')?.close();
  });
  window.MiuClubQr = { drawClubQr };
})();
