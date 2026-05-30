const DATA = window.ML_TEST_DATA || { questions: [] };
const STORAGE_KEY = "ml-test-set-progress-v1";
const BATCH_SIZE = 10;

const state = {
  batchIndex: 0,
  query: "",
  set: "all",
  topic: "all",
  type: "all",
  wrongOnly: false,
  shuffle: false,
  order: [],
  progress: loadProgress(),
};

const els = {
  search: document.querySelector("#searchInput"),
  setFilter: document.querySelector("#setFilter"),
  topicFilter: document.querySelector("#topicFilter"),
  typeFilter: document.querySelector("#typeFilter"),
  wrongOnly: document.querySelector("#wrongOnly"),
  shuffleMode: document.querySelector("#shuffleMode"),
  doneCount: document.querySelector("#doneCount"),
  rightCount: document.querySelector("#rightCount"),
  accuracy: document.querySelector("#accuracy"),
  learningPercent: document.querySelector("#learningPercent"),
  learningBar: document.querySelector("#learningBar"),
  learningText: document.querySelector("#learningText"),
  quizMeta: document.querySelector("#quizMeta"),
  quizTitle: document.querySelector("#quizTitle"),
  pageText: document.querySelector("#pageText"),
  prev: document.querySelector("#prevBatch"),
  next: document.querySelector("#nextBatch"),
  batchTag: document.querySelector("#batchTag"),
  batchHint: document.querySelector("#batchHint"),
  batchAnswered: document.querySelector("#batchAnswered"),
  questionList: document.querySelector("#questionList"),
  batchResult: document.querySelector("#batchResult"),
  revealBatch: document.querySelector("#revealBatch"),
  submitBatch: document.querySelector("#submitBatch"),
  nextAfterBatch: document.querySelector("#nextAfterBatch"),
  exportWrong: document.querySelector("#exportWrong"),
  resetProgress: document.querySelector("#resetProgress"),
};

init();

function init() {
  fillFilters();
  bindEvents();
  rebuildOrder();
  renderAll();
}

function fillFilters() {
  fillSelect(els.setFilter, [...new Set(DATA.questions.map((q) => q.set))].sort());
  fillSelect(els.topicFilter, [...new Set(DATA.questions.map((q) => q.topic))].sort());
}

function fillSelect(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function bindEvents() {
  els.search.addEventListener("input", () => updateFilter("query", els.search.value.trim().toLowerCase()));
  els.setFilter.addEventListener("change", () => updateFilter("set", els.setFilter.value));
  els.topicFilter.addEventListener("change", () => updateFilter("topic", els.topicFilter.value));
  els.typeFilter.addEventListener("change", () => updateFilter("type", els.typeFilter.value));
  els.wrongOnly.addEventListener("change", () => updateFilter("wrongOnly", els.wrongOnly.checked));
  els.shuffleMode.addEventListener("change", () => updateFilter("shuffle", els.shuffleMode.checked));
  els.prev.addEventListener("click", () => moveBatch(-1));
  els.next.addEventListener("click", () => moveBatch(1));
  els.nextAfterBatch.addEventListener("click", () => moveBatch(1));
  els.submitBatch.addEventListener("click", submitBatch);
  els.revealBatch.addEventListener("click", revealBatch);
  els.exportWrong.addEventListener("click", exportWrong);
  els.resetProgress.addEventListener("click", resetProgress);
  window.addEventListener("keydown", handleKeys);
}

function updateFilter(key, value) {
  state[key] = value;
  state.batchIndex = 0;
  rebuildOrder();
  renderAll();
}

function filteredQuestions() {
  return DATA.questions.filter((q) => {
    const progress = state.progress[q.id] || {};
    const haystack = [
      q.set,
      q.topic,
      q.type,
      q.stem,
      q.explanation,
      q.options.map((option) => option.text).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return (
      (state.set === "all" || q.set === state.set) &&
      (state.topic === "all" || q.topic === state.topic) &&
      (state.type === "all" || q.type === state.type) &&
      (!state.wrongOnly || progress.correct === false) &&
      (!state.query || haystack.includes(state.query))
    );
  });
}

function rebuildOrder() {
  state.order = filteredQuestions().map((q) => q.id);
  if (state.shuffle) state.order.sort((a, b) => seededSort(a) - seededSort(b));
  clampBatchIndex();
}

function seededSort(value) {
  let hash = 17;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 100003;
  return hash;
}

function batchCount() {
  return Math.max(1, Math.ceil(state.order.length / BATCH_SIZE));
}

function clampBatchIndex() {
  state.batchIndex = Math.min(Math.max(state.batchIndex, 0), batchCount() - 1);
}

function currentBatch() {
  const start = state.batchIndex * BATCH_SIZE;
  return state.order
    .slice(start, start + BATCH_SIZE)
    .map((id) => DATA.questions.find((q) => q.id === id))
    .filter(Boolean);
}

function renderAll() {
  renderStats();
  renderQuiz();
}

function renderStats() {
  const answers = Object.values(state.progress).filter((p) => p.answered);
  const right = answers.filter((p) => p.correct).length;
  const percent = DATA.questions.length ? Math.round((answers.length / DATA.questions.length) * 100) : 0;
  els.doneCount.textContent = answers.length;
  els.rightCount.textContent = right;
  els.accuracy.textContent = answers.length ? `${Math.round((right / answers.length) * 100)}%` : "0%";
  els.learningPercent.textContent = `${percent}%`;
  els.learningBar.style.width = `${percent}%`;
  els.learningText.textContent = `完成 ${answers.length} / ${DATA.questions.length} 题`;
}

function renderQuiz() {
  const batch = currentBatch();
  const submitted = isBatchSubmitted(batch);
  const answered = batch.filter((q) => selectedAnswers(q).length).length;
  const totalBatches = batchCount();

  els.pageText.textContent = `${state.order.length ? state.batchIndex + 1 : 0} / ${totalBatches}`;
  els.prev.disabled = state.batchIndex <= 0;
  els.next.disabled = state.batchIndex >= totalBatches - 1;
  els.nextAfterBatch.disabled = state.batchIndex >= totalBatches - 1;
  els.nextAfterBatch.hidden = !submitted;

  if (!batch.length) {
    els.quizMeta.textContent = "NO MATCH";
    els.quizTitle.textContent = "没有匹配题目";
    els.batchTag.textContent = "EMPTY";
    els.batchHint.textContent = "调整筛选条件后再试。";
    els.batchAnswered.textContent = "0 / 0";
    els.questionList.innerHTML = `<div class="empty-state">没有匹配的题目</div>`;
    els.batchResult.hidden = true;
    els.submitBatch.disabled = true;
    els.revealBatch.disabled = true;
    return;
  }

  const start = state.batchIndex * BATCH_SIZE + 1;
  const end = start + batch.length - 1;
  els.quizMeta.textContent = `${DATA.title} · 第 ${start}-${end} 题`;
  els.quizTitle.textContent = state.shuffle ? "随机 10 题训练" : "10 题一组训练";
  els.batchTag.textContent = `BATCH ${String(state.batchIndex + 1).padStart(2, "0")}`;
  els.batchHint.textContent = submitted ? "本组已评分，可复盘解析。" : "答完本组后统一评分。多选题可选择多个选项。";
  els.batchAnswered.textContent = `${answered} / ${batch.length}`;
  els.submitBatch.disabled = submitted || answered < batch.length;
  els.revealBatch.disabled = submitted;
  els.questionList.innerHTML = "";

  batch.forEach((q, index) => {
    els.questionList.append(renderQuestion(q, start + index, submitted));
  });

  renderBatchResult(batch, submitted);
}

function renderQuestion(q, displayNumber, submitted) {
  const progress = state.progress[q.id] || {};
  const showAnswer = submitted || progress.revealed;
  const article = document.createElement("article");
  article.className = "question-card";
  article.id = questionAnchor(q);
  article.innerHTML = `
    <div class="question-head">
      <span class="tag">${escapeHTML(q.topic)}</span>
      <span>${escapeHTML(typeLabel(q.type))} · ${escapeHTML(q.set)}</span>
    </div>
    <h3>${displayNumber}. ${escapeHTML(q.stem)}</h3>
    <div class="options"></div>
    <div class="feedback" ${showAnswer ? "" : "hidden"}>
      <strong>${escapeHTML(answerLine(q, progress))}</strong>
      <p>${escapeHTML(q.explanation)}</p>
    </div>
  `;
  const options = article.querySelector(".options");
  q.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option";
    button.type = "button";
    button.innerHTML = `<span class="letter">${escapeHTML(option.label)}</span><span>${escapeHTML(option.text)}</span>`;
    decorateOption(button, q, option.label, showAnswer);
    button.addEventListener("click", () => chooseOption(q, option.label));
    options.append(button);
  });
  return article;
}

function decorateOption(node, q, label, showAnswer) {
  const selected = selectedAnswers(q).includes(label);
  const correct = q.answer.includes(label);
  node.classList.toggle("selected", selected);
  if (showAnswer) {
    node.classList.toggle("correct", correct);
    node.classList.toggle("incorrect", selected && !correct);
  }
}

function selectedAnswers(q) {
  return (state.progress[q.id] || {}).choice || [];
}

function chooseOption(q, label) {
  const progress = state.progress[q.id] || {};
  if (progress.answered) return;
  let choice = selectedAnswers(q);
  if (q.type === "multiple") {
    choice = choice.includes(label) ? choice.filter((item) => item !== label) : [...choice, label].sort();
  } else {
    choice = [label];
  }
  state.progress[q.id] = { ...progress, choice, answered: false, revealed: false };
  saveProgress();
  renderAll();
}

function submitBatch() {
  const batch = currentBatch();
  const unanswered = batch.filter((q) => !selectedAnswers(q).length);
  if (unanswered.length) {
    window.alert(`本组还有 ${unanswered.length} 题未作答。`);
    return;
  }
  batch.forEach((q) => {
    const choice = selectedAnswers(q);
    state.progress[q.id] = {
      ...state.progress[q.id],
      choice,
      answered: true,
      revealed: true,
      correct: sameAnswer(choice, q.answer),
    };
  });
  saveProgress();
  renderAll();
}

function revealBatch() {
  currentBatch().forEach((q) => {
    state.progress[q.id] = { ...state.progress[q.id], revealed: true };
  });
  saveProgress();
  renderAll();
}

function renderBatchResult(batch, submitted) {
  if (!submitted) {
    els.batchResult.hidden = true;
    els.batchResult.innerHTML = "";
    return;
  }
  const right = batch.filter((q) => (state.progress[q.id] || {}).correct).length;
  const score = Math.round((right / batch.length) * 100);
  const wrongLinks = batch
    .map((q, index) => ({ q, displayNumber: state.batchIndex * BATCH_SIZE + index + 1 }))
    .filter(({ q }) => (state.progress[q.id] || {}).correct === false)
    .map(({ q, displayNumber }) => `<a href="#${questionAnchor(q)}">第 ${displayNumber} 题</a>`)
    .join("");
  els.batchResult.hidden = false;
  els.batchResult.innerHTML = `
    <strong>${right} / ${batch.length} · ${score}%</strong>
    <p>${score >= 90 ? "本组表现很稳，继续推进。" : score >= 70 ? "基础掌握不错，建议复盘错题。" : "建议回看相关知识点后重刷本组。"}</p>
    <p class="wrong-links">本组错题：${wrongLinks || "<span>无</span>"}</p>
  `;
}

function isBatchSubmitted(batch) {
  return batch.length > 0 && batch.every((q) => (state.progress[q.id] || {}).answered);
}

function moveBatch(direction) {
  state.batchIndex += direction;
  clampBatchIndex();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function exportWrong() {
  const wrong = DATA.questions.filter((q) => (state.progress[q.id] || {}).correct === false);
  if (!wrong.length) {
    window.alert("当前还没有错题。");
    return;
  }
  const text = wrong
    .map((q, index) => {
      const progress = state.progress[q.id] || {};
      return [
        `${index + 1}. [${q.topic}] ${q.stem}`,
        `你的答案：${(progress.choice || []).join("") || "未选择"}`,
        `正确答案：${q.answer.join("")}`,
        `解析：${q.explanation}`,
      ].join("\n");
    })
    .join("\n\n");
  navigator.clipboard
    .writeText(text)
    .then(() => window.alert("错题已复制到剪贴板。"))
    .catch(() => window.prompt("复制错题：", text));
}

function resetProgress() {
  if (!window.confirm("确认重置本地答题进度？")) return;
  state.progress = {};
  saveProgress();
  rebuildOrder();
  renderAll();
}

function handleKeys(event) {
  if (event.key === "ArrowLeft") moveBatch(-1);
  if (event.key === "ArrowRight") moveBatch(1);
}

function sameAnswer(left, right) {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

function answerLine(q, progress) {
  return `你的答案：${(progress.choice || []).join("") || "未选择"} · 正确答案：${q.answer.join("")}`;
}

function questionAnchor(q) {
  return `question-${q.id}`;
}

function typeLabel(type) {
  return { single: "单选题", multiple: "多选题", true_false: "判断题" }[type] || type;
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
