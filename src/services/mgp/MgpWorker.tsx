import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BusArrival, parseMgpResponse, resolveInternalLineCode } from './telemetryMapper';

const TARGET_URL = 'https://appsl.mardelplata.gob.ar/app_cuando_llega/webWS.php';
// The directory route redirects to an external municipal 403 page. Keep the
// resident document on the API origin so its clearance cookie is same-origin.
const MGP_PAGE_URL = TARGET_URL;
// Keep the known-good browser baseline enabled while the API-request failure is isolated.
const MGP_CHALLENGE_PROBE_ENABLED = false;
// Temporary baseline: this is intentionally a plain browser. It lets Cloudflare
// own its full navigation without injected scripts, bridge messages, or MGP fetches.
const MGP_PURE_CHALLENGE_BROWSER_ONLY = true;
const PROBE_INJECTED_JAVASCRIPT = `
(function() {
  async function runProbe() {
    try {
      var response = await fetch('https://appsl.mardelplata.gob.ar/app_cuando_llega/webWS.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: 'accion=RecuperarLineaPorCuandoLlega'
      });
      var body = await response.text();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PROBE_RESULT',
        result: 'HTTP ' + response.status + ' | cf-mitigated=' + (response.headers.get('cf-mitigated') || '-') + ' | ' + body.slice(0, 180)
      }));
    } catch (error) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PROBE_RESULT',
        result: 'FETCH ERROR: ' + (error && error.name ? error.name + ': ' : '') + (error && error.message ? error.message : String(error)) + ' | page=' + location.href
      }));
    }
  }
  function receive(raw) {
    try { if (JSON.parse(raw).type === 'RUN_PROBE') runProbe(); } catch (_) {}
  }
  window.addEventListener('message', function(event) { receive(event.data); });
  document.addEventListener('message', function(event) { receive(event.data); });
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PROBE_READY' }));
  true;
})();
`;
// Cloudflare clearance is scoped to this origin, so solve challenges on a
// renderable MGP page and issue API requests from the same resident WebView.
const WEBVIEW_SOURCE = { uri: MGP_PAGE_URL };
const REQUEST_TIMEOUT_MS = 15000;
// The former server proxy serialized municipal requests. Preserve that behavior
// on-device: a burst of concurrent XHRs re-triggers MGP's Cloudflare rule.
const REQUEST_PACING_MS = 6000;
// Managed Challenges normally finish in a few seconds. Keep that path invisible and
// only ask for user attention when Cloudflare has not cleared by this deadline.
const AUTO_CHALLENGE_GRACE_MS = 7000;

interface PendingRequest {
  resolve: (data: string) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  message: {
    type: 'REQUEST';
    id: string;
    params: Record<string, string>;
  };
}

export interface MgpContextValue {
  requestMgp: (params: Record<string, string>) => Promise<string>;
  getArrivals: (commercialLine: string, stopId: string) => Promise<BusArrival[]>;
  requestArrivals: (commercialLine: string, stopId: string) => Promise<BusArrival[]>;
  isReady: boolean;
  isChallenging: boolean;
  reloadBridge: () => void;
}

const MgpContext = createContext<MgpContextValue | null>(null);

export function useMgp(): MgpContextValue {
  const context = useContext(MgpContext);
  if (!context) {
    throw new Error('useMgp must be used within an MgpProvider');
  }
  return context;
}

export const useMgpClient = useMgp;

const INJECTED_JAVASCRIPT = `
(function() {
  var documentId = 'mgp_doc_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  function isChallengeActive() {
    try {
      var title = (document.title || '').toLowerCase();
      var hasChallengeTitle = title.includes('just a moment') ||
                              title.includes('attention required') ||
                              title.includes('un momento');

      var stage = document.querySelector('#challenge-stage') ||
                  document.querySelector('#challenge-running') ||
                  document.querySelector('#cf-challenge-running') ||
                  document.querySelector('.cf-turnstile-wrapper') ||
                  document.querySelector('#turnstile-wrapper');

      var challengeForm = document.querySelector('form#challenge-form');
      var challengeIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');

      var bodyText = (document.body ? document.body.innerText || '' : '').toLowerCase();
      var hasChallengeText = bodyText.includes('verifying you are human') ||
                             bodyText.includes('verifique que es humano') ||
                             bodyText.includes('checking your browser') ||
                             bodyText.includes('comprobando');

      var hasChallengeElements = !!(stage || challengeForm || challengeIframe);
      return !!(hasChallengeTitle || (hasChallengeElements && hasChallengeText));
    } catch (e) {
      return false;
    }
  }

  var lastChallengeState = null;
  function reportChallengeState() {
    var active = isChallengeActive();
    if (active !== lastChallengeState) {
      lastChallengeState = active;
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CF_STATUS',
          isChallenging: active,
          documentId: documentId
        }));
      }
    }
  }

  // MutationObserver for immediate Cloudflare challenge detection and clearance
  try {
    var observer = new MutationObserver(function() {
      reportChallengeState();
    });
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
  } catch (e) {}

  setInterval(reportChallengeState, 500);

  // Executes form-urlencoded POST against upstream endpoint within active browser session
  async function executeFetch(id, params) {
    try {
      var formData = new URLSearchParams();
      if (params) {
        for (var key in params) {
          if (Object.prototype.hasOwnProperty.call(params, key)) {
            formData.append(key, params[key]);
          }
        }
      }

      // Always post to the clean canonical endpoint without stale challenge tokens
      var targetUrl = 'https://appsl.mardelplata.gob.ar/app_cuando_llega/webWS.php';
      var response = await window.fetch(targetUrl, {
        method: 'POST',
        headers: {
          // Match the proven municipal AJAX contract. Origin, Referer and
          // Sec-Fetch-* remain browser-controlled and are supplied by WebView.
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: formData.toString()
      });

      var text = await response.text();

      // Check if Cloudflare intercepted the request with a challenge HTML page
      var isCfBlocked = response.status === 403 ||
                        text.includes('Just a moment...') ||
                        text.includes('Attention Required!') ||
                        text.includes('cf-mitigated') ||
                        text.includes('challenge-platform') ||
                        text.includes('cf-turnstile');

      if (isCfBlocked) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CF_STATUS',
            isChallenging: true,
            documentId: documentId
          }));
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CF_BLOCKED',
            id: id
          }));
        }
        // A fetch response cannot render Cloudflare's Challenge Page. React Native
        // receives CF_BLOCKED and recreates a clean top-level navigation; do not
        // navigate from injected JavaScript while Cloudflare is challenging.
        return;
      }

      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'RESPONSE',
          id: id,
          success: response.ok,
          data: text,
          error: response.ok ? null : ('HTTP error ' + response.status)
        }));
      }
    } catch (err) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'RESPONSE',
          id: id,
          success: false,
          error: err ? (err.message || String(err)) : 'Worker execution exception'
        }));
      }
    }
  }

  function handleIncomingMessage(raw) {
    try {
      var msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (msg && msg.type === 'REQUEST') {
        executeFetch(msg.id, msg.params);
      }
    } catch (e) {}
  }

  window.addEventListener('message', function(event) {
    handleIncomingMessage(event.data);
  });
  document.addEventListener('message', function(event) {
    handleIncomingMessage(event.data);
  });

  // Cloudflare status MUST reach React Native before READY. Otherwise the native
  // side can dispatch a fetch into a challenge document and restart its flow.
  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    reportChallengeState();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY', documentId: documentId }));
  }
  true;
})();
`;

export function MgpProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [isChallenging, setIsChallenging] = useState(false);
  const [isChallengeVisible, setIsChallengeVisible] = useState(false);
  const [isPureChallengeBrowserVisible, setIsPureChallengeBrowserVisible] = useState(true);
  const [probeReady, setProbeReady] = useState(false);
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());
  const queuedRequestIds = useRef<string[]>([]);
  const activeRequestId = useRef<string | null>(null);
  const nextRequestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bridgeReady = useRef(false);
  const bridgeOperational = useRef(false);
  const challengeActive = useRef(false);
  const challengeVisibilityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A challenge page can remove its visible UI before Cloudflare completes the
  // redirect. Do not treat that DOM transition as a clearance.
  const awaitingChallengeClearance = useRef(false);
  const readyDocumentId = useRef<string | null>(null);
  const challengeDocumentId = useRef<string | null>(null);
  const clearedChallengeDocumentId = useRef<string | null>(null);
  const pureChallengeDocumentLoaded = useRef(false);
  const pureChallengeRedirectStarted = useRef(false);
  const pureBridgeInjected = useRef(false);
  const pureChallengeSeen = useRef(false);
  const pureInitialLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearChallengeVisibilityTimeout = useCallback(() => {
    if (challengeVisibilityTimeout.current) {
      clearTimeout(challengeVisibilityTimeout.current);
      challengeVisibilityTimeout.current = null;
    }
  }, []);

  const deferChallengeVisibility = useCallback(() => {
    if (challengeVisibilityTimeout.current) return;
    challengeVisibilityTimeout.current = setTimeout(() => {
      challengeVisibilityTimeout.current = null;
      setIsChallengeVisible(true);
    }, AUTO_CHALLENGE_GRACE_MS);
  }, []);

  const flushQueuedRequests = useCallback(() => {
    if (activeRequestId.current || !bridgeOperational.current || !webViewRef.current) return;

    let requestId = queuedRequestIds.current.shift();
    while (requestId && !pendingRequests.current.has(requestId)) {
      requestId = queuedRequestIds.current.shift();
    }
    if (!requestId) return;

    activeRequestId.current = requestId;
    webViewRef.current.postMessage(JSON.stringify(pendingRequests.current.get(requestId)!.message));
  }, []);

  const scheduleNextRequest = useCallback(() => {
    if (nextRequestTimer.current) return;
    nextRequestTimer.current = setTimeout(() => {
      nextRequestTimer.current = null;
      flushQueuedRequests();
    }, REQUEST_PACING_MS);
  }, [flushQueuedRequests]);

  const activateBridge = useCallback(() => {
    if (!bridgeReady.current || challengeActive.current) return;

    bridgeOperational.current = true;
    setIsReady(true);
    flushQueuedRequests();
  }, [flushQueuedRequests]);

  const activatePureChallengeBridge = useCallback(() => {
    if (pureBridgeInjected.current) return;
    pureBridgeInjected.current = true;
    setIsPureChallengeBrowserVisible(false);
    // This runs only after native WebView events have confirmed the final page.
    // Cloudflare's challenge document never receives injected application code.
    webViewRef.current?.injectJavaScript(INJECTED_JAVASCRIPT);
  }, []);

  const restartPureChallenge = useCallback(() => {
    // The document which observed the 403 contains our bridge. Reload it from
    // native after clearing all bridge state so Cloudflare receives a completely
    // plain, visible WebView. Cookie storage remains owned by the WebView session.
    bridgeReady.current = false;
    bridgeOperational.current = false;
    challengeActive.current = false;
    awaitingChallengeClearance.current = false;
    pureBridgeInjected.current = false;
    pureChallengeDocumentLoaded.current = false;
    pureChallengeRedirectStarted.current = false;
    pureChallengeSeen.current = false;
    if (pureInitialLoadTimer.current) clearTimeout(pureInitialLoadTimer.current);
    pureInitialLoadTimer.current = null;
    setIsReady(false);
    setIsChallenging(true);
    setIsPureChallengeBrowserVisible(true);
    webViewRef.current?.reload();
  }, []);

  const completeChallengeRedirect = useCallback(() => {
    const readyDocument = readyDocumentId.current;
    const challengeDocument = challengeDocumentId.current;

    if (
      !awaitingChallengeClearance.current ||
      !readyDocument ||
      !challengeDocument ||
      readyDocument === challengeDocument ||
      clearedChallengeDocumentId.current !== readyDocument
    ) {
      return;
    }

    awaitingChallengeClearance.current = false;
    challengeDocumentId.current = null;
    clearedChallengeDocumentId.current = null;
    clearChallengeVisibilityTimeout();
    setIsChallengeVisible(false);
    challengeActive.current = false;
    setIsChallenging(false);
    activateBridge();
  }, [activateBridge, clearChallengeVisibilityTimeout]);

  const handleProbeMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.type === 'PROBE_READY') setProbeReady(true);
      if (payload.type === 'PROBE_RESULT') setProbeResult(String(payload.result));
    } catch {
      // Ignore page messages unrelated to the diagnostic probe.
    }
  }, []);

  // Handle hardware back press on Android when challenging overlay is open
  useEffect(() => {
    if (!isChallengeVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsChallengeVisible(false);
      return true;
    });
    return () => subscription.remove();
  }, [isChallengeVisible]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (!payload || !payload.type) return;

        if (payload.type === 'READY') {
          // This confirms that the current document has installed its message
          // listener. It is deliberately separate from Cloudflare clearance.
          readyDocumentId.current =
            typeof payload.documentId === 'string' ? payload.documentId : null;
          bridgeReady.current = true;
          completeChallengeRedirect();
          activateBridge();
          return;
        }

        if (payload.type === 'CF_STATUS' || payload.type === 'CHALLENGE_STATE') {
          const challenging = Boolean(payload.isChallenging);
          const documentId = typeof payload.documentId === 'string' ? payload.documentId : null;
          if (challenging) {
            if (!awaitingChallengeClearance.current) {
              challengeDocumentId.current = documentId;
            }
            awaitingChallengeClearance.current = true;
            clearedChallengeDocumentId.current = null;
            challengeActive.current = true;
            bridgeOperational.current = false;
            setIsChallenging(true);
            setIsReady(false);
            deferChallengeVisibility();
          } else if (awaitingChallengeClearance.current) {
            // Cloudflare's spinner can temporarily remove the challenge markers.
            // Keep requests suspended until a different, redirected document
            // has loaded. A transient spinner state keeps the same document id.
            clearedChallengeDocumentId.current = documentId;
            completeChallengeRedirect();
          } else {
            clearChallengeVisibilityTimeout();
            setIsChallengeVisible(false);
            challengeActive.current = false;
            setIsChallenging(false);
            activateBridge();
          }
          return;
        }

        if (payload.type === 'CF_BLOCKED') {
          const requestId = String(payload.id || '');
          if (activeRequestId.current === requestId) {
            activeRequestId.current = null;
            // Do not reject a request merely because its clearance expired.
            // It will run once the top-level challenge has redirected back.
            queuedRequestIds.current.unshift(requestId);
            restartPureChallenge();
          }
          return;
        }

        if (payload.type === 'RESPONSE') {
          const { id, success, data, error } = payload;
          const pending = pendingRequests.current.get(id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.current.delete(id);
            if (activeRequestId.current === id) {
              activeRequestId.current = null;
              scheduleNextRequest();
            }

            if (success && typeof data === 'string') {
              pending.resolve(data);
            } else {
              pending.reject(new Error(error || 'Error al obtener telemetría municipal de MGP'));
            }
          }
        }
      } catch {
        // Ignore unparseable messages from third-party scripts
      }
    },
    [
      activateBridge,
      clearChallengeVisibilityTimeout,
      completeChallengeRedirect,
      deferChallengeVisibility,
      restartPureChallenge,
      scheduleNextRequest,
    ]
  );

  const requestMgp = useCallback((params: Record<string, string>): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const requestId = 'req_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();

      const timeout = setTimeout(() => {
        pendingRequests.current.delete(requestId);
        if (activeRequestId.current === requestId) {
          activeRequestId.current = null;
          scheduleNextRequest();
        }
        reject(new Error(`Timeout (${REQUEST_TIMEOUT_MS / 1000}s) esperando respuesta de MGP`));
      }, REQUEST_TIMEOUT_MS);

      const message = {
        type: 'REQUEST' as const,
        id: requestId,
        params,
      };

      pendingRequests.current.set(requestId, {
        resolve,
        reject,
        timeout,
        message,
      });

      if (bridgeOperational.current && webViewRef.current) {
        queuedRequestIds.current.push(requestId);
        flushQueuedRequests();
        return;
      }
      queuedRequestIds.current.push(requestId);
    });
  }, []);

  const getArrivals = useCallback(
    async (commercialLine: string, stopId: string): Promise<BusArrival[]> => {
      const raw = await requestMgp({
        accion: 'RecuperarProximosArribosW',
        identificadorParada: stopId.trim(),
        codigoLineaParada: resolveInternalLineCode(commercialLine).trim(),
      });
      return parseMgpResponse(raw, commercialLine);
    },
    [requestMgp]
  );

  const reloadBridge = useCallback(() => {
    setIsReady(false);
    setIsChallenging(false);
    setIsChallengeVisible(false);
    awaitingChallengeClearance.current = false;
    readyDocumentId.current = null;
    challengeDocumentId.current = null;
    clearedChallengeDocumentId.current = null;
    bridgeReady.current = false;
    bridgeOperational.current = false;
    challengeActive.current = false;
    activeRequestId.current = null;
    if (nextRequestTimer.current) {
      clearTimeout(nextRequestTimer.current);
      nextRequestTimer.current = null;
    }
    clearChallengeVisibilityTimeout();
    webViewRef.current?.reload();
  }, [clearChallengeVisibilityTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    const activeRequests = pendingRequests.current;
    return () => {
      activeRequests.forEach((req) => {
        clearTimeout(req.timeout);
        req.reject(new Error('MGP Provider desmontado'));
      });
      activeRequests.clear();
      queuedRequestIds.current = [];
      if (nextRequestTimer.current) clearTimeout(nextRequestTimer.current);
      if (pureInitialLoadTimer.current) clearTimeout(pureInitialLoadTimer.current);
      clearChallengeVisibilityTimeout();
    };
  }, [clearChallengeVisibilityTimeout]);

  if (MGP_CHALLENGE_PROBE_ENABLED) {
    return (
      <MgpContext.Provider
        value={{
          getArrivals,
          requestMgp,
          requestArrivals: getArrivals,
          isReady: false,
          isChallenging: false,
          reloadBridge,
        }}>
        {children}
        <View style={styles.challengeProbe}>
          <WebView
            ref={webViewRef}
            source={WEBVIEW_SOURCE}
            injectedJavaScript={PROBE_INJECTED_JAVASCRIPT}
            onMessage={handleProbeMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
          <SafeAreaView style={styles.probeControls} pointerEvents="box-none">
            <TouchableOpacity
              disabled={!probeReady}
              onPress={() => {
                setProbeResult(null);
                webViewRef.current?.postMessage(JSON.stringify({ type: 'RUN_PROBE' }));
              }}
              style={styles.probeButton}>
              <Text style={styles.probeButtonText}>Probar API MGP</Text>
            </TouchableOpacity>
            {probeResult ? <Text style={styles.probeResult}>{probeResult}</Text> : null}
          </SafeAreaView>
        </View>
      </MgpContext.Provider>
    );
  }

  if (MGP_PURE_CHALLENGE_BROWSER_ONLY) {
    return (
      <MgpContext.Provider
        value={{
          getArrivals,
          requestMgp,
          requestArrivals: getArrivals,
          isReady,
          isChallenging,
          reloadBridge,
        }}>
        {children}
        <View
          pointerEvents={isPureChallengeBrowserVisible ? 'auto' : 'none'}
          style={
            isPureChallengeBrowserVisible ? styles.pureChallengeBrowser : styles.headlessContainer
          }>
          <WebView
            ref={webViewRef}
            source={WEBVIEW_SOURCE}
            onMessage={handleMessage}
            onHttpError={(event) => {
              // Cloudflare serves its challenge with HTTP 403. This native event
              // is outside the page, so it does not modify or fingerprint it.
              if (event.nativeEvent.statusCode === 403) {
                pureChallengeSeen.current = true;
                if (pureInitialLoadTimer.current) {
                  clearTimeout(pureInitialLoadTimer.current);
                  pureInitialLoadTimer.current = null;
                }
              }
            }}
            onLoadStart={() => {
              // The first document is Cloudflare's challenge. A later top-level
              // navigation is Cloudflare's own redirect after it has cleared.
              if (pureChallengeDocumentLoaded.current) {
                pureChallengeRedirectStarted.current = true;
              }
            }}
            onLoadEnd={() => {
              if (!pureChallengeDocumentLoaded.current) {
                pureChallengeDocumentLoaded.current = true;
                // A persisted cf_clearance skips the challenge entirely: the
                // endpoint simply loads once and remains visually blank. Give
                // the native 403 callback a moment before treating it as final.
                pureInitialLoadTimer.current = setTimeout(() => {
                  pureInitialLoadTimer.current = null;
                  if (!pureChallengeSeen.current && !pureChallengeRedirectStarted.current) {
                    activatePureChallengeBridge();
                  }
                }, 750);
                return;
              }

              if (pureChallengeRedirectStarted.current) {
                if (pureInitialLoadTimer.current) {
                  clearTimeout(pureInitialLoadTimer.current);
                  pureInitialLoadTimer.current = null;
                }
                activatePureChallengeBridge();
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
            cacheEnabled={true}
            incognito={false}
            originWhitelist={['*']}
            style={styles.webViewStyle}
          />
        </View>
      </MgpContext.Provider>
    );
  }

  return (
    <MgpContext.Provider
      value={{
        getArrivals,
        requestMgp,
        requestArrivals: getArrivals,
        isReady,
        isChallenging,
        reloadBridge,
      }}>
      {children}

      {/*
        Single persistent WebView:
        NEVER unmounted so that the Chromium session, cookies (cf_clearance),
        DOM state, and JavaScript context are permanently preserved.
      */}
      <View
        pointerEvents={isChallengeVisible ? 'auto' : 'none'}
        style={isChallengeVisible ? styles.challengingOverlay : styles.headlessContainer}>
        {isChallengeVisible && (
          <SafeAreaView style={styles.modalHeader}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.modalTitle}>Verificación de seguridad MGP</Text>
              <Text style={styles.modalSubtitle}>
                Completá la verificación para continuar recibiendo arribos de colectivos en tiempo
                real.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsChallengeVisible(false)}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </SafeAreaView>
        )}

        <View style={isChallengeVisible ? styles.webViewActiveContainer : styles.webViewHidden}>
          <WebView
            ref={webViewRef}
            source={WEBVIEW_SOURCE}
            injectedJavaScript={INJECTED_JAVASCRIPT}
            onMessage={handleMessage}
            onLoadStart={() => {
              bridgeReady.current = false;
              bridgeOperational.current = false;
              setIsReady(false);
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
            cacheEnabled={true}
            incognito={false}
            originWhitelist={['*']}
            style={styles.webViewStyle}
          />
        </View>

        {isChallengeVisible && (
          <View style={styles.modalFooter}>
            <ActivityIndicator size="small" color="#0284c7" />
            <Text style={styles.modalFooterText}>
              El diálogo se cerrará automáticamente al validar.
            </Text>
          </View>
        )}
      </View>
    </MgpContext.Provider>
  );
}

const styles = StyleSheet.create({
  probeControls: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    left: 12,
    gap: 8,
  },
  probeButton: {
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: '#075985',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  probeButtonText: { color: '#ffffff', fontWeight: '700' },
  probeResult: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    color: '#111827',
    padding: 10,
    fontSize: 12,
  },
  challengeProbe: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#ffffff',
    zIndex: 999999,
    elevation: 999999,
  },
  pureChallengeBrowser: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#ffffff',
    zIndex: 999999,
    elevation: 999999,
  },
  headlessContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
    zIndex: -1,
  },
  challengingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    zIndex: 999999,
    elevation: 999999,
  },
  webViewHidden: {
    flex: 1,
    opacity: 0,
  },
  webViewActiveContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webViewStyle: {
    flex: 1,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
  },
  headerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  modalFooter: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  modalFooterText: {
    fontSize: 12,
    color: '#64748b',
  },
});
