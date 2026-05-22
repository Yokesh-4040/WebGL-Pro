/* WebGL QA Panel Bridge Javascript */
(function () {
  // Global Configurations (Set default values, can be modified inside index.html)
  const config = window.QA_CONFIG || {
    convexUrl: "https://festive-mandrill-69.convex.site",
    projectName: "bits_exp_1",
    autoStartSession: true,
  };

  const API_UPLOAD_URL = `${config.convexUrl}/api/upload-url`;
  const API_BUG_REPORTS = `${config.convexUrl}/api/bug-reports`;
  const API_SESSIONS = `${config.convexUrl}/api/sessions`;

  // UI Setup & Elements
  let panelOpen = false;
  let startTime = Date.now();
  let accumulatedTime = 0;
  let timerInterval = null;

  // Media Capture variables
  let screenshotBlob = null;
  let videoBlob = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;

  // Error Console Storage
  let errorLogs = [];

  // Create UI Elements Programmatically
  function createUI() {
    // 1. Toggle Button
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "qa-toggle-btn";
    toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12a10 10 0 0 1 10-10z"></path>
        <path d="M12 6v6l4 2"></path>
      </svg>
      <span>Open QA Panel</span>
    `;
    document.body.appendChild(toggleBtn);

    // 2. Sidebar Panel
    const panel = document.createElement("div");
    panel.id = "qa-panel";
    panel.innerHTML = `
      <div id="qa-header">
        <h3 id="qa-header-title">
          <span>🛠️ WebGL QA Panel</span>
          <span id="qa-timer">00:00</span>
        </h3>
        <button id="qa-close-btn">&times;</button>
      </div>
      <div id="qa-body">
        <!-- Project Stats -->
        <div class="qa-section">
          <p class="qa-section-title">Active Target</p>
          <div style="font-size:11px; display:flex; justify-content:space-between;">
            <span>Project: <strong style="color:#60a5fa;">${config.projectName}</strong></span>
            <span style="opacity:0.6;">API: Cloud</span>
          </div>
        </div>

        <!-- Media Attachment Tools -->
        <div class="qa-section">
          <p class="qa-section-title">Media Attachments</p>
          <div class="qa-grid-2">
            <button type="button" class="qa-btn qa-btn-secondary" id="qa-btn-screenshot">
              📸 Screenshot
            </button>
            <button type="button" class="qa-btn qa-btn-secondary" id="qa-btn-video">
              🎥 Record
            </button>
          </div>
          <div class="qa-media-badges" id="qa-media-badges"></div>
        </div>

        <!-- Intercepted Errors Console -->
        <div id="qa-error-list"></div>

        <!-- Bug Submission Form -->
        <form class="qa-section" id="qa-bug-form">
          <p class="qa-section-title">Submit Bug Report</p>
          
          <div class="qa-form-group">
            <label>Bug Title</label>
            <input type="text" class="qa-input" id="qa-bug-title" placeholder="Physics collider failed..." required />
          </div>

          <div class="qa-grid-2">
            <div class="qa-form-group">
              <label>Category</label>
              <select class="qa-select" id="qa-bug-category">
                <option value="Visual">Visual</option>
                <option value="Audio">Audio</option>
                <option value="Physics">Physics</option>
                <option value="Performance">Performance</option>
                <option value="Script Error">Script Error</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="qa-form-group">
              <label>Severity</label>
              <select class="qa-select" id="qa-bug-severity">
                <option value="Low">Low</option>
                <option value="Medium" selected>Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div class="qa-form-group">
            <label>Reproduction & Details</label>
            <textarea class="qa-textarea" id="qa-bug-desc" placeholder="Provide steps to reproduce or crash description..." required></textarea>
          </div>

          <button type="submit" class="qa-btn" id="qa-btn-submit">
            📤 Submit Cloud Bug
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(panel);

    // 3. Toast Notifier
    const toast = document.createElement("div");
    toast.id = "qa-toast";
    document.body.appendChild(toast);

    // Setup Actions Event Listeners
    toggleBtn.addEventListener("click", () => togglePanel(true));
    document.getElementById("qa-close-btn").addEventListener("click", () => togglePanel(false));
    document.getElementById("qa-btn-screenshot").addEventListener("click", captureScreenshot);
    document.getElementById("qa-btn-video").addEventListener("click", toggleRecording);
    document.getElementById("qa-bug-form").addEventListener("submit", submitBugReport);
  }

  // Toast Functionality
  function showToast(msg, duration = 3000) {
    const toast = document.getElementById("qa-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.className = "show";
    setTimeout(() => {
      toast.className = "";
    }, duration);
  }

  // Panel Open / Close
  function togglePanel(open) {
    panelOpen = open;
    const panel = document.getElementById("qa-panel");
    const toggleBtn = document.getElementById("qa-toggle-btn");
    if (open) {
      panel.classList.add("open");
      toggleBtn.style.display = "none";
      startTimer();
    } else {
      panel.classList.remove("open");
      toggleBtn.style.display = "flex";
      stopTimer();
    }
  }

  // Active Session Timer
  function startTimer() {
    if (timerInterval) return;
    const timerElem = document.getElementById("qa-timer");
    timerInterval = setInterval(() => {
      const diff = Math.round((Date.now() - startTime) / 1000) + accumulatedTime;
      const mins = Math.floor(diff / 60).toString().padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      timerElem.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // Find Canvas Element (supports Unity built-in template structures)
  function getGameCanvas() {
    return document.querySelector("canvas#unity-canvas") || document.querySelector("canvas");
  }

  // Screenshot Capture
  function captureScreenshot() {
    const canvas = getGameCanvas();
    if (!canvas) {
      showToast("Game canvas not found!");
      return;
    }

    try {
      // Create a blob directly from canvas
      canvas.toBlob((blob) => {
        if (!blob || blob.size === 0) {
          showToast("Failed to capture: Canvas returned empty frame (Preserve Drawing Buffer must be enabled)");
          // Let's ask browser screen share stream as fallback if canvas is blank
          captureDisplayScreenshotFallback();
          return;
        }
        screenshotBlob = blob;
        updateMediaBadges();
        showToast("Screenshot captured from WebGL Canvas!");
      }, "image/png");
    } catch (e) {
      captureDisplayScreenshotFallback();
    }
  }

  // Fallback Screenshot using Display Stream
  async function captureDisplayScreenshotFallback() {
    try {
      showToast("Initiating Screen Frame Capture...");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.onloadedmetadata = () => {
        setTimeout(() => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            screenshotBlob = blob;
            updateMediaBadges();
            showToast("Screen Screenshot captured successfully!");
            stream.getTracks().forEach(t => t.stop());
          }, "image/png");
        }, 150);
      };
    } catch (err) {
      showToast("Screenshot capture cancelled or failed.");
    }
  }

  // Gameplay Video Recording
  async function toggleRecording() {
    const btn = document.getElementById("qa-btn-video");
    if (isRecording) {
      // Stop Recording
      if (mediaRecorder) mediaRecorder.stop();
      return;
    }

    // Start Recording
    const canvas = getGameCanvas();
    if (!canvas) {
      showToast("Game canvas not found!");
      return;
    }

    try {
      recordedChunks = [];
      showToast("Starting browser-native recording...");

      // Get video stream from canvas
      let stream;
      try {
        stream = canvas.captureStream(30); // 30 FPS stream from canvas directly
      } catch (err) {
        // Fallback to screen capture
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }

      const options = { mimeType: "video/webm; codecs=vp9" };
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        videoBlob = new Blob(recordedChunks, { type: "video/webm" });
        isRecording = false;
        btn.textContent = "🎥 Record";
        btn.className = "qa-btn qa-btn-secondary";
        updateMediaBadges();
        showToast("Video recording ready!");
      };

      mediaRecorder.start();
      isRecording = true;
      btn.textContent = "🛑 Stop";
      btn.className = "qa-btn qa-btn-destructive";
      showToast("Recording game canvas... press stop to finalize.");
    } catch (err) {
      showToast("Recording cancelled or failed.");
    }
  }

  // Media Badge Updates
  function updateMediaBadges() {
    const container = document.getElementById("qa-media-badges");
    container.innerHTML = "";

    if (screenshotBlob) {
      const badge = document.createElement("div");
      badge.className = "qa-badge";
      badge.innerHTML = `
        <span>📸 Screenshot Attached (${Math.round(screenshotBlob.size / 1024)} KB)</span>
        <button class="qa-badge-close" type="button" id="qa-clear-ss">&times;</button>
      `;
      container.appendChild(badge);
      document.getElementById("qa-clear-ss").onclick = () => {
        screenshotBlob = null;
        updateMediaBadges();
      };
    }

    if (videoBlob) {
      const badge = document.createElement("div");
      badge.className = "qa-badge";
      badge.innerHTML = `
        <span>🎥 Video Attached (${Math.round(videoBlob.size / 1024)} KB)</span>
        <button class="qa-badge-close" type="button" id="qa-clear-video">&times;</button>
      `;
      container.appendChild(badge);
      document.getElementById("qa-clear-video").onclick = () => {
        videoBlob = null;
        updateMediaBadges();
      };
    }
  }

  // Error Console Hooking
  function hookErrors() {
    const errContainer = document.getElementById("qa-error-list");

    function renderError(msg) {
      if (!errContainer) return;
      errContainer.style.display = "block";
      const entry = document.createElement("div");
      entry.className = "qa-error-entry";
      entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      errContainer.appendChild(entry);
      errContainer.scrollTop = errContainer.scrollHeight;
    }

    window.onerror = function (message, source, lineno, colno, error) {
      const stack = error ? error.stack : "";
      const formatted = `${message} (${source || "Unknown"}:${lineno}:${colno})\n${stack}`;
      errorLogs.push(formatted);
      renderError(message);
      return false;
    };

    const origConsoleError = console.error;
    console.error = function () {
      const args = Array.prototype.slice.call(arguments);
      const msg = args.join(" ");
      errorLogs.push(msg);
      renderError(msg);
      origConsoleError.apply(console, arguments);
    };
  }

  // Helper for Uploading Files to Convex Storage
  async function uploadFile(blob, mimeType) {
    // 1. Get secure Convex upload URL
    const responseUrl = await fetch(API_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!responseUrl.ok) throw new Error("Failed to allocate upload URL");
    const { uploadUrl } = await responseUrl.json();

    // 2. Upload file binary
    const responseBinary = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: blob,
    });
    if (!responseBinary.ok) throw new Error("Failed to transfer binary data");
    const { storageId } = await responseBinary.json();
    return storageId;
  }

  // Submit Bug Report to Cloud
  async function submitBugReport(e) {
    e.preventDefault();
    const title = document.getElementById("qa-bug-title").value.trim();
    const desc = document.getElementById("qa-bug-desc").value.trim();
    const category = document.getElementById("qa-bug-category").value;
    const severity = document.getElementById("qa-bug-severity").value;
    const submitBtn = document.getElementById("qa-btn-submit");

    if (!title || !desc) {
      showToast("Please fill all required fields", 3000);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading attachments...";

    try {
      let screenshotId = null;
      let videoId = null;

      // 1. Upload Attachments if present
      if (screenshotBlob) {
        showToast("Uploading Screenshot...");
        screenshotId = await uploadFile(screenshotBlob, "image/png");
      }

      if (videoBlob) {
        showToast("Uploading Video clip...");
        videoId = await uploadFile(videoBlob, "video/webm");
      }

      // 2. Post Metadata Payload to HTTP API Action
      showToast("Saving Cloud Bug Report...");
      submitBtn.textContent = "Saving Bug Report...";
      const bugPayload = {
        projectName: config.projectName,
        title: title,
        description: desc,
        category: category,
        severity: severity,
        screenshotId: screenshotId || undefined,
        videoId: videoId || undefined,
        consoleLogs: errorLogs.length > 0 ? errorLogs.join("\n") : undefined,
        timestamp: Date.now(),
      };

      const res = await fetch(API_BUG_REPORTS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bugPayload),
      });

      if (!res.ok) throw new Error("Could not log bug to cloud database");

      showToast("🚀 Bug submitted successfully!");
      // Reset form
      document.getElementById("qa-bug-form").reset();
      screenshotBlob = null;
      videoBlob = null;
      updateMediaBadges();
      const errList = document.getElementById("qa-error-list");
      if (errList) {
        errList.innerHTML = "";
        errList.style.display = "none";
      }
      togglePanel(false);
    } catch (err) {
      showToast(`Error: ${err.message || "Failed to submit bug"}`, 4000);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "📤 Submit Cloud Bug";
    }
  }

  // Auto Session log on unload
  function registerSessionLogging() {
    // Record session duration
    window.addEventListener("pagehide", () => {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      if (durationSeconds > 5) {
        const payload = JSON.stringify({
          projectName: config.projectName,
          startTime: startTime,
          duration: durationSeconds,
        });

        // Use keepalive fetch which persists after tab close
        fetch(API_SESSIONS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch((err) => console.error("Session logger failed:", err));
      }
    });
  }

  // Initialize script execution when DOM is ready
  function init() {
    createUI();
    hookErrors();
    if (config.autoStartSession) {
      registerSessionLogging();
    }
    console.log(`[WebGL QA Bridge] Initialized. Target project: ${config.projectName}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
