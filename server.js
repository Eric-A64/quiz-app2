const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ============================
// STATIC FILES
// ============================

app.use(express.static(path.join(process.cwd(), "public")));
app.use('/audio', express.static(path.join(__dirname, 'audio')));
app.use('/media', express.static(path.join(__dirname, 'public/media')));
app.use('/buzzer', express.static(path.join(__dirname, 'public/buzzer')));

// ============================
// INDEX
// ============================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================
// QUIZ API
// ============================

app.get('/api/buzzer-files', (req, res) => {
    const dir = path.join(__dirname, 'public', 'buzzer');

    if (!fs.existsSync(dir)) {
        return res.json([]);
    }

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));

    res.json(files);
});




app.get('/api/quizzes', (req, res) => {
    const dir = path.join(__dirname, 'public', 'quizliste');

    if (!fs.existsSync(dir)) {
        return res.status(500).json({ error: 'quizliste introuvable' });
    }

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));

    res.json(files);
});

app.get('/api/quiz/:id', (req, res) => {
    const file = path.join(__dirname, 'public', 'quizliste', `${req.params.id}.json`);

    if (!fs.existsSync(file)) {
        return res.status(404).json({ error: 'Quiz introuvable' });
    }

    res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

// ============================
// GLOBAL STATE
// ============================

let lobbyPlayers = {};
let scores = {};
let qrState = { visible: false, url: null };

let currentBuzzFile = 'buzz';
let currentBuzzQuestion = null;
let buzzedPlayers = [];
let allBuzzData = [];

// ============================
// BUZZ LOAD
// ============================

function loadBuzzData(file) {
    try {
        const filePath = path.join(__dirname, 'public', 'buzzer', `${file}.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        allBuzzData = Array.isArray(data)
            ? data
            : Object.values(data)[0] || [];

    } catch (e) {
        console.error("Buzz load error:", e.message);
        allBuzzData = [];
    }
}

// ============================
// LOBBY SAVE
// ============================

const LOBBY_FILE = path.join(__dirname, 'lobby.json');

function saveLobby() {
    fs.writeFileSync(LOBBY_FILE, JSON.stringify(lobbyPlayers, null, 2));
}

// ============================
// MEDIA NORMALIZE
// ============================

function normalizeMedia(input) {
    if (!input) return null;

    if (typeof input === "string") {
        return {
            audio: null,
            image: null,
            video: null,
            url: input
        };
    }

    if (Array.isArray(input)) {
        return normalizeMedia(input[0]);
    }

    return {
        audio: input.audio || null,
        image: input.image || null,
        video: input.video || null,
        url: input.url || null
    };
}

function emitMedia(event, data) {
    let media = normalizeMedia(data);
    io.emit(event, media);
}

// ============================
// SOCKET.IO
// ============================

io.on('connection', (socket) => {

    console.log("Client connected:", socket.id);

    // QR sync
    if (qrState.visible && qrState.url) {
        socket.emit('showQRCodeOnScreen', qrState.url);
    }



    // ============================
    // PLAYER
    // ============================

    socket.on('playerJoin', (name) => {
        if (!name) return;

        const clean = name.trim();
        lobbyPlayers[clean] = true;

        if (!scores[clean]) scores[clean] = 0;

        saveLobby();

        io.emit('waitingRoom:snapshot', Object.keys(lobbyPlayers));
    });

    // ============================
    // QUIZ
    // ============================

    socket.on('addQuestion', (q) => io.emit('newQuestion', q));
    socket.on('showCorrectAnswer', (i) => io.emit('showCorrectAnswer', i));

    socket.on('answer', ({ playerName, correct }) => {
        if (!playerName) return;

        scores[playerName] = (scores[playerName] || 0) + (correct ? 1 : 0);
        io.emit('updateScores', scores);
    });

    socket.on('resetScores', () => {
        scores = {};
        io.emit('updateScores', scores);
    });

    // ============================
    // BUZZ
    // ============================

    socket.on('selectBuzzFile', (file) => {
        currentBuzzFile = file.replace('.json', '');
        loadBuzzData(currentBuzzFile);
    });

    socket.on('startBuzzQuestion', ({ index }) => {
        currentBuzzQuestion = allBuzzData[index];
        buzzedPlayers = [];

        io.emit('newBuzzQuestion', currentBuzzQuestion);
        io.emit('resetBuzz');
    });

socket.on('getBuzzQuestions', () => {

    console.log("📥 getBuzzQuestions reçu");

    if (!allBuzzData || allBuzzData.length === 0) {
        console.log("⚠️ allBuzzData vide");
        return;
    }

    socket.emit('buzzQuestionsList', allBuzzData);

    console.log("📤 buzzQuestionsList envoyé");
});

    socket.on('playerBuzz', (name) => {
        if (!name) return;
        if (buzzedPlayers.includes(name)) return;

        buzzedPlayers.push(name);
        io.emit('updateBuzzList', buzzedPlayers);
    });

    socket.on('validateBuzzPlayer', (pos) => {
        const player = buzzedPlayers[pos - 1];
        if (!player) return;

        scores[player] = (scores[player] || 0) + 1;

        io.emit('updateScores', scores);
        io.emit('buzzValidated', { player, pos });
    });

    // ============================
    // MEDIA
    // ============================

    socket.on('showMediaExplanation2', (data) => {
        emitMedia('showMediaExplanation2', data);
    });

    socket.on('showMediaAnswer2', (data) => {
        emitMedia('showMediaAnswer2', data);
    });

    socket.on('clearMediaExplanation', () => {
        io.emit('clearMediaExplanation');
    });

    // ============================
    // QR CODE
    // ============================

    socket.on('showQRCodeOnScreen', (url) => {
        qrState = { visible: true, url };
        io.emit('showQRCodeOnScreen', url);
    });

    socket.on('hideQRCode', () => {
        qrState = { visible: false, url: null };
        io.emit('hideQRCode');
    });

    // ============================
    // DISCONNECT
    // ============================

    socket.on('disconnect', () => {
        console.log("Client disconnected:", socket.id);
    });
});

// ============================
// START SERVER
// ============================

server.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
});