const CACHE_NAME = 'mrz-scanner-models-v1';
const MODEL_ASSETS = [
    './assets/ch_PP-OCRv4_det.onnx',
    './assets/ch_PP-OCRv4_rec.onnx',
    './assets/ppocr_keys_v1.txt',
    './assets/version-RFB-320.onnx',
    './assets/face-api-models/ssd_mobilenetv1_model-shard1',
    './assets/face-api-models/ssd_mobilenetv1_model-shard2',
    './assets/face-api-models/ssd_mobilenetv1_model-weights_manifest.json'
];

// Install event - only cache the heavy model files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching models...');
                return cache.addAll(MODEL_ASSETS);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only apply caching strategy to assets (models)
    // This allows HTML/JS/CSS to update immediately during development
    if (url.pathname.includes('/assets/')) {
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    // Cache hit - return response
                    if (response) {
                        return response;
                    }

                    // Clone the request because it's a one-time use stream
                    const fetchRequest = event.request.clone();

                    return fetch(fetchRequest).then(
                        (response) => {
                            // Check if we received a valid response
                            if (!response || response.status !== 200 || response.type !== 'basic') {
                                return response;
                            }

                            // Clone the response
                            const responseToCache = response.clone();

                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });

                            return response;
                        }
                    );
                })
        );
    }
    // For all other requests (HTML, JS, CSS), go directly to network
    // No event.respondWith() means standard network behavior
});
