const qrImage = document.getElementById("qr-code");
const startBtn = document.getElementById("start-quiz");
const shareBtn = document.getElementById("share-link");
const statusEl = document.getElementById("share-status");

function getAnswerUrl() {
  const url = new URL("answer.html", window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function showShareStatus(message) {
  statusEl.textContent = message;
  window.setTimeout(() => {
    if (statusEl.textContent === message) {
      statusEl.textContent = "";
    }
  }, 2500);
}

function setupQrCode() {
  const url = getAnswerUrl();
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
  qrImage.alt = `QR-kode til ${url}`;
}

function shareLink() {
  const url = getAnswerUrl();

  if (navigator.share) {
    navigator
      .share({
        title: "Bryllupsquiz",
        text: "Svar på bryllupsquizzen",
        url
      })
      .then(() => showShareStatus("Link delt"))
      .catch(() => showShareStatus("Deling annulleret"));
    return;
  }

  if (!navigator.clipboard) {
    showShareStatus("Kopiér linket fra adresselinjen");
    return;
  }

  navigator.clipboard
    .writeText(url)
    .then(() => showShareStatus("Link kopieret"))
    .catch(() => showShareStatus("Kunne ikke kopiere link"));
}

startBtn.addEventListener("click", () => {
  window.location.href = getAnswerUrl();
});
shareBtn.addEventListener("click", shareLink);
window.addEventListener("load", setupQrCode);
