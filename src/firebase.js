
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDnaTf-hlaJqXqnQ8ykRH6mVUEgkXMgYxU",
  authDomain: "mybudgetapp-ae452.firebaseapp.com",
  projectId: "mybudgetapp-ae452",
  storageBucket: "mybudgetapp-ae452.firebasestorage.app",
  messagingSenderId: "659773105401",
  appId: "1:659773105401:web:400912f73e5e54dfdd2e28",
  measurementId: "G-Z3PVX8VPBG",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };

