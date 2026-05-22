const { app, BrowserWindow, screen } = require('electron');
const http = require('http');

let win;

const URL = "http://192.168.0.185:3000/screen.html";

// 🔎 check serveur
function waitForServer(url, retries = 20, delay = 500) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          console.log("✅ Serveur prêt");
          resolve();
        } else {
          retry(n);
        }
      }).on("error", () => retry(n));
    };

    const retry = (n) => {
      if (n <= 0) {
        reject("❌ Serveur inaccessible");
      } else {
        console.log(`⏳ Attente serveur... (${n})`);
        setTimeout(() => attempt(n - 1), delay);
      }
    };

    attempt(retries);
  });
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find(d => !d.internal) || displays[0];

  win = new BrowserWindow({
    x: externalDisplay.bounds.x,
    y: externalDisplay.bounds.y,
    width: externalDisplay.bounds.width,
    height: externalDisplay.bounds.height,
    kiosk: true,
    fullscreen: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  // 🚀 LOAD UNE SEULE FOIS
  win.loadURL(URL);

  // ✅ fenêtre prête
  win.once('ready-to-show', () => {
    console.log("🟢 Fenêtre affichée");
    win.show();
  });

  // ❌ si ça plante → retry
  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.log("❌ LOAD FAIL:", code, desc);

    setTimeout(() => {
      console.log("🔁 Retry load...");
      win.loadURL(URL);
    }, 1000);
  });

  // 🔥 🔥 🔥 INJECTION DES LIBS (LA CLÉ)
  win.webContents.on("did-finish-load", async () => {
    console.log("🔧 Injection des scripts...");

    try {
      await win.webContents.executeJavaScript(`
        (function() {

          function loadScript(src, name) {
            return new Promise((resolve) => {
              if (window[name]) {
                console.log(name + " déjà présent");
                return resolve();
              }

              console.log("📦 Chargement " + name);

              var s = document.createElement('script');
              s.src = src;
              s.onload = () => {
                console.log("✅ " + name + " chargé");
                resolve();
              };
              s.onerror = () => {
                console.warn("❌ Erreur chargement " + name);
                resolve();
              };

              document.head.appendChild(s);
            });
          }

          return Promise.all([
            loadScript(
              "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
              "QRCode"
            ),
            loadScript(
              "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js",
              "confetti"
            )
          ]);

        })();
      `);
    } catch (err) {
      console.error("Injection error:", err);
    }
  });

  win.webContents.openDevTools();
}

// 🚀 START APP
app.whenReady().then(async () => {
  try {
    await waitForServer("http://192.168.0.185:3000");
    createWindow();
  } catch (err) {
    console.error(err);
  }
});