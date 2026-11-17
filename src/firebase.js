// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDnaTf-hlaJqXqnQ8ykRH6mVUEgkXMgYxU",
  authDomain: "mybudgetapp-ae452.firebaseapp.com",
  projectId: "mybudgetapp-ae452",
  storageBucket: "mybudgetapp-ae452.firebasestorage.app",
  messagingSenderId: "659773105401",
  appId: "1:659773105401:web:400912f73e5e54dfdd2e28",
  measurementId: "G-Z3PVX8VPBG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);