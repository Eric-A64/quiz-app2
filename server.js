const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ============================
// STATIC (Render safe)
// ============================

app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'audio')));
app.use('/media', express.static(path.join(__dirname, 'public/media')));
app.use('/buzzer', express.static(path.join(__dirname, 'public/buzzer')));

// ============================
// HOME
// ============================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================
// QUIZ API
// ============================

app.get('/api/quizzes', (req, res) => {
    const quizDir = path.join(__dirname, 'public', 'quizliste');

    if (!fs.existsSync(quizDir)) {
        return res.status(500).json({ error: 'quizliste introuvable' });
    }

    const files = fs.readdirSync(quizDir)
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
// STATE GLOBAL (Render memory)
// ============================

let lobbyPlayers = {};
let scores = {};
let qrState = { visible: false, url: null };

let currentBuzzQuestion = null;
let buzzedPlayers = [];
let allBuzzData = [];
let currentBuzzFile = 'buzz';

// ============================
// HELPERS BUZZ
// ============================

function loadBuzzData(file) {
    try {
        const safeFile = path.parse(file).name;

        const filePath = path.join(
            __dirname,
            'public',
            'buzzer',
            `${safeFile}.json`
        );

        if (!fs.existsSync(filePath)) {
            console.error("Buzz file introuvable:", filePath);
            allBuzzData = [];
            return;
        }

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
// SOCKET.IO (CORE GAME ENGINE)
// ============================

io.on('connection', (socket) => {

    console.log("Client connected:", socket.id);

    // sync QR
    if (qrState.visible) {
        socket.emit('showQRCodeOnScreen', qrState.url);
    }

    // ============================
    // PLAYER JOIN
    // ============================

    socket.on('playerJoin', (name) => {
        if (!name) return;

        lobbyPlayers[name] = true;
        scores[name] = scores[name] || 0;

        io.emit('waitingRoom:snapshot', Object.keys(lobbyPlayers));
    });

    // ============================
    // QUIZ FLOW
    // ============================

    socket.on('addQuestion', (q) => io.emit('newQuestion', q));
    socket.on('showCorrectAnswer', (i) => io.emit('showCorrectAnswer', i));

    socket.on('answer', ({ playerName, correct }) => {
        if (!playerName) return;

        scores[playerName] += correct ? 1 : 0;

        io.emit('updateScores', scores);
    });

    socket.on('resetScores', () => {
        scores = {};
        io.emit('updateScores', scores);
    });

    // ============================
    // BUZZER
    // ============================

    socket.on('selectBuzzFile', (file) => {
        currentBuzzFile = path.parse(file).name;
        loadBuzzData(currentBuzzFile);
    });

    socket.on('startBuzzQuestion', ({ index }) => {
        currentBuzzQuestion = allBuzzData[index];
        buzzedPlayers = [];

        io.emit('newBuzzQuestion', currentBuzzQuestion);
        io.emit('resetBuzz');
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
// START SERVER (RENDER)
// ============================

server.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
});