const FIREBASE_SDK_VERSION = "12.16.0";
const QUESTION_ID_PATTERN = /^q(0|[1-9]|1[0-2])$/;
const QUESTION_TYPES = ["number", "time"];
const DASHBOARD_ACCESS_CODE = "1234";
const DASHBOARD_ACCESS_STORAGE_KEY = "bryllup-dashboard-unlocked";
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
    text: "Hvor mange Disney-karakterer kan Anna nævne på 30 sekunder?",
    type: "number"
  },
  {
    id: "q5",
    order: 5,
    category: "Anna opgave",
    text: "Hvor mange Disney-citater kan Anna gætte på 30 sekunder?",
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
    text: "Hvor mange balloner kan Anna puste op på 30 sekunder?",
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

const dashboardLockEl = document.getElementById("dashboard-lock");
const dashboardLockFormEl = document.getElementById("dashboard-lock-form");
const dashboardLockCodeInputEl = document.getElementById("dashboard-lock-code");
const dashboardLockStatusEl = document.getElementById("dashboard-lock-status");
const dashboardPageEl = document.getElementById("dashboard-page");
const qrImage = document.getElementById("qr-code");
const qrOpenBtn = document.getElementById("qr-open");
const startBtn = document.getElementById("start-quiz");
const shareBtn = document.getElementById("share-link");
const statusEl = document.getElementById("share-status");
const activationGrid = document.getElementById("question-activation");
const questionTypeControls = document.getElementById("question-type-controls");
const questionTypeStatusEl = document.getElementById("question-type-status");
const activeQuestionTitleEl = document.getElementById("active-question-title");
const activeQuestionVideoEl = document.getElementById("active-question-video");
const activeAnswerCountEl = document.getElementById("active-answer-count");
const activeAnswerListEl = document.getElementById("active-answer-list");
const winnerCurrentEl = document.getElementById("winner-current");
const winnerFormEl = document.getElementById("winner-form");
const winnerTargetFieldEl = document.getElementById("winner-target-field");
const winnerTargetLabelEl = document.getElementById("winner-target-label");
const winnerTargetInputEl = document.getElementById("winner-target");
const winnerSaveBtn = document.getElementById("winner-save");
const winnerStatusEl = document.getElementById("winner-status");
const resetAnswersBtn = document.getElementById("reset-answers");
const resetWinnersBtn = document.getElementById("reset-winners");
const resetParticipantsBtn = document.getElementById("reset-participants");
const resetStatusEl = document.getElementById("reset-status");
const videoModalEl = document.getElementById("video-modal");
const videoModalLabelEl = document.getElementById("video-modal-label");
const videoModalTitleEl = document.getElementById("video-modal-title");
const videoModalBodyEl = document.getElementById("video-modal-body");
const videoModalCloseBtn = document.getElementById("video-modal-close");
const qrModalEl = document.getElementById("qr-modal");
const qrModalImageEl = document.getElementById("qr-modal-code");
const qrModalCloseBtn = document.getElementById("qr-modal-close");
const winnerModalEl = document.getElementById("winner-modal");
const winnerModalQuestionEl = document.getElementById("winner-modal-question");
const winnerModalTitleEl = document.getElementById("winner-modal-title");
const winnerModalAnswerEl = document.getElementById("winner-modal-answer");
const winnerModalMetaEl = document.getElementById("winner-modal-meta");
const winnerModalCloseBtn = document.getElementById("winner-modal-close");
const participantCountEl = document.getElementById("participant-count");
const participantsListEl = document.getElementById("participants-list");
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  questionsPath: "questions",
  activeQuestionPath: "activeQuestion",
  answersPath: "answers",
  participantsPath: "participants",
  submissionsPath: "submissions",
  winnersPath: "winners",
  videoConfigPath: "videos.json",
  ...(window.firebaseSettings || {})
};
let staticQuestionVideos = normalizeStaticQuestionVideos(window.staticQuestionVideos || {});

let questionsCache = [...FALLBACK_QUESTIONS];
let participantsCache = [];
let answersCache = [];
let legacySubmissionsCache = [];
let winnersCache = {};
let activeQuestionId = "q1";
let firebaseState = null;
let winnerStatusTimer;
let resetStatusTimer;
let openVideoQuestionId = "";
let dashboardStarted = false;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function isDashboardUnlocked() {
  try {
    return window.sessionStorage.getItem(DASHBOARD_ACCESS_STORAGE_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function rememberDashboardUnlock() {
  try {
    window.sessionStorage.setItem(DASHBOARD_ACCESS_STORAGE_KEY, "true");
  } catch (error) {
    // Session storage can be unavailable in strict browser modes.
  }
}

function showDashboardLockStatus(message) {
  if (dashboardLockStatusEl) {
    dashboardLockStatusEl.textContent = message;
  }
}

function revealDashboard() {
  document.body.classList.remove("dashboard-locked");

  if (dashboardLockEl) {
    dashboardLockEl.hidden = true;
  }

  if (dashboardPageEl) {
    dashboardPageEl.hidden = false;
    dashboardPageEl.removeAttribute("aria-hidden");
  }
}

async function startDashboard() {
  if (dashboardStarted) {
    return;
  }

  dashboardStarted = true;
  revealDashboard();
  setupQrCode();
  await loadStaticQuestionVideos();
  initFirebase();
}

function handleDashboardLockSubmit(event) {
  event.preventDefault();

  const value = dashboardLockCodeInputEl ? dashboardLockCodeInputEl.value.trim() : "";

  if (value === DASHBOARD_ACCESS_CODE) {
    rememberDashboardUnlock();
    showDashboardLockStatus("");
    startDashboard();
    return;
  }

  showDashboardLockStatus("Forkert kode.");

  if (dashboardLockCodeInputEl) {
    dashboardLockCodeInputEl.value = "";
    dashboardLockCodeInputEl.focus();
  }
}

function initDashboardLock() {
  if (!dashboardLockEl || !dashboardPageEl || !dashboardLockFormEl) {
    startDashboard();
    return;
  }

  if (isDashboardUnlocked()) {
    startDashboard();
    return;
  }

  dashboardLockEl.hidden = false;
  dashboardPageEl.hidden = true;
  dashboardPageEl.setAttribute("aria-hidden", "true");
  document.body.classList.add("dashboard-locked");

  if (dashboardLockCodeInputEl) {
    dashboardLockCodeInputEl.focus({ preventScroll: true });
  }
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
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timeValue));
}

function formatDateTime(item) {
  const timeValue = getTimeValue(item);
  if (!timeValue) {
    return "";
  }

  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
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

function normalizeWinner(questionId, data = {}) {
  if (!QUESTION_ID_PATTERN.test(questionId) || !data || typeof data !== "object") {
    return null;
  }

  const storedQuestionId = typeof data.questionId === "string" ? data.questionId : questionId;
  const winnerName = typeof data.winnerName === "string" ? data.winnerName.trim() : "";
  const answer = typeof data.answer === "string" ? data.answer.trim() : "";
  const participantId = typeof data.participantId === "string" ? data.participantId : "";

  if (storedQuestionId !== questionId || !winnerName || !answer || !participantId) {
    return null;
  }

  return {
    questionId,
    question: typeof data.question === "string" ? data.question : "",
    questionCategory: typeof data.questionCategory === "string" ? data.questionCategory : "",
    questionType: normalizeQuestionType(data.questionType),
    correctAnswer: typeof data.correctAnswer === "string" ? data.correctAnswer : "",
    correctAnswerValue: typeof data.correctAnswerValue === "number" ? data.correctAnswerValue : null,
    submissionId: typeof data.submissionId === "string" ? data.submissionId : "",
    participantId,
    winnerName,
    answer,
    answerType: normalizeQuestionType(data.answerType),
    answerValue: typeof data.answerValue === "number" ? data.answerValue : null,
    distance: typeof data.distance === "number" ? data.distance : null,
    answeredAt: typeof data.answeredAt === "number" ? data.answeredAt : 0,
    answeredAtClient: typeof data.answeredAtClient === "string" ? data.answeredAtClient : "",
    savedAt: typeof data.savedAt === "number" ? data.savedAt : 0,
    savedAtClient: typeof data.savedAtClient === "string" ? data.savedAtClient : ""
  };
}

function normalizeWinners(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .map(([questionId, winner]) => normalizeWinner(questionId, winner))
      .filter(Boolean)
      .map((winner) => [winner.questionId, winner])
  );
}

function normalizeStaticQuestionVideo(questionId, data = {}, index = 0) {
  const videoData = typeof data === "string" ? { src: data } : data;

  if (!QUESTION_ID_PATTERN.test(questionId) || !videoData || typeof videoData !== "object") {
    return null;
  }

  const src = typeof videoData.src === "string" ? videoData.src.trim() : "";

  if (!src) {
    return null;
  }

  return {
    id: typeof videoData.id === "string" && videoData.id.trim() ? videoData.id.trim() : `${questionId}-${index}`,
    questionId,
    src,
    label: typeof videoData.label === "string" ? videoData.label.trim() : ""
  };
}

function normalizeStaticQuestionVideoList(questionId, data = []) {
  const videos = Array.isArray(data) ? data : [data];
  return videos.map((video, index) => normalizeStaticQuestionVideo(questionId, video, index)).filter(Boolean);
}

function normalizeStaticQuestionAnswerValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const answerValue = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(answerValue) && answerValue >= 0 && answerValue <= 999999 ? answerValue : null;
}

function normalizeStaticQuestionVideoConfig(questionId, data = []) {
  const isQuestionConfig =
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    ("videos" in data || "correctAnswerValue" in data || "usesPredefinedAnswer" in data);
  const configData = isQuestionConfig ? data : { videos: data };
  const videos = normalizeStaticQuestionVideoList(questionId, configData.videos || []);
  const correctAnswerValue = normalizeStaticQuestionAnswerValue(configData.correctAnswerValue);
  const usesPredefinedAnswer = Boolean(configData.usesPredefinedAnswer) || correctAnswerValue !== null;

  if (!QUESTION_ID_PATTERN.test(questionId) || (!videos.length && correctAnswerValue === null && !usesPredefinedAnswer)) {
    return null;
  }

  return {
    questionId,
    videos,
    correctAnswerValue,
    usesPredefinedAnswer
  };
}

function normalizeStaticQuestionVideos(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .map(([questionId, videoConfig]) => [questionId, normalizeStaticQuestionVideoConfig(questionId, videoConfig)])
      .filter(([questionId, videoConfig]) => QUESTION_ID_PATTERN.test(questionId) && videoConfig)
  );
}

function getQuestionVideos(questionId) {
  return staticQuestionVideos[questionId]?.videos || [];
}

function getQuestionVideo(questionId, videoIndex = 0) {
  const videos = getQuestionVideos(questionId);
  const index = Number(videoIndex);
  return videos[Number.isInteger(index) ? index : 0] || null;
}

function hasQuestionVideos(questionId) {
  return getQuestionVideos(questionId).length > 0;
}

function getPredefinedQuestionAnswerValue(questionOrId) {
  const questionId = typeof questionOrId === "string" ? questionOrId : questionOrId?.id;
  const answerValue = staticQuestionVideos[questionId]?.correctAnswerValue;

  if (typeof answerValue !== "number" || !Number.isFinite(answerValue)) {
    return null;
  }

  const questionType = typeof questionOrId === "string" ? getQuestionById(questionId)?.type : questionOrId?.type;
  return normalizeQuestionType(questionType) === "time" ? Math.trunc(answerValue) : answerValue;
}

function usesPredefinedQuestionAnswer(questionId) {
  return Boolean(staticQuestionVideos[questionId]?.usesPredefinedAnswer);
}

async function loadStaticQuestionVideos() {
  const fallbackVideos = normalizeStaticQuestionVideos(window.staticQuestionVideos || {});
  const configPath = typeof firebaseSettings.videoConfigPath === "string" ? firebaseSettings.videoConfigPath.trim() : "";

  if (!configPath) {
    staticQuestionVideos = fallbackVideos;
    return;
  }

  try {
    const response = await fetch(new URL(configPath, window.location.href), { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    staticQuestionVideos = normalizeStaticQuestionVideos(await response.json());
  } catch (error) {
    staticQuestionVideos = fallbackVideos;

    if (!Object.keys(fallbackVideos).length) {
      showQuestionTypeStatus(`Kunne ikke hente videoer: ${error.message}`);
    }
  }
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

function getAnsweredParticipantIdsForQuestion(questionId) {
  return new Set(
    getDisplayAnswersForQuestion(questionId)
      .map((answer) => answer.participantId)
      .filter(Boolean)
  );
}

function getWinnerParticipantIds(exceptQuestionId = "") {
  return new Set(
    Object.values(winnersCache)
      .filter((winner) => winner.questionId !== exceptQuestionId)
      .map((winner) => winner.participantId)
      .filter(Boolean)
  );
}

function hasParticipantWon(participantId, exceptQuestionId = "") {
  return Boolean(participantId && getWinnerParticipantIds(exceptQuestionId).has(participantId));
}

function getTieBreakTimeValue(answer) {
  const timeValue = getTimeValue(answer);
  return timeValue || Number.MAX_SAFE_INTEGER;
}

function getValidWinnerAnswers(questionId) {
  return getDisplayAnswersForQuestion(questionId).filter((answer) => {
    return answer.participantId && typeof answer.answerValue === "number" && Number.isFinite(answer.answerValue);
  });
}

function selectWinnerCandidate(question, correctAnswerValue) {
  const previousWinnerIds = getWinnerParticipantIds(question.id);

  return getValidWinnerAnswers(question.id)
    .filter((answer) => !previousWinnerIds.has(answer.participantId))
    .map((answer) => ({
      ...answer,
      distance: Math.abs(answer.answerValue - correctAnswerValue)
    }))
    .sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }

      const timeDifference = getTieBreakTimeValue(a) - getTieBreakTimeValue(b);
      if (timeDifference !== 0) {
        return timeDifference;
      }

      return a.id.localeCompare(b.id, "da-DK");
    })[0];
}

function getActiveQuestion() {
  return questionsCache.find((question) => question.id === activeQuestionId) || questionsCache[0];
}

function getQuestionById(questionId) {
  return questionsCache.find((question) => question.id === questionId) || null;
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

function showWinnerStatus(message, options = {}) {
  winnerStatusEl.textContent = message;

  if (options.persistent) {
    window.clearTimeout(winnerStatusTimer);
    return;
  }

  window.clearTimeout(winnerStatusTimer);
  winnerStatusTimer = window.setTimeout(() => {
    if (winnerStatusEl.textContent === message) {
      winnerStatusEl.textContent = "";
    }
  }, 3500);
}

function showResetStatus(message, options = {}) {
  resetStatusEl.textContent = message;

  if (options.persistent) {
    window.clearTimeout(resetStatusTimer);
    return;
  }

  window.clearTimeout(resetStatusTimer);
  resetStatusTimer = window.setTimeout(() => {
    if (resetStatusEl.textContent === message) {
      resetStatusEl.textContent = "";
    }
  }, 3500);
}

function setResetButtonsDisabled(disabled) {
  [resetAnswersBtn, resetWinnersBtn, resetParticipantsBtn].forEach((button) => {
    button.disabled = disabled || !firebaseState;
  });
}

function parseCorrectAnswerValue(rawValue, type) {
  const normalizedType = normalizeQuestionType(type);
  const normalizedValue = String(rawValue || "")
    .trim()
    .replace(",", ".");

  if (!normalizedValue) {
    return null;
  }

  if (normalizedType === "time" && !/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const value = Number(normalizedValue);

  if (!Number.isFinite(value) || value < 0 || value > 999999) {
    return null;
  }

  return normalizedType === "time" ? Math.trunc(value) : value;
}

function formatAnswerValue(type, value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (normalizeQuestionType(type) === "time") {
    return `${value} sekunder`;
  }

  return String(value).replace(".", ",");
}

function formatDistance(questionType, distance) {
  if (!Number.isFinite(distance)) {
    return "";
  }

  if (distance === 0) {
    return "Ramte præcist";
  }

  return normalizeQuestionType(questionType) === "time" ? `Afvigelse: ${distance} sek.` : `Afvigelse: ${distance}`;
}

function setupQrCode() {
  const url = getGuestEntryUrl();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=720x720&data=${encodeURIComponent(url)}`;
  qrImage.src = qrUrl;
  qrImage.alt = `QR-kode til ${url}`;
  qrModalImageEl.src = qrUrl;
  qrModalImageEl.alt = `Stor QR-kode til ${url}`;
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
  const controls = questionsCache.map((question) => {
    const cell = document.createElement("div");
    cell.className = question.id === activeQuestionId ? "activation-cell active" : "activation-cell";

    const button = document.createElement("button");
    button.type = "button";
    button.className = question.id === activeQuestionId ? "activation-button active" : "activation-button";
    button.classList.add(`type-${question.type}`);
    button.dataset.questionId = question.id;
    button.title = `${question.category ? `${question.category}: ` : ""}${question.text}`;
    button.disabled = !firebaseState;

    const number = document.createElement("span");
    number.className = "activation-number";
    number.textContent = question.order;

    button.append(number);
    cell.append(button);

    return cell;
  });

  activationGrid.replaceChildren(...controls);
  const activeQuestion = getActiveQuestion();
  renderQuestionTypeControls();
}

function renderActiveQuestionVideo(question) {
  const videoStates = question ? getQuestionVideos(question.id) : [];

  if (!question || !videoStates.length) {
    activeQuestionVideoEl.hidden = true;
    activeQuestionVideoEl.replaceChildren();
    return;
  }

  const buttons = videoStates.map((videoState, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "active-question-video-button";
    button.dataset.activeVideoQuestionId = question.id;
    button.dataset.activeVideoIndex = String(index);
    button.textContent = videoState.label || "Afspil video";

    return button;
  });

  activeQuestionVideoEl.hidden = false;
  activeQuestionVideoEl.replaceChildren(...buttons);
}

function renderActiveQuestionPanel() {
  const activeQuestion = getActiveQuestion();

  if (!activeQuestion) {
    activeQuestionTitleEl.textContent = "-";
    renderActiveQuestionVideo(null);
    activeAnswerCountEl.textContent = "0 svar";
    activeAnswerListEl.replaceChildren(createEmptyMessage("Intet aktivt spørgsmål."));
    renderWinnerPanel(null, []);
    return;
  }

  const activeAnswers = getDisplayAnswersForQuestion(activeQuestion.id);

  activeQuestionTitleEl.textContent = activeQuestion.text;
  renderActiveQuestionVideo(activeQuestion);
  activeAnswerCountEl.textContent = formatAnswerCount(activeAnswers.length);

  if (!activeAnswers.length) {
    activeAnswerListEl.replaceChildren(createEmptyMessage("Ingen svar på dette spørgsmål endnu."));
    renderWinnerPanel(activeQuestion, activeAnswers);
    return;
  }

  activeAnswerListEl.replaceChildren(...activeAnswers.map(createAnswerRow));
  renderWinnerPanel(activeQuestion, activeAnswers);
}

function createAnswerRow(submission) {
  const row = document.createElement("article");
  row.className = "answer-row live-answer-row";
  const currentWinner = winnersCache[submission.questionId];
  const isCurrentWinner = currentWinner?.participantId === submission.participantId;
  const hasWonAnotherQuestion = hasParticipantWon(submission.participantId, submission.questionId);

  if (isCurrentWinner) {
    row.classList.add("current-winner-answer");
  } else if (hasWonAnotherQuestion) {
    row.classList.add("previous-winner-answer");
  }

  const header = document.createElement("div");
  header.className = "answer-row-header";

  const name = document.createElement("strong");
  name.textContent = submission.name;

  const meta = document.createElement("div");
  meta.className = "answer-row-meta";

  const time = document.createElement("span");
  time.textContent = formatClock(submission);
  time.title = formatDateTime(submission);

  meta.append(time);

  if (isCurrentWinner || hasWonAnotherQuestion) {
    const badge = document.createElement("span");
    badge.className = "answer-badge";
    badge.textContent = isCurrentWinner ? "Vinder" : "Har vundet";
    meta.append(badge);
  }

  const answer = document.createElement("p");
  answer.textContent = submission.answer;

  header.append(name, meta);
  row.append(header, answer);
  return row;
}

function renderWinnerPanel(activeQuestion, activeAnswers) {
  if (!activeQuestion) {
    winnerFormEl.hidden = true;
    winnerCurrentEl.replaceChildren(createEmptyMessage("Intet aktivt spørgsmål."));
    return;
  }

  const currentWinner = winnersCache[activeQuestion.id];
  const inputIsFocused = document.activeElement === winnerTargetInputEl;
  const usesPredefinedAnswer = usesPredefinedQuestionAnswer(activeQuestion.id);
  const predefinedAnswerValue = getPredefinedQuestionAnswerValue(activeQuestion);
  const hasPredefinedAnswer = predefinedAnswerValue !== null;

  winnerFormEl.hidden = false;
  winnerFormEl.classList.toggle("predefined-answer", usesPredefinedAnswer);
  winnerTargetFieldEl.hidden = usesPredefinedAnswer;
  winnerTargetFieldEl.classList.toggle("is-hidden", usesPredefinedAnswer);
  winnerTargetFieldEl.setAttribute("aria-hidden", String(usesPredefinedAnswer));
  winnerTargetInputEl.required = !usesPredefinedAnswer;
  winnerTargetLabelEl.textContent = activeQuestion.type === "time" ? "Rigtigt svar i sekunder" : "Rigtigt svar";
  winnerTargetInputEl.placeholder = activeQuestion.type === "time" ? "Antal sekunder" : "Rigtigt tal";
  winnerTargetInputEl.inputMode = activeQuestion.type === "time" ? "numeric" : "decimal";
  winnerTargetInputEl.step = activeQuestion.type === "time" ? "1" : "any";
  winnerTargetInputEl.disabled = !firebaseState || usesPredefinedAnswer;
  winnerSaveBtn.disabled = !firebaseState || !activeAnswers.length || (usesPredefinedAnswer && !hasPredefinedAnswer);

  if (currentWinner) {
    if (!usesPredefinedAnswer && !inputIsFocused && currentWinner.correctAnswerValue !== null) {
      winnerTargetInputEl.value = String(currentWinner.correctAnswerValue);
    } else if (usesPredefinedAnswer) {
      winnerTargetInputEl.value = "";
    }

    winnerCurrentEl.replaceChildren(createWinnerBlock(currentWinner, activeQuestion));
    return;
  }

  if (usesPredefinedAnswer) {
    if (!inputIsFocused) {
      winnerTargetInputEl.value = "";
    }

    winnerCurrentEl.replaceChildren(createEmptyMessage("Ingen vinder annonceret endnu."));
    return;
  }

  if (!inputIsFocused) {
    winnerTargetInputEl.value = "";
  }

  winnerCurrentEl.replaceChildren(createEmptyMessage("Ingen vinder annonceret endnu."));
}

function createWinnerBlock(winner, question) {
  const block = document.createElement("article");
  block.className = "winner-block winner-announcement has-winner";

  const label = document.createElement("span");
  label.textContent = `Spørgsmål ${question.order} · annonceret vinder`;

  const name = document.createElement("strong");
  name.textContent = winner.winnerName;

  const answer = document.createElement("p");
  answer.textContent = `Svar: ${winner.answer}`;

  const metaParts = [
    `Facit: ${winner.correctAnswer || formatAnswerValue(question.type, winner.correctAnswerValue)}`,
    formatDistance(question.type, winner.distance)
  ].filter(Boolean);

  const answeredAt = formatClock({
    createdAt: winner.answeredAt,
    createdAtClient: winner.answeredAtClient
  });
  const answeredAtTitle = formatDateTime({
    createdAt: winner.answeredAt,
    createdAtClient: winner.answeredAtClient
  });

  if (answeredAt) {
    metaParts.push(`Svarede kl. ${answeredAt}`);
  }

  const meta = document.createElement("p");
  meta.textContent = metaParts.join(" · ");
  if (answeredAtTitle) {
    meta.title = answeredAtTitle;
  }

  block.append(label, name, answer, meta);
  return block;
}

function createQuestionVideoPlayer(videoState) {
  const player = document.createElement("div");
  player.className = "custom-video-player";

  const video = document.createElement("video");
  video.src = videoState.src;
  video.playsInline = true;
  video.preload = "metadata";
  video.autoplay = true;

  const controls = document.createElement("div");
  controls.className = "custom-video-controls";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "custom-video-toggle";

  function updatePlayButton() {
    playButton.textContent = video.paused ? "Afspil" : "Pause";
  }

  function togglePlayback() {
    if (video.paused) {
      video.play().catch(() => {});
      return;
    }

    video.pause();
  }

  playButton.addEventListener("click", togglePlayback);
  video.addEventListener("click", togglePlayback);
  video.addEventListener("play", updatePlayButton);
  video.addEventListener("pause", updatePlayButton);
  video.addEventListener("ended", updatePlayButton);
  updatePlayButton();

  controls.append(playButton);
  player.append(video, controls);
  return { player, video };
}

function openQuestionVideo(questionId, videoIndex = 0) {
  const question = getQuestionById(questionId);
  const videoState = getQuestionVideo(questionId, videoIndex);

  if (!question || !videoState) {
    return;
  }

  closeQrModal();
  closeWinnerModal();

  const { player, video } = createQuestionVideoPlayer(videoState);
  openVideoQuestionId = questionId;
  videoModalLabelEl.textContent = [
    `Spm. ${question.order}`,
    question.category,
    videoState.label
  ]
    .filter(Boolean)
    .join(" - ");
  videoModalTitleEl.textContent = question.text;
  videoModalBodyEl.replaceChildren(player);
  videoModalEl.hidden = false;
  document.body.classList.add("modal-open");

  video.currentTime = 0;
  const playPromise = video.play();
  if (playPromise) {
    playPromise.catch(() => {});
  }
}

function closeVideoModal() {
  const video = videoModalBodyEl.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  openVideoQuestionId = "";
  videoModalBodyEl.replaceChildren();
  videoModalEl.hidden = true;
  document.body.classList.remove("modal-open");
}

function openQrModal() {
  closeVideoModal();
  closeWinnerModal();
  qrModalImageEl.src = qrImage.src;
  qrModalImageEl.alt = qrImage.alt.replace("QR-kode", "Stor QR-kode");
  qrModalEl.hidden = false;
  document.body.classList.add("modal-open");
}

function closeQrModal() {
  qrModalEl.hidden = true;
  document.body.classList.remove("modal-open");
}

function openWinnerModal(winner, question = null) {
  if (!winnerModalEl || !winner) {
    return;
  }

  const resolvedQuestion = question || getQuestionById(winner.questionId);

  if (!resolvedQuestion) {
    return;
  }

  closeVideoModal();
  closeQrModal();

  const correctAnswer = winner.correctAnswer || formatAnswerValue(resolvedQuestion.type, winner.correctAnswerValue);
  const metaParts = [
    `Facit: ${correctAnswer}`,
    formatDistance(resolvedQuestion.type, winner.distance)
  ].filter(Boolean);
  const answeredAt = formatClock({
    createdAt: winner.answeredAt,
    createdAtClient: winner.answeredAtClient
  });

  if (answeredAt) {
    metaParts.push(`Svarede kl. ${answeredAt}`);
  }

  winnerModalQuestionEl.textContent = `Spørgsmål ${resolvedQuestion.order}`;
  winnerModalTitleEl.textContent = winner.winnerName;
  winnerModalAnswerEl.textContent = `Svar: ${winner.answer}`;
  winnerModalMetaEl.textContent = metaParts.join(" · ");
  winnerModalEl.hidden = false;
  document.body.classList.add("modal-open");
}

function closeWinnerModal() {
  if (!winnerModalEl) {
    return;
  }

  winnerModalEl.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderParticipants() {
  participantCountEl.textContent = String(participantsCache.length);

  if (!participantsCache.length) {
    participantsListEl.replaceChildren(createEmptyMessage("Ingen deltagere endnu."));
    return;
  }

  const answeredParticipantIds = getAnsweredParticipantIdsForQuestion(activeQuestionId);
  participantsListEl.replaceChildren(
    ...participantsCache.map((participant) => createParticipantRow(participant, answeredParticipantIds.has(participant.id)))
  );
}

function createParticipantRow(participant, hasAnsweredActiveQuestion = false) {
  const row = document.createElement("article");
  row.className = hasAnsweredActiveQuestion ? "participant-row has-answered-active" : "participant-row";

  const name = document.createElement("strong");
  name.textContent = participant.name;

  const time = document.createElement("span");
  time.textContent = formatClock(participant) || "Registreret";
  time.title = formatDateTime(participant);

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

  showQuestionTypeStatus("Aktiverer...");

  try {
    const { activeQuestionRef, serverTimestamp, set } = firebaseState;
    await set(activeQuestionRef, {
      questionId,
      activatedAt: serverTimestamp(),
      activatedAtClient: new Date().toISOString()
    });
  } catch (error) {
    showQuestionTypeStatus(`Kunne ikke aktivere: ${error.message}`);
  }
}

async function resetQuizData(kind) {
  if (!firebaseState) {
    showResetStatus("Firebase er ikke klar endnu.");
    return;
  }

  const { answersRef, participantsRef, remove, submissionsRef, winnersRef } = firebaseState;
  const resetConfigs = {
    answers: {
      label: "alle svar",
      done: "Alle svar er ryddet.",
      refs: [answersRef, submissionsRef]
    },
    winners: {
      label: "alle vindere",
      done: "Alle vindere er ryddet.",
      refs: [winnersRef]
    },
    participants: {
      label: "alle deltagere",
      done: "Alle deltagere er ryddet.",
      refs: [participantsRef]
    }
  };
  const config = resetConfigs[kind];

  if (!config) {
    return;
  }

  if (!window.confirm(`Er du sikker på, at du vil nulstille ${config.label}?`)) {
    return;
  }

  setResetButtonsDisabled(true);
  showResetStatus(`Rydder ${config.label}...`);

  try {
    await Promise.all(config.refs.map((itemRef) => remove(itemRef)));
    showResetStatus(config.done);
  } catch (error) {
    showResetStatus(`Kunne ikke nulstille: ${error.message}`, { persistent: true });
  } finally {
    setResetButtonsDisabled(false);
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

function buildWinnerPayload(question, candidate, correctAnswerValue) {
  const answeredAt = getTimeValue(candidate);

  return {
    questionId: question.id,
    question: question.text,
    questionCategory: question.category || "",
    questionType: question.type,
    correctAnswer: formatAnswerValue(question.type, correctAnswerValue),
    correctAnswerValue,
    submissionId: candidate.id,
    participantId: candidate.participantId,
    winnerName: candidate.name,
    answer: candidate.answer,
    answerType: candidate.answerType,
    answerValue: candidate.answerValue,
    distance: candidate.distance,
    answeredAt,
    answeredAtClient: candidate.createdAtClient || "",
    savedAt: firebaseState.serverTimestamp(),
    savedAtClient: new Date().toISOString()
  };
}

async function saveWinner(event) {
  event.preventDefault();

  const activeQuestion = getActiveQuestion();

  if (!firebaseState || !activeQuestion) {
    return;
  }

  const usesPredefinedAnswer = usesPredefinedQuestionAnswer(activeQuestion.id);
  const predefinedAnswerValue = getPredefinedQuestionAnswerValue(activeQuestion);
  const correctAnswerValue = usesPredefinedAnswer
    ? predefinedAnswerValue
    : parseCorrectAnswerValue(winnerTargetInputEl.value, activeQuestion.type);

  if (correctAnswerValue === null) {
    showWinnerStatus(
      usesPredefinedAnswer
        ? "Resultat mangler for dette spørgsmål."
        : activeQuestion.type === "time"
          ? "Skriv det rigtige svar som hele sekunder."
          : "Skriv det rigtige svar som et tal."
    );
    return;
  }

  const validAnswers = getValidWinnerAnswers(activeQuestion.id);
  const candidate = selectWinnerCandidate(activeQuestion, correctAnswerValue);

  if (!candidate) {
    const previousWinnerCount = validAnswers.filter((answer) => hasParticipantWon(answer.participantId, activeQuestion.id))
      .length;
    showWinnerStatus(
      previousWinnerCount
        ? "Alle gyldige svar er fra personer, der allerede har vundet."
        : "Der er ingen gyldige numeriske svar endnu."
    );
    return;
  }

  winnerSaveBtn.disabled = true;
  showWinnerStatus("Annoncerer vinder...");

  try {
    const { getWinnerRef, set } = firebaseState;
    const winnerPayload = buildWinnerPayload(activeQuestion, candidate, correctAnswerValue);
    await set(getWinnerRef(activeQuestion.id), winnerPayload);
    openWinnerModal(winnerPayload, activeQuestion);
    showWinnerStatus(`Vinder annonceret for spørgsmål ${activeQuestion.order}: ${candidate.name}.`);
  } catch (error) {
    showWinnerStatus(`Kunne ikke gemme vinder: ${error.message}`, { persistent: true });
  } finally {
    renderWinnerPanel(activeQuestion, getDisplayAnswersForQuestion(activeQuestion.id));
  }
}

async function initFirebase() {
  renderActivationControls();
  renderActiveQuestionPanel();
  renderParticipants();
  renderQuestionTypeControls();
  setResetButtonsDisabled(true);

  if (!hasFirebaseConfig(firebaseConfig)) {
    showQuestionTypeStatus("Indsæt Firebase config i firebase-config.js.");
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
    const winnersRef = database.ref(db, firebaseSettings.winnersPath);
    firebaseState = {
      activeQuestionRef,
      answersRef,
      participantsRef,
      submissionsRef,
      winnersRef,
      getQuestionTypeRef: (questionId) => database.ref(db, `${firebaseSettings.questionsPath}/${questionId}/type`),
      getWinnerRef: (questionId) => database.ref(db, `${firebaseSettings.winnersPath}/${questionId}`),
      onValue: database.onValue,
      remove: database.remove,
      serverTimestamp: database.serverTimestamp,
      set: database.set
    };
    setResetButtonsDisabled(false);

    firebaseState.onValue(
      questionsRef,
      (snapshot) => {
        questionsCache = normalizeQuestions(snapshot.val() || {});
        renderActivationControls();
        renderActiveQuestionPanel();
      },
      (error) => {
        showQuestionTypeStatus(`Firebase-fejl: ${error.message}`);
      }
    );

    firebaseState.onValue(
      activeQuestionRef,
      (snapshot) => {
        activeQuestionId = normalizeActiveQuestion(snapshot.val() || {});
        renderActivationControls();
        renderActiveQuestionPanel();
        renderParticipants();
      },
      (error) => {
        showQuestionTypeStatus(`Firebase-fejl: ${error.message}`);
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
        renderParticipants();
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
        renderParticipants();
      },
      (error) => {
        activeAnswerListEl.replaceChildren(createEmptyMessage(`Firebase-fejl: ${error.message}`));
      }
    );

    firebaseState.onValue(
      winnersRef,
      (snapshot) => {
        winnersCache = normalizeWinners(snapshot.val() || {});
        renderActiveQuestionPanel();
      },
      (error) => {
        showWinnerStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

  } catch (error) {
    showQuestionTypeStatus(`Kunne ikke starte Firebase: ${error.message}`);
  }
}

if (dashboardLockFormEl) {
  dashboardLockFormEl.addEventListener("submit", handleDashboardLockSubmit);
}
startBtn.addEventListener("click", () => {
  window.location.href = getGuestEntryUrl();
});
qrOpenBtn.addEventListener("click", openQrModal);
shareBtn.addEventListener("click", shareLink);
activationGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-question-id]");
  if (button) {
    activateQuestion(button.dataset.questionId);
  }
});
activeQuestionVideoEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-active-video-question-id]");
  if (button) {
    openQuestionVideo(button.dataset.activeVideoQuestionId, button.dataset.activeVideoIndex);
  }
});
questionTypeControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-question-type]");
  if (button) {
    setQuestionType(button.dataset.questionType);
  }
});
winnerFormEl.addEventListener("submit", saveWinner);
resetAnswersBtn.addEventListener("click", () => resetQuizData("answers"));
resetWinnersBtn.addEventListener("click", () => resetQuizData("winners"));
resetParticipantsBtn.addEventListener("click", () => resetQuizData("participants"));
videoModalCloseBtn.addEventListener("click", closeVideoModal);
videoModalEl.addEventListener("click", (event) => {
  if (event.target.closest("[data-video-close]")) {
    closeVideoModal();
  }
});
qrModalCloseBtn.addEventListener("click", closeQrModal);
qrModalEl.addEventListener("click", (event) => {
  if (event.target.closest("[data-qr-close]")) {
    closeQrModal();
  }
});
winnerModalCloseBtn.addEventListener("click", closeWinnerModal);
winnerModalEl.addEventListener("click", (event) => {
  if (event.target.closest("[data-winner-close]")) {
    closeWinnerModal();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!videoModalEl.hidden) {
    closeVideoModal();
  }

  if (!qrModalEl.hidden) {
    closeQrModal();
  }

  if (!winnerModalEl.hidden) {
    closeWinnerModal();
  }
});
window.addEventListener("load", initDashboardLock);
