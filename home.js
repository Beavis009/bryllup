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
const activeQuestionLabelEl = document.getElementById("active-question-label");
const activeQuestionTitleEl = document.getElementById("active-question-title");
const activeAnswerCountEl = document.getElementById("active-answer-count");
const activeAnswerListEl = document.getElementById("active-answer-list");
const participantCountEl = document.getElementById("participant-count");
const participantsListEl = document.getElementById("participants-list");
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  questionsPath: "questions",
  activeQuestionPath: "activeQuestion",
  participantsPath: "participants",
  submissionsPath: "submissions",
  ...(window.firebaseSettings || {})
};

let questionsCache = [...FALLBACK_QUESTIONS];
let participantsCache = [];
let submissionsCache = [];
let activeQuestionId = "q1";
let firebaseState = null;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function getGuestEntryUrl() {
  const url = new URL("join.html", window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getTimeValue(item) {
  if (typeof item.createdAt === "number") {
    return item.createdAt;
  }

  if (typeof item.createdAtClient === "string") {
    const parsed = Date.parse(item.createdAtClient);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function formatClock(item) {
  const timeValue = getTimeValue(item);
  if (!timeValue) {
    return "";
  }

  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timeValue));
}

function formatAnswerCount(count) {
  return count === 1 ? "1 svar" : `${count} svar`;
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

function normalizeParticipant(id, data = {}) {
  const name = typeof data.name === "string" ? data.name.trim() : "";

  if (!name) {
    return null;
  }

  return {
    id,
    name,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    createdAtClient: typeof data.createdAtClient === "string" ? data.createdAtClient : ""
  };
}

function normalizeParticipants(data = {}) {
  return Object.entries(data)
    .map(([id, participant]) => normalizeParticipant(id, participant))
    .filter(Boolean)
    .sort((a, b) => getTimeValue(b) - getTimeValue(a));
}

function normalizeSubmission(id, data = {}) {
  const questionId = typeof data.questionId === "string" ? data.questionId : "";
  const answer = typeof data.answer === "string" ? data.answer.trim() : "";
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Ukendt";

  if (!/^q([1-9]|1[0-2])$/.test(questionId) || !answer) {
    return null;
  }

  return {
    id,
    questionId,
    answer,
    name,
    participantId: typeof data.participantId === "string" ? data.participantId : "",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    createdAtClient: typeof data.createdAtClient === "string" ? data.createdAtClient : ""
  };
}

function normalizeSubmissions(data = {}) {
  return Object.entries(data)
    .map(([id, submission]) => normalizeSubmission(id, submission))
    .filter(Boolean)
    .sort((a, b) => getTimeValue(b) - getTimeValue(a));
}

function getActiveQuestion() {
  return questionsCache.find((question) => question.id === activeQuestionId) || questionsCache[0];
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
  const url = getGuestEntryUrl();
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
  qrImage.alt = `QR-kode til ${url}`;
}

function renderActivationControls() {
  const buttons = questionsCache.map((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = question.id === activeQuestionId ? "activation-button active" : "activation-button";
    button.dataset.questionId = question.id;
    button.textContent = question.order;
    button.title = question.text;
    button.disabled = !firebaseState;
    return button;
  });

  activationGrid.replaceChildren(...buttons);
  const activeQuestion = getActiveQuestion();
  const questionIndex = questionsCache.findIndex((question) => question.id === activeQuestion.id);
  activeQuestionStatusEl.textContent = activeQuestion
    ? `Aktivt spørgsmål ${questionIndex + 1}`
    : "Intet aktivt spørgsmål";
}

function renderActiveQuestionPanel() {
  const activeQuestion = getActiveQuestion();

  if (!activeQuestion) {
    activeQuestionLabelEl.textContent = "Aktivt spørgsmål";
    activeQuestionTitleEl.textContent = "-";
    activeAnswerCountEl.textContent = "0 svar";
    activeAnswerListEl.replaceChildren(createEmptyMessage("Intet aktivt spørgsmål."));
    return;
  }

  const questionIndex = questionsCache.findIndex((question) => question.id === activeQuestion.id);
  const activeSubmissions = submissionsCache.filter((submission) => submission.questionId === activeQuestion.id);

  activeQuestionLabelEl.textContent = `Aktivt spørgsmål ${questionIndex + 1} af ${questionsCache.length}`;
  activeQuestionTitleEl.textContent = activeQuestion.text;
  activeAnswerCountEl.textContent = formatAnswerCount(activeSubmissions.length);

  if (!activeSubmissions.length) {
    activeAnswerListEl.replaceChildren(createEmptyMessage("Ingen svar på dette spørgsmål endnu."));
    return;
  }

  activeAnswerListEl.replaceChildren(...activeSubmissions.map(createAnswerRow));
}

function createAnswerRow(submission) {
  const row = document.createElement("article");
  row.className = "answer-row live-answer-row";

  const header = document.createElement("div");
  header.className = "answer-row-header";

  const name = document.createElement("strong");
  name.textContent = submission.name;

  const time = document.createElement("span");
  time.textContent = formatClock(submission);

  const answer = document.createElement("p");
  answer.textContent = submission.answer;

  header.append(name, time);
  row.append(header, answer);
  return row;
}

function renderParticipants() {
  participantCountEl.textContent = String(participantsCache.length);

  if (!participantsCache.length) {
    participantsListEl.replaceChildren(createEmptyMessage("Ingen deltagere endnu."));
    return;
  }

  participantsListEl.replaceChildren(...participantsCache.map(createParticipantRow));
}

function createParticipantRow(participant) {
  const row = document.createElement("article");
  row.className = "participant-row";

  const name = document.createElement("strong");
  name.textContent = participant.name;

  const time = document.createElement("span");
  time.textContent = formatClock(participant) || "Registreret";

  row.append(name, time);
  return row;
}

function createEmptyMessage(message) {
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = message;
  return empty;
}

function shareLink() {
  const url = getGuestEntryUrl();

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
  renderActiveQuestionPanel();
  renderParticipants();

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
    const participantsRef = database.ref(db, firebaseSettings.participantsPath);
    const submissionsRef = database.ref(db, firebaseSettings.submissionsPath);

    firebaseState = {
      activeQuestionRef,
      onValue: database.onValue,
      serverTimestamp: database.serverTimestamp,
      set: database.set
    };

    firebaseState.onValue(
      questionsRef,
      (snapshot) => {
        questionsCache = normalizeQuestions(snapshot.val() || {});
        renderActivationControls();
        renderActiveQuestionPanel();
      },
      (error) => {
        activeQuestionStatusEl.textContent = `Firebase-fejl: ${error.message}`;
      }
    );

    firebaseState.onValue(
      activeQuestionRef,
      (snapshot) => {
        activeQuestionId = normalizeActiveQuestion(snapshot.val() || {});
        renderActivationControls();
        renderActiveQuestionPanel();
      },
      (error) => {
        activeQuestionStatusEl.textContent = `Firebase-fejl: ${error.message}`;
      }
    );

    firebaseState.onValue(
      participantsRef,
      (snapshot) => {
        participantsCache = normalizeParticipants(snapshot.val() || {});
        renderParticipants();
      },
      (error) => {
        participantsListEl.replaceChildren(createEmptyMessage(`Firebase-fejl: ${error.message}`));
      }
    );

    firebaseState.onValue(
      submissionsRef,
      (snapshot) => {
        submissionsCache = normalizeSubmissions(snapshot.val() || {});
        renderActiveQuestionPanel();
      },
      (error) => {
        activeAnswerListEl.replaceChildren(createEmptyMessage(`Firebase-fejl: ${error.message}`));
      }
    );
  } catch (error) {
    activeQuestionStatusEl.textContent = `Kunne ikke starte Firebase: ${error.message}`;
  }
}

startBtn.addEventListener("click", () => {
  window.location.href = getGuestEntryUrl();
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
