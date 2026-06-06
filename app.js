const QUESTION_COUNT = 40;
const OPTIONS = ["A", "B", "C", "D"];
const WARP_WIDTH = 1000;
const WARP_HEIGHT = 1400;
const MARK_THRESHOLD = 0.36;

const els = {
  opencvStatus: document.querySelector("#opencvStatus"),
  scanStatus: document.querySelector("#scanStatus"),
  imageInput: document.querySelector("#imageInput"),
  sourceCanvas: document.querySelector("#sourceCanvas"),
  warpedCanvas: document.querySelector("#warpedCanvas"),
  scanBtn: document.querySelector("#scanBtn"),
  saveResultBtn: document.querySelector("#saveResultBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  answerKey: document.querySelector("#answerKey"),
  studentName: document.querySelector("#studentName"),
  studentNumber: document.querySelector("#studentNumber"),
  answersTable: document.querySelector("#answersTable tbody"),
  historyTable: document.querySelector("#historyTable tbody"),
  answerRowTemplate: document.querySelector("#answerRowTemplate"),
  scoreSummary: document.querySelector("#scoreSummary"),
  cameraPreview: document.querySelector("#cameraPreview"),
  startCameraBtn: document.querySelector("#startCameraBtn"),
  captureBtn: document.querySelector("#captureBtn"),
  stopCameraBtn: document.querySelector("#stopCameraBtn"),
  clearBtn: document.querySelector("#clearBtn"),
};

let cvReady = false;
let currentImageLoaded = false;
let cameraStream = null;
let activeResult = null;
let savedResults = loadSavedResults();

window.addEventListener("load", () => {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", switchSource));
  els.imageInput.addEventListener("change", handleFileInput);
  document.querySelector(".drop-zone").addEventListener("dragover", (event) => event.preventDefault());
  document.querySelector(".drop-zone").addEventListener("drop", handleDroppedFile);
  els.scanBtn.addEventListener("click", scanCurrentImage);
  els.saveResultBtn.addEventListener("click", saveActiveResult);
  els.downloadBtn.addEventListener("click", downloadExcel);
  els.startCameraBtn.addEventListener("click", startCamera);
  els.captureBtn.addEventListener("click", captureCameraFrame);
  els.stopCameraBtn.addEventListener("click", stopCamera);
  els.clearBtn.addEventListener("click", clearSavedResults);
  els.answerKey.addEventListener("input", () => activeResult && scoreAndRender(activeResult.answers));
  renderHistory();
  waitForOpenCv();
  updateScanAvailability();
});

function waitForOpenCv() {
  if (window.cv?.Mat) {
    cvReady = true;
    els.opencvStatus.textContent = "OpenCV siap";
    els.opencvStatus.className = "badge ok";
    updateScanAvailability();
    return;
  }
  window.setTimeout(waitForOpenCv, 250);
}

function switchSource(event) {
  const source = event.currentTarget.dataset.source;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.source === source));
  document.querySelector("#filePanel").classList.toggle("hidden", source !== "file");
  document.querySelector("#cameraPanel").classList.toggle("hidden", source !== "camera");
}

async function handleFileInput(event) {
  await loadImageFile(event.target.files?.[0]);
}

async function handleDroppedFile(event) {
  event.preventDefault();
  await loadImageFile(event.dataTransfer.files?.[0]);
}

async function loadImageFile(file) {
  if (!file) return;
  const image = await blobToImage(file);
  drawImageToCanvas(image, els.sourceCanvas);
  currentImageLoaded = true;
  activeResult = null;
  els.scanStatus.textContent = `Gambar dimuat: ${file.name}`;
  updateScanAvailability();
}

async function startCamera() {
  stopCamera();
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  els.cameraPreview.srcObject = cameraStream;
  els.captureBtn.disabled = false;
  els.stopCameraBtn.disabled = false;
  els.startCameraBtn.disabled = true;
}

function captureCameraFrame() {
  const video = els.cameraPreview;
  els.sourceCanvas.width = video.videoWidth;
  els.sourceCanvas.height = video.videoHeight;
  els.sourceCanvas.getContext("2d").drawImage(video, 0, 0);
  currentImageLoaded = true;
  activeResult = null;
  els.scanStatus.textContent = "Foto kamera siap discan";
  updateScanAvailability();
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  els.cameraPreview.srcObject = null;
  els.captureBtn.disabled = true;
  els.stopCameraBtn.disabled = true;
  els.startCameraBtn.disabled = false;
}

function updateScanAvailability() {
  els.scanBtn.disabled = !(cvReady && currentImageLoaded);
  els.saveResultBtn.disabled = !activeResult;
  els.downloadBtn.disabled = savedResults.length === 0;
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(blob);
  });
}

function drawImageToCanvas(image, canvas) {
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
}

function scanCurrentImage() {
  if (!cvReady || !currentImageLoaded) return;
  setStatus("Memproses gambar...");
  try {
    const warped = warpAnswerSheet(els.sourceCanvas, els.warpedCanvas);
    const answers = readAnswers(warped, els.warpedCanvas);
    warped.delete();
    scoreAndRender(answers);
    setStatus("Scan selesai. Periksa kolom koreksi manual jika ada jawaban meragukan.");
  } catch (error) {
    console.error(error);
    setStatus(`Gagal scan otomatis: ${error.message}. Coba foto lebih lurus/terang.`);
  }
}

function setStatus(message) {
  els.scanStatus.textContent = message;
}

function warpAnswerSheet(sourceCanvas, targetCanvas) {
  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const thresh = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  const markerPoints = findCornerMarkers(thresh, sourceCanvas.width, sourceCanvas.height);
  const ordered = orderPoints(markerPoints);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((point) => [point.x, point.y]));
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, WARP_WIDTH, 0, WARP_WIDTH, WARP_HEIGHT, 0, WARP_HEIGHT]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, transform, new cv.Size(WARP_WIDTH, WARP_HEIGHT), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  cv.imshow(targetCanvas, warped);

  src.delete(); gray.delete(); blurred.delete(); thresh.delete(); srcTri.delete(); dstTri.delete(); transform.delete();
  return warped;
}

function findCornerMarkers(thresh, width, height) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const candidates = [];
  const imageArea = width * height;

  for (let i = 0; i < contours.size(); i += 1) {
    const contour = contours.get(i);
    const rect = cv.boundingRect(contour);
    const area = cv.contourArea(contour);
    const ratio = rect.width / Math.max(rect.height, 1);
    const fill = area / Math.max(rect.width * rect.height, 1);
    if (area > imageArea * 0.00004 && area < imageArea * 0.003 && ratio > 0.55 && ratio < 1.7 && fill > 0.45) {
      candidates.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, area });
    }
    contour.delete();
  }
  contours.delete(); hierarchy.delete();

  if (candidates.length < 4) throw new Error("penanda sudut hitam tidak ditemukan lengkap");
  const corners = [
    nearest(candidates, { x: 0, y: 0 }),
    nearest(candidates, { x: width, y: 0 }),
    nearest(candidates, { x: width, y: height }),
    nearest(candidates, { x: 0, y: height }),
  ];
  if (new Set(corners.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`)).size < 4) {
    throw new Error("penanda sudut kurang jelas atau tertutup");
  }
  return corners;
}

function nearest(points, target) {
  return points.reduce((best, point) => {
    const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
    return distance < best.distance ? { ...point, distance } : best;
  }, { distance: Number.POSITIVE_INFINITY });
}

function orderPoints(points) {
  const sorted = [...points].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

function readAnswers(warped, previewCanvas) {
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  const layout = answerBubbleLayout();
  const answers = layout.map((question) => {
    const fills = question.bubbles.map((bubble) => fillRatio(binary, bubble));
    const best = Math.max(...fills);
    const sorted = [...fills].sort((a, b) => b - a);
    const selectedIndex = best >= MARK_THRESHOLD && best - sorted[1] > 0.055 ? fills.indexOf(best) : -1;
    return {
      number: question.number,
      detected: selectedIndex >= 0 ? OPTIONS[selectedIndex] : "",
      confidence: Number(best.toFixed(3)),
      fills,
    };
  });

  drawScanOverlay(previewCanvas, layout, answers);
  gray.delete(); binary.delete();
  return answers;
}

function answerBubbleLayout() {
  const columns = [0.205, 0.392, 0.610, 0.817];
  const startY = 0.722;
  const rowGap = 0.0333;
  const optionGap = 0.0214;
  const radius = 9;
  const layout = [];

  columns.forEach((columnX, colIndex) => {
    for (let row = 0; row < 10; row += 1) {
      const number = colIndex * 10 + row + 1;
      const y = (startY + row * rowGap) * WARP_HEIGHT;
      const bubbles = OPTIONS.map((_, optionIndex) => ({
        x: (columnX + optionIndex * optionGap) * WARP_WIDTH,
        y,
        r: radius,
      }));
      layout.push({ number, bubbles });
    }
  });
  return layout.sort((a, b) => a.number - b.number);
}

function fillRatio(binary, { x, y, r }) {
  const left = Math.max(0, Math.round(x - r));
  const top = Math.max(0, Math.round(y - r));
  const size = Math.round(r * 2);
  const rect = new cv.Rect(left, top, Math.min(size, binary.cols - left), Math.min(size, binary.rows - top));
  const roi = binary.roi(rect);
  const count = cv.countNonZero(roi);
  roi.delete();
  return count / (rect.width * rect.height);
}

function drawScanOverlay(canvas, layout, answers) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.lineWidth = 2;
  layout.forEach((question, questionIndex) => {
    question.bubbles.forEach((bubble, optionIndex) => {
      const selected = answers[questionIndex].detected === OPTIONS[optionIndex];
      ctx.strokeStyle = selected ? "#087f5b" : "#246bfe";
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.r + 2, 0, Math.PI * 2);
      ctx.stroke();
    });
  });
  ctx.restore();
}

function parseAnswerKey() {
  const raw = els.answerKey.value.trim().toUpperCase();
  const key = Array(QUESTION_COUNT).fill("");
  if (!raw) return key;

  const pairs = [...raw.matchAll(/(\d{1,2})\s*[:=.)-]?\s*([ABCD])/g)];
  if (pairs.length) {
    pairs.forEach((match) => {
      const number = Number(match[1]);
      if (number >= 1 && number <= QUESTION_COUNT) key[number - 1] = match[2];
    });
    return key;
  }

  raw.replace(/[^ABCD]/g, "").slice(0, QUESTION_COUNT).split("").forEach((answer, index) => {
    key[index] = answer;
  });
  return key;
}

function scoreAndRender(answers) {
  const key = parseAnswerKey();
  activeResult = {
    timestamp: new Date().toISOString(),
    name: els.studentName.value.trim(),
    number: els.studentNumber.value.trim(),
    answers: answers.map((answer) => ({ ...answer })),
    key,
  };
  renderAnswers(activeResult);
  updateScanAvailability();
}

function renderAnswers(result) {
  els.answersTable.innerHTML = "";
  result.answers.forEach((answer, index) => {
    const row = els.answerRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".question-number").textContent = answer.number;
    row.querySelector(".detected-answer").textContent = answer.detected || "-";
    row.querySelector(".key-answer").textContent = result.key[index] || "-";
    const select = row.querySelector(".manual-answer");
    select.value = answer.manual ?? answer.detected;
    select.addEventListener("change", () => {
      activeResult.answers[index].manual = select.value;
      renderAnswers(activeResult);
    });
    const status = answerStatus(select.value, result.key[index]);
    row.querySelector(".answer-status").textContent = status.label;
    row.className = status.className;
    els.answersTable.appendChild(row);
  });
  const score = calculateScore(result.answers, result.key);
  els.scoreSummary.textContent = `${score.correct}/${QUESTION_COUNT} benar • Nilai ${score.value}`;
}

function answerStatus(answer, key) {
  if (!answer) return { label: "Kosong/ragu", className: "blank" };
  if (!key) return { label: "Belum ada kunci", className: "" };
  return answer === key ? { label: "Benar", className: "correct" } : { label: "Salah", className: "wrong" };
}

function calculateScore(answers, key) {
  const keyed = key.filter(Boolean).length || QUESTION_COUNT;
  const correct = answers.reduce((total, answer, index) => total + ((answer.manual ?? answer.detected) && key[index] && (answer.manual ?? answer.detected) === key[index] ? 1 : 0), 0);
  return { correct, value: Number(((correct / keyed) * 100).toFixed(2)) };
}

function saveActiveResult() {
  if (!activeResult) return;
  activeResult.name = els.studentName.value.trim() || `Scan ${savedResults.length + 1}`;
  activeResult.number = els.studentNumber.value.trim();
  activeResult.key = parseAnswerKey();
  const score = calculateScore(activeResult.answers, activeResult.key);
  savedResults.push({ ...activeResult, score });
  localStorage.setItem("ljk-scan-results", JSON.stringify(savedResults));
  renderHistory();
  updateScanAvailability();
}

function loadSavedResults() {
  try {
    return JSON.parse(localStorage.getItem("ljk-scan-results") || "[]");
  } catch {
    return [];
  }
}

function renderHistory() {
  els.historyTable.innerHTML = "";
  savedResults.forEach((result) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${new Date(result.timestamp).toLocaleString("id-ID")}</td><td>${escapeHtml(result.name || "-")}</td><td>${escapeHtml(result.number || "-")}</td><td>${result.score.correct}</td><td>${result.score.value}</td>`;
    els.historyTable.appendChild(row);
  });
  updateScanAvailability();
}

function clearSavedResults() {
  savedResults = [];
  localStorage.removeItem("ljk-scan-results");
  renderHistory();
}

function downloadExcel() {
  const summary = savedResults.map((result) => ({
    Waktu: new Date(result.timestamp).toLocaleString("id-ID"),
    Nama: result.name,
    "Nomor Peserta": result.number,
    Benar: result.score.correct,
    Nilai: result.score.value,
  }));
  const detail = savedResults.flatMap((result) => result.answers.map((answer, index) => ({
    Nama: result.name,
    "Nomor Peserta": result.number,
    Soal: answer.number,
    Jawaban: answer.manual ?? answer.detected,
    Kunci: result.key[index] || "",
    Status: answerStatus(answer.manual ?? answer.detected, result.key[index]).label,
    Confidence: answer.confidence,
  })));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "Rekap Nilai");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail), "Detail Jawaban");
  XLSX.writeFile(workbook, `rekap-scan-ljk-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
