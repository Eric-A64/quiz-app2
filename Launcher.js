// launcher.js (version locale sans ngrok)

const express = require('express');
const path = require('path');

const PORT = 3000;

// 1️⃣ Démarrer le serveur Express
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// routes optionnelles (si tu en as besoin)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('=======================================');
  console.log('🎮 QUIZ LOCAL DÉMARRÉ');
  console.log(`📍 URL locale : http://localhost:${PORT}`);
  console.log(`📱 Admin : http://localhost:${PORT}/admin.html`);
  console.log(`📺 Screen : http://localhost:${PORT}/screen.html`);
  console.log(`🎤 Player : http://localhost:${PORT}/player.html`);
  console.log('=======================================');
});