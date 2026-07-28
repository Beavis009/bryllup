const FIREBASE_SDK_VERSION = "12.16.0";
const DEFAULT_TIME = "16:00";
const form = document.getElementById("guess-form");
const guessList = document.getElementById("guess-list");
const countEl = document.getElementById("count");
const earliestEl = document.getElementById("earliest");
const latestEl = document.getElementById("latest");
const clearBtn = document.getElementById("clear-btn");
const shareBtn = document.getElementById("share-link");
const statusEl = document.getElementById("share-status");
const saveStatusEl = document.getElementById("save-status");
const qrImage = document.getElementById("qr-code");
const nameInput = document.getElementById("name");
const timeInput = document.getElementById("time");
const submitBtn = form.querySelector('button[type="submit"]');
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  path: "guesses",
  allowClientClear: false,
  ...(window.firebaseSettings || {})
};

let guessesCache = [];
let firebaseState = null;
let hasLoadedGuesses = false;
let statusTimer;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function sortGuesses(guesses) {
  return [...guesses].sort((a, b) => {
    const timeSort = a.time.localeCompare(b.time);
    if (timeSort !== 0) {
      return timeSort;
    }

    return a.createdAtMs - b.createdAtMs;
  });
}

function setFormDisabled(disabled) {
  nameInput.disabled = disabled;
  timeInput.disabled = disabled;
  submitBtn.disabled = disabled;
}

function setClearButtonState() {
  clearBtn.hidden = !firebaseSettings.allowClientClear;
  clearBtn.disabled = !firebaseState;
}

function showStatus(target, message, options = {}) {
  target.textContent = message;

  if (target !== saveStatusEl || options.persistent) {
    return;
  }

  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    if (target.textContent === message) {
      target.textContent = "";
    }
  }, 3000);
}

function showShareStatus(message) {
  showStatus(statusEl, message);
  window.setTimeout(() => {
    if (statusEl.textContent === message) {
      statusEl.textContent = "";
    }
  }, 2500);
}

function getCreatedAtMs(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function normalizeGuess(id, data = {}) {
  return {
    id,
    name: typeof data.name === "string" ? data.name.trim() : "",
    time: typeof data.time === "string" ? data.time : "",
    createdAtMs: getCreatedAtMs(data.createdAt) || getCreatedAtMs(data.createdAtClient)
  };
}

function createGuessCard(guess) {
  const article = document.createElement("article");
  article.className = "guess-card";

  const content = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = guess.name;
  const time = document.createElement("div");
  time.textContent = guess.time;
  content.append(name, time);

  const guessTime = document.createElement("div");
  guessTime.className = "guess-time";
  guessTime.textContent = guess.time;

  article.append(content, guessTime);
  return article;
}

function render() {
  const guesses = sortGuesses(guessesCache);
  countEl.textContent = guesses.length;
  earliestEl.textContent = guesses[0] ? guesses[0].time : "-";
  latestEl.textContent = guesses[guesses.length - 1] ? guesses[guesses.length - 1].time : "-";

  if (!guesses.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen gæt endnu. Vær den første.";
    guessList.replaceChildren(empty);
    return;
  }

  guessList.replaceChildren(...guesses.map(createGuessCard));
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

async function saveGuess(name, time) {
  const { guessesRef, push, set, serverTimestamp } = firebaseState;
  const newGuessRef = push(guessesRef);

  await set(newGuessRef, {
    name,
    time,
    createdAt: serverTimestamp(),
    createdAtClient: new Date().toISOString(),
    pageUrl: window.location.href.split("#")[0]
  });
}

async function clearGuesses() {
  const { guessesRef, remove } = firebaseState;
  await remove(guessesRef);
}

async function initFirebase() {
  render();
  setFormDisabled(true);
  setClearButtonState();

  if (!hasFirebaseConfig(firebaseConfig)) {
    showStatus(saveStatusEl, "Indsæt Firebase config i firebase-config.js.", { persistent: true });
    return;
  }

  showStatus(saveStatusEl, "Forbinder til Firebase...", { persistent: true });

  try {
    const [{ initializeApp }, database] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`)
    ]);
    const app = initializeApp(firebaseConfig);
    const db = database.getDatabase(app);
    const guessesRef = database.ref(db, firebaseSettings.path);

    firebaseState = {
      guessesRef,
      onValue: database.onValue,
      push: database.push,
      remove: database.remove,
      serverTimestamp: database.serverTimestamp,
      set: database.set
    };

    setClearButtonState();
    firebaseState.onValue(
      guessesRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        guessesCache = Object.entries(data)
          .map(([id, guess]) => normalizeGuess(id, guess))
          .filter((guess) => guess.name && guess.time);
        render();
        setFormDisabled(false);

        if (!hasLoadedGuesses) {
          hasLoadedGuesses = true;
          showStatus(saveStatusEl, "Klar til gæt");
        }
      },
      (error) => {
        setFormDisabled(true);
        showStatus(saveStatusEl, `Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );
  } catch (error) {
    setFormDisabled(true);
    showStatus(saveStatusEl, `Kunne ikke starte Firebase: ${error.message}`, { persistent: true });
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const time = timeInput.value;

  if (!name || !time || !firebaseState) {
    return;
  }

  setFormDisabled(true);
  showStatus(saveStatusEl, "Gemmer...");

  try {
    await saveGuess(name, time);
    form.reset();
    timeInput.value = DEFAULT_TIME;
    nameInput.focus();
    showStatus(saveStatusEl, "Gæt gemt");
  } catch (error) {
    showStatus(saveStatusEl, `Kunne ikke gemme: ${error.message}`, { persistent: true });
  } finally {
    setFormDisabled(false);
  }
});

clearBtn.addEventListener("click", async () => {
  if (!firebaseState || !window.confirm("Vil du rydde alle gæt i Firebase?")) {
    return;
  }

  clearBtn.disabled = true;
  showStatus(saveStatusEl, "Rydder...");

  try {
    await clearGuesses();
    showStatus(saveStatusEl, "Alle gæt er ryddet");
  } catch (error) {
    showStatus(saveStatusEl, `Kunne ikke rydde: ${error.message}`, { persistent: true });
  } finally {
    clearBtn.disabled = false;
  }
});

shareBtn.addEventListener("click", shareLink);
window.addEventListener("load", () => {
  timeInput.value = DEFAULT_TIME;
  setupQrCode();
  initFirebase();
});
