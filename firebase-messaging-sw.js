importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCGWAqi1MKJrlLNiCOIEztMu5qrNGbGtMA",
  authDomain: "piso-app-11882.firebaseapp.com",
  projectId: "piso-app-11882",
  storageBucket: "piso-app-11882.firebasestorage.app",
  messagingSenderId: "897201846594",
  appId: "1:897201846594:web:eb7df0b778ee8350eff0db"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
