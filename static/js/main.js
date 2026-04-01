// main.js - fixed: one camera at a time, gesture capture working

const startCamEncBtn = document.getElementById('startCamEnc');
const captureEncBtn = document.getElementById('captureEnc');
const videoEnc = document.getElementById('videoEnc');
const canvasEnc = document.getElementById('canvasEnc');
const gestureEncSpan = document.getElementById('gestureEnc');

const startCamDecBtn = document.getElementById('startCamDec');
const captureDecBtn = document.getElementById('captureDec');
const videoDec = document.getElementById('videoDec');
const canvasDec = document.getElementById('canvasDec');
const gestureDecSpan = document.getElementById('gestureDec');

let streamEnc = null;
let streamDec = null;

// Stop a running camera stream
function stopStream(stream, videoEl) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  if (videoEl) {
    videoEl.srcObject = null;
    videoEl.style.display = 'none';
  }
}

async function startCameraFor(videoEl) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (e) {
    alert('Could not open webcam. Please allow camera access in your browser.');
    throw e;
  }
}

// ── ENCRYPT camera ──
startCamEncBtn.onclick = async () => {
  try {
    // Stop decrypt camera if running
    if (streamDec) {
      stopStream(streamDec, videoDec);
      streamDec = null;
      captureDecBtn.disabled = true;
      gestureDecSpan.textContent = 'gesture: —';
    }
    // Stop encrypt camera if already running (toggle off)
    if (streamEnc) {
      stopStream(streamEnc, videoEnc);
      streamEnc = null;
      captureEncBtn.disabled = true;
      startCamEncBtn.textContent = 'Open webcam (capture)';
      return;
    }
    streamEnc = await startCameraFor(videoEnc);
    videoEnc.style.display = 'block';
    captureEncBtn.disabled = false;
    startCamEncBtn.textContent = 'Close webcam';
  } catch (e) {}
};

captureEncBtn.onclick = async () => {
  const w = videoEnc.videoWidth;
  const h = videoEnc.videoHeight;
  if (!w || !h) { alert('Webcam not ready yet, please wait a moment.'); return; }

  canvasEnc.width = w;
  canvasEnc.height = h;
  const ctx = canvasEnc.getContext('2d');
  ctx.drawImage(videoEnc, 0, 0, w, h);

  gestureEncSpan.textContent = 'gesture: detecting...';

  canvasEnc.toBlob(async (blob) => {
    try {
      const fd = new FormData();
      fd.append('snapshot', blob, 'snap.png');
      const res = await fetch('/api/estimate', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok) {
        gestureEncSpan.textContent = `gesture: ${j.count} finger(s)`;
        gestureEncSpan.dataset.gesture = j.count;
        // Stop camera after capture
        stopStream(streamEnc, videoEnc);
        streamEnc = null;
        captureEncBtn.disabled = true;
        startCamEncBtn.textContent = 'Open webcam (capture)';
      } else {
        gestureEncSpan.textContent = 'gesture: failed';
        alert(j.error || 'Failed to detect gesture. Make sure your hand is visible.');
      }
    } catch (e) {
      gestureEncSpan.textContent = 'gesture: error';
      alert('Error detecting gesture: ' + e);
    }
  }, 'image/png');
};

// ── DECRYPT camera ──
startCamDecBtn.onclick = async () => {
  try {
    // Stop encrypt camera if running
    if (streamEnc) {
      stopStream(streamEnc, videoEnc);
      streamEnc = null;
      captureEncBtn.disabled = true;
      gestureEncSpan.textContent = 'gesture: —';
      startCamEncBtn.textContent = 'Open webcam (capture)';
    }
    // Stop decrypt camera if already running (toggle off)
    if (streamDec) {
      stopStream(streamDec, videoDec);
      streamDec = null;
      captureDecBtn.disabled = true;
      startCamDecBtn.textContent = 'Open webcam (capture)';
      return;
    }
    streamDec = await startCameraFor(videoDec);
    videoDec.style.display = 'block';
    captureDecBtn.disabled = false;
    startCamDecBtn.textContent = 'Close webcam';
  } catch (e) {}
};

captureDecBtn.onclick = async () => {
  const w = videoDec.videoWidth;
  const h = videoDec.videoHeight;
  if (!w || !h) { alert('Webcam not ready yet, please wait a moment.'); return; }

  canvasDec.width = w;
  canvasDec.height = h;
  const ctx = canvasDec.getContext('2d');
  ctx.drawImage(videoDec, 0, 0, w, h);

  gestureDecSpan.textContent = 'gesture: detecting...';

  canvasDec.toBlob(async (blob) => {
    try {
      const fd = new FormData();
      fd.append('snapshot', blob, 'snap2.png');
      const res = await fetch('/api/estimate', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok) {
        gestureDecSpan.textContent = `gesture: ${j.count} finger(s)`;
        gestureDecSpan.dataset.gesture = j.count;
        // Stop camera after capture
        stopStream(streamDec, videoDec);
        streamDec = null;
        captureDecBtn.disabled = true;
        startCamDecBtn.textContent = 'Open webcam (capture)';
      } else {
        gestureDecSpan.textContent = 'gesture: failed';
        alert(j.error || 'Failed to detect gesture. Make sure your hand is visible.');
      }
    } catch (e) {
      gestureDecSpan.textContent = 'gesture: error';
      alert('Error detecting gesture: ' + e);
    }
  }, 'image/png');
};

// ── ENCRYPT ──
document.getElementById('encryptBtn').onclick = async () => {
  const coverInput = document.getElementById('cover');
  const message = document.getElementById('message').value;
  const pass = document.getElementById('pass_enc').value;
  const encStatus = document.getElementById('encStatus');

  if (!coverInput.files.length) { alert('Choose a cover image'); return; }
  if (!message || !pass) { alert('Enter message and passcode'); return; }
  if (gestureEncSpan.dataset.gesture === undefined) {
    alert('Please capture your gesture first using the webcam!'); return;
  }

  encStatus.textContent = 'Encrypting...';

  const fd = new FormData();
  fd.append('cover', coverInput.files[0]);
  fd.append('message', message);
  fd.append('passcode', pass);
  fd.append('gesture', gestureEncSpan.dataset.gesture);

  try {
    const res = await fetch('/api/encrypt', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      encStatus.textContent = 'Error: ' + (err.error || 'Failed to encrypt');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'stego_encrypted.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    encStatus.textContent = 'Encrypted file downloaded successfully!';
  } catch (e) {
    encStatus.textContent = 'Error: ' + e;
  }
};

// ── DECRYPT ──
document.getElementById('decryptBtn').onclick = async () => {
  const stegoInput = document.getElementById('stego');
  const pass = document.getElementById('pass_dec').value;
  const decStatus = document.getElementById('decStatus');

  if (!stegoInput.files.length) { alert('Choose a stego image'); return; }
  if (!pass) { alert('Enter passcode'); return; }
  if (gestureDecSpan.dataset.gesture === undefined) {
    alert('Please capture your gesture first using the webcam!'); return;
  }

  decStatus.textContent = 'Decrypting...';

  const fd = new FormData();
  fd.append('stego', stegoInput.files[0]);
  fd.append('passcode', pass);
  fd.append('gesture', gestureDecSpan.dataset.gesture);

  try {
    const res = await fetch('/api/decrypt', { method: 'POST', body: fd });
    const j = await res.json();
    if (res.ok && j.success) {
      decStatus.textContent = 'Decrypted message: ' + j.message;
    } else {
      decStatus.textContent = 'Error: ' + (j.message || j.error || 'Failed to decrypt');
    }
  } catch (e) {
    decStatus.textContent = 'Error: ' + e;
  }
};
