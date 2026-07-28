const FIREBASE_SDK_VERSION = "12.16.0";
const QUESTION_COUNT = 12;
const PARTICIPANT_COOKIE_NAME = "bryllupParticipant";
const FALLBACK_QUESTIONS = Array.from({ length: QUESTION_COUNT }, (_, index) => ({
  id: `q${index + 1}`,
  order: index + 1,
  text: String(index + 1)
}));

const quizForm = document.getElementById("quiz-form");
const questionFields = document.getElementById("question-fields");
const saveStatusEl = document.getElementById("save-status");
const participantNameEl = document.getElementById("participant-name");
const quizSubmitBtn = quizForm.querySelector('button[type="submit"]');
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  questionsPath: "questions",
  activeQuestionPath: "activeQuestion",
  answersPath: "answers",
  submissionsPath: "submissions",
  ...(window.firebaseSettings || {})
};

let questionsCache = [...FALLBACK_QUESTIONS];
let answersData = {};
let legacySubmissionsCache = [];
let activeQuestionId = "q1";
let activeAnswer = "";
let participant = readParticipantCookie();
let firebaseState = null;
let hasLoadedQuestions = false;
let hasLoadedActiveQuestion = false;
let hasLoadedAnswers = false;
let hasLoadedLegacySubmissions = false;
let answerStatusTimer;

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

function getJoinUrl() {
  const url = new URL("join.html", window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function redirectToJoinPage() {
  window.location.replace(getJoinUrl());
}

function getActiveQuestion() {
  return questionsCache.find((question) => question.id === activeQuestionId) || questionsCache[0];
}

function getAnswerInput(questionId) {
  return document.getElementById(`answer-${questionId}`);
}

function sortQuestions(questions) {
  return [...questions].sort((a, b) => a.order - b.order);
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

function isQuestionReady() {
  return Boolean(
    firebaseState &&
      hasLoadedQuestions &&
      hasLoadedActiveQuestion &&
      hasLoadedAnswers &&
      hasLoadedLegacySubmissions &&
      participant
  );
}

function setQuizDisabled(disabled) {
  quizSubmitBtn.disabled = disabled;

  const input = getAnswerInput(activeQuestionId);
  if (input) {
    input.disabled = disabled;
  }
}

function showAnswerStatus(message, options = {}) {
  saveStatusEl.textContent = message;

  if (options.persistent) {
    window.clearTimeout(answerStatusTimer);
    return;
  }

  window.clearTimeout(answerStatusTimer);
  answerStatusTimer = window.setTimeout(() => {
    if (saveStatusEl.textContent === message) {
      saveStatusEl.textContent = "";
    }
  }, 3000);
}

function showQuizStep() {
  participantNameEl.textContent = participant ? participant.name : "-";
  renderQuestionField();
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

function normalizeAnswer(participantId, questionId, data = {}) {
  const answer = typeof data.answer === "string" ? data.answer.trim() : "";
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : participant?.name || "Dig";

  if (!answer) {
    return null;
  }

  return {
    id: data.id || `${questionId}-${participantId}`,
    participantId,
    questionId,
    answer,
    name,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    createdAtClient: typeof data.createdAtClient === "string" ? data.createdAtClient : ""
  };
}

function normalizeLegacySubmission(id, data = {}) {
  const questionId = typeof data.questionId === "string" ? data.questionId : "";
  const participantId = typeof data.participantId === "string" ? data.participantId : "";
  const normalized = normalizeAnswer(participantId, questionId, data);

  if (!normalized || !/^q([1-9]|1[0-2])$/.test(questionId)) {
    return null;
  }

  return {
    ...normalized,
    id
  };
}

function normalizeLegacySubmissions(data = {}) {
  return Object.entries(data)
    .map(([id, submission]) => normalizeLegacySubmission(id, submission))
    .filter(Boolean)
    .sort((a, b) => getTimeValue(b) - getTimeValue(a));
}

function getSavedAnswerForActiveQuestion() {
  if (!participant) {
    return null;
  }

  const canonicalAnswer = normalizeAnswer(
    participant.id,
    activeQuestionId,
    answersData?.[activeQuestionId]?.[participant.id]
  );

  if (canonicalAnswer) {
    return canonicalAnswer;
  }

  return (
    legacySubmissionsCache.find(
      (submission) => submission.questionId === activeQuestionId && submission.participantId === participant.id
    ) || null
  );
}

function syncVisibleAnswer() {
  const input = getAnswerInput(activeQuestionId);
  if (input) {
    activeAnswer = input.value;
  }
}

function createSavedAnswerCard(savedAnswer) {
  const card = document.createElement("div");
  card.className = "saved-answer-card";

  const label = document.createElement("span");
  label.textContent = "Dit svar";

  const answer = document.createElement("p");
  answer.textContent = savedAnswer.answer;

  card.append(label, answer);
  return card;
}

function renderQuestionField() {
  const question = getActiveQuestion();

  if (!question) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Intet aktivt spørgsmål fundet.";
    questionFields.replaceChildren(empty);
    quizSubmitBtn.hidden = true;
    return;
  }

  const savedAnswer = getSavedAnswerForActiveQuestion();
  const questionIndex = questionsCache.findIndex((item) => item.id === question.id);
  const wrapper = document.createElement("section");
  wrapper.className = "question-step active-question-step";

  const meta = document.createElement("div");
  meta.className = "question-step-meta";

  const counter = document.createElement("span");
  counter.textContent = `Aktivt spørgsmål ${questionIndex + 1} af ${questionsCache.length}`;

  const state = document.createElement("span");
  state.textContent = savedAnswer ? "Besvaret" : "Live";

  meta.append(counter, state);

  const title = document.createElement("h2");
  title.textContent = question.text;

  wrapper.append(meta, title);

  if (savedAnswer) {
    wrapper.append(createSavedAnswerCard(savedAnswer));
    questionFields.replaceChildren(wrapper);
    quizSubmitBtn.hidden = true;
    setQuizDisabled(true);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.id = `answer-${question.id}`;
  textarea.name = question.id;
  textarea.placeholder = "Skriv dit svar";
  textarea.maxLength = 500;
  textarea.required = true;
  textarea.rows = 4;
  textarea.value = activeAnswer;

  wrapper.append(textarea);
  questionFields.replaceChildren(wrapper);
  quizSubmitBtn.hidden = false;
  setQuizDisabled(!isQuestionReady());
}

function getAnswerPageUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildAnswerPayload(answer) {
  const question = getActiveQuestion();

  return {
    participantId: participant.id,
    name: participant.name,
    questionId: question.id,
    question: question.text,
    answer,
    createdAt: firebaseState.serverTimestamp(),
    createdAtClient: new Date().toISOString(),
    pageUrl: getAnswerPageUrl()
  };
}

async function saveAnswer(answer) {
  const question = getActiveQuestion();
  const answerRef = firebaseState.getAnswerRef(question.id, participant.id);
  const payload = buildAnswerPayload(answer);

  const result = await firebaseState.runTransaction(
    answerRef,
    (currentAnswer) => {
      if (currentAnswer !== null && currentAnswer !== undefined) {
        return;
      }

      return payload;
    },
    {
      applyLocally: false
    }
  );

  if (result.committed) {
    answersData = {
      ...answersData,
      [question.id]: {
        ...(answersData[question.id] || {}),
        [participant.id]: result.snapshot.val() || payload
      }
    };
  }

  return result.committed;
}

function updateReadyState() {
  showQuizStep();

  if (!isQuestionReady()) {
    setQuizDisabled(true);
    showAnswerStatus("Henter spørgsmål og tidligere svar...", { persistent: true });
    return;
  }

  if (getSavedAnswerForActiveQuestion()) {
    showAnswerStatus("Du har allerede svaret på dette spørgsmål.", { persistent: true });
    return;
  }

  setQuizDisabled(false);
  showAnswerStatus("Klar til svar");
}

async function initFirebase() {
  if (!participant) {
    redirectToJoinPage();
    return;
  }

  showQuizStep();
  setQuizDisabled(true);

  if (!hasFirebaseConfig(firebaseConfig)) {
    showAnswerStatus("Indsæt Firebase config i firebase-config.js.", { persistent: true });
    return;
  }

  showAnswerStatus("Forbinder til Firebase...", { persistent: true });

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
    const submissionsRef = database.ref(db, firebaseSettings.submissionsPath);

    firebaseState = {
      getAnswerRef: (questionId, participantId) =>
        database.ref(db, `${firebaseSettings.answersPath}/${questionId}/${participantId}`),
      onValue: database.onValue,
      runTransaction: database.runTransaction,
      serverTimestamp: database.serverTimestamp
    };

    firebaseState.onValue(
      questionsRef,
      (snapshot) => {
        questionsCache = normalizeQuestions(snapshot.val() || {});
        hasLoadedQuestions = true;
        updateReadyState();
      },
      (error) => {
        setQuizDisabled(true);
        showAnswerStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    firebaseState.onValue(
      activeQuestionRef,
      (snapshot) => {
        syncVisibleAnswer();
        const nextActiveQuestionId = normalizeActiveQuestion(snapshot.val() || {});

        if (nextActiveQuestionId !== activeQuestionId) {
          activeAnswer = "";
        }

        activeQuestionId = nextActiveQuestionId;
        hasLoadedActiveQuestion = true;
        updateReadyState();
      },
      (error) => {
        setQuizDisabled(true);
        showAnswerStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    firebaseState.onValue(
      answersRef,
      (snapshot) => {
        answersData = snapshot.val() || {};
        hasLoadedAnswers = true;
        updateReadyState();
      },
      (error) => {
        setQuizDisabled(true);
        showAnswerStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    firebaseState.onValue(
      submissionsRef,
      (snapshot) => {
        legacySubmissionsCache = normalizeLegacySubmissions(snapshot.val() || {});
        hasLoadedLegacySubmissions = true;
        updateReadyState();
      },
      (error) => {
        hasLoadedLegacySubmissions = true;
        updateReadyState();
        showAnswerStatus(`Kunne ikke hente gamle svar: ${error.message}`, { persistent: true });
      }
    );
  } catch (error) {
    setQuizDisabled(true);
    showAnswerStatus(`Kunne ikke starte Firebase: ${error.message}`, { persistent: true });
  }
}

questionFields.addEventListener("input", (event) => {
  if (event.target.id === `answer-${activeQuestionId}`) {
    activeAnswer = event.target.value;
  }
});

quizForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  syncVisibleAnswer();
  const answer = activeAnswer.trim();

  if (getSavedAnswerForActiveQuestion()) {
    activeAnswer = "";
    renderQuestionField();
    showAnswerStatus("Du har allerede svaret på dette spørgsmål.", { persistent: true });
    return;
  }

  if (!firebaseState || !participant || !answer) {
    showAnswerStatus("Skriv et svar.");
    return;
  }

  setQuizDisabled(true);
  showAnswerStatus("Gemmer...");

  try {
    const didSave = await saveAnswer(answer);

    if (!didSave) {
      activeAnswer = "";
      renderQuestionField();
      showAnswerStatus("Du har allerede svaret på dette spørgsmål.", { persistent: true });
      return;
    }

    activeAnswer = "";
    renderQuestionField();
    showAnswerStatus("Svar gemt. Du kan nu se dit svar.", { persistent: true });
  } catch (error) {
    showAnswerStatus(`Kunne ikke gemme: ${error.message}`, { persistent: true });
  } finally {
    if (!getSavedAnswerForActiveQuestion()) {
      setQuizDisabled(false);
    }
  }
});

window.addEventListener("load", initFirebase);
