// Call Shield frontend. Three ways in:
//  - Listen to a call: listens to the microphone and analyses as the call goes on.
//  - Check a recording: uploads a recording, plays it, and analyses as it plays.
//  - Sample calls: plays a call; uses saved results if there are any, otherwise analyses live.
// Live analysis sends audio in chunks of at least chunk_seconds, never faster than the
// Gemini rate limit (rpm), so a call keeps working on the free tier.
//
// All screen text comes from STRINGS, and render() repaints from the `ui` state,
// so switching language updates everything at once.

const STRINGS = {
  gu: {
    brand: "કૉલ રક્ષક",
    idleTitle: "તૈયાર છે",
    idleMsg: "કૉલ આવે ત્યારે ફોન સ્પીકર પર મૂકો અને નીચેનું બટન દબાવો.",
    listenTitle: "કૉલ સાંભળો",
    listenSub: "ફોન સ્પીકર પર મૂકીને અહીં દબાવો",
    uploadTitle: "રેકોર્ડિંગ તપાસો",
    uploadSub: "કૉલનું રેકોર્ડિંગ પસંદ કરો",
    uploading: "રેકોર્ડિંગ ખુલી રહ્યું છે…",
    listening: "સાંભળી રહ્યું છે…",
    listeningMsg: "ફોન સ્પીકર પર આ ઉપકરણની પાસે રાખો. કંઈ ખોટું લાગશે તો અમે તરત કહીશું.",
    playing: "રેકોર્ડિંગ તપાસી રહ્યું છે…",
    playingMsg: "રેકોર્ડિંગ ચાલે છે. કંઈ ખોટું લાગશે તો અમે તરત કહીશું.",
    safeTitle: "અત્યાર સુધી બધું બરાબર છે",
    safeMsg: "સાંભળવાનું ચાલુ છે. યાદ રાખો: ફોન પર ક્યારેય OTP કે PIN ન આપશો.",
    warnTitle: "સાવધાન રહો",
    scamTitle: "આ ફ્રોડ કૉલ છે. ફોન કાપી નાખો.",
    endedSafe: "કૉલ પૂરો થયો. કોઈ ફ્રોડ સંભળાયું નહીં.",
    endedSafeMsg: "છતાં, ફોન પર ક્યારેય OTP, PIN કે પૈસા ન આપશો.",
    endedWarn: "કૉલ પૂરો થયો. આ કૉલ શંકાસ્પદ હતો.",
    endedScam: "આ ફ્રોડ કૉલ હતો.",
    stopped: "બંધ કર્યું",
    stoppedMsg: "ફરી શરૂ કરવા નીચેનું બટન દબાવો.",
    errorTitle: "કંઈક ખોટું થયું",
    micError: "માઇક્રોફોન ચાલુ ન થયો. બ્રાઉઝરમાં ઉપર માઇક્રોફોનની પરવાનગી આપો અને ફરી પ્રયાસ કરો.",
    uploadError: "આ ફાઇલ ખોલી ન શકાઈ. બીજી ઑડિયો ફાઇલ પસંદ કરો.",
    hangUp: "ફોન કાપો",
    call1930: "1930 પર ફોન કરો",
    stop: "બંધ કરો",
    stopListening: "સાંભળવાનું બંધ કરો",
    lvlSafe: "સુરક્ષિત",
    lvlWarn: "સાવધાન",
    lvlScam: "ફ્રોડ",
    heardTitle: "અમે આ ચેતવણીના સંકેતો સાંભળ્યા",
    transcript: "કૉલમાં શું બોલાયું તે જુઓ",
    samples: "નમૂના કૉલ",
    ready: "તૈયાર",
    new: "નવો",
    uploaded: "તમારું રેકોર્ડિંગ",
    noCalls: "હજી કોઈ કૉલ નથી.",
    settings: "સેટિંગ્સ",
    speakAloud: "ચેતવણી મોટેથી બોલીને સંભળાવો",
    fresh: "ફરીથી તપાસો (સાચવેલું પરિણામ ન વાપરો)",
    footer: "સાયબર ફ્રોડ હેલ્પલાઇન: 1930",
    timeLive: "સાંભળે છે · {t}",
    finishing: "છેલ્લો ભાગ તપાસી રહ્યું છે…",
    retrying: "થોડી વાર લાગે છે, ફરી પ્રયાસ કરે છે…",
    alertAt: "ચેતવણી {t} પર",
    risk: "જોખમ {n}/100",
  },
  hi: {
    brand: "कॉल रक्षक",
    idleTitle: "तैयार है",
    idleMsg: "कॉल आने पर फ़ोन स्पीकर पर रखें और नीचे का बटन दबाएँ।",
    listenTitle: "कॉल सुनें",
    listenSub: "फ़ोन स्पीकर पर रखकर यहाँ दबाएँ",
    uploadTitle: "रिकॉर्डिंग जाँचें",
    uploadSub: "कॉल की रिकॉर्डिंग चुनें",
    uploading: "रिकॉर्डिंग खुल रही है…",
    listening: "सुन रहा है…",
    listeningMsg: "फ़ोन स्पीकर पर इस डिवाइस के पास रखें। कुछ गलत लगा तो हम तुरंत बताएँगे।",
    playing: "रिकॉर्डिंग जाँच रहा है…",
    playingMsg: "रिकॉर्डिंग चल रही है। कुछ गलत लगा तो हम तुरंत बताएँगे।",
    safeTitle: "अब तक सब ठीक है",
    safeMsg: "सुनना जारी है। याद रखें: फ़ोन पर कभी OTP या PIN न बताएँ।",
    warnTitle: "सावधान रहें",
    scamTitle: "यह धोखाधड़ी कॉल है। फ़ोन काट दें।",
    endedSafe: "कॉल खत्म। कोई धोखाधड़ी नहीं सुनी।",
    endedSafeMsg: "फिर भी, फ़ोन पर कभी OTP, PIN या पैसे न दें।",
    endedWarn: "कॉल खत्म। यह कॉल संदिग्ध थी।",
    endedScam: "यह धोखाधड़ी कॉल थी।",
    stopped: "बंद किया",
    stoppedMsg: "फिर से शुरू करने के लिए नीचे का बटन दबाएँ।",
    errorTitle: "कुछ गड़बड़ हुई",
    micError: "माइक्रोफ़ोन चालू नहीं हुआ। ब्राउज़र में ऊपर माइक्रोफ़ोन की अनुमति दें और फिर कोशिश करें।",
    uploadError: "यह फ़ाइल खुल नहीं पाई। कोई दूसरी ऑडियो फ़ाइल चुनें।",
    hangUp: "फ़ोन काटें",
    call1930: "1930 पर कॉल करें",
    stop: "बंद करें",
    stopListening: "सुनना बंद करें",
    lvlSafe: "सुरक्षित",
    lvlWarn: "सावधान",
    lvlScam: "धोखाधड़ी",
    heardTitle: "हमने ये खतरे के संकेत सुने",
    transcript: "कॉल में क्या बोला गया, देखें",
    samples: "नमूना कॉल",
    ready: "तैयार",
    new: "नया",
    uploaded: "आपकी रिकॉर्डिंग",
    noCalls: "अभी कोई कॉल नहीं है।",
    settings: "सेटिंग्स",
    speakAloud: "चेतावनी बोलकर सुनाएँ",
    fresh: "फिर से जाँचें (सेव किया नतीजा इस्तेमाल न करें)",
    footer: "साइबर धोखाधड़ी हेल्पलाइन: 1930",
    timeLive: "सुन रहा है · {t}",
    finishing: "आखिरी हिस्सा जाँच रहा है…",
    retrying: "थोड़ा समय लग रहा है, फिर से कोशिश…",
    alertAt: "चेतावनी {t} पर",
    risk: "खतरा {n}/100",
  },
  en: {
    brand: "Call Shield",
    idleTitle: "Ready",
    idleMsg: "When a call comes, put the phone on speaker and press the button below.",
    listenTitle: "Listen to a call",
    listenSub: "Put the phone on speaker, then press here",
    uploadTitle: "Check a recording",
    uploadSub: "Choose a recording of a call",
    uploading: "Opening the recording…",
    listening: "Listening…",
    listeningMsg: "Keep the phone on speaker near this device. We will tell you at once if something is wrong.",
    playing: "Checking the recording…",
    playingMsg: "The recording is playing. We will tell you at once if something is wrong.",
    safeTitle: "Nothing wrong so far",
    safeMsg: "Still listening. Remember: never share an OTP or PIN on a call.",
    warnTitle: "Be careful",
    scamTitle: "This is a fraud call. Hang up.",
    endedSafe: "Call ended. No fraud heard.",
    endedSafeMsg: "Even so, never give an OTP, PIN or money over the phone.",
    endedWarn: "Call ended. This call was suspicious.",
    endedScam: "This was a fraud call.",
    stopped: "Stopped",
    stoppedMsg: "Press a button below to start again.",
    errorTitle: "Something went wrong",
    micError: "The microphone did not start. Allow microphone access in the browser bar above and try again.",
    uploadError: "This file could not be opened. Please choose another audio file.",
    hangUp: "Hang up",
    call1930: "Call 1930",
    stop: "Stop",
    stopListening: "Stop listening",
    lvlSafe: "Safe",
    lvlWarn: "Careful",
    lvlScam: "Fraud",
    heardTitle: "Warning signs we heard",
    transcript: "See what was said on the call",
    samples: "Sample calls",
    ready: "Ready",
    new: "New",
    uploaded: "Your recording",
    noCalls: "No calls yet.",
    settings: "Settings",
    speakAloud: "Read the warning out loud",
    fresh: "Check again (don't use saved results)",
    footer: "Cyber fraud helpline: 1930",
    timeLive: "Listening · {t}",
    finishing: "Checking the last part…",
    retrying: "Taking a little longer, trying again…",
    alertAt: "Warning at {t}",
    risk: "Risk {n}/100",
  },
};

const FLAG_LABELS = {
  URGENCY:            { gu: "જલદી કરવા દબાણ કરે છે",        hi: "जल्दी करने का दबाव डाला",       en: "Rushed you to act now" },
  THREAT:             { gu: "ધમકી આપી",                     hi: "धमकी दी",                       en: "Threatened you" },
  AUTHORITY_CLAIM:    { gu: "પોલીસ કે બેંક હોવાનો દાવો કર્યો",  hi: "पुलिस या बैंक होने का दावा किया", en: "Claimed to be police or a bank" },
  OTP_REQUEST:        { gu: "OTP માંગ્યો",                    hi: "OTP माँगा",                      en: "Asked for your OTP" },
  MONEY_REQUEST:      { gu: "પૈસા મોકલવા કહ્યું",               hi: "पैसे भेजने को कहा",               en: "Asked you to send money" },
  ISOLATION:          { gu: "કોઈને ન કહેવા કહ્યું",              hi: "किसी को न बताने को कहा",          en: "Told you to keep it secret" },
  REMOTE_ACCESS:      { gu: "એપ કે લિંક ખોલવા કહ્યું",           hi: "ऐप या लिंक खोलने को कहा",          en: "Asked you to open an app or link" },
  PERSONAL_DATA:      { gu: "આધાર કે બેંક વિગતો માંગી",         hi: "आधार या बैंक जानकारी माँगी",       en: "Asked for Aadhaar or bank details" },
  VIDEO_CALL_CUSTODY: { gu: "વીડિયો કૉલ પર 'ધરપકડ'ની વાત",       hi: "वीडियो कॉल पर 'गिरफ़्तारी' की बात", en: "Talked of 'arrest' on video call" },
};

const ICONS = {
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
  play: '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  stop: '<polygon points="7.9 2 16.1 2 22 7.9 22 16.1 16.1 22 7.9 22 2 16.1 2 7.9"/><path d="M15 9l-6 6"/><path d="m9 9 6 6"/>',
  upload: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
};
const icon = (name, size = 34) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const SAMPLE_RATE = 16000;
const $ = (id) => document.getElementById(id);
const player = $("player");

let cfg = { chunk_seconds: 5, overlap_seconds: 1, alert_threshold: 70, rpm: 5 };
let lang = loadLang();
let calls = [];
let run = null; // the call currently being played or listened to
// What the screen shows. phase: idle | uploading | running | ended | stopped | error
let ui = { phase: "idle", result: null, alertAt: null, errorKey: null };

const t = (key, vars = {}) =>
  (STRINGS[lang][key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

function loadLang() {
  try { return localStorage.getItem("lang") || "gu"; } catch { return "gu"; }
}

// ---------- setup ----------

async function init() {
  for (const b of document.querySelectorAll(".langs button")) {
    b.onclick = () => {
      lang = b.dataset.lang;
      try { localStorage.setItem("lang", lang); } catch {}
      render();
      renderCalls();
    };
  }
  $("micBtn").onclick = startMic;
  $("stopBtn").onclick = () => run && endRun(run, true);
  $("hangup").onclick = () => run && !run.ended && endRun(run, true);
  $("helpline").onclick = () => { window.location.href = "tel:1930"; };

  const drop = $("drop");
  $("fileInput").onchange = (e) => e.target.files[0] && uploadFile(e.target.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("dragover"); };
  drop.ondragleave = () => drop.classList.remove("dragover");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  };

  render();
  cfg = await (await fetch("/config")).json();
  await loadCalls();
}

async function loadCalls() {
  calls = await (await fetch("/calls")).json();
  renderCalls();
}

function prettyName(name) {
  return name.replace(/^uploads\//, "").replace(/\.wav$/, "").replace(/^(scam|genuine)_/, "")
    .replace(/_+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

// ---------- rendering ----------

function render() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll(".langs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));

  const active = run && !run.ended;
  const r = ui.result;
  const verdict = r?.verdict;
  let tone = "", ic = "shield", title = t("idleTitle"), msg = t("idleMsg");

  if (ui.phase === "uploading") {
    tone = "is-listening"; ic = "upload"; title = t("uploading"); msg = "";
  } else if (ui.phase === "error") {
    tone = "is-warn"; ic = "warn"; title = t("errorTitle"); msg = t(ui.errorKey);
  } else if (ui.phase === "running" || ui.phase === "ended" || ui.phase === "stopped") {
    const ended = ui.phase !== "running";
    const warning = r?.[`warning_${lang}`];
    if (verdict === "SCAM") {
      tone = "is-danger"; ic = "stop"; title = ended ? t("endedScam") : t("scamTitle"); msg = warning;
    } else if (verdict === "SUSPICIOUS") {
      tone = "is-warn"; ic = "warn"; title = ended ? t("endedWarn") : t("warnTitle"); msg = warning;
    } else if (verdict === "SAFE") {
      tone = "is-safe"; ic = "check";
      title = ended ? t("endedSafe") : t("safeTitle");
      msg = ended ? t("endedSafeMsg") : t("safeMsg");
    } else if (ended) {
      title = t("stopped"); msg = t("stoppedMsg");
    } else {
      const mic = run?.mode === "mic";
      tone = "is-listening"; ic = mic ? "mic" : "play";
      title = mic ? t("listening") : t("playing");
      msg = mic ? t("listeningMsg") : t("playingMsg");
    }
  }

  const card = $("status");
  card.className = `status ${tone}${ui.alarm ? " alarm" : ""}`;
  $("statusIcon").innerHTML = icon(ic);
  $("statusTitle").textContent = title;
  $("statusMsg").textContent = msg || "";
  $("statusMsg").classList.toggle("hidden", !msg);

  $("callActions").classList.toggle("hidden", !(verdict === "SCAM" || verdict === "SUSPICIOUS"));
  $("hangup").classList.toggle("hidden", !active);
  const showScale = ["running", "ended", "stopped"].includes(ui.phase) && !!verdict;
  $("scale").classList.toggle("hidden", !showScale);
  document.querySelectorAll("#scale div").forEach((d) => {
    const on = d.dataset.level === verdict;
    d.className = on ? { SAFE: "on-safe", SUSPICIOUS: "on-warn", SCAM: "on-danger" }[verdict] : "";
  });
  $("player").classList.toggle("hidden", !(run && run.mode !== "mic" && ui.phase !== "idle"));

  $("choices").classList.toggle("hidden", !!active || ui.phase === "uploading");
  $("stopBtn").classList.toggle("hidden", !active);
  $("stopBtn").querySelector("span").textContent = run?.mode === "mic" ? t("stopListening") : t("stop");

  const flags = r?.red_flags || [];
  $("heard").classList.toggle("hidden", !flags.length);
  $("flags").innerHTML = flags.map((f) => {
    const label = FLAG_LABELS[f.type]?.[lang] || f.type;
    return `<li><span class="ic">${icon("warn", 26)}</span><span><b>${escapeHtml(label)}</b><q>${escapeHtml(f.evidence)}</q></span></li>`;
  }).join("");
  $("transcriptBox").classList.toggle("hidden", !$("transcript").children.length);

  renderMeta();
}

function renderMeta() {
  let left = "";
  if (run && !run.ended) {
    if (run.retrying) left = t("retrying");
    else if (run.done?.() && run.mode !== "replay") left = t("finishing");
    else if (run.mode === "mic" && run.now) left = `<span class="live-dot"></span>${t("timeLive", { t: fmtTime(run.now()) })}`;
  }
  const right = [
    ui.alertAt != null ? t("alertAt", { t: fmtTime(ui.alertAt) }) : "",
    ui.result ? t("risk", { n: ui.result.max_risk }) : "",
  ].filter(Boolean).join(" · ");
  $("metaLeft").innerHTML = left;
  $("metaRight").textContent = right;
}

function renderCalls() {
  const box = $("calls");
  if (!calls.length) {
    box.innerHTML = `<p class="empty">${t("noCalls")}</p>`;
    return;
  }
  box.innerHTML = "";
  for (const c of calls) {
    const b = document.createElement("button");
    b.className = "sample";
    b.classList.toggle("active", run?.callName === c.name);
    b.innerHTML =
      `<span>${escapeHtml(prettyName(c.name))}<small>${c.uploaded ? t("uploaded") : escapeHtml(c.name)}</small></span>` +
      `<span class="tag ${c.saved ? "ready" : "new"}">${c.saved ? t("ready") : t("new")}</span>`;
    b.onclick = () => playCall(c);
    box.appendChild(b);
  }
}

function appendTranscript(start, text) {
  const p = document.createElement("p");
  p.innerHTML = `<time>${fmtTime(start)}</time>${escapeHtml(text)}`;
  const box = $("transcript");
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

// ---------- run lifecycle ----------

function newRun(mode, callName = null) {
  if (run && !run.ended) endRun(run, false);
  $("transcript").innerHTML = "";
  speechSynthesis.cancel();
  run = {
    mode, callName, sessionId: crypto.randomUUID(),
    pcm: null, lastEnd: 0, lastSent: 0, busy: false, ended: false, retrying: false, timer: null,
  };
  ui = { phase: "running", result: null, alertAt: null, errorKey: null };
  renderCalls();
  render();
  return run;
}

// Stop audio/mic and close the server session. A recording analysed to the end is saved for replay.
async function endRun(r, byUser) {
  if (r.ended) return;
  r.ended = true;
  clearInterval(r.timer);
  if (r.mode === "mic") stopMic(r);
  else player.pause();
  player.volume = 1;

  if (r === run) {
    ui.phase = byUser && !(r.mode !== "mic" && player.ended) ? "stopped" : "ended";
    if (ui.phase === "stopped" && !ui.result) ui.phase = "idle";
    render();
  }
  if (r.mode !== "replay") {
    const form = new FormData();
    form.append("session_id", r.sessionId);
    if (!byUser && r.mode === "file" && player.ended) form.append("call_name", r.callName);
    const res = await (await fetch("/finish", { method: "POST", body: form })).json();
    if (res.saved) loadCalls();
  }
}

function showError(key, detail) {
  if (detail) console.warn(detail);
  ui = { phase: "error", result: null, alertAt: null, errorKey: key };
  render();
}

// ---------- sample calls + upload ----------

async function playCall(call) {
  const saved = !$("fresh").checked && call.saved
    ? await fetch(`/saved/${encodeURIComponent(call.name)}`).then((r) => (r.ok ? r.json() : null))
    : null;
  const r = newRun(saved ? "replay" : "file", call.name);
  player.src = call.url;
  player.currentTime = 0;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (saved) {
    r.entries = saved.entries;
    r.next = 0;
    r.done = () => player.ended;
    await player.play();
    r.timer = setInterval(() => replayTick(r), 100);
    return;
  }

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const buf = await ctx.decodeAudioData(await (await fetch(call.url)).arrayBuffer());
  ctx.close();
  if (r !== run || r.ended) return; // another call was started while decoding
  r.pcm = toMono(buf);
  r.now = () => player.currentTime;
  r.done = () => player.ended;
  await player.play();
  startStreaming(r);
}

// Show each saved result when playback reaches the end of the chunk it came from.
function replayTick(r) {
  if (r.ended) return;
  while (r.next < r.entries.length && (player.ended || r.entries[r.next].end <= player.currentTime + 0.05)) {
    const e = r.entries[r.next++];
    onResult(r, e.start, e.result);
  }
  if (player.ended && r.next >= r.entries.length) endRun(r, false);
}

async function uploadFile(file) {
  if (run && !run.ended) endRun(run, false);
  ui = { phase: "uploading", result: null, alertAt: null, errorKey: null };
  render();
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return showError("uploadError", data.detail);
    await loadCalls();
    playCall(data);
  } catch (e) {
    showError("uploadError", e);
  } finally {
    $("fileInput").value = "";
  }
}

// ---------- live microphone ----------

async function startMic() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    return showError("micError", e);
  }
  const r = newRun("mic");
  let ctx, src;
  try {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    src = ctx.createMediaStreamSource(stream);
  } catch {
    ctx?.close();
    ctx = new AudioContext(); // browsers that can't resample the mic: record at the native rate
    src = ctx.createMediaStreamSource(stream);
  }
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const rec = { data: new Float32Array(ctx.sampleRate * 60), length: 0 };
  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    if (rec.length + input.length > rec.data.length) {
      const bigger = new Float32Array(rec.data.length * 2);
      bigger.set(rec.data.subarray(0, rec.length));
      rec.data = bigger;
    }
    rec.data.set(input, rec.length);
    rec.length += input.length;
  };
  src.connect(proc);
  proc.connect(ctx.destination); // the processor only runs while connected; it outputs silence

  Object.assign(r, { stream, ctx, src, proc, rec, rate: ctx.sampleRate, micStopped: false });
  r.now = () => rec.length / r.rate;
  r.done = () => r.micStopped;
  r.getPcm = () => rec.data;
  render();
  startStreaming(r);
}

function stopMic(r) {
  r.micStopped = true;
  r.stream?.getTracks().forEach((tr) => tr.stop());
  r.proc?.disconnect();
  r.src?.disconnect();
  r.ctx?.close();
}

// ---------- rate-aware streaming to /analyze ----------

function startStreaming(r) {
  const minGapMs = 60000 / cfg.rpm;
  r.timer = setInterval(() => {
    if (r.ended) return;
    renderMeta();
    if (r.busy) return;
    const now = r.now();
    const pending = now - r.lastEnd;
    const gapOk = Date.now() - r.lastSent >= minGapMs;
    if (r.done()) {
      if (pending > 0.3 && gapOk) sendChunk(r, now);
      else if (pending <= 0.3) endRun(r, false);
    } else if (pending >= cfg.chunk_seconds && gapOk) {
      sendChunk(r, now);
    }
  }, 250);
}

async function sendChunk(r, end) {
  const prevEnd = r.lastEnd;
  const start = Math.max(0, prevEnd - cfg.overlap_seconds);
  const rate = r.rate || SAMPLE_RATE;
  const pcm = r.getPcm ? r.getPcm() : r.pcm;
  const wav = encodeWav(pcm.subarray(Math.floor(start * rate), Math.floor(end * rate)), rate);
  r.busy = true;
  r.lastEnd = end;
  r.lastSent = Date.now();

  const form = new FormData();
  form.append("session_id", r.sessionId);
  form.append("start", start.toFixed(2));
  form.append("end", end.toFixed(2));
  form.append("audio", wav, "chunk.wav");
  try {
    const res = await fetch("/analyze", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    r.retrying = false;
    if (r === run && !r.ended) onResult(r, start, data);
  } catch (e) {
    r.lastEnd = prevEnd; // keep that audio; it goes out with the next chunk
    r.retrying = true;
    console.warn("analyze failed, will retry:", e.message);
  } finally {
    r.busy = false;
  }
}

function onResult(r, start, data) {
  if (data.chunk_transcript) appendTranscript(start, data.chunk_transcript);
  const wasScam = ui.result?.verdict === "SCAM";
  ui.result = data;
  if (data.verdict === "SCAM" && !wasScam) {
    ui.alertAt = r.mode === "mic" ? r.now() : player.currentTime;
    ui.alarm = true; // flash the card a few times, then hold steady red
    setTimeout(() => { ui.alarm = false; render(); }, 2600);
    beep();
    if ($("speak").checked) speakWarning(data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  render();
}

// ---------- audio helpers ----------

function toMono(buf) {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
  }
  return out;
}

// 16-bit PCM mono WAV encoder.
function encodeWav(samples, rate) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o, s) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

function beep() {
  const ctx = new AudioContext();
  [0, 0.3, 0.6].forEach((at) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; o.type = "square";
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.18);
  });
  setTimeout(() => ctx.close(), 1500);
}

// Read the warning in the chosen language; fall back to Hindi when there is no Gujarati voice.
function speakWarning(data) {
  if (!("speechSynthesis" in window)) return;
  const voices = speechSynthesis.getVoices();
  const find = (code) => voices.find((v) => v.lang.replace("_", "-").startsWith(code));
  let text = data[`warning_${lang}`], voice = find({ gu: "gu", hi: "hi", en: "en-IN" }[lang]);
  if (lang === "gu" && !voice) { text = data.warning_hi; voice = find("hi"); }
  if (lang === "en" && !voice) voice = find("en");
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  player.volume = 0.25; // duck the call audio while the warning is read
  u.onend = () => { player.volume = 1; };
  setTimeout(() => speechSynthesis.speak(u), 1000);
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

init();
