const FIREBASE_SDK_VERSION = "12.16.0";
const PARTICIPANT_COOKIE_NAME = "bryllupParticipant";

const identityForm = document.getElementById("identity-form");
const identityStatusEl = document.getElementById("identity-status");
const nameInput = document.getElementById("name");
const identitySubmitBtn = identityForm.querySelector('button[type="submit"]');
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  participantsPath: "participants",
  ...(window.firebaseSettings || {})
};

let firebaseState = null;
let identityStatusTimer;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function getCookie(name) {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
}

function setCookie(name, value, maxAgeSeconds) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function readParticipantCookie() {
  const rawValue = getCookie(PARTICIPANT_COOKIE_NAME);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue));
    if (typeof parsed.id === "string" && typeof parsed.name === "string" && parsed.name.trim()) {
      return {
        id: parsed.id,
        name: parsed.name.trim()
      };
    }
  } catch {
    return null;
  }

  return null;
}

function saveParticipantCookie(participant) {
  setCookie(PARTICIPANT_COOKIE_NAME, JSON.stringify(participant), 60 * 60 * 24 * 365);
}

function getCleanPageUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getAnswerUrl() {
  const url = new URL("answer.html", window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function redirectToAnswerPage() {
  window.location.replace(getAnswerUrl());
}

function setIdentityDisabled(disabled) {
  nameInput.disabled = disabled;
  identitySubmitBtn.disabled = disabled;
}

function showIdentityStatus(message, options = {}) {
  identityStatusEl.textContent = message;

  if (options.persistent) {
    return;
  }

  window.clearTimeout(identityStatusTimer);
  identityStatusTimer = window.setTimeout(() => {
    if (identityStatusEl.textContent === message) {
      identityStatusEl.textContent = "";
    }
  }, 3000);
}

async function createParticipant(name) {
  const { participantsRef, push, serverTimestamp, set } = firebaseState;
  const newParticipantRef = push(participantsRef);

  await set(newParticipantRef, {
    name,
    createdAt: serverTimestamp(),
    createdAtClient: new Date().toISOString(),
    pageUrl: getCleanPageUrl()
  });

  return {
    id: newParticipantRef.key,
    name
  };
}

async function initFirebase() {
  if (readParticipantCookie()) {
    redirectToAnswerPage();
    return;
  }

  setIdentityDisabled(true);

  if (!hasFirebaseConfig(firebaseConfig)) {
    showIdentityStatus("Indsæt Firebase config i firebase-config.js.", { persistent: true });
    return;
  }

  showIdentityStatus("Forbinder til Firebase...", { persistent: true });

  try {
    const [{ initializeApp }, database] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`)
    ]);
    const app = initializeApp(firebaseConfig);
    const db = database.getDatabase(app);

    firebaseState = {
      participantsRef: database.ref(db, firebaseSettings.participantsPath),
      push: database.push,
      serverTimestamp: database.serverTimestamp,
      set: database.set
    };

    setIdentityDisabled(false);
    showIdentityStatus("");
    nameInput.focus();
  } catch (error) {
    setIdentityDisabled(true);
    showIdentityStatus(`Kunne ikke starte Firebase: ${error.message}`, { persistent: true });
  }
}

identityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();

  if (!firebaseState || !name) {
    showIdentityStatus("Skriv dit navn.");
    return;
  }

  setIdentityDisabled(true);
  showIdentityStatus("Gemmer navn...");

  try {
    const participant = await createParticipant(name);
    saveParticipantCookie(participant);
    showIdentityStatus("Navn gemt. Sender dig videre...");
    redirectToAnswerPage();
  } catch (error) {
    setIdentityDisabled(false);
    showIdentityStatus(`Kunne ikke gemme navn: ${error.message}`, { persistent: true });
  }
});

window.addEventListener("load", initFirebase);
