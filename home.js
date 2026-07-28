const FIREBASE_SDK_VERSION = "12.16.0";
const NUMBERED_QUESTION_COUNT = 12;
const QUESTION_ID_PATTERN = /^q(0|[1-9]|1[0-2])$/;
const QUESTION_TYPES = ["number", "time"];
const FALLBACK_QUESTIONS = [
  {
    id: "q0",
    order: 0,
    text: "Hvormange gange på en dag siger Anna GRØNDAHL!",
    type: "number"
  },
  ...Array.from({ length: NUMBERED_QUESTION_COUNT }, (_, index) => ({
    id: `q${index + 1}`,
    order: index + 1,
    text: String(index + 1),
    type: "number"
  }))
];

const qrImage = document.getElementById("qr-code");
const startBtn = document.getElementById("start-quiz");
const shareBtn = document.getElementById("share-link");
const statusEl = document.getElementById("share-status");
const activationGrid = document.getElementById("question-activation");
const questionTypeControls = document.getElementById("question-type-controls");
const questionTypeStatusEl = document.getElementById("question-type-status");
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
  answersPath: "answers",
  participantsPath: "participants",
  submissionsPath: "submissions",
  ...(window.firebaseSettings || {})
};

let questionsCache = [...FALLBACK_QUESTIONS];
let participantsCache = [];
let answersCache = [];
let legacySubmissionsCache = [];
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

function normalizeQuestionType(type) {
  return QUESTION_TYPES.includes(type) ? type : "number";
}

function getQuestionTypeLabel(type) {
  return normalizeQuestionType(type) === "time" ? "Tid" : "Tal";
}

function sortQuestions(questions) {
  return [...questions].sort((a, b) => a.order - b.order);
}

function normalizeQuestion(id, data = {}) {
  const fallbackIndex = Number(id.replace("q", "")) || 0;
  const fallback = FALLBACK_QUESTIONS.find((question) => question.id === id);
  const text = typeof data.text === "string" && data.text.trim() ? data.text.trim() : fallback ? fallback.text : id;
  const order = typeof data.order === "number" ? data.order : fallback ? fallback.order : fallbackIndex;
  const type = normalizeQuestionType(typeof data.type === "string" ? data.type : fallback?.type);

  return {
    id,
    order,
    text,
    type
  };
}

function normalizeQuestions(data = {}) {
  const loadedQuestions = Object.fromEntries(
    Object.entries(data)
      .map(([id, question]) => normalizeQuestion(id, question))
      .filter((question) => QUESTION_ID_PATTERN.test(question.id))
      .map((question) => [question.id, question])
  );

  return sortQuestions(FALLBACK_QUESTIONS.map((fallback) => loadedQuestions[fallback.id] || fallback));
}

function normalizeActiveQuestion(data = {}) {
  const questionId = typeof data.questionId === "string" ? data.questionId : "q1";
  return QUESTION_ID_PATTERN.test(questionId) ? questionId : "q1";
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

  if (!QUESTION_ID_PATTERN.test(questionId) || !answer) {
    return null;
  }

  return {
    id,
    questionId,
    answer,
    name,
    answerType: normalizeQuestionType(data.answerType),
    answerValue: typeof data.answerValue === "number" ? data.answerValue : null,
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

function normalizeAnswers(data = {}) {
  return Object.entries(data)
    .flatMap(([questionId, answersByParticipant]) => {
      if (!answersByParticipant || typeof answersByParticipant !== "object") {
        return [];
      }

      return Object.entries(answersByParticipant).map(([participantId, answer]) => {
        const answerData = answer && typeof answer === "object" ? answer : {};

        return normalizeSubmission(`${questionId}-${participantId}`, {
          ...answerData,
          participantId,
          questionId
        });
      });
    })
    .filter(Boolean)
    .sort((a, b) => getTimeValue(b) - getTimeValue(a));
}

function getDisplayAnswersForQuestion(questionId) {
  const canonicalAnswers = answersCache.filter((answer) => answer.questionId === questionId);
  const canonicalKeys = new Set(
    canonicalAnswers
      .filter((answer) => answer.participantId)
      .map((answer) => `${answer.questionId}:${answer.participantId}`)
  );
  const legacyAnswers = legacySubmissionsCache.filter((answer) => {
    if (answer.questionId !== questionId) {
      return false;
    }

    if (!answer.participantId) {
      return true;
    }

    return !canonicalKeys.has(`${answer.questionId}:${answer.participantId}`);
  });

  return [...canonicalAnswers, ...legacyAnswers].sort((a, b) => getTimeValue(b) - getTimeValue(a));
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

function showQuestionTypeStatus(message) {
  questionTypeStatusEl.textContent = message;
  window.setTimeout(() => {
    if (questionTypeStatusEl.textContent === message) {
      questionTypeStatusEl.textContent = "";
    }
  }, 2500);
}

function setupQrCode() {
  const url = getGuestEntryUrl();
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
  qrImage.alt = `QR-kode til ${url}`;
}

function renderQuestionTypeControls() {
  const activeQuestion = getActiveQuestion();

  questionTypeControls.querySelectorAll("[data-question-type]").forEach((button) => {
    const type = normalizeQuestionType(button.dataset.questionType);
    button.classList.toggle("active", Boolean(activeQuestion && activeQuestion.type === type));
    button.disabled = !firebaseState || !activeQuestion;
  });
}

function renderActivationControls() {
  const buttons = questionsCache.map((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = question.id === activeQuestionId ? "activation-button active" : "activation-button";
    button.classList.add(`type-${question.type}`);
    button.dataset.questionId = question.id;
    button.title = `${question.text} (${getQuestionTypeLabel(question.type)})`;
    button.disabled = !firebaseState;

    const number = document.createElement("span");
    number.className = "activation-number";
    number.textContent = question.order;

    const type = document.createElement("span");
    type.className = "activation-type";
    type.textContent = getQuestionTypeLabel(question.type);

    button.append(number, type);
    return button;
  });

  activationGrid.replaceChildren(...buttons);
  const activeQuestion = getActiveQuestion();
  activeQuestionStatusEl.textContent = activeQuestion
    ? `Aktivt spørgsmål ${activeQuestion.order}`
    : "Intet aktivt spørgsmål";
  renderQuestionTypeControls();
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

  const activeAnswers = getDisplayAnswersForQuestion(activeQuestion.id);

  activeQuestionLabelEl.textContent = `Aktivt spørgsmål ${activeQuestion.order} · ${getQuestionTypeLabel(activeQuestion.type)}`;
  activeQuestionTitleEl.textContent = activeQuestion.text;
  activeAnswerCountEl.textContent = formatAnswerCount(activeAnswers.length);

  if (!activeAnswers.length) {
    activeAnswerListEl.replaceChildren(createEmptyMessage("Ingen svar på dette spørgsmål endnu."));
    return;
  }

  activeAnswerListEl.replaceChildren(...activeAnswers.map(createAnswerRow));
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

async function setQuestionType(type) {
  const normalizedType = normalizeQuestionType(type);
  const activeQuestion = getActiveQuestion();

  if (!firebaseState || !activeQuestion || activeQuestion.type === normalizedType) {
    return;
  }

  questionTypeControls.querySelectorAll("[data-question-type]").forEach((button) => {
    button.disabled = true;
  });
  showQuestionTypeStatus("Gemmer type...");

  try {
    const { getQuestionTypeRef, set } = firebaseState;
    await set(getQuestionTypeRef(activeQuestion.id), normalizedType);
    showQuestionTypeStatus(`Type sat til ${getQuestionTypeLabel(normalizedType)}`);
  } catch (error) {
    showQuestionTypeStatus(`Kunne ikke gemme type: ${error.message}`);
    renderQuestionTypeControls();
  }
}

async function initFirebase() {
  renderActivationControls();
  renderActiveQuestionPanel();
  renderParticipants();
  renderQuestionTypeControls();

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
    const answersRef = database.ref(db, firebaseSettings.answersPath);
    const participantsRef = database.ref(db, firebaseSettings.participantsPath);
    const submissionsRef = database.ref(db, firebaseSettings.submissionsPath);

    firebaseState = {
      activeQuestionRef,
      getQuestionTypeRef: (questionId) => database.ref(db, `${firebaseSettings.questionsPath}/${questionId}/type`),
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
      answersRef,
      (snapshot) => {
        answersCache = normalizeAnswers(snapshot.val() || {});
        renderActiveQuestionPanel();
      },
      (error) => {
        activeAnswerListEl.replaceChildren(createEmptyMessage(`Firebase-fejl: ${error.message}`));
      }
    );

    firebaseState.onValue(
      submissionsRef,
      (snapshot) => {
        legacySubmissionsCache = normalizeSubmissions(snapshot.val() || {});
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
questionTypeControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-question-type]");
  if (button) {
    setQuestionType(button.dataset.questionType);
  }
});
window.addEventListener("load", () => {
  setupQrCode();
  initFirebase();
});
