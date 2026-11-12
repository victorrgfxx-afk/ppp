// the two checks that catch a name used before its own declaration in the same function (a const / let further down:
// "Cannot access X before initialization" when that line runs) and a name never declared
const g = {};
for (const k of ['window', 'document', 'navigator', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'matchMedia', 'devicePixelRatio', 'addEventListener', 'removeEventListener', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', 'fetch', 'URL', 'URLSearchParams', 'Blob', 'Image', 'ImageData', 'OffscreenCanvas', 'Worker', 'self', 'postMessage', 'onmessage', 'location', 'history', 'innerWidth', 'innerHeight', 'screen', 'alert', 'crypto', 'WebSocket', 'RTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate', 'BroadcastChannel', 'AudioContext', 'webkitAudioContext', 'TextEncoder', 'TextDecoder', 'createImageBitmap', 'AbortController', 'structuredClone', 'queueMicrotask', 'HTMLCanvasElement', 'HTMLElement', 'KeyboardEvent', 'CustomEvent', 'Event', 'DOMParser', 'FileReader', 'atob', 'btoa', 'getComputedStyle', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'PointerEvent', 'WebGL2RenderingContext', 'top', 'parent', 'CompressionStream', 'DecompressionStream', 'Response', 'Request', 'Headers', 'EventSource', 'XMLHttpRequest', 'FontFace', 'Path2D', 'DOMMatrix', 'navigation', 'scrollTo', 'open', 'close', 'focus', 'requestIdleCallback', 'MessageChannel', 'File', 'FormData', 'ClipboardItem', 'visualViewport', 'OfflineAudioContext', 'ImageBitmap', 'VideoFrame', 'reportError']) g[k] = 'readonly';
export default [{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: g },
  linterOptions: { reportUnusedDisableDirectives: 'off' },
  rules: {
    'no-use-before-define': ['error', { functions: false, classes: false, variables: false, allowNamedExports: true }],
    'no-undef': 'error', 'no-const-assign': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-import-assign': 'error', 'no-class-assign': 'error', 'no-func-assign': 'error', 'no-dupe-class-members': 'error',
  },
}];
