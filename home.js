const FIREBASE_SDK_VERSION = "12.16.0";
const QUESTION_COUNT = 12;
const FALLBACK_QUESTIONS = Array.from({ length: QUESTION_COUNT }, (_, index) => ({
  id: `q${index + 1}`,
  order: index + 1,
  text: String(index + 1)
}));

const qrImage = document.getElementById("qr-code");
const startBtn = document.getElementById("start-quiz");
const shareBtn = document.getElementById("share-link");
const statusEl = document.getElementById("share-status");
const activationGrid = document.getElementById("question-activation");
const activeQuestionStatusEl = document.getElementById("active-question-status");
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  questionsPath: "questions",
  activeQuestionPath: "activeQuestion",
  ...(window.firebaseSettings || {})
};

let questionsCache = [...FALLBACK_QUESTIONS];
let activeQuestionId = "q1";
let firebaseState = null;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function getAnswerUrl() {
  const url = new URL("answer.html", window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function sortQuestions(questions) {
  return [...questions].sort((a, b) => a.order - b.order);
}

function normalizeQuestion(id, data = {}) {
  const fallbackIndex = Number(id.replace("q", "")) || 0;
  const fallback = FALLBACK_QUESTIONS.find((question) => question.id === id);
  const text = typeof data.text === "string" && data.text.trim() ? data.text.trim() : fallback ? fallback.text : id;
  const order = typeof data.order === "number" ? data.order : fallback ? fallback.order : fallbackIndex;

  return {
    id,
    order,
    text
  };
}

function normalizeQuestions(data = {}) {
  const loadedQuestions = Object.fromEntries(
    Object.entries(data)
      .map(([id, question]) => normalizeQuestion(id, question))
      .filter((question) => /^q([1-9]|1[0-2])$/.test(question.id))
      .map((question) => [question.id, question])
  );

  return sortQuestions(FALLBACK_QUESTIONS.map((fallback) => loadedQuestions[fallback.id] || fallback));
}

function normalizeActiveQuestion(data = {}) {
  const questionId = typeof data.questionId === "string" ? data.questionId : "q1";
  return /^q([1-9]|1[0-2])$/.test(questionId) ? questionId : "q1";
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

function renderActivationControls() {
  const buttons = questionsCache.map((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = question.id === activeQuestionId ? "activation-button active" : "activation-button";
    button.dataset.questionId = question.id;
    button.textContent = question.text;
    button.disabled = !firebaseState;
    return button;
  });

  activationGrid.replaceChildren(...buttons);
  const activeQuestion = questionsCache.find((question) => question.id === activeQuestionId);
  activeQuestionStatusEl.textContent = activeQuestion ? `Aktivt spørgsmål: ${activeQuestion.text}` : "Intet aktivt spørgsmål";
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

async function activateQuestion(questionId) {
  if (!firebaseState) {
    return;
  }

  const question = questionsCache.find((item) => item.id === questionId);
  if (!question) {
    return;
  }

  activeQuestionStatusEl.textContent = "Aktiverer...";

  try {
    const { activeQuestionRef, serverTimestamp, set } = firebaseState;
    await set(activeQuestionRef, {
      questionId,
      activatedAt: serverTimestamp(),
      activatedAtClient: new Date().toISOString()
    });
  } catch (error) {
    activeQuestionStatusEl.textContent = `Kunne ikke aktivere: ${error.message}`;
  }
}

async function initFirebase() {
  renderActivationControls();

  if (!hasFirebaseConfig(firebaseConfig)) {
    activeQuestionStatusEl.textContent = "Indsæt Firebase config i firebase-config.js.";
    return;
  }

  try {
    const [{ initializeApp }, database] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`)
    ]);
    const app = initializeApp(firebaseConfig);
    const db = database.getDatabase(app);
    const questionsRef = database.ref(db, firebaseSettings.questionsPath);
    const activeQuestionRef = database.ref(db, firebaseSettings.activeQuestionPath);

    firebaseState = {
      activeQuestionRef,
      onValue: database.onValue,
      serverTimestamp: database.serverTimestamp,
      set: database.set
    };

    firebaseState.onValue(questionsRef, (snapshot) => {
      questionsCache = normalizeQuestions(snapshot.val() || {});
      renderActivationControls();
    });

    firebaseState.onValue(activeQuestionRef, (snapshot) => {
      activeQuestionId = normalizeActiveQuestion(snapshot.val() || {});
      renderActivationControls();
    });
  } catch (error) {
    activeQuestionStatusEl.textContent = `Kunne ikke starte Firebase: ${error.message}`;
  }
}

startBtn.addEventListener("click", () => {
  window.location.href = getAnswerUrl();
});
shareBtn.addEventListener("click", shareLink);
activationGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-question-id]");
  if (button) {
    activateQuestion(button.dataset.questionId);
  }
});
window.addEventListener("load", () => {
  setupQrCode();
  initFirebase();
});
