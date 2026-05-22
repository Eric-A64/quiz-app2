// ============================
// Import des modules
// ============================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const { exec } = require("child_process");
const os = require("os"); // ✅ AJOUT IMPORTANT

let qrState = {
    visible: false,
    url: null
};

// ============================
// Configuration serveur
// ============================

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// ============================
// Middleware
// ============================


app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'audio')));
app.use('/media', express.static(path.join(__dirname, 'public/media')));
app.use('/buzzer', express.static(path.join(__dirname, 'public/buzzer')));
app.get('/api/buzzer-files', (req, res) => {
    const dir = path.join(__dirname, 'public', 'buzzer');

    fs.readdir(dir, (err, files) => {
        if (err) {
            console.error("❌ readDir buzzer error:", err);
            return res.status(500).json([]);
        }

        const jsonFiles = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));

        res.json(jsonFiles);
    });
});


// ✅ PAGE D'ACCUEIL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================
// Routes HTTP - Quiz
// ============================

app.get('/quizzes.json', (req, res) => {
    const filePath = path.join(__dirname, 'quizzes.json');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Fichier quizzes.json introuvable' });
    }

    res.sendFile(filePath);
});

app.get('/api/quizzes', (req, res) => {
    const quizDir = path.join(__dirname, 'public', 'quizliste');

    try {
        if (!fs.existsSync(quizDir)) {
            return res.status(500).json({ error: 'quizliste introuvable' });
        }

        const files = fs.readdirSync(quizDir);

        const quizzes = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace(/\.json$/, ''));

        return res.json(quizzes);

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'server error' });
    }
});

// quiz normal
app.get('/api/quiz/:theme', (req, res) => {
    const theme = req.params.theme;
    const filePath = path.join(__dirname, 'public', 'quizliste', `${theme}.json`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Thème non trouvé dans public/quizliste' });
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Erreur lecture quiz' });

        try {
            const quiz = JSON.parse(data);
            res.json(quiz);
        } catch (e) {
            res.status(500).json({ error: 'Erreur parsing JSON du quiz' });
        }
    });
});

// ============================
// Gestion Buzzer
// ============================

let currentBuzzFile = 'buzz';
let currentBuzzQuestion = null;
let buzzedPlayers = [];
let timerInterval = null;
let timerActive = false;
let currentTheme = null;
let allBuzzData = [];
let scoreScreenActive = false;

loadBuzzDataFromFile(currentBuzzFile);

let buzzFolder = path.join(__dirname, 'public/buzzer');

if (fs.existsSync(buzzFolder)) {
  console.log("FILES:", fs.readdirSync(buzzFolder));
}

function loadBuzzDataFromFile(filename) {
  if (!filename) return;

  const cleanName = filename.toString().replace(/\.json$/i, '').trim();
  const filePath = path.join(__dirname, 'public', 'buzzer', `${cleanName}.json`);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      allBuzzData = parsed;
    } else if (parsed[cleanName]) {
      allBuzzData = parsed[cleanName];
    } else {
      const firstKey = Object.keys(parsed)[0];
      allBuzzData = parsed[firstKey] || [];
    }

    console.log("📦 BUZZ LOADED :", allBuzzData.length);

  } catch (err) {
    console.error("❌ Erreur JSON buzz:", err);
    allBuzzData = [];
  }
}
// ============================
// Routes Buzz
// ============================

app.get('/api/quiz/:quizId', (req, res) => {
  const quizId = req.params.quizId;

  const quizPath = path.join(
    __dirname,
    'public',
    'quizliste',
    quizId.endsWith('.json') ? quizId : `${quizId}.json`
  );

  fs.readFile(quizPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).json({ error: 'Quiz non trouvé' });
    }

    try {
      res.json(JSON.parse(data));
    } catch (e) {
      res.status(500).json({ error: 'JSON invalide' });
    }
  });
});


app.get('/buzzer/:file', (req, res, next) => {
  const file = req.params.file;

  const fileWithExt = file.endsWith('.json') ? file : `${file}.json`;

  const filePath = path.join(__dirname, 'public', 'buzzer', fileWithExt);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Buzz file introuvable');
  }

  res.sendFile(filePath);
});
// ============================
// Lobby / Scores
// ============================

let lobbyPlayers = {};
let scores = {};



const LOBBY_FILE = path.join(__dirname, "lobby.json");


function resetLobby() {

    lobbyPlayers = {};
    scores = {};

    fs.writeFileSync(LOBBY_FILE, JSON.stringify({}, null, 2));

    io.emit("waitingRoom:snapshot", []);
    io.emit("updateWaitingRoom", []);
    io.emit("updateScores", {});

    console.log("🧹 LOBBY + FILE RESET COMPLET");
}

// ============================
// LOAD AU DÉMARRAGE
// ============================

if (fs.existsSync(LOBBY_FILE)) {
    try {
        lobbyPlayers = JSON.parse(fs.readFileSync(LOBBY_FILE, "utf8"));
    } catch (e) {
        console.error("❌ lobby.json corrompu, reset");
        lobbyPlayers = {};
    }
}

// ============================
// SAVE FUNCTION
// ============================

function saveLobby() {
    fs.writeFileSync(LOBBY_FILE, JSON.stringify(lobbyPlayers, null, 2));
}

// ============================
// Helpers media
// ============================


function getWaitingRoomSnapshot() {
    return Object.values(lobbyPlayers);
}




function normalizeMedia(input) {
    if (!input) return null;

    // STRING → toujours objet
    if (typeof input === "string") {
        return {
            audio: null,
            image: null,
            video: null,
            url: input.startsWith("/") ? input : "/" + input
        };
    }

    // ARRAY
    if (Array.isArray(input)) {
        return normalizeMedia(input[0]);
    }

    // OBJECT
    if (typeof input === "object") {

        return {
            audio: input.audio ? (input.audio.startsWith("/") ? input.audio : "/" + input.audio) : null,
            image: input.image ? (input.image.startsWith("/") ? input.image : "/" + input.image) : null,
            video: input.video ? (input.video.startsWith("/") ? input.video : "/" + input.video) : null,
            url: input.url || null
        };
    }

    return null;
}







function emitMedia(event, data) {

    console.log("📺 RAW EMIT DATA:", event, data);

    if (!data) return;

    let media = normalizeMedia(data);

    // 🔥 CAS STRING → transformer en objet compatible FRONT
    if (typeof media === "string") {
        media = {
            kind: "file",
            url: media
        };
    }

    // 🔥 CAS OBJET INCOMPLET
    if (typeof media === "object" && !media.kind) {
        media = {
            kind: "multi",
            audio: media.audio || null,
            image: media.image || null,
            video: media.video || null,
            url: media.url || null
        };
    }

    console.log("📺 EMIT FINAL:", event, media);

    io.emit(event, media);
}




// ============================
// Socket.IO
// ============================

io.on('connection', (socket) => {

    console.log('Client connecté :', socket.id);

    if (qrState.visible && qrState.url) {
        socket.emit('showQRCodeOnScreen', qrState.url);
    }

socket.on("screen:init", () => {
    socket.emit("waitingRoom:snapshot", Object.keys(lobbyPlayers));
});

socket.on("admin:resetLobby", () => {
    resetLobby();
});

    socket.onAny((event, ...args) => {
        console.log("📡 SOCKET EVENT:", event, args);
    });

    socket.on('playerJoin', (name) => {
    const cleanName = name?.trim();
    if (!cleanName) return;

    socket.playerName = cleanName;

    lobbyPlayers[cleanName] = true;

    if (!scores.hasOwnProperty(cleanName)) {
        scores[cleanName] = 0;
    }

    saveLobby();

    const players = Object.keys(lobbyPlayers);

    io.emit('waitingRoom:snapshot', players);
    io.emit('updateWaitingRoom', players);
});





    socket.on('addQuestion', (question) => io.emit('newQuestion', question));
    socket.on('showCorrectAnswer', (correctIndex) => io.emit('showCorrectAnswer', correctIndex));




    socket.on('answer', ({ playerName, correct }) => {

    if (typeof playerName !== 'string') return;

    scores[playerName] =
        (scores[playerName] || 0) + (correct ? 1 : 0);

    if (!scoreScreenActive) {
        io.emit('updateScores', scores);
    }
});




    socket.on('endQuiz', () => {
        const podium = Object.entries(scores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([playerName, score]) => ({ playerName, score }));

        io.emit('showPodium', podium);
    });

    socket.on('showMediaExplanation', (media) => {
        io.emit('showMediaExplanation', media);
    });



    socket.on('showMediaExplanation2', (data) => {

    console.log("📥 RECU SHOW MEDIA:", data);

    if (!data) return;

    // 🔧 normalisation des formats entrants
    let normalized = data;

    // si string → chemin fichier
    if (typeof normalized === "string") {
        normalized = { media: normalized };
    }

    // si array → on prend le premier élément
    if (Array.isArray(normalized)) {
        normalized = normalized[0];
    }

    // sécurité si objet déjà partiellement structuré
    if (typeof normalized === "object") {
        normalized = {
            audio: normalized.audio || null,
            image: normalized.image || null,
            video: normalized.video || null,
            url: normalized.url || normalized.media || null
        };
    }

    emitMedia('showMediaExplanation2', normalized);
});





    socket.on('showMediaAnswer2', (data) => {
        emitMedia('showMediaAnswer2', data);
    });

    socket.on('clearMediaExplanation', () => {
        io.emit('clearMediaExplanation');
    });

    socket.on('resetScores', () => {
        scores = {};
        io.emit('updateScores', scores);
    });

    socket.on('showQRCodeOnScreen', (url) => {
        qrState.visible = true;
        qrState.url = url;
        io.emit('showQRCodeOnScreen', url);
    });

    socket.on('hideQRCode', () => {
        qrState = { visible: false, url: null };
        io.emit('hideQRCode');
    });

    socket.on('getBuzzQuestions', () => {
        socket.emit('buzzQuestionsList', allBuzzData);
    });

    socket.on('startBuzzQuestion', ({ index }) => {
        const question = allBuzzData?.[index];
        if (!question) return socket.emit('errorMessage', 'Question invalide');

        currentBuzzQuestion = question;
        buzzedPlayers = [];

        io.emit('newBuzzQuestion', question);
        io.emit('resetBuzz');
    });

    socket.on('selectBuzzFile', (file) => {
        const clean = file?.replace('.json', '');
        currentBuzzFile = clean;

        loadBuzzDataFromFile(clean);

        socket.emit('buzzQuestionsList', allBuzzData);
    });

    socket.on('buzzAddQuestion', (question) => {
        io.emit('buzzAddQuestion', question);
    });

    socket.on('playerBuzz', (playerName) => {
        if (typeof playerName !== 'string') return;
        if (!currentBuzzQuestion) return;
        if (buzzedPlayers.includes(playerName)) return;

        buzzedPlayers.push(playerName);
        io.emit('updateBuzzList', buzzedPlayers);
    });



    socket.on('showScoreScreen', (scores) => {

    socket.broadcast.emit('showScoreScreen', scores);

});



    socket.on('hideScoreScreen', () => {

    socket.broadcast.emit('hideScoreScreen');

});


// ============================
// PODIUM
// ============================

socket.on('showPodium', (data) => {

    console.log("🏆 SHOW PODIUM:", data);

    io.emit('showPodium', data);

});

socket.on('hidePodium', () => {

    console.log("🧹 HIDE PODIUM");

    io.emit('hidePodium');

});




    socket.on('validateBuzzPlayer', (position) => {

    const playerName = buzzedPlayers[position - 1];

    if (!playerName) {
        return socket.emit('errorMessage', 'Pas de joueur à cette position');
    }

    scores[playerName] = (scores[playerName] || 0) + 1;

    if (!scoreScreenActive) {
        io.emit('updateScores', scores);
    }

    io.emit('buzzValidated', { playerName, position });
});






    socket.on('validatePlayerAnswer', ({ playerName }) => {

    if (!playerName) return;

    scores[playerName] = (scores[playerName] || 0) + 1;

    if (!scoreScreenActive) {
        io.emit('updateScores', scores);
    }

    io.emit('buzzValidated', { playerName });
});







    socket.on('launchBuzzMediaAndQuestion', (index) => {
        const question = allBuzzData?.[index];
        if (!question) return socket.emit('errorMessage', 'Question buzzer invalide');

        currentBuzzQuestion = question;
        buzzedPlayers = [];

        io.emit('newBuzzQuestion', question);
        io.emit('resetBuzz');

        if (question.mediaExplanation2) {
            const mediaPath = `/media/${question.mediaExplanation2}`;
            emitMedia('showMediaExplanation2', mediaPath);
        }
    });

    socket.on('disconnect', () => {
    if (socket.playerName) {
        delete lobbyPlayers[socket.playerName];
        saveLobby();

        io.emit('waitingRoom:snapshot', Object.keys(lobbyPlayers));
        io.emit('updateWaitingRoom', Object.keys(lobbyPlayers));
    }
});
});

// ============================
// Lancement serveur
// ============================

function getLocalIP() {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }

    return 'localhost';
}

const LOCAL_IP = '192.168.0.185';


console.log("ROUTES API CHARGÉES OK");

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});