const FIREBASE_SDK_VERSION = "12.16.0";
const QUESTION_COUNT = 12;
const FALLBACK_QUESTIONS = Array.from({ length: QUESTION_COUNT }, (_, index) => ({
  id: `q${index + 1}`,
  order: index + 1,
  text: String(index + 1)
}));

const form = document.getElementById("quiz-form");
const questionFields = document.getElementById("question-fields");
const saveStatusEl = document.getElementById("save-status");
const nameInput = document.getElementById("name");
const submitBtn = form.querySelector('button[type="submit"]');
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  questionsPath: "questions",
  submissionsPath: "submissions",
  ...(window.firebaseSettings || {})
};

let questionsCache = [...FALLBACK_QUESTIONS];
let draftAnswers = {};
let currentQuestionIndex = 0;
let firebaseState = null;
let statusTimer;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function getQuestions() {
  return questionsCache;
}

function getCurrentQuestion() {
  return getQuestions()[currentQuestionIndex] || getQuestions()[0];
}

function getAnswerInput(questionId) {
  return document.getElementById(`answer-${questionId}`);
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

function showStatus(message, options = {}) {
  saveStatusEl.textContent = message;

  if (options.persistent) {
    return;
  }

  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    if (saveStatusEl.textContent === message) {
      saveStatusEl.textContent = "";
    }
  }, 3000);
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
  completed.dataset.completedCount = "true";
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

  setFormDisabled(!firebaseState);
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

function getAnswerPageUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function saveSubmission(name, answers) {
  const { push, serverTimestamp, set, submissionsRef } = firebaseState;
  const newSubmissionRef = push(submissionsRef);

  await set(newSubmissionRef, {
    name,
    answers,
    createdAt: serverTimestamp(),
    createdAtClient: new Date().toISOString(),
    pageUrl: getAnswerPageUrl()
  });
}

async function initFirebase() {
  renderQuestionFields();
  setFormDisabled(true);

  if (!hasFirebaseConfig(firebaseConfig)) {
    showStatus("Indsæt Firebase config i firebase-config.js.", { persistent: true });
    return;
  }

  showStatus("Forbinder til Firebase...", { persistent: true });

  try {
    const [{ initializeApp }, database] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`)
    ]);
    const app = initializeApp(firebaseConfig);
    const db = database.getDatabase(app);
    const questionsRef = database.ref(db, firebaseSettings.questionsPath);
    const submissionsRef = database.ref(db, firebaseSettings.submissionsPath);

    firebaseState = {
      onValue: database.onValue,
      push: database.push,
      serverTimestamp: database.serverTimestamp,
      set: database.set,
      submissionsRef
    };

    firebaseState.onValue(
      questionsRef,
      (snapshot) => {
        questionsCache = normalizeQuestions(snapshot.val() || {});
        currentQuestionIndex = Math.min(currentQuestionIndex, questionsCache.length - 1);
        renderQuestionFields();
        setFormDisabled(false);
        showStatus("Klar til svar");
      },
      (error) => {
        setFormDisabled(true);
        showStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );
  } catch (error) {
    setFormDisabled(true);
    showStatus(`Kunne ikke starte Firebase: ${error.message}`, { persistent: true });
  }
}

questionFields.addEventListener("input", (event) => {
  const question = getCurrentQuestion();
  if (question && event.target.id === `answer-${question.id}`) {
    draftAnswers[question.id] = event.target.value;
    const completed = questionFields.querySelector("[data-completed-count]");
    if (completed) {
      const completedCount = getQuestions().filter((item) => draftAnswers[item.id] && draftAnswers[item.id].trim()).length;
      completed.textContent = `${completedCount}/${getQuestions().length} besvaret`;
    }
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

    showStatus("Udfyld navn og alle 12 svar.");
    return;
  }

  setFormDisabled(true);
  showStatus("Gemmer...");

  try {
    await saveSubmission(name, answers);
    form.reset();
    draftAnswers = {};
    currentQuestionIndex = 0;
    renderQuestionFields();
    nameInput.focus();
    showStatus("Svar gemt");
  } catch (error) {
    showStatus(`Kunne ikke gemme: ${error.message}`, { persistent: true });
  } finally {
    setFormDisabled(false);
  }
});

window.addEventListener("load", initFirebase);
