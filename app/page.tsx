"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LogKind = "command" | "event" | "success" | "warning" | "error" | "info";
type LogEntry = { id: number; time: string; kind: LogKind; message: string; data?: unknown };
type PhoneApi = Record<string, unknown>;
type SDK = { ApplyConfig?: (config: { login: string; password: string }) => void; Phone?: PhoneApi };

declare global {
  interface Window {
    MightyCallWebPhone?: SDK;
  }
}

const SDK_URL = "https://ccapi.mightycall.com/v4/sdk/mightycall.webphone.sdk.js";
const EVENT_NAMES = [
  "OnReady",
  "OnOffline",
  "OnError",
  "OnFail",
  "OnCallIncoming",
  "OnCallOutgoing",
  "OnCallStarted",
  "OnCallCompleted",
  "OnCallRejected",
  "OnAccept",
  "OnHangUp",
  "OnHold",
  "OnUnHold",
  "OnMute",
  "OnUnMute",
  "OnLoadConfig",
  "CallPartiesChanged",
  "OnStatusChange",
  "OnInactive",
];

function serialize(value: unknown) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [userKey, setUserKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [sdkUrl, setSdkUrl] = useState(SDK_URL);
  const [number, setNumber] = useState("");
  const [mode, setMode] = useState<"inline" | "modal">("inline");
  const [sdkState, setSdkState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [initialized, setInitialized] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState("Not initialized");
  const [callState, setCallState] = useState<"idle" | "calling" | "active">("idle");
  const [callSeconds, setCallSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [micState, setMicState] = useState("Not checked");
  const [popupState, setPopupState] = useState("Not checked");
  const [online, setOnline] = useState(true);
  const [secureContext, setSecureContext] = useState(false);
  const [methodNames, setMethodNames] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logId = useRef(0);
  const logEnd = useRef<HTMLDivElement>(null);
  const wired = useRef(false);

  const addLog = useCallback((kind: LogKind, message: string, data?: unknown) => {
    setLogs((current) => [
      ...current,
      { id: ++logId.current, time: new Date().toLocaleTimeString([], { hour12: false }), kind, message, data },
    ]);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOnline(navigator.onLine);
      setSecureContext(window.isSecureContext);
    });
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    if (autoScroll) logEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs, autoScroll]);

  useEffect(() => {
    if (callState === "idle") return;
    const timer = window.setInterval(() => setCallSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  const phone = () => window.MightyCallWebPhone?.Phone;

  const hasMethod = useCallback((name: string) => typeof phone()?.[name] === "function", []);

  const invoke = useCallback(
    (name: string, ...args: unknown[]) => {
      const fn = phone()?.[name];
      if (typeof fn !== "function") {
        addLog("warning", `${name}() is not exposed by this SDK version.`);
        return undefined;
      }
      try {
        addLog("command", `${name}(${args.map(serialize).join(", ")})`);
        return (fn as (...values: unknown[]) => unknown)(...args);
      } catch (error) {
        addLog("error", `${name}() failed`, error instanceof Error ? error.message : String(error));
        return undefined;
      }
    },
    [addLog],
  );

  const wireEvents = useCallback(() => {
    if (wired.current) return;
    const api = phone();
    if (!api) return;
    let attached = 0;
    EVENT_NAMES.forEach((eventName) => {
      const event = api[eventName] as { subscribe?: (callback: (payload: unknown) => void) => void } | undefined;
      if (event?.subscribe) {
        event.subscribe((payload) => {
          const kind: LogKind = eventName.includes("Error") || eventName.includes("Fail") ? "error" : "event";
          addLog(kind, eventName, payload);
          if (eventName === "OnCallStarted" || eventName === "OnAccept") setCallState("active");
          if (eventName === "OnCallCompleted" || eventName === "OnCallRejected" || eventName === "OnHangUp") {
            setCallState("idle");
            setCallSeconds(0);
          }
          if (eventName === "OnStatusChange") setPhoneStatus(serialize(payload) || "Status changed");
          if (eventName === "OnReady") setPhoneStatus("Ready");
          if (eventName === "OnOffline") setPhoneStatus("Offline");
        });
        attached += 1;
      }
    });
    wired.current = true;
    addLog("success", `Attached ${attached} SDK event listeners.`);
  }, [addLog]);

  const loadSdk = () => {
    if (window.MightyCallWebPhone?.Phone) {
      setSdkState("loaded");
      setMethodNames(Object.keys(window.MightyCallWebPhone.Phone).sort());
      wireEvents();
      addLog("info", "SDK is already loaded.");
      return;
    }
    if (!sdkUrl.startsWith("https://")) {
      addLog("error", "SDK URL must use HTTPS.");
      return;
    }
    setSdkState("loading");
    addLog("command", "Loading SDK", sdkUrl);
    const script = document.createElement("script");
    script.src = sdkUrl;
    script.async = true;
    script.dataset.mcSdk = "true";
    script.onload = () => {
      const api = window.MightyCallWebPhone?.Phone;
      if (!api) {
        setSdkState("error");
        addLog("error", "Script loaded, but MightyCallWebPhone.Phone was not found.");
        return;
      }
      setSdkState("loaded");
      const names = Object.keys(api).sort();
      setMethodNames(names);
      addLog("success", `SDK loaded successfully. ${names.length} Phone members detected.`);
      wireEvents();
    };
    script.onerror = () => {
      setSdkState("error");
      addLog("error", "SDK failed to load. Check the URL, CSP, DNS, or network access.");
    };
    document.head.appendChild(script);
  };

  const initialize = () => {
    if (!window.MightyCallWebPhone?.Phone || !window.MightyCallWebPhone.ApplyConfig) {
      addLog("warning", "Load the SDK before initializing.");
      return;
    }
    if (!apiKey.trim() || !userKey.trim()) {
      addLog("warning", "Enter both the Account API Key and User Key.");
      return;
    }
    try {
      window.MightyCallWebPhone.ApplyConfig({ login: apiKey.trim(), password: userKey.trim() });
      addLog("command", "ApplyConfig({ login, password: •••••••• })");
      const init = phone()?.Init;
      if (typeof init !== "function") throw new Error("Phone.Init is unavailable.");
      if (mode === "inline") (init as (container: string) => void)("mcContainer");
      else (init as () => void)();
      setInitialized(true);
      setPhoneStatus("Initialized");
      addLog("success", `Phone.Init(${mode === "inline" ? '"mcContainer"' : ""}) completed in ${mode} mode.`);
      window.setTimeout(refreshStatus, 500);
    } catch (error) {
      addLog("error", "Initialization failed", error instanceof Error ? error.message : String(error));
    }
  };

  const refreshStatus = () => {
    const value = invoke("Status");
    if (value !== undefined) {
      setPhoneStatus(serialize(value) || "Ready");
      addLog("info", "Current phone status", value);
    }
  };

  const runBrowserChecks = async () => {
    addLog("info", "Running browser diagnostics…");
    if (!window.isSecureContext) addLog("error", "Page is not in a secure context; microphone access may fail.");
    else addLog("success", "Secure context confirmed.");
    addLog(navigator.onLine ? "success" : "error", navigator.onLine ? "Browser reports network online." : "Browser reports network offline.");
    const popup = window.open("about:blank", "mcSdkPopupTest", "width=280,height=180");
    if (popup) {
      popup.close();
      setPopupState("Allowed");
      addLog("success", "Popup test passed.");
    } else {
      setPopupState("Blocked");
      addLog("warning", "Popup was blocked. Modal SDK mode may need site permission.");
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia is unavailable.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      setMicState(track?.label ? `Ready: ${track.label}` : "Ready");
      addLog("success", "Microphone permission and audio track are available.", track?.label || undefined);
      stream.getTracks().forEach((item) => item.stop());
    } catch (error) {
      setMicState("Blocked / unavailable");
      addLog("error", "Microphone check failed", error instanceof Error ? error.message : String(error));
    }
  };

  const startCall = () => {
    if (!number.trim()) {
      addLog("warning", "Enter a destination number first.");
      return;
    }
    const result = invoke("Call", number.trim());
    if (hasMethod("Focus")) invoke("Focus");
    if (result !== undefined || hasMethod("Call")) {
      setCallState("calling");
      setCallSeconds(0);
    }
  };

  const hangUp = () => {
    invoke("HangUp");
    setCallState("idle");
    setCallSeconds(0);
    setHeld(false);
    setMuted(false);
  };

  const toggleMute = () => {
    const next = !muted;
    const candidates = next ? ["Mute", "MicrophoneOff"] : ["UnMute", "Unmute", "MicrophoneOn"];
    const method = candidates.find(hasMethod);
    if (method) {
      invoke(method);
      setMuted(next);
    } else addLog("warning", `No ${next ? "mute" : "unmute"} method detected.`);
  };

  const toggleHold = () => {
    const next = !held;
    const candidates = next ? ["Hold", "HoldCall"] : ["UnHold", "Unhold", "Resume", "ResumeCall"];
    const method = candidates.find(hasMethod);
    if (method) {
      invoke(method);
      setHeld(next);
    } else addLog("warning", `No ${next ? "hold" : "resume"} method detected.`);
  };

  const sendDtmf = (digit: string) => {
    const method = ["SendDTMF", "SendDtmf", "DTMF", "Dtmf"].find(hasMethod);
    if (method) invoke(method, digit);
    else addLog("warning", `DTMF ${digit} not sent: no DTMF method detected.`);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      const matchesKind =
        logFilter === "all" ||
        (logFilter === "errors" && (entry.kind === "error" || entry.kind === "warning")) ||
        entry.kind === logFilter;
      const query = logSearch.toLowerCase();
      return matchesKind && (!query || `${entry.message} ${serialize(entry.data)}`.toLowerCase().includes(query));
    });
  }, [logs, logFilter, logSearch]);

  const exportLogs = () => {
    const content = logs.map((item) => `[${item.time}] ${item.kind.toUpperCase()} ${item.message}${item.data === undefined ? "" : `\n${serialize(item.data)}`}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `mightycall-sdk-log-${new Date().toISOString().replaceAll(":", "-")}.txt`;
    link.click();
    URL.revokeObjectURL(href);
    addLog("info", "Log exported to a text file.");
  };

  const copyLogs = async () => {
    const content = logs.map((item) => `[${item.time}] ${item.kind.toUpperCase()} ${item.message} ${serialize(item.data)}`).join("\n");
    await navigator.clipboard.writeText(content);
    addLog("success", "Log copied to clipboard.");
  };

  const resetSession = () => {
    setApiKey("");
    setUserKey("");
    setNumber("");
    setInitialized(false);
    setPhoneStatus("Not initialized");
    setCallState("idle");
    setCallSeconds(0);
    setMuted(false);
    setHeld(false);
    setLogs([]);
    addLog("info", "Session fields and log cleared. Reload the page to fully reset the loaded SDK.");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">MC</div>
        <div className="brand-copy">
          <strong>MightyCall SDK Lab</strong>
          <span>WebPhone integration test console</span>
        </div>
        <div className="topbar-actions">
          <span className={`environment-pill ${online ? "online" : "offline"}`}>
            <i /> {online ? "Browser online" : "Offline"}
          </span>
          <button className="ghost-button" onClick={resetSession}>Reset session</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Integration workspace</p>
          <h1>Test the WebPhone SDK without your CRM in the way.</h1>
          <p>Load, initialize, call, inspect events, and export a clean diagnostic trail from one focused console.</p>
        </div>
        <div className="status-strip" aria-label="Integration status">
          <StatusItem label="SDK" value={sdkState === "loaded" ? "Loaded" : sdkState === "loading" ? "Loading" : sdkState === "error" ? "Failed" : "Not loaded"} ok={sdkState === "loaded"} />
          <StatusItem label="Phone" value={phoneStatus} ok={initialized} />
          <StatusItem label="Microphone" value={micState} ok={micState.startsWith("Ready")} />
        </div>
      </section>

      <div className="workspace-grid">
        <div className="main-column">
          <section className="panel setup-panel">
            <div className="panel-heading">
              <div><span className="step">01</span><h2>SDK setup</h2></div>
              <span className="privacy-note">Credentials stay in this browser tab</span>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Account API Key <b>login</b></span>
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste account API key" autoComplete="off" spellCheck={false} />
              </label>
              <label className="field">
                <span>User Key <b>secret</b></span>
                <div className="input-action">
                  <input type={showKey ? "text" : "password"} value={userKey} onChange={(event) => setUserKey(event.target.value)} placeholder="Paste user key" autoComplete="new-password" spellCheck={false} />
                  <button type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? "Hide" : "Show"}</button>
                </div>
              </label>
              <label className="field wide-field">
                <span>SDK source</span>
                <div className="input-action sdk-source">
                  <input value={sdkUrl} onChange={(event) => setSdkUrl(event.target.value)} spellCheck={false} />
                  <button type="button" onClick={() => setSdkUrl(SDK_URL)}>Default</button>
                </div>
              </label>
            </div>
            <div className="setup-actions">
              <button className="primary-button" onClick={loadSdk} disabled={sdkState === "loading"}>{sdkState === "loading" ? "Loading SDK…" : sdkState === "loaded" ? "SDK loaded" : "Load SDK"}</button>
              <div className="mode-switch" aria-label="SDK display mode">
                <button className={mode === "inline" ? "active" : ""} onClick={() => setMode("inline")}>Inline</button>
                <button className={mode === "modal" ? "active" : ""} onClick={() => setMode("modal")}>Modal</button>
              </div>
              <button className="dark-button" onClick={initialize} disabled={sdkState !== "loaded"}>Initialize {mode}</button>
            </div>
          </section>

          <section className="panel call-panel">
            <div className="panel-heading">
              <div><span className="step">02</span><h2>Call controls</h2></div>
              <div className={`call-state ${callState}`}><i /> {callState === "idle" ? "No active call" : `${callState} · ${formatDuration(callSeconds)}`}</div>
            </div>
            <div className="dial-row">
              <label className="field dial-field">
                <span>Destination number</span>
                <input value={number} onChange={(event) => setNumber(event.target.value)} onKeyDown={(event) => event.key === "Enter" && startCall()} placeholder="+1 555 010 2040" inputMode="tel" />
              </label>
              <button className="call-button" onClick={startCall} disabled={!initialized || callState !== "idle"}>Call</button>
              <button className="hangup-button" onClick={hangUp} disabled={!initialized || callState === "idle"}>Hang up</button>
            </div>
            <div className="secondary-controls">
              <button onClick={() => invoke("SwitchOn")} disabled={!initialized}>Switch on</button>
              <button onClick={() => invoke("SwitchOff")} disabled={!initialized || !hasMethod("SwitchOff")}>Switch off</button>
              <button onClick={refreshStatus} disabled={!initialized}>Refresh status</button>
              <button onClick={toggleMute} disabled={callState === "idle"}>{muted ? "Unmute" : "Mute"}</button>
              <button onClick={toggleHold} disabled={callState === "idle"}>{held ? "Resume" : "Hold"}</button>
              <button onClick={() => invoke("Accept")} disabled={!initialized || !hasMethod("Accept")}>Accept</button>
              <button onClick={() => invoke("Reject")} disabled={!initialized || !hasMethod("Reject")}>Reject</button>
              <button onClick={() => invoke("Focus")} disabled={!initialized || !hasMethod("Focus")}>Focus window</button>
            </div>
            <details className="dtmf-section">
              <summary>DTMF keypad</summary>
              <div className="dtmf-grid">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => <button key={digit} onClick={() => sendDtmf(digit)} disabled={callState === "idle"}>{digit}</button>)}
              </div>
            </details>
            <div id="mcContainer" className={`webphone-stage ${mode === "inline" ? "visible-stage" : ""}`}>
              <div className="stage-placeholder">
                <span>Inline WebPhone mount</span>
                <small>{mode === "inline" ? "The SDK interface will render here after initialization." : "Modal mode is selected; the WebPhone should open in its own window."}</small>
              </div>
            </div>
          </section>

          <section className="panel log-panel">
            <div className="panel-heading log-heading">
              <div><span className="step">03</span><h2>Event stream</h2><span className="count-badge">{logs.length}</span></div>
              <div className="log-actions">
                <button onClick={copyLogs} disabled={!logs.length}>Copy</button>
                <button onClick={exportLogs} disabled={!logs.length}>Export .txt</button>
                <button onClick={() => setLogs([])} disabled={!logs.length}>Clear</button>
              </div>
            </div>
            <div className="log-toolbar">
              <div className="filter-tabs">
                {["all", "event", "command", "errors"].map((item) => <button key={item} className={logFilter === item ? "active" : ""} onClick={() => setLogFilter(item)}>{item}</button>)}
              </div>
              <input className="log-search" value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Search log…" />
              <label className="auto-scroll"><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} /> Auto-scroll</label>
            </div>
            <div className="terminal" role="log" aria-live="polite">
              {!filteredLogs.length ? <div className="empty-log"><span>&gt;_</span><p>Events and commands will appear here.</p></div> : filteredLogs.map((entry) => (
                <div className={`log-line ${entry.kind}`} key={entry.id}>
                  <time>{entry.time}</time><span className="log-kind">{entry.kind}</span><div><strong>{entry.message}</strong>{entry.data !== undefined && <pre>{serialize(entry.data)}</pre>}</div>
                </div>
              ))}
              <div ref={logEnd} />
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="panel diagnostic-card">
            <div className="panel-heading"><div><span className="step">A</span><h2>Preflight</h2></div></div>
            <p>Check browser permissions before blaming the SDK or CRM.</p>
            <div className="check-list">
              <CheckRow label="Secure context" value={secureContext ? "Yes" : "No"} ok={secureContext} />
              <CheckRow label="Network" value={online ? "Online" : "Offline"} ok={online} />
              <CheckRow label="Popup window" value={popupState} ok={popupState === "Allowed"} neutral={popupState === "Not checked"} />
              <CheckRow label="Microphone" value={micState} ok={micState.startsWith("Ready")} neutral={micState === "Not checked"} />
            </div>
            <button className="wide-button" onClick={runBrowserChecks}>Run browser checks</button>
          </section>

          <section className="panel diagnostic-card">
            <div className="panel-heading"><div><span className="step">B</span><h2>SDK inspector</h2></div></div>
            <p>Detected members on <code>Phone</code> after the script loads.</p>
            <div className="method-list">
              {!methodNames.length ? <span className="method-empty">Load the SDK to inspect its methods.</span> : methodNames.map((name) => <code key={name}>{name}</code>)}
            </div>
          </section>

          <section className="panel guide-card">
            <span className="guide-label">Suggested test order</span>
            <ol>
              <li><span>1</span><p><strong>Run preflight</strong><small>Confirm microphone and popup access.</small></p></li>
              <li><span>2</span><p><strong>Load and initialize</strong><small>Compare inline and modal separately.</small></p></li>
              <li><span>3</span><p><strong>Place one test call</strong><small>Watch status and SDK events together.</small></p></li>
              <li><span>4</span><p><strong>Export the log</strong><small>Attach it to an escalation or bug report.</small></p></li>
            </ol>
          </section>
        </aside>
      </div>

      <footer><span>MightyCall SDK Lab</span><p>Standalone diagnostic harness · Credentials are never saved by this app.</p></footer>
    </main>
  );
}

function StatusItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="status-item"><span>{label}</span><strong title={value}><i className={ok ? "ok" : ""} />{value}</strong></div>;
}

function CheckRow({ label, value, ok, neutral = false }: { label: string; value: string; ok: boolean; neutral?: boolean }) {
  return <div className="check-row"><span>{label}</span><strong className={neutral ? "neutral" : ok ? "pass" : "fail"}>{neutral ? "—" : ok ? "✓" : "!"} {value}</strong></div>;
}
