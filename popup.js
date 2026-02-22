document.addEventListener("DOMContentLoaded", () => {

    const urlInput = document.getElementById("urlInput");
    const counter = document.getElementById("counter");
    const delayInput = document.getElementById("delay");
    const maxWaitInput = document.getElementById("maxWait");
    const limitInput = document.getElementById("limit");
    const rememberCb = document.getElementById("remember");
    const status = document.getElementById("status");
    const fileInput = document.getElementById("fileInput");
    const themeToggle = document.getElementById("themeToggle");
    const modeSelect = document.getElementById("modeSelect");

    /* ---------------- THEME ---------------- */

    function applyTheme(theme) {
        document.body.classList.remove("dark", "light");
        document.body.classList.add(theme);
        themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    }

    function loadTheme() {
        chrome.storage.local.get("theme", data => {
            applyTheme(data.theme || "light");
        });
    }

    themeToggle.addEventListener("click", () => {
        const current = document.body.classList.contains("dark") ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        chrome.storage.local.set({ theme: next });
    });

    loadTheme();

    /* ---------------- URL EXTRACTION ---------------- */

    function extractUrls(text, removeDuplicates = false) {
        const regex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s]*)/g;
        const matches = text.match(regex) || [];

        let urls = matches.map(url => {
            if (!/^https?:\/\//i.test(url)) url = "https://" + url;
            try {
                new URL(url);
                return url;
            } catch {
                return null;
            }
        }).filter(Boolean);

        if (removeDuplicates) urls = [...new Set(urls)];
        return urls;
    }

    function getUrlsForOpening() {
        let urls = extractUrls(urlInput.value, false);
        const limit = parseInt(limitInput.value) || 0;
        if (limit > 0) urls = urls.slice(0, limit);
        return urls;
    }

    /* ---------------- COUNTER ---------------- */

    function updateCounter() {
        const raw = extractUrls(urlInput.value, false).length;
        const unique = extractUrls(urlInput.value, true).length;

        counter.textContent =
            raw === unique ? raw : `${raw} (${unique} unique)`;
    }

    /* ---------------- EXTRACT ---------------- */

    function extractAndReplace() {
        const urls = extractUrls(urlInput.value, false);
        urlInput.value = urls.join("\n");
        updateCounter();
        status.textContent = "URLs extracted.";
        setTimeout(() => status.textContent = "", 1500);
    }

    document.getElementById("extractBtn")?.addEventListener("click", extractAndReplace);

    /* ---------------- CLEANUP ---------------- */

    function cleanup() {
        const urls = extractUrls(urlInput.value, true);
        urlInput.value = urls.join("\n");
        updateCounter();
        status.textContent = "Duplicates removed.";
        setTimeout(() => status.textContent = "", 1500);
    }

    document.getElementById("cleanup").onclick = cleanup;

    /* ---------------- OPEN LOGIC ---------------- */

    async function openAll(urls) {
        const mode = modeSelect.value;

        if (mode === "group") {
            const groups = {};
            urls.forEach(url => {
                const host = new URL(url).hostname;
                if (!groups[host]) groups[host] = [];
                groups[host].push(url);
            });

            for (const host in groups) {
                const win = await chrome.windows.create({ url: groups[host][0] });
                for (let i = 1; i < groups[host].length; i++) {
                    chrome.tabs.create({ windowId: win.id, url: groups[host][i] });
                }
            }
            return;
        }

        for (const url of urls) {
            if (mode === "window") {
                await chrome.windows.create({ url });
            } else {
                chrome.tabs.create({ url });
            }
        }
    }

    async function openOneByOne(urls) {
        const delay = parseInt(delayInput.value) * 1000 || 0;
        const maxWait = parseInt(maxWaitInput.value) * 1000 || 0;

        for (const url of urls) {
            chrome.tabs.create({ url });
            await new Promise(r => setTimeout(r, delay || maxWait));
        }
    }

    document.getElementById("openAll").onclick = () =>
        openAll(getUrlsForOpening());

    document.getElementById("openOne").onclick = () =>
        openOneByOne(getUrlsForOpening());

    /* ---------------- EXPORT ---------------- */

    document.getElementById("exportBtn").onclick = () => {
        const urls = extractUrls(urlInput.value, false);
        const blob = new Blob([urls.join("\n")], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "urls.txt";
        link.click();
    };

    /* ---------------- IMPORT ---------------- */

    document.getElementById("importBtn").onclick = () => fileInput.click();

    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            urlInput.value = event.target.result;
            extractAndReplace();
        };
        reader.readAsText(file);
    };

    const clearBtn = document.getElementById("clearUrls");

    function toggleClearButton() {
        if (urlInput.value.trim().length > 0) {
            clearBtn.style.display = "inline-block";
        } else {
            clearBtn.style.display = "none";
        }
    }

    // Initial check
    toggleClearButton();

    // On typing
    urlInput.addEventListener("input", toggleClearButton);

    // Clear functionality
    clearBtn.addEventListener("click", () => {
        urlInput.value = "";
        updateCounter();
        toggleClearButton();
    });

    /* ---------------- COPY ---------------- */

    document.getElementById("copyBtn").onclick = () =>
        navigator.clipboard.writeText(urlInput.value);

    document.getElementById("copyCleanBtn").onclick = () =>
        navigator.clipboard.writeText(extractUrls(urlInput.value, true).join("\n"));

    /* ---------------- CLEAR URLS ---------------- */

    document.getElementById("clearUrls").onclick = () => {
        if (!confirm("Clear all URLs?")) return;
        urlInput.value = "";
        updateCounter();
    };

    /* ---------------- Restore Default (FULL RESET) ---------------- */

    document.getElementById("restore").onclick = () => {
        if (!confirm("Restore all settings to default? This will reset everything.")) return;

        // Reset inputs
        delayInput.value = 0;
        maxWaitInput.value = 3;
        limitInput.value = 0;

        // Reset checkboxes
        rememberCb.checked = false;

        // Reset dropdown
        modeSelect.value = "group";

        // Reset theme
        applyTheme("light");

        // Clear stored data
        chrome.storage.local.remove(["urls", "theme", "mode"]);

        // Clear textarea
        urlInput.value = "";

        updateCounter();

        status.textContent = "All settings restored.";
        setTimeout(() => status.textContent = "", 1500);
    };

    /* ---------------- STORAGE ---------------- */

    function saveState() {
        if (!rememberCb.checked) return;
        chrome.storage.local.set({ urls: urlInput.value });
    }

    function loadState() {
        chrome.storage.local.get("urls", data => {
            if (data.urls) {
                urlInput.value = data.urls;
                updateCounter();
            }
        });
    }

    urlInput.addEventListener("input", () => {
        updateCounter();
        saveState();
    });

    limitInput.addEventListener("input", updateCounter);
    rememberCb.addEventListener("change", saveState);

    loadState();
    updateCounter();
});