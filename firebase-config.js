// Indsaet konfigurationen fra Firebase Console > Project settings > Your apps.
// Firebase web config er ikke en hemmelighed, men database-reglerne skal stadig sikre dataene.
window.firebaseConfig = {
  apiKey: "AIzaSyAPUjX1CnZVxXI3VS9eIcJKjNJmiwrY62o",
  authDomain: "bryllup-7f66a.firebaseapp.com",
  databaseURL: "https://bryllup-7f66a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bryllup-7f66a",
  storageBucket: "bryllup-7f66a.firebasestorage.app",
  messagingSenderId: "386198944236",
  appId: "1:386198944236:web:e620399530584f6d0268c9"
};

window.firebaseSettings = {
  questionsPath: "questions",
  activeQuestionPath: "activeQuestion",
  answersPath: "answers",
  participantsPath: "participants",
  submissionsPath: "submissions",
  winnersPath: "winners",
  allowClientClear: false
};
