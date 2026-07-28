const FIREBASE_SDK_VERSION = "12.16.0";
const QUESTION_ID_PATTERN = /^q(0|[1-9]|1[0-2])$/;
const MAX_VIDEO_SIZE_BYTES = 524288000;
const FALLBACK_VIDEO_TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime"
};
const FALLBACK_QUESTIONS = [
  {
    id: "q0",
    order: 0,
    category: "Testspørgsmål",
    text: 'Hvor mange gange siger Anna "Grøndahl!" i løbet af en helt almindelig uge?'
  },
  {
    id: "q1",
    order: 1,
    category: "Samarbejdsopgave",
    text: "Hvor lang tid tager det Kasper at lave en Old Fashioned, når Anna læser opskriften højt for ham?"
  },
  {
    id: "q2",
    order: 2,
    category: "Spørgsmål",
    text: "Hvilket husnummer bor Anna og Kasper i?"
  },
  {
    id: "q3",
    order: 3,
    category: "Kasper opgave",
    text: "Hvor mange vingummibamser kan Kasper flytte fra én skål til en anden på 30 sekunder?"
  },
  {
    id: "q4",
    order: 4,
    category: "Anna video",
    text: "Hvor mange Disney-karakterer kan Anna nævne på 30 sekunder?"
  },
  {
    id: "q5",
    order: 5,
    category: "Anna opgave",
    text: "Hvor mange Disney-citater kan Anna gætte på 30 sekunder?"
  },
  {
    id: "q6",
    order: 6,
    category: "Kasper video",
    text: "Hvor længe kan Kasper blive stående på et surfbræt på en kunstig bølge?"
  },
  {
    id: "q7",
    order: 7,
    category: "Spørgsmål",
    text: "Hvor mange dækskift er der blevet lavet hos Lykkegårdens Auto i 2026?"
  },
  {
    id: "q8",
    order: 8,
    category: "Kasper opgave",
    text: "Hvor lang tid tager det Kasper at binde et slips?"
  },
  {
    id: "q9",
    order: 9,
    category: "Anna video",
    text: "Hvor mange balloner kan Anna puste op på 30 sekunder?"
  },
  {
    id: "q10",
    order: 10,
    category: "Anna opgave",
    text: "Hvor lang tid tager det Anna at lægge et puslespil med 8 brikker?"
  },
  {
    id: "q11",
    order: 11,
    category: "Kasper video",
    text: "Hvor lang tid tager det Kasper at slå 5 søm i?"
  },
  {
    id: "q12",
    order: 12,
    category: "Samarbejdsopgave",
    text: "Hvor lang tid tager det Anna og Kasper at skifte betræk på en dyne og en pude?"
  }
];

const questionSelectEl = document.getElementById("upload-question");
const uploadFormEl = document.getElementById("upload-video-form");
const uploadFileInputEl = document.getElementById("upload-file");
const uploadVisibleInputEl = document.getElementById("upload-visible");
const uploadSubmitBtn = document.getElementById("upload-submit");
const uploadStatusEl = document.getElementById("upload-status");
const uploadProgressEl = document.getElementById("upload-progress");
const uploadProgressTextEl = document.getElementById("upload-progress-text");
const uploadVideoStateEl = document.getElementById("upload-video-state");
const uploadCurrentQuestionEl = document.getElementById("upload-current-question");
const uploadVideoDisplayEl = document.getElementById("upload-video-display");
const uploadShowCurrentBtn = document.getElementById("upload-show-current");
const uploadHideCurrentBtn = document.getElementById("upload-hide-current");
const firebaseConfig = window.firebaseConfig || {};
const firebaseSettings = {
  questionsPath: "questions",
  activeQuestionPath: "activeQuestion",
  questionVideosPath: "questionVideos",
  videoStoragePath: "questionVideos",
  ...(window.firebaseSettings || {})
};

let questionsCache = [...FALLBACK_QUESTIONS];
let questionVideosCache = {};
let selectedQuestionId = getInitialQuestionId();
let hasUserSelectedQuestion = Boolean(selectedQuestionId);
let firebaseState = null;
let uploadStatusTimer;

function hasFirebaseConfig(config) {
  return ["apiKey", "authDomain", "databaseURL", "projectId", "appId", "storageBucket"].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function getInitialQuestionId() {
  const questionId = new URLSearchParams(window.location.search).get("q") || "";
  return QUESTION_ID_PATTERN.test(questionId) ? questionId : "";
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

  return {
    id,
    order,
    category,
    text
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

function normalizeQuestionVideo(questionId, data = {}) {
  if (!QUESTION_ID_PATTERN.test(questionId) || !data || typeof data !== "object") {
    return null;
  }

  const storedQuestionId = typeof data.questionId === "string" ? data.questionId : questionId;
  const url = typeof data.url === "string" ? data.url.trim() : "";
  const embedUrl = typeof data.embedUrl === "string" ? data.embedUrl.trim() : "";
  const provider = typeof data.provider === "string" ? data.provider.trim() : "";
  const storagePath = typeof data.storagePath === "string" ? data.storagePath.trim() : "";
  const fileName = typeof data.fileName === "string" ? data.fileName.trim() : "";
  const contentType = typeof data.contentType === "string" ? data.contentType.trim() : "";
  const size = typeof data.size === "number" ? data.size : 0;

  if (
    storedQuestionId !== questionId ||
    !url ||
    !embedUrl ||
    provider !== "file" ||
    !storagePath ||
    !fileName ||
    !contentType.startsWith("video/")
  ) {
    return null;
  }

  return {
    questionId,
    question: typeof data.question === "string" ? data.question : "",
    questionCategory: typeof data.questionCategory === "string" ? data.questionCategory : "",
    url,
    embedUrl,
    provider,
    storagePath,
    fileName,
    contentType,
    size,
    visible: data.visible === true,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    updatedAtClient: typeof data.updatedAtClient === "string" ? data.updatedAtClient : ""
  };
}

function normalizeQuestionVideos(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .map(([questionId, video]) => normalizeQuestionVideo(questionId, video))
      .filter(Boolean)
      .map((video) => [video.questionId, video])
  );
}

function getSelectedQuestion() {
  return questionsCache.find((question) => question.id === selectedQuestionId) || questionsCache[0];
}

function setUploadDisabled(disabled) {
  uploadSubmitBtn.disabled = disabled;
  uploadFileInputEl.disabled = disabled;
  questionSelectEl.disabled = disabled;
  uploadVisibleInputEl.disabled = disabled;
}

function showUploadStatus(message, options = {}) {
  uploadStatusEl.textContent = message;

  if (options.persistent) {
    window.clearTimeout(uploadStatusTimer);
    return;
  }

  window.clearTimeout(uploadStatusTimer);
  uploadStatusTimer = window.setTimeout(() => {
    if (uploadStatusEl.textContent === message) {
      uploadStatusEl.textContent = "";
    }
  }, 3500);
}

function setUploadProgress(percent) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  uploadProgressEl.value = safePercent;
  uploadProgressTextEl.textContent = `${safePercent}%`;
}

function renderQuestionOptions() {
  const selectedQuestion = getSelectedQuestion();
  selectedQuestionId = selectedQuestion?.id || "q1";

  const options = questionsCache.map((question) => {
    const option = document.createElement("option");
    option.value = question.id;
    option.textContent = `Spørgsmål ${question.order}${question.category ? ` · ${question.category}` : ""}`;
    option.selected = question.id === selectedQuestionId;
    return option;
  });

  questionSelectEl.replaceChildren(...options);
  renderCurrentVideo();
}

function createVideoElement(videoState) {
  const video = document.createElement("video");
  video.src = videoState.embedUrl;
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  return video;
}

function createEmptyMessage(message) {
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = message;
  return empty;
}

function renderCurrentVideo() {
  const question = getSelectedQuestion();
  const videoState = question ? questionVideosCache[question.id] : null;
  const hasVideo = Boolean(videoState?.url && videoState?.embedUrl);
  const shouldShowVideo = Boolean(hasVideo && videoState.visible);

  uploadCurrentQuestionEl.textContent = question ? question.text : "-";
  uploadVideoStateEl.textContent = shouldShowVideo ? "Vises" : "Skjult";
  uploadShowCurrentBtn.disabled = !firebaseState || !question || !hasVideo || shouldShowVideo;
  uploadHideCurrentBtn.disabled = !firebaseState || !question || !hasVideo || !shouldShowVideo;
  uploadVideoDisplayEl.classList.toggle("has-video", shouldShowVideo);

  if (!question) {
    uploadVideoDisplayEl.replaceChildren(createEmptyMessage("Vælg et spørgsmål."));
    return;
  }

  if (!hasVideo) {
    uploadVideoDisplayEl.replaceChildren(createEmptyMessage(`Ingen video gemt til spørgsmål ${question.order}.`));
    return;
  }

  if (!shouldShowVideo) {
    uploadVideoDisplayEl.replaceChildren(createEmptyMessage(`Video skjult på spørgsmål ${question.order}.`));
    return;
  }

  uploadVideoDisplayEl.replaceChildren(createVideoElement(videoState));
}

function sanitizeFileName(fileName) {
  const cleanedName = String(fileName || "video")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleanedName || "video";
}

function getFileExtension(fileName) {
  const match = String(fileName || "")
    .toLowerCase()
    .match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function getVideoContentType(file) {
  if (file.type && file.type.startsWith("video/")) {
    return file.type;
  }

  return FALLBACK_VIDEO_TYPES[getFileExtension(file.name)] || "";
}

function buildStoragePath(question, file) {
  return `${firebaseSettings.videoStoragePath}/${question.id}/${Date.now()}-${sanitizeFileName(file.name)}`;
}

function buildQuestionVideoPayload(question, videoData, visible) {
  return {
    questionId: question.id,
    question: question.text,
    questionCategory: question.category || "",
    ...videoData,
    visible,
    updatedAt: firebaseState.serverTimestamp(),
    updatedAtClient: new Date().toISOString()
  };
}

function uploadFile(storageRef, file, metadata) {
  const uploadTask = firebaseState.uploadBytesResumable(storageRef, file, metadata);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = snapshot.totalBytes ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0;
        setUploadProgress(percent);
      },
      reject,
      () => resolve(uploadTask.snapshot)
    );
  });
}

async function saveCurrentVideoVisibility(visible) {
  const question = getSelectedQuestion();
  const videoState = question ? questionVideosCache[question.id] : null;

  if (!firebaseState || !question || !videoState) {
    return;
  }

  uploadShowCurrentBtn.disabled = true;
  uploadHideCurrentBtn.disabled = true;
  showUploadStatus(visible ? "Viser video..." : "Skjuler video...");

  try {
    await firebaseState.set(
      firebaseState.getQuestionVideoRef(question.id),
      buildQuestionVideoPayload(question, videoState, visible)
    );
    showUploadStatus(visible ? `Video vises på spørgsmål ${question.order}.` : `Video skjult på spørgsmål ${question.order}.`);
  } catch (error) {
    showUploadStatus(`Kunne ikke gemme video: ${error.message}`, { persistent: true });
  } finally {
    renderCurrentVideo();
  }
}

async function handleUpload(event) {
  event.preventDefault();

  const question = getSelectedQuestion();
  const file = uploadFileInputEl.files?.[0];

  if (!firebaseState || !question) {
    showUploadStatus("Firebase er ikke klar endnu.");
    return;
  }

  if (!file) {
    showUploadStatus("Vælg en videofil.");
    return;
  }

  const contentType = getVideoContentType(file);

  if (!contentType) {
    showUploadStatus("Filen skal være en video.");
    return;
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    showUploadStatus("Videoen må højst være 500 MB.");
    return;
  }

  setUploadDisabled(true);
  setUploadProgress(0);
  showUploadStatus("Uploader video...", { persistent: true });

  try {
    const storagePath = buildStoragePath(question, file);
    const storageRef = firebaseState.storageRef(firebaseState.storage, storagePath);
    const metadata = {
      contentType,
      customMetadata: {
        questionId: question.id,
        questionOrder: String(question.order)
      }
    };

    const snapshot = await uploadFile(storageRef, file, metadata);
    const downloadUrl = await firebaseState.getDownloadURL(snapshot.ref);
    const payload = buildQuestionVideoPayload(
      question,
      {
        url: downloadUrl,
        embedUrl: downloadUrl,
        provider: "file",
        storagePath,
        fileName: file.name,
        contentType,
        size: file.size
      },
      uploadVisibleInputEl.checked
    );

    await firebaseState.set(firebaseState.getQuestionVideoRef(question.id), payload);
    uploadFileInputEl.value = "";
    setUploadProgress(100);
    showUploadStatus(`Video uploadet til spørgsmål ${question.order}.`);
  } catch (error) {
    showUploadStatus(`Upload fejlede: ${error.message}`, { persistent: true });
  } finally {
    setUploadDisabled(false);
    renderCurrentVideo();
  }
}

async function initFirebase() {
  renderQuestionOptions();
  setUploadDisabled(true);

  if (!hasFirebaseConfig(firebaseConfig)) {
    showUploadStatus("Indsæt Firebase config med Storage bucket.", { persistent: true });
    return;
  }

  showUploadStatus("Forbinder til Firebase...", { persistent: true });

  try {
    const [{ initializeApp }, database, storageApi] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-storage.js`)
    ]);
    const app = initializeApp(firebaseConfig);
    const db = database.getDatabase(app);
    const storage = storageApi.getStorage(app);
    const questionsRef = database.ref(db, firebaseSettings.questionsPath);
    const activeQuestionRef = database.ref(db, firebaseSettings.activeQuestionPath);
    const questionVideosRef = database.ref(db, firebaseSettings.questionVideosPath);

    firebaseState = {
      storage,
      getQuestionVideoRef: (questionId) => database.ref(db, `${firebaseSettings.questionVideosPath}/${questionId}`),
      getDownloadURL: storageApi.getDownloadURL,
      onValue: database.onValue,
      serverTimestamp: database.serverTimestamp,
      set: database.set,
      storageRef: storageApi.ref,
      uploadBytesResumable: storageApi.uploadBytesResumable
    };

    firebaseState.onValue(
      questionsRef,
      (snapshot) => {
        questionsCache = normalizeQuestions(snapshot.val() || {});
        renderQuestionOptions();
      },
      (error) => {
        showUploadStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    firebaseState.onValue(
      activeQuestionRef,
      (snapshot) => {
        if (hasUserSelectedQuestion) {
          return;
        }

        selectedQuestionId = normalizeActiveQuestion(snapshot.val() || {});
        renderQuestionOptions();
      },
      (error) => {
        showUploadStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    firebaseState.onValue(
      questionVideosRef,
      (snapshot) => {
        questionVideosCache = normalizeQuestionVideos(snapshot.val() || {});
        renderCurrentVideo();
      },
      (error) => {
        showUploadStatus(`Firebase-fejl: ${error.message}`, { persistent: true });
      }
    );

    setUploadDisabled(false);
    showUploadStatus("");
  } catch (error) {
    setUploadDisabled(true);
    showUploadStatus(`Kunne ikke starte Firebase: ${error.message}`, { persistent: true });
  }
}

questionSelectEl.addEventListener("change", () => {
  selectedQuestionId = questionSelectEl.value;
  hasUserSelectedQuestion = true;
  renderCurrentVideo();
});
uploadFormEl.addEventListener("submit", handleUpload);
uploadShowCurrentBtn.addEventListener("click", () => saveCurrentVideoVisibility(true));
uploadHideCurrentBtn.addEventListener("click", () => saveCurrentVideoVisibility(false));
window.addEventListener("load", initFirebase);
