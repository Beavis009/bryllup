const RULES_MODAL_ID = "rules-modal";

const WINNING_RULES = [
  "Den person, der er tættest på det rigtige svar, vinder spørgsmålet.",
  "Hvis flere rammer lige tæt på, vinder den, der svarede hurtigst.",
  "Du kan kun svare én gang på hvert spørgsmål.",
  "Du kan kun vinde én gang i hele quizzen.",
  "Ved tidsspørgsmål skal svaret skrives som antal sekunder."
];

let rulesModalEl = null;

function createRulesModal() {
  const modal = document.createElement("div");
  modal.id = RULES_MODAL_ID;
  modal.className = "video-modal rules-modal";
  modal.hidden = true;

  const backdrop = document.createElement("div");
  backdrop.className = "video-modal-backdrop";
  backdrop.dataset.rulesClose = "";

  const dialog = document.createElement("section");
  dialog.className = "video-dialog rules-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "rules-modal-title");

  const header = document.createElement("div");
  header.className = "video-dialog-header";

  const headingWrap = document.createElement("div");
  const label = document.createElement("span");
  label.className = "question-number";
  label.textContent = "Regler";

  const title = document.createElement("h2");
  title.id = "rules-modal-title";
  title.textContent = "Sådan vinder du";

  headingWrap.append(label, title);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "secondary compact-action";
  closeButton.dataset.rulesClose = "";
  closeButton.textContent = "Luk";

  header.append(headingWrap, closeButton);

  const body = document.createElement("div");
  body.className = "rules-body";

  const list = document.createElement("ol");
  list.className = "rules-list";
  WINNING_RULES.forEach((rule) => {
    const item = document.createElement("li");
    item.textContent = rule;
    list.append(item);
  });

  const note = document.createElement("p");
  note.className = "rules-note";
  note.textContent = "Værten annoncerer vinderen, når det rigtige svar er kendt.";

  body.append(list, note);
  dialog.append(header, body);
  modal.append(backdrop, dialog);
  document.body.append(modal);

  return modal;
}

function getRulesModal() {
  if (!rulesModalEl) {
    rulesModalEl = document.getElementById(RULES_MODAL_ID) || createRulesModal();
  }

  return rulesModalEl;
}

function openRulesModal() {
  const modal = getRulesModal();
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeRulesModal() {
  const modal = getRulesModal();
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function initRulesModal() {
  document.querySelectorAll("[data-rules-open]").forEach((button) => {
    button.addEventListener("click", openRulesModal);
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-rules-close]")) {
      closeRulesModal();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !getRulesModal().hidden) {
      closeRulesModal();
    }
  });
}

window.addEventListener("load", initRulesModal);
