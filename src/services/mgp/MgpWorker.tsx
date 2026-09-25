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
// Cloudflare clearance is scoped to this origin, so solve challenges on a
// renderable MGP page and issue API requests from the same resident WebView.
const WEBVIEW_SOURCE = { uri: MGP_PAGE_URL };
const REQUEST_TIMEOUT_MS = 15000;
// The former server proxy serialized municipal requests. Preserve that behavior
// on-device: a burst of concurrent XHRs re-triggers MGP's Cloudflare rule.
const REQUEST_PACING_MS = 6000;
// Managed Challenges normally finish in a few seconds. Keep that path invisible for
// 10 seconds and only ask for user attention when Cloudflare has not cleared by then.
const PURE_CHALLENGE_GRACE_MS = 10000;

interface PendingRequest {
  resolve: (data: string) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
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
  const [isPureChallengeBrowserVisible, setIsPureChallengeBrowserVisible] = useState(false);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());
  const queuedRequestIds = useRef<string[]>([]);
  const activeRequestId = useRef<string | null>(null);
  const nextRequestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bridgeReady = useRef(false);
  const bridgeOperational = useRef(false);
  const challengeActive = useRef(false);
  const pureChallengeDocumentLoaded = useRef(false);
  const pureChallengeRedirectStarted = useRef(false);
  const pureBridgeInjected = useRef(false);
  const pureChallengeSeen = useRef(false);
  const pureInitialLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pureVisibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPureVisibilityTimer = useCallback(() => {
    if (pureVisibilityTimer.current) {
      clearTimeout(pureVisibilityTimer.current);
      pureVisibilityTimer.current = null;
    }
  }, []);

  const startPureVisibilityTimer = useCallback(() => {
    clearPureVisibilityTimer();
    pureVisibilityTimer.current = setTimeout(() => {
      pureVisibilityTimer.current = null;
      setIsPureChallengeBrowserVisible(true);
    }, PURE_CHALLENGE_GRACE_MS);
  }, [clearPureVisibilityTimer]);

  const scheduleNextRequestRef = useRef<() => void>(() => {});

  const flushQueuedRequests = useCallback(() => {
    if (activeRequestId.current || !bridgeOperational.current || !webViewRef.current) return;

    let requestId = queuedRequestIds.current.shift();
    while (requestId && !pendingRequests.current.has(requestId)) {
      requestId = queuedRequestIds.current.shift();
    }
    if (!requestId) return;

    const pending = pendingRequests.current.get(requestId);
    if (!pending) return;

    activeRequestId.current = requestId;

    // Start the request timeout ONLY when the request is actually dispatched to the WebView
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    pending.timeout = setTimeout(() => {
      pendingRequests.current.delete(requestId);
      if (activeRequestId.current === requestId) {
        activeRequestId.current = null;
        scheduleNextRequestRef.current();
      }
      pending.reject(new Error(`Timeout (${REQUEST_TIMEOUT_MS / 1000}s) esperando respuesta de MGP`));
    }, REQUEST_TIMEOUT_MS);

    webViewRef.current.postMessage(JSON.stringify(pending.message));
  }, []);

  const scheduleNextRequest = useCallback(() => {
    if (nextRequestTimer.current) return;
    nextRequestTimer.current = setTimeout(() => {
      nextRequestTimer.current = null;
      flushQueuedRequests();
    }, REQUEST_PACING_MS);
  }, [flushQueuedRequests]);

  scheduleNextRequestRef.current = scheduleNextRequest;

  const activateBridge = useCallback(() => {
    if (!bridgeReady.current || challengeActive.current) return;

    bridgeOperational.current = true;
    setIsReady(true);
    flushQueuedRequests();
  }, [flushQueuedRequests]);

  const activatePureChallengeBridge = useCallback(() => {
    if (pureBridgeInjected.current) return;
    pureBridgeInjected.current = true;
    clearPureVisibilityTimer();
    setIsPureChallengeBrowserVisible(false);
    setIsChallenging(false);
    // This runs only after native WebView events have confirmed the final page.
    // Cloudflare's challenge document never receives injected application code.
    webViewRef.current?.injectJavaScript(INJECTED_JAVASCRIPT);
  }, [clearPureVisibilityTimer]);

  const restartPureChallenge = useCallback(() => {
    // The document which observed the 403 contains our bridge. Reload it from
    // native after clearing all bridge state so Cloudflare receives a completely
    // plain, visible WebView. Cookie storage remains owned by the WebView session.
    bridgeReady.current = false;
    bridgeOperational.current = false;
    challengeActive.current = false;
    pureBridgeInjected.current = false;
    pureChallengeDocumentLoaded.current = false;
    pureChallengeRedirectStarted.current = false;
    pureChallengeSeen.current = false;
    if (pureInitialLoadTimer.current) clearTimeout(pureInitialLoadTimer.current);
    pureInitialLoadTimer.current = null;
    clearPureVisibilityTimer();
    setIsReady(false);
    setIsChallenging(true);
    setIsPureChallengeBrowserVisible(false);
    startPureVisibilityTimer();
    webViewRef.current?.reload();
  }, [clearPureVisibilityTimer, startPureVisibilityTimer]);

  // Handle hardware back press on Android when challenging overlay is open
  useEffect(() => {
    if (!isPureChallengeBrowserVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsPureChallengeBrowserVisible(false);
      return true;
    });
    return () => subscription.remove();
  }, [isPureChallengeBrowserVisible]);

  // Start 10-second grace timer for initial load if Cloudflare is challenging
  useEffect(() => {
    startPureVisibilityTimer();
  }, [startPureVisibilityTimer]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (!payload || !payload.type) return;

        if (payload.type === 'READY') {
          bridgeReady.current = true;
          activateBridge();
          return;
        }

        if (payload.type === 'CF_BLOCKED') {
          const requestId = String(payload.id || '');
          if (activeRequestId.current === requestId) {
            activeRequestId.current = null;
            const pending = pendingRequests.current.get(requestId);
            if (pending && pending.timeout) {
              clearTimeout(pending.timeout);
              pending.timeout = null;
            }
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
            if (pending.timeout) {
              clearTimeout(pending.timeout);
              pending.timeout = null;
            }
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
    [activateBridge, restartPureChallenge, scheduleNextRequest]
  );

  const requestMgp = useCallback(
    (params: Record<string, string>): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        const requestId = 'req_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();

        const message = {
          type: 'REQUEST' as const,
          id: requestId,
          params,
        };

        pendingRequests.current.set(requestId, {
          resolve,
          reject,
          timeout: null,
          message,
        });

        queuedRequestIds.current.push(requestId);

        if (bridgeOperational.current && webViewRef.current) {
          flushQueuedRequests();
        }
      });
    },
    [flushQueuedRequests]
  );

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
    setIsChallenging(true);
    setIsPureChallengeBrowserVisible(false);
    bridgeReady.current = false;
    bridgeOperational.current = false;
    challengeActive.current = false;
    pureBridgeInjected.current = false;
    pureChallengeDocumentLoaded.current = false;
    pureChallengeRedirectStarted.current = false;
    pureChallengeSeen.current = false;
    activeRequestId.current = null;
    if (nextRequestTimer.current) {
      clearTimeout(nextRequestTimer.current);
      nextRequestTimer.current = null;
    }
    clearPureVisibilityTimer();
    startPureVisibilityTimer();
    webViewRef.current?.reload();
  }, [clearPureVisibilityTimer, startPureVisibilityTimer]);

  // Cleanup on unmount
  useEffect(() => {
    const activeRequests = pendingRequests.current;
    return () => {
      activeRequests.forEach((req) => {
        if (req.timeout) {
          clearTimeout(req.timeout);
        }
        req.reject(new Error('MGP Provider desmontado'));
      });
      activeRequests.clear();
      queuedRequestIds.current = [];
      if (nextRequestTimer.current) clearTimeout(nextRequestTimer.current);
      if (pureInitialLoadTimer.current) clearTimeout(pureInitialLoadTimer.current);
      clearPureVisibilityTimer();
    };
  }, [clearPureVisibilityTimer]);

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
        {isPureChallengeBrowserVisible && (
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
              onPress={() => setIsPureChallengeBrowserVisible(false)}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </SafeAreaView>
        )}
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
        {isPureChallengeBrowserVisible && (
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
