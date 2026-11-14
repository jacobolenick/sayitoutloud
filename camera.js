const PEER_PREFIX = "siol-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ORIENT_KEY = "sayitoutloud.cameraOrient";
const POS_KEY = "sayitoutloud.cameraPos";
const HIDDEN_KEY = "sayitoutloud.cameraHidden";

const cameraJoin = document.getElementById("camera-join");
const cameraCopy = document.getElementById("camera-join-copy");
const cameraStatus = document.getElementById("camera-join-status");
const cameraForm = document.getElementById("camera-code-form");
const cameraCodeInput = document.getElementById("camera-code-input");
const cameraVideo = document.getElementById("camera-join-video");
const cameraStartBtn = document.getElementById("camera-start-btn");
const cameraFlipBtn = document.getElementById("camera-flip-btn");
const cameraAppUi = document.getElementById("camera-app-ui");
const cameraRecordBtn = document.getElementById("camera-record-btn");
const cameraSaveBtn = document.getElementById("camera-save-btn");
const cameraRecBadge = document.getElementById("camera-rec-badge");
const cameraRecTime = document.getElementById("camera-rec-time");
const cameraDock = document.getElementById("camera-dock");
const cameraFrame = document.getElementById("camera-frame");
const cameraPreview = document.getElementById("camera-preview");
const camCodeEl = document.getElementById("cam-code");
const camLinkEl = document.getElementById("cam-link");
const camHintEl = document.getElementById("cam-panel-hint");
const camQrEl = document.getElementById("cam-qr");
const camCopyBtn = document.getElementById("cam-copy-btn");
const camNewBtn = document.getElementById("cam-new-btn");
const orientVertical = document.getElementById("orient-vertical");
const orientHorizontal = document.getElementById("orient-horizontal");
const camHideBtn = document.getElementById("cam-hide-btn");
const camShowBtn = document.getElementById("cam-show-btn");
const camVisibilityBtn = document.getElementById("cam-visibility-btn");
const camUnhideBtn = document.getElementById("cam-unhide-btn");

const camState = {
  code: "",
  hostPeer: null,
  phonePeer: null,
  call: null,
  stream: null,
  facing: "user",
  x: null,
  y: null,
  hidden: false,
  dragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
};

function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function peerIdFromCode(code) {
  return PEER_PREFIX + code.toLowerCase();
}

function joinUrl(code) {
  const url = new URL(window.location.href);
  url.search = `?cam=${code}`;
  url.hash = "";
  return url.toString();
}

function peerConfig() {
  return {
    debug: 0,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    },
  };
}

function setJoinStatus(text) {
  if (cameraStatus) cameraStatus.textContent = text;
}

function ensurePeerJs() {
  if (typeof Peer === "function") return true;
  setJoinStatus("Could not load the connection library. Check your internet and refresh.");
  if (camHintEl) camHintEl.textContent = "Could not load the connection library. Check your internet and refresh.";
  return false;
}

function renderQr(url) {
  if (!camQrEl) return;
  camQrEl.innerHTML = "";
  if (typeof QRCode !== "function") {
    const img = document.createElement("img");
    img.alt = "QR code";
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
    camQrEl.appendChild(img);
    return;
  }
  new QRCode(camQrEl, {
    text: url,
    width: 132,
    height: 132,
    colorDark: "#0c0c0b",
    colorLight: "#f4f1ea",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function setOrientation(mode) {
  cameraFrame.classList.toggle("is-vertical", mode === "vertical");
  cameraFrame.classList.toggle("is-horizontal", mode === "horizontal");
  orientVertical.classList.toggle("is-active", mode === "vertical");
  orientHorizontal.classList.toggle("is-active", mode === "horizontal");
  localStorage.setItem(ORIENT_KEY, mode);
  requestAnimationFrame(clampDockPos);
}

function defaultDockPos() {
  const width = cameraDock.offsetWidth || 140;
  const height = cameraDock.offsetHeight || 280;
  return {
    x: Math.max(8, (window.innerWidth - width) / 2),
    y: Math.max(8, window.innerHeight - height - 96),
  };
}

function applyDockPos() {
  cameraDock.style.left = `${camState.x}px`;
  cameraDock.style.top = `${camState.y}px`;
  cameraDock.style.right = "auto";
  cameraDock.style.bottom = "auto";
  cameraDock.style.transform = "none";
}

function clampDockPos() {
  if (camState.x == null || camState.y == null) return;
  const width = cameraDock.offsetWidth || 40;
  const height = cameraDock.offsetHeight || 40;
  camState.x = clamp(camState.x, 8, Math.max(8, window.innerWidth - width - 8));
  camState.y = clamp(camState.y, 8, Math.max(8, window.innerHeight - height - 8));
  applyDockPos();
}

function saveDockPos() {
  localStorage.setItem(POS_KEY, JSON.stringify({ x: camState.x, y: camState.y }));
}

function loadDockPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      camState.x = saved.x;
      camState.y = saved.y;
      return;
    }
  } catch {
    /* use default */
  }
  const pos = defaultDockPos();
  camState.x = pos.x;
  camState.y = pos.y;
}

function updateVisibilityLabel() {
  const connected = Boolean(camState.stream);
  if (camVisibilityBtn) {
    camVisibilityBtn.textContent = camState.hidden ? "Unhide" : "Hide camera";
    camVisibilityBtn.classList.toggle("hidden", !connected);
  }
  if (camUnhideBtn) {
    camUnhideBtn.classList.toggle("hidden", !(connected && camState.hidden));
  }
}

function setCameraHidden(hidden) {
  camState.hidden = hidden;
  cameraDock.classList.toggle("is-hidden", hidden);
  localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0");
  updateVisibilityLabel();
  requestAnimationFrame(clampDockPos);
}

function showDock(stream) {
  cameraPreview.srcObject = stream;
  cameraPreview.play().catch(() => {});
  cameraDock.classList.remove("hidden");
  camPanel.classList.add("is-connected");
  camHintEl.textContent = "Phone connected. Press Record on your phone to save the video. You'll see yourself here.";
  if (camState.x == null || camState.y == null) loadDockPos();
  applyDockPos();
  setCameraHidden(localStorage.getItem(HIDDEN_KEY) === "1");
  requestAnimationFrame(clampDockPos);
}

function hideDock() {
  cameraPreview.srcObject = null;
  cameraDock.classList.add("hidden");
  camPanel.classList.remove("is-connected");
  updateVisibilityLabel();
}

function listenForPhone(peer) {
  peer.on("call", (call) => {
    camState.call = call;
    call.answer();
    call.on("stream", (stream) => {
      camState.stream = stream;
      showDock(stream);
      closeCamPanel();
      showControls();
    });
    call.on("close", disconnectHost);
    call.on("error", disconnectHost);
  });
  peer.on("disconnected", () => {
    if (camState.hostPeer) camState.hostPeer.reconnect();
  });
}

function destroyHost() {
  if (camState.call) {
    camState.call.close();
    camState.call = null;
  }
  if (camState.hostPeer) {
    camState.hostPeer.destroy();
    camState.hostPeer = null;
  }
  camState.stream = null;
  hideDock();
}

function startHost(forceNew) {
  if (!ensurePeerJs()) return;
  destroyHost();
  camState.code = forceNew ? randomCode() : camState.code || randomCode();
  const url = joinUrl(camState.code);
  camCodeEl.textContent = camState.code;
  camLinkEl.textContent = url;
  const local =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  camHintEl.textContent = local
    ? "Scan or open the unique link on your phone, then press Record. Phones need HTTPS, so localhost will not unlock the camera."
    : "Scan the QR or type the code on your phone, then press Record. You'll see yourself here.";
  renderQr(url);

  const peer = new Peer(peerIdFromCode(camState.code), peerConfig());
  camState.hostPeer = peer;
  peer.on("error", (error) => {
    if (error.type === "unavailable-id") startHost(true);
    else camHintEl.textContent = "Could not start camera sharing. Try a new code.";
  });
  peer.on("open", () => listenForPhone(peer));
}

function toggleCamPanel() {
  const open = camPanel.classList.contains("hidden");
  if (open) {
    closePadPanel();
    if (!camState.hostPeer) startHost(false);
    camPanel.classList.remove("hidden");
    camBtn.classList.add("is-active");
    camBtn.setAttribute("aria-expanded", "true");
  } else {
    closeCamPanel();
  }
  showControls();
}

function disconnectHost() {
  hideDock();
  camHintEl.textContent = "Phone disconnected. Waiting again…";
  if (camPanel.classList.contains("hidden") && camState.hostPeer) {
    camBtn.classList.add("is-active");
  }
}

async function getPhoneStream() {
  const video = {
    facingMode: { ideal: camState.facing },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: camState.facing },
      });
    } catch {
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: camState.facing },
      });
    }
  }
}

function connectPhone(code, stream) {
  if (!ensurePeerJs()) return;
  if (camState.phonePeer) {
    camState.phonePeer.destroy();
    camState.phonePeer = null;
  }

  const peer = new Peer(peerConfig());
  camState.phonePeer = peer;
  setJoinStatus("Connecting to your computer…");

  peer.on("open", () => {
    const call = peer.call(peerIdFromCode(code), stream);
    camState.call = call;
    if (!call) {
      setJoinStatus("Could not reach that code. Is Cam open on the computer?");
      return;
    }
    call.on("error", () => {
      setJoinStatus("Could not reach that code. Is Cam open on the computer?");
    });
    setJoinStatus("Connected. Leave this page open.");
  });

  peer.on("error", (error) => {
    if (error.type === "peer-unavailable") {
      setJoinStatus("Code not found. Open Cam on the computer and try again.");
    } else {
      setJoinStatus("Connection failed. Refresh and try the code again.");
    }
  });
}

let cameraStarting = false;
let cameraControlsBound = false;

const recState = {
  recorder: null,
  chunks: [],
  timer: null,
  startedAt: 0,
  recording: false,
  blob: null,
};

function recorderMime() {
  const types = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function formatRecTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function tickRecTimer() {
  if (cameraRecTime) cameraRecTime.textContent = formatRecTime(Date.now() - recState.startedAt);
}

function setRecordingUi(on) {
  recState.recording = on;
  document.body.classList.toggle("camera-recording", on);
  cameraRecordBtn?.setAttribute("aria-pressed", on ? "true" : "false");
  cameraRecordBtn?.setAttribute("aria-label", on ? "Stop recording" : "Record");
  cameraRecBadge?.classList.toggle("hidden", !on);
  if (!on && cameraRecTime) cameraRecTime.textContent = "00:00";
}

function stopRecTimer() {
  if (recState.timer) {
    clearInterval(recState.timer);
    recState.timer = null;
  }
}

async function keepAwake() {
  try {
    if (navigator.wakeLock) camState.wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    /* optional */
  }
}

function showCameraFallback(message) {
  cameraAppUi?.classList.add("hidden");
  cameraStartBtn.classList.remove("hidden");
  cameraStartBtn.textContent = "Open camera";
  cameraCopy.textContent = message;
}

async function saveRecording(blob) {
  recState.blob = blob;
  const type = blob.type || "video/webm";
  const ext = type.includes("mp4") ? "mp4" : "webm";
  const file = new File([blob], `sayitoutloud-${Date.now()}.${ext}`, { type });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Recording" });
      cameraSaveBtn?.classList.add("hidden");
      setJoinStatus("Saved. Press Record for another take.");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      cameraSaveBtn?.classList.add("hidden");
      return;
    }
  }

  cameraSaveBtn?.classList.remove("hidden");
  setJoinStatus("Tap Save to keep the video on your phone.");
}

async function shareOrDownload() {
  if (!recState.blob) return;
  const blob = recState.blob;
  const type = blob.type || "video/webm";
  const ext = type.includes("mp4") ? "mp4" : "webm";
  const file = new File([blob], `sayitoutloud-${Date.now()}.${ext}`, { type });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Recording" });
      cameraSaveBtn?.classList.add("hidden");
      setJoinStatus("Saved. Press Record for another take.");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  cameraSaveBtn?.classList.add("hidden");
  setJoinStatus("Saved. Press Record for another take.");
}

function startPhoneRecord() {
  if (!camState.stream || recState.recording) return;
  if (typeof MediaRecorder !== "function") {
    setJoinStatus("This browser cannot save a video file. You can still see yourself on the computer.");
    connectPhone(camState.code, camState.stream);
    return;
  }

  recState.chunks = [];
  recState.blob = null;
  cameraSaveBtn?.classList.add("hidden");
  const mime = recorderMime();

  try {
    recState.recorder = mime
      ? new MediaRecorder(camState.stream, { mimeType: mime, videoBitsPerSecond: 3_500_000 })
      : new MediaRecorder(camState.stream);
  } catch {
    setJoinStatus("Could not start recording on this phone.");
    return;
  }

  recState.recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) recState.chunks.push(event.data);
  };
  recState.recorder.onerror = () => {
    setJoinStatus("Recording stopped unexpectedly.");
    setRecordingUi(false);
    stopRecTimer();
  };

  recState.recorder.start(250);
  recState.startedAt = Date.now();
  recState.timer = setInterval(tickRecTimer, 250);
  tickRecTimer();
  setRecordingUi(true);
  setJoinStatus("Recording. You're live on the computer.");
  if (!camState.phonePeer) connectPhone(camState.code, camState.stream);
}

function stopPhoneRecord() {
  if (!recState.recording) return;
  setRecordingUi(false);
  stopRecTimer();

  const recorder = recState.recorder;
  if (!recorder || recorder.state === "inactive") return;

  recorder.onstop = () => {
    const type = recorder.mimeType || "video/webm";
    const blob = new Blob(recState.chunks, { type });
    recState.recorder = null;
    if (!blob.size) {
      setJoinStatus("Nothing was saved. Press Record to try again.");
      return;
    }
    saveRecording(blob);
  };
  recorder.stop();
}

function togglePhoneRecord() {
  if (recState.recording) stopPhoneRecord();
  else startPhoneRecord();
}

async function startPhoneCamera(code) {
  if (cameraStarting || recState.recording) return;
  camState.code = code;
  if (!window.isSecureContext) {
    showCameraFallback("Phones need a secure link (HTTPS) to use the camera.");
    setJoinStatus("Open this site with https://, then enter the code.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraFallback("This browser cannot open the camera.");
    return;
  }

  cameraStarting = true;
  cameraCopy.textContent = "Opening camera…";
  cameraStartBtn.classList.add("hidden");

  try {
    if (camState.stream) {
      camState.stream.getTracks().forEach((track) => track.stop());
    }
    camState.stream = await getPhoneStream();
    cameraVideo.style.transform = camState.facing === "user" ? "scaleX(-1)" : "none";
    cameraVideo.srcObject = camState.stream;
    cameraVideo.classList.add("is-on");
    document.body.classList.add("camera-live");
    cameraVideo.play().catch(() => {});
    cameraForm.classList.add("hidden");
    cameraAppUi?.classList.remove("hidden");
    cameraCopy.textContent = "Press Record.";
    setJoinStatus("Press Record to start. You'll see yourself on the computer.");
    keepAwake();
    connectPhone(code, camState.stream);
  } catch (error) {
    document.body.classList.remove("camera-live");
    showCameraFallback("Tap Open camera to start.");
    if (error?.name === "NotAllowedError") {
      setJoinStatus("Allow camera access, then tap Open camera.");
    }
  } finally {
    cameraStarting = false;
  }
}

function bindCameraControls(code) {
  camState.code = code;
  if (cameraControlsBound) return;
  cameraControlsBound = true;
  cameraStartBtn.addEventListener("click", () => startPhoneCamera(camState.code));
  cameraFlipBtn.addEventListener("click", async () => {
    if (recState.recording) return;
    camState.facing = camState.facing === "user" ? "environment" : "user";
    await startPhoneCamera(camState.code);
  });
  cameraRecordBtn?.addEventListener("click", togglePhoneRecord);
  cameraSaveBtn?.addEventListener("click", shareOrDownload);
}

function initPhonePage(codeFromUrl) {
  document.body.classList.add("is-camera-page");
  editor.classList.add("hidden");
  prompter.classList.add("hidden");
  cameraJoin.classList.remove("hidden");

  const code = (codeFromUrl || "").trim().toUpperCase();
  if (!code) {
    cameraCopy.textContent = "Enter the code from your computer.";
    cameraForm.classList.remove("hidden");
    cameraStartBtn.classList.add("hidden");
    cameraForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const next = cameraCodeInput.value.trim().toUpperCase();
      if (next.length < 4) return;
      history.replaceState({}, "", `?cam=${next}`);
      cameraForm.classList.add("hidden");
      bindCameraControls(next);
      await startPhoneCamera(next);
    });
    return;
  }

  bindCameraControls(code);
  startPhoneCamera(code);
}

function setupDockDrag() {
  cameraDock.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".camera-orient")) return;
    camState.dragging = true;
    camState.moved = false;
    camState.dragOffsetX = event.clientX - camState.x;
    camState.dragOffsetY = event.clientY - camState.y;
    cameraDock.classList.add("is-dragging");
    cameraDock.setPointerCapture(event.pointerId);
  });

  cameraDock.addEventListener("pointermove", (event) => {
    if (!camState.dragging) return;
    const x = event.clientX - camState.dragOffsetX;
    const y = event.clientY - camState.dragOffsetY;
    if (!camState.moved && Math.hypot(x - camState.x, y - camState.y) < 4) return;
    camState.moved = true;
    camState.x = x;
    camState.y = y;
    clampDockPos();
  });

  const endDrag = (event) => {
    if (!camState.dragging) return;
    camState.dragging = false;
    cameraDock.classList.remove("is-dragging");
    if (cameraDock.hasPointerCapture?.(event.pointerId)) {
      cameraDock.releasePointerCapture(event.pointerId);
    }
    saveDockPos();
  };

  cameraDock.addEventListener("pointerup", endDrag);
  cameraDock.addEventListener("pointercancel", endDrag);
}

function initHostPage() {
  const savedOrient = localStorage.getItem(ORIENT_KEY);
  if (savedOrient === "horizontal" || savedOrient === "vertical") {
    setOrientation(savedOrient);
  }

  camBtn.addEventListener("click", toggleCamPanel);
  camCopyBtn.addEventListener("click", async () => {
    const url = joinUrl(camState.code);
    try {
      await navigator.clipboard.writeText(url);
      camCopyBtn.textContent = "Copied";
      setTimeout(() => {
        camCopyBtn.textContent = "Copy link";
      }, 1200);
    } catch {
      window.prompt("Copy this link", url);
    }
  });
  camNewBtn.addEventListener("click", () => startHost(true));
  orientVertical.addEventListener("click", () => setOrientation("vertical"));
  orientHorizontal.addEventListener("click", () => setOrientation("horizontal"));
  camHideBtn.addEventListener("click", () => setCameraHidden(true));
  camShowBtn.addEventListener("click", (event) => {
    if (camState.moved) {
      event.preventDefault();
      return;
    }
    setCameraHidden(false);
  });
  camUnhideBtn.addEventListener("click", () => setCameraHidden(false));
  camVisibilityBtn.addEventListener("click", () => setCameraHidden(!camState.hidden));
  setupDockDrag();
  window.addEventListener("resize", clampDockPos);
}

const camParam = new URLSearchParams(window.location.search).get("cam");
if (camParam !== null) initPhonePage(camParam);
else initHostPage();
