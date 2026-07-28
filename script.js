const STORAGE_KEY = "bryllup-guesses-v2";
const form = document.getElementById("guess-form");
const guessList = document.getElementById("guess-list");
const countEl = document.getElementById("count");
const earliestEl = document.getElementById("earliest");
const latestEl = document.getElementById("latest");
const clearBtn = document.getElementById("clear-btn");
const shareBtn = document.getElementById("share-link");
const statusEl = document.getElementById("share-status");
const qrImage = document.getElementById("qr-code");
const nameInput = document.getElementById("name");
const timeInput = document.getElementById("time");

function getStoredGuesses() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveGuesses(guesses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guesses));
}

function sortGuesses(guesses) {
  return [...guesses].sort((a, b) => a.time.localeCompare(b.time));
}

function showStatus(message) {
  statusEl.textContent = message;
  window.setTimeout(() => {
    if (statusEl.textContent === message) {
      statusEl.textContent = "";
    }
  }, 2500);
}

function render() {
  const guesses = sortGuesses(getStoredGuesses());
  countEl.textContent = guesses.length;
  earliestEl.textContent = guesses[0] ? guesses[0].time : "-";
  latestEl.textContent = guesses[guesses.length - 1] ? guesses[guesses.length - 1].time : "-";

  if (!guesses.length) {
    guessList.innerHTML = '<p class="empty">Ingen gæt endnu. Vær den første.</p>';
    return;
  }

  guessList.innerHTML = guesses
    .map(
      (guess) => `
        <article class="guess-card">
          <div>
            <strong>${guess.name}</strong>
            <div>${guess.time}</div>
          </div>
          <div class="guess-time">${guess.time}</div>
        </article>
      `
    )
    .join("");
}

function setupQrCode() {
  const url = window.location.href.split("#")[0];
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
  qrImage.alt = `QR-kode til ${url}`;
}

function shareLink() {
  const url = window.location.href;

  if (navigator.share) {
    navigator
      .share({
        title: "Bryllupsstemning",
        text: "Stem på den tid du tror festen starter",
        url
      })
      .then(() => showStatus("Link delt"))
      .catch(() => showStatus("Deling annulleret"));
    return;
  }

  navigator.clipboard
    .writeText(url)
    .then(() => showStatus("Link kopieret"))
    .catch(() => showStatus("Kunne ikke kopiere link"));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const time = timeInput.value;

  if (!name || !time) {
    return;
  }

  const guesses = getStoredGuesses();
  guesses.push({ name, time });
  saveGuesses(guesses);
  form.reset();
  timeInput.value = "16:00";
  nameInput.focus();
  render();
});

clearBtn.addEventListener("click", () => {
  if (window.confirm("Vil du rydde alle gæt?")) {
    localStorage.removeItem(STORAGE_KEY);
    render();
  }
});

shareBtn.addEventListener("click", shareLink);
window.addEventListener("storage", render);
window.addEventListener("load", () => {
  timeInput.value = "16:00";
  setupQrCode();
  render();
});
