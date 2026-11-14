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
  camHintEl.textContent = "Phone connected. Drag the preview anywhere. Leave that page open while you record.";
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
    ? "Scan or open the unique link on your phone. Phones need HTTPS, so localhost will not unlock the camera."
    : "Scan the QR or open the unique link on your phone. Keep that page open.";
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
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: camState.facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };
  return navigator.mediaDevices.getUserMedia(constraints);
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

async function startPhoneCamera(code) {
  if (!window.isSecureContext) {
    cameraCopy.textContent = "Phones need a secure link (HTTPS) to use the camera.";
    setJoinStatus("Open this site with https://, then enter the code.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setJoinStatus("This browser cannot use the camera.");
    return;
  }

  try {
    if (camState.stream) {
      camState.stream.getTracks().forEach((track) => track.stop());
    }
    camState.stream = await getPhoneStream();
    cameraVideo.style.transform = camState.facing === "user" ? "scaleX(-1)" : "none";
    cameraVideo.srcObject = camState.stream;
    cameraVideo.classList.add("is-on");
    cameraVideo.play().catch(() => {});
    cameraStartBtn.classList.add("hidden");
    cameraFlipBtn.classList.remove("hidden");
    cameraForm.classList.add("hidden");
    cameraCopy.textContent = "Keep this page open while you record.";
    connectPhone(code, camState.stream);
  } catch (error) {
    setJoinStatus("Camera permission is needed to send video to your computer.");
  }
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
    cameraForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const next = cameraCodeInput.value.trim().toUpperCase();
      if (next.length < 4) return;
      window.location.search = `?cam=${next}`;
    });
    return;
  }

  cameraCopy.textContent = `Code ${code}. Allow the camera, then keep this page open.`;
  cameraStartBtn.addEventListener("click", () => startPhoneCamera(code));
  cameraFlipBtn.addEventListener("click", async () => {
    camState.facing = camState.facing === "user" ? "environment" : "user";
    await startPhoneCamera(code);
  });
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
