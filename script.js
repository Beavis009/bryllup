const FIREBASE_SDK_VERSION = "12.16.0";
const QUESTION_COUNT = 12;
const FALLBACK_QUESTIONS = Array.from({ length: QUESTION_COUNT }, (_, index) => ({
  id: `q${index + 1}`,
  order: index + 1,
  text: String(index + 1)
}));

const form = document.getElementById("quiz-form");
const questionFields = document.getElementById("question-fields");
const questionBoard = document.getElementById("question-board");
const participantCountEl = document.getElementById("participant-count");
const answerCountEl = document.getElementById("answer-count");
const winnerCountEl = document.getElementById("winner-count");
const clearBtn = document.getElementById("clear-btn");
const shareBtn = document.getElementById("share-link");
const statusEl = document.getElementById("share-status");
const saveStatusEl = document.getElementById("save-status");
const qrImage = document.getElementById("qr-code");
const nameInput = document.getElementById("name");
const submitBtn = form.querySelector('button[type="submit"]');
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  questionsPath: "questions",
  submissionsPath: "submissions",
  winnersPath: "winners",
  allowClientClear: false,
  ...(window.firebaseSettings || {})
};
const isAdmin = new URLSearchParams(window.location.search).get("admin") === "1";

let questionsCache = [...FALLBACK_QUESTIONS];
let submissionsCache = [];
let winnersCache = {};
let draftAnswers = {};
let currentQuestionIndex = 0;
let firebaseState = null;
let hasLoadedQuestions = false;
let hasLoadedSubmissions = false;
let hasLoadedWinners = false;
let hasShownReadyStatus = false;
let statusTimer;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function getGuestUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("admin");
  url.hash = "";
  return url.toString();
}

function getQuestions() {
  return questionsCache;
}

function getQuestion(id) {
  return getQuestions().find((question) => question.id === id);
}

function getCurrentQuestion() {
  return getQuestions()[currentQuestionIndex] || getQuestions()[0];
}

function getAnswerInput(questionId) {
  return document.getElementById(`answer-${questionId}`);
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

function sortSubmissions(submissions) {
  return [...submissions].sort((a, b) => a.createdAtMs - b.createdAtMs);
}

function sortQuestions(questions) {
  return [...questions].sort((a, b) => a.order - b.order);
}

function setFormDisabled(disabled) {
  nameInput.disabled = disabled;
  submitBtn.disabled = disabled;

  getQuestions().forEach((question) => {
    const input = getAnswerInput(question.id);
    if (input) {
      input.disabled = disabled;
    }
  });

  questionFields.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled || button.dataset.navDisabled === "true";
  });
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

function normalizeSubmission(id, data = {}) {
  const answers = {};

  getQuestions().forEach((question) => {
    const answer = data.answers && typeof data.answers[question.id] === "string" ? data.answers[question.id] : "";
    answers[question.id] = answer.trim();
  });

  return {
    id,
    name: typeof data.name === "string" ? data.name.trim() : "",
    answers,
    createdAtMs: getCreatedAtMs(data.createdAt) || getCreatedAtMs(data.createdAtClient)
  };
}

function normalizeWinner(questionId, data = {}) {
  const question = getQuestion(questionId);

  return {
    questionId,
    submissionId: typeof data.submissionId === "string" ? data.submissionId : "",
    winnerName: typeof data.winnerName === "string" ? data.winnerName.trim() : "",
    answer: typeof data.answer === "string" ? data.answer.trim() : "",
    question: typeof data.question === "string" ? data.question.trim() : question ? question.text : "",
    savedAtMs: getCreatedAtMs(data.savedAt) || getCreatedAtMs(data.savedAtClient)
  };
}

function getAnswersForQuestion(questionId) {
  return sortSubmissions(submissionsCache)
    .map((submission) => ({
      submissionId: submission.id,
      name: submission.name,
      answer: submission.answers[questionId]
    }))
    .filter((entry) => entry.name && entry.answer);
}

function syncVisibleAnswer() {
  const question = getCurrentQuestion();
  if (!question) {
    return;
  }

  const input = getAnswerInput(question.id);
  if (input) {
    draftAnswers[question.id] = input.value;
  }
}

function goToQuestion(index) {
  syncVisibleAnswer();
  currentQuestionIndex = Math.max(0, Math.min(index, getQuestions().length - 1));
  renderQuestionFields();
  getAnswerInput(getCurrentQuestion().id).focus();
}

function renderQuestionFields() {
  const questions = getQuestions();
  const question = getCurrentQuestion();

  if (!question) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen spørgsmål fundet.";
    questionFields.replaceChildren(empty);
    return;
  }

  const completedCount = questions.filter((item) => draftAnswers[item.id] && draftAnswers[item.id].trim()).length;
  const wrapper = document.createElement("section");
  wrapper.className = "question-step";

  const meta = document.createElement("div");
  meta.className = "question-step-meta";

  const counter = document.createElement("span");
  counter.textContent = `Spørgsmål ${currentQuestionIndex + 1} af ${questions.length}`;

  const completed = document.createElement("span");
  completed.textContent = `${completedCount}/${questions.length} besvaret`;

  meta.append(counter, completed);

  const title = document.createElement("h2");
  title.textContent = question.text;

  const textarea = document.createElement("textarea");
  textarea.id = `answer-${question.id}`;
  textarea.name = question.id;
  textarea.placeholder = "Skriv dit svar";
  textarea.maxLength = 500;
  textarea.required = true;
  textarea.rows = 4;
  textarea.value = draftAnswers[question.id] || "";

  const nav = document.createElement("div");
  nav.className = "question-nav";

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "secondary";
  previousButton.dataset.direction = "previous";
  previousButton.dataset.navDisabled = currentQuestionIndex === 0 ? "true" : "false";
  previousButton.disabled = currentQuestionIndex === 0;
  previousButton.textContent = "Forrige";

  const dots = document.createElement("div");
  dots.className = "question-dots";
  questions.forEach((item, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = index === currentQuestionIndex ? "question-dot active" : "question-dot";
    dot.dataset.index = String(index);
    dot.dataset.navDisabled = "false";
    dot.textContent = String(index + 1);
    dots.append(dot);
  });

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "secondary";
  nextButton.dataset.direction = "next";
  nextButton.dataset.navDisabled = currentQuestionIndex === questions.length - 1 ? "true" : "false";
  nextButton.disabled = currentQuestionIndex === questions.length - 1;
  nextButton.textContent = "Næste";

  nav.append(previousButton, dots, nextButton);
  wrapper.append(meta, title, textarea, nav);
  questionFields.replaceChildren(wrapper);
}

function renderSummary() {
  const totalAnswers = submissionsCache.reduce((total, submission) => {
    return total + getQuestions().filter((question) => submission.answers[question.id]).length;
  }, 0);
  const winnerCount = getQuestions().filter((question) => winnersCache[question.id]).length;

  participantCountEl.textContent = submissionsCache.length;
  answerCountEl.textContent = totalAnswers;
  winnerCountEl.textContent = `${winnerCount}/${QUESTION_COUNT}`;
}

function createWinnerBlock(question, winner) {
  const wrapper = document.createElement("div");
  wrapper.className = winner ? "winner-block has-winner" : "winner-block";

  const label = document.createElement("span");
  label.textContent = "Vinder";

  const value = document.createElement("strong");
  value.textContent = winner ? winner.winnerName : "Ikke valgt endnu";

  const answer = document.createElement("p");
  answer.textContent = winner ? winner.answer : "Vælg vinderen fra admin-visningen.";

  wrapper.append(label, value, answer);
  return wrapper;
}

function createAnswerList(questionId) {
  const answers = getAnswersForQuestion(questionId);
  const list = document.createElement("div");
  list.className = "answer-list";

  if (!answers.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen svar endnu.";
    list.append(empty);
    return list;
  }

  answers.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "answer-row";

    const name = document.createElement("strong");
    name.textContent = entry.name;

    const answer = document.createElement("p");
    answer.textContent = entry.answer;

    row.append(name, answer);
    list.append(row);
  });

  return list;
}

function createWinnerForm(question) {
  const answers = getAnswersForQuestion(question.id);
  const winner = winnersCache[question.id];
  const formEl = document.createElement("form");
  formEl.className = "winner-form";
  formEl.dataset.questionId = question.id;

  const select = document.createElement("select");
  select.name = "winner";
  select.required = true;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Vælg vinder";
  select.append(placeholder);

  answers.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.submissionId;
    option.textContent = `${entry.name}: ${entry.answer}`;
    option.selected = winner && winner.submissionId === entry.submissionId;
    select.append(option);
  });

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "secondary";
  button.textContent = "Gem vinder";
  button.disabled = !answers.length || !firebaseState;

  formEl.append(select, button);
  return formEl;
}

function createQuestionCard(question, index) {
  const card = document.createElement("article");
  card.className = "question-card";

  const header = document.createElement("div");
  header.className = "question-card-header";

  const titleGroup = document.createElement("div");
  const number = document.createElement("span");
  number.className = "question-number";
  number.textContent = `Spørgsmål ${index + 1}`;
  const title = document.createElement("h3");
  title.textContent = question.text;
  titleGroup.append(number, title);

  const answerCount = document.createElement("span");
  answerCount.className = "answer-count";
  const answers = getAnswersForQuestion(question.id);
  answerCount.textContent = `${answers.length} svar`;

  header.append(titleGroup, answerCount);
  card.append(header, createWinnerBlock(question, winnersCache[question.id]), createAnswerList(question.id));

  if (isAdmin) {
    card.append(createWinnerForm(question));
  }

  return card;
}

function renderBoard() {
  const cards = getQuestions().map(createQuestionCard);
  questionBoard.replaceChildren(...cards);
}

function render() {
  renderSummary();
  renderBoard();
}

function setupQrCode() {
  const url = getGuestUrl();
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
  qrImage.alt = `QR-kode til ${url}`;
}

function shareLink() {
  const url = getGuestUrl();

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

function getFormAnswers() {
  syncVisibleAnswer();
  return getQuestions().reduce((answers, question) => {
    answers[question.id] = (draftAnswers[question.id] || "").trim();
    return answers;
  }, {});
}

function getFirstMissingQuestionIndex(answers) {
  return getQuestions().findIndex((question) => !answers[question.id]);
}

function isCompleteSubmission(name, answers) {
  return Boolean(name) && getFirstMissingQuestionIndex(answers) === -1;
}

async function saveSubmission(name, answers) {
  const { push, serverTimestamp, set, submissionsRef } = firebaseState;
  const newSubmissionRef = push(submissionsRef);

  await set(newSubmissionRef, {
    name,
    answers,
    createdAt: serverTimestamp(),
    createdAtClient: new Date().toISOString(),
    pageUrl: getGuestUrl()
  });
}

async function saveWinner(questionId, submissionId) {
  const { child, serverTimestamp, set, winnersRef } = firebaseState;
  const question = getQuestion(questionId);
  const submission = submissionsCache.find((entry) => entry.id === submissionId);

  if (!question || !submission || !submission.answers[questionId]) {
    throw new Error("Vinder kunne ikke findes");
  }

  await set(child(winnersRef, questionId), {
    questionId,
    question: question.text,
    submissionId,
    winnerName: submission.name,
    answer: submission.answers[questionId],
    savedAt: serverTimestamp(),
    savedAtClient: new Date().toISOString()
  });
}

async function clearAll() {
  const { remove, submissionsRef, winnersRef } = firebaseState;
  await Promise.all([remove(submissionsRef), remove(winnersRef)]);
}

function updateReadyState() {
  const isReady = hasLoadedQuestions && hasLoadedSubmissions && hasLoadedWinners;
  renderQuestionFields();
  render();
  setFormDisabled(!isReady);

  if (isReady) {
    if (hasShownReadyStatus) {
      return;
    }

    hasShownReadyStatus = true;
    showStatus(saveStatusEl, "Klar til svar");
  }
}

async function initFirebase() {
  renderQuestionFields();
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
    const questionsRef = database.ref(db, firebaseSettings.questionsPath);
    const submissionsRef = database.ref(db, firebaseSettings.submissionsPath);
    const winnersRef = database.ref(db, firebaseSettings.winnersPath);

    firebaseState = {
      child: database.child,
      onValue: database.onValue,
      push: database.push,
      remove: database.remove,
      serverTimestamp: database.serverTimestamp,
      set: database.set,
      questionsRef,
      submissionsRef,
      winnersRef
    };

    setClearButtonState();
    firebaseState.onValue(
      questionsRef,
      (snapshot) => {
        questionsCache = normalizeQuestions(snapshot.val() || {});
        currentQuestionIndex = Math.min(currentQuestionIndex, questionsCache.length - 1);
        hasLoadedQuestions = true;
        updateReadyState();
      },
      (error) => {
        setFormDisabled(true);
        showStatus(saveStatusEl, `Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    firebaseState.onValue(
      submissionsRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        submissionsCache = Object.entries(data)
          .map(([id, submission]) => normalizeSubmission(id, submission))
          .filter((submission) => submission.name && getQuestions().every((question) => submission.answers[question.id]));
        hasLoadedSubmissions = true;
        updateReadyState();
      },
      (error) => {
        setFormDisabled(true);
        showStatus(saveStatusEl, `Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    firebaseState.onValue(
      winnersRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        winnersCache = Object.fromEntries(
          Object.entries(data)
            .map(([questionId, winner]) => [questionId, normalizeWinner(questionId, winner)])
            .filter(([questionId, winner]) => getQuestion(questionId) && winner.winnerName && winner.answer)
        );
        hasLoadedWinners = true;
        updateReadyState();
      },
      (error) => {
        showStatus(saveStatusEl, `Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );
  } catch (error) {
    setFormDisabled(true);
    showStatus(saveStatusEl, `Kunne ikke starte Firebase: ${error.message}`, { persistent: true });
  }
}

questionFields.addEventListener("input", (event) => {
  const question = getCurrentQuestion();
  if (question && event.target.id === `answer-${question.id}`) {
    draftAnswers[question.id] = event.target.value;
    renderSummary();
  }
});

questionFields.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.direction === "previous") {
    goToQuestion(currentQuestionIndex - 1);
    return;
  }

  if (button.dataset.direction === "next") {
    goToQuestion(currentQuestionIndex + 1);
    return;
  }

  if (button.dataset.index) {
    goToQuestion(Number(button.dataset.index));
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const answers = getFormAnswers();
  const firstMissingQuestionIndex = getFirstMissingQuestionIndex(answers);

  if (!firebaseState || !isCompleteSubmission(name, answers)) {
    if (firstMissingQuestionIndex >= 0) {
      currentQuestionIndex = firstMissingQuestionIndex;
      renderQuestionFields();
      getAnswerInput(getCurrentQuestion().id).focus();
    }

    showStatus(saveStatusEl, "Udfyld navn og alle 12 svar.");
    return;
  }

  setFormDisabled(true);
  showStatus(saveStatusEl, "Gemmer...");

  try {
    await saveSubmission(name, answers);
    form.reset();
    draftAnswers = {};
    currentQuestionIndex = 0;
    renderQuestionFields();
    nameInput.focus();
    showStatus(saveStatusEl, "Svar gemt");
  } catch (error) {
    showStatus(saveStatusEl, `Kunne ikke gemme: ${error.message}`, { persistent: true });
  } finally {
    setFormDisabled(false);
  }
});

questionBoard.addEventListener("submit", async (event) => {
  const winnerForm = event.target.closest(".winner-form");
  if (!winnerForm) {
    return;
  }

  event.preventDefault();
  const questionId = winnerForm.dataset.questionId;
  const submissionId = new FormData(winnerForm).get("winner");

  if (!firebaseState || !questionId || !submissionId) {
    return;
  }

  const button = winnerForm.querySelector("button");
  button.disabled = true;
  showStatus(saveStatusEl, "Gemmer vinder...");

  try {
    await saveWinner(questionId, submissionId);
    showStatus(saveStatusEl, "Vinder gemt");
  } catch (error) {
    showStatus(saveStatusEl, `Kunne ikke gemme vinder: ${error.message}`, { persistent: true });
  } finally {
    button.disabled = false;
  }
});

clearBtn.addEventListener("click", async () => {
  if (!firebaseState || !window.confirm("Vil du rydde alle svar og vindere i Firebase?")) {
    return;
  }

  clearBtn.disabled = true;
  showStatus(saveStatusEl, "Rydder...");

  try {
    await clearAll();
    showStatus(saveStatusEl, "Alt er ryddet");
  } catch (error) {
    showStatus(saveStatusEl, `Kunne ikke rydde: ${error.message}`, { persistent: true });
  } finally {
    clearBtn.disabled = false;
  }
});

shareBtn.addEventListener("click", shareLink);
window.addEventListener("load", () => {
  setupQrCode();
  initFirebase();
});
