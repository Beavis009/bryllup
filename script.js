const FIREBASE_SDK_VERSION = "12.16.0";
const PARTICIPANT_COOKIE_NAME = "bryllupParticipant";
const QUESTION_ID_PATTERN = /^q(0|[1-9]|1[0-2])$/;
const QUESTION_TYPES = ["number", "time"];
const FALLBACK_QUESTIONS = [
  {
    id: "q0",
    order: 0,
    category: "Testspørgsmål",
    text: 'Hvor mange gange siger Anna "Grøndahl!" i løbet af en helt almindelig uge?',
    type: "number"
  },
  {
    id: "q1",
    order: 1,
    category: "Samarbejdsopgave",
    text: "Hvor lang tid tager det Kasper at lave en Old Fashioned, når Anna læser opskriften højt for ham?",
    type: "time"
  },
  {
    id: "q2",
    order: 2,
    category: "Spørgsmål",
    text: "Hvilket husnummer bor Anna og Kasper i?",
    type: "number"
  },
  {
    id: "q3",
    order: 3,
    category: "Kasper opgave",
    text: "Hvor mange vingummibamser kan Kasper flytte fra én skål til en anden på 30 sekunder?",
    type: "number"
  },
  {
    id: "q4",
    order: 4,
    category: "Anna video",
    text: "Hvor mange balloner kan Anna puste op på 1 minut?",
    type: "number"
  },
  {
    id: "q5",
    order: 5,
    category: "Anna opgave",
    text: "Hvor mange Disney-film kan Anna gætte på 30 sekunder?",
    type: "number"
  },
  {
    id: "q6",
    order: 6,
    category: "Kasper video",
    text: "Hvor længe kan Kasper blive stående på et surfbræt på en kunstig bølge?",
    type: "time"
  },
  {
    id: "q7",
    order: 7,
    category: "Spørgsmål",
    text: "Hvor mange dækskift er der blevet lavet hos Lykkegårdens Auto i 2026?",
    type: "number"
  },
  {
    id: "q8",
    order: 8,
    category: "Kasper opgave",
    text: "Hvor lang tid tager det Kasper at binde et slips?",
    type: "time"
  },
  {
    id: "q9",
    order: 9,
    category: "Anna video",
    text: "Hvor mange Disney-karakterer kan Anna nævne på 30 sekunder?",
    type: "number"
  },
  {
    id: "q10",
    order: 10,
    category: "Anna opgave",
    text: "Hvor lang tid tager det Anna at lægge et puslespil med 8 brikker?",
    type: "time"
  },
  {
    id: "q11",
    order: 11,
    category: "Kasper video",
    text: "Hvor lang tid tager det Kasper at slå 5 søm i?",
    type: "time"
  },
  {
    id: "q12",
    order: 12,
    category: "Samarbejdsopgave",
    text: "Hvor lang tid tager det Anna og Kasper at skifte betræk på en dyne og en pude?",
    type: "time"
  }
];
const QUESTION_TEXT_OVERRIDES = {
  q4: "Hvor mange balloner kan Anna puste op på 1 minut?",
  q5: "Hvor mange Disney-film kan Anna gætte på 30 sekunder?",
  q9: "Hvor mange Disney-karakterer kan Anna nævne på 30 sekunder?"
};

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
  participantsPath: "participants",
  submissionsPath: "submissions",
  ...(window.firebaseSettings || {})
};

let questionsCache = [...FALLBACK_QUESTIONS];
let answersData = {};
let legacySubmissionsCache = [];
let activeQuestionId = "q1";
let activeAnswerDraft = createEmptyAnswerDraft("number");
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

function setCookie(name, value, maxAgeSeconds) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function clearCookie(name) {
  setCookie(name, "", 0);
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

function clearParticipantCookie() {
  clearCookie(PARTICIPANT_COOKIE_NAME);
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

function getNumberAnswerInput(questionId) {
  return document.getElementById(`answer-${questionId}`);
}

function sortQuestions(questions) {
  return [...questions].sort((a, b) => a.order - b.order);
}

function normalizeQuestionType(type) {
  return QUESTION_TYPES.includes(type) ? type : "number";
}

function getQuestionTypeLabel(type) {
  return normalizeQuestionType(type) === "time" ? "Tid" : "Tal";
}

function createEmptyAnswerDraft(type) {
  return {
    type: normalizeQuestionType(type),
    value: ""
  };
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
  questionFields.querySelectorAll("input, textarea, select").forEach((input) => {
    input.disabled = disabled;
  });
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
  const overrideText = QUESTION_TEXT_OVERRIDES[id];
  const text =
    typeof overrideText === "string" && overrideText.trim()
      ? overrideText.trim()
      : typeof data.text === "string" && data.text.trim()
        ? data.text.trim()
        : fallback
          ? fallback.text
          : id;
  const order = typeof data.order === "number" ? data.order : fallback ? fallback.order : fallbackIndex;
  const category =
    typeof data.category === "string" && data.category.trim() ? data.category.trim() : fallback?.category || "";
  const type = normalizeQuestionType(typeof data.type === "string" ? data.type : fallback?.type);

  return {
    id,
    order,
    category,
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
    answerType: normalizeQuestionType(data.answerType),
    answerValue: typeof data.answerValue === "number" ? data.answerValue : null,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    createdAtClient: typeof data.createdAtClient === "string" ? data.createdAtClient : ""
  };
}

function normalizeLegacySubmission(id, data = {}) {
  const questionId = typeof data.questionId === "string" ? data.questionId : "";
  const participantId = typeof data.participantId === "string" ? data.participantId : "";
  const normalized = normalizeAnswer(participantId, questionId, data);

  if (!normalized || !QUESTION_ID_PATTERN.test(questionId)) {
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
  const question = getActiveQuestion();
  if (!question) {
    return;
  }

  const input = getNumberAnswerInput(activeQuestionId);
  if (input) {
    activeAnswerDraft = {
      type: question.type,
      value: input.value
    };
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

function createNumberAnswerField(question) {
  const label = document.createElement("label");
  label.className = "answer-input-label";

  const isTimeQuestion = question.type === "time";
  const text = document.createElement("span");
  text.textContent = isTimeQuestion ? "Antal sekunder" : "Tal";

  const input = document.createElement("input");
  input.id = `answer-${question.id}`;
  input.name = question.id;
  input.type = "number";
  input.inputMode = isTimeQuestion ? "numeric" : "decimal";
  input.autocomplete = "off";
  input.min = "0";
  input.step = isTimeQuestion ? "1" : "any";
  input.placeholder = isTimeQuestion ? "Skriv antal sekunder" : "Skriv et tal";
  input.required = true;
  input.value = activeAnswerDraft.type === question.type ? activeAnswerDraft.value : "";
  input.dataset.answerField = question.type;

  label.append(text, input);
  return label;
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

  if (activeAnswerDraft.type !== question.type) {
    activeAnswerDraft = createEmptyAnswerDraft(question.type);
  }

  const savedAnswer = getSavedAnswerForActiveQuestion();
  const wrapper = document.createElement("section");
  wrapper.className = "question-step active-question-step";

  const meta = document.createElement("div");
  meta.className = "question-step-meta";

  const counter = document.createElement("span");
  counter.textContent = ["Aktivt spørgsmål", question.category].filter(Boolean).join(" · ");

  const state = document.createElement("span");
  state.textContent = savedAnswer ? "Besvaret" : getQuestionTypeLabel(question.type);

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

  wrapper.append(createNumberAnswerField(question));
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

function parseNonNegativeInteger(value) {
  const trimmedValue = String(value).trim();
  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  return Number.parseInt(trimmedValue, 10);
}

function getPreparedAnswer() {
  const question = getActiveQuestion();

  if (!question) {
    return null;
  }

  if (question.type === "time") {
    const seconds = parseNonNegativeInteger(activeAnswerDraft.value);

    if (seconds === null || seconds > 999999) {
      return null;
    }

    return {
      answer: `${seconds} sekunder`,
      answerType: "time",
      answerValue: seconds
    };
  }

  const normalizedValue = String(activeAnswerDraft.value || "")
    .trim()
    .replace(",", ".");
  const numberValue = Number(normalizedValue);

  if (!normalizedValue || !Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return {
    answer: String(activeAnswerDraft.value).trim(),
    answerType: "number",
    answerValue: numberValue
  };
}

function buildAnswerPayload(preparedAnswer) {
  const question = getActiveQuestion();

  return {
    participantId: participant.id,
    name: participant.name,
    questionId: question.id,
    question: question.text,
    answer: preparedAnswer.answer,
    answerType: preparedAnswer.answerType,
    answerValue: preparedAnswer.answerValue,
    createdAt: firebaseState.serverTimestamp(),
    createdAtClient: new Date().toISOString(),
    pageUrl: getAnswerPageUrl()
  };
}

async function saveAnswer(preparedAnswer) {
  const question = getActiveQuestion();
  const answerRef = firebaseState.getAnswerRef(question.id, participant.id);
  const payload = buildAnswerPayload(preparedAnswer);

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
    const participantRef = database.ref(db, `${firebaseSettings.participantsPath}/${participant.id}`);

    firebaseState = {
      getAnswerRef: (questionId, participantId) =>
        database.ref(db, `${firebaseSettings.answersPath}/${questionId}/${participantId}`),
      onValue: database.onValue,
      runTransaction: database.runTransaction,
      serverTimestamp: database.serverTimestamp
    };

    showAnswerStatus("Tjekker bruger...", { persistent: true });
    const participantSnapshot = await database.get(participantRef);

    if (!participantSnapshot.exists()) {
      clearParticipantCookie();
      participant = null;
      showAnswerStatus("Din bruger er nulstillet. Sender dig til navn...", { persistent: true });
      window.setTimeout(redirectToJoinPage, 700);
      return;
    }

    showQuizStep();

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
        const didChangeQuestion = nextActiveQuestionId !== activeQuestionId;

        activeQuestionId = nextActiveQuestionId;
        if (didChangeQuestion) {
          const activeQuestion = getActiveQuestion();
          activeAnswerDraft = createEmptyAnswerDraft(activeQuestion?.type);
        }

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

function handleAnswerFieldChange(event) {
  if (!event.target.matches("[data-answer-field]")) {
    return;
  }

  const question = getActiveQuestion();

  activeAnswerDraft = {
    type: question.type,
    value: getNumberAnswerInput(activeQuestionId)?.value || ""
  };
}

questionFields.addEventListener("input", handleAnswerFieldChange);
questionFields.addEventListener("change", handleAnswerFieldChange);

quizForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  syncVisibleAnswer();
  const preparedAnswer = getPreparedAnswer();

  if (getSavedAnswerForActiveQuestion()) {
    activeAnswerDraft = createEmptyAnswerDraft(getActiveQuestion()?.type);
    renderQuestionField();
    showAnswerStatus("Du har allerede svaret på dette spørgsmål.", { persistent: true });
    return;
  }

  if (!firebaseState || !participant || !preparedAnswer) {
    const activeQuestion = getActiveQuestion();
    showAnswerStatus(activeQuestion?.type === "time" ? "Skriv antal sekunder." : "Skriv et tal.");
    return;
  }

  setQuizDisabled(true);
  showAnswerStatus("Gemmer...");

  try {
    const didSave = await saveAnswer(preparedAnswer);

    if (!didSave) {
      activeAnswerDraft = createEmptyAnswerDraft(getActiveQuestion()?.type);
      renderQuestionField();
      showAnswerStatus("Du har allerede svaret på dette spørgsmål.", { persistent: true });
      return;
    }

    activeAnswerDraft = createEmptyAnswerDraft(getActiveQuestion()?.type);
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
