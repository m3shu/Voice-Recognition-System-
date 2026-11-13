# বাংলা ভয়েস রিকগনিশন · Bangla Voice Recognition System

বাংলায় কথা বলুন, সঙ্গে সঙ্গে বাংলা লেখা পান।
Speak Bangla and get Bangla text in real time, right in the browser.

## চালানোর নিয়ম · How to run

1. **`start.bat`** ফাইলে ডাবল-ক্লিক করুন। (Double-click `start.bat`.)
   - অথবা টার্মিনালে: `python server.py`
2. Google Chrome-এ অ্যাপটি খুলবে: `http://localhost:8000`
3. মাইক বাটনে ক্লিক করুন (বা <kbd>Ctrl</kbd>+<kbd>M</kbd>), মাইক্রোফোনের অনুমতি দিন, এবং বাংলায় কথা বলুন।

**প্রয়োজন · Requirements**
- **Google Chrome** (best Bangla support). Edge may work; Firefox, Brave and Opera do not support it.
- **ইন্টারনেট সংযোগ**: Chrome sends the audio to Google's speech service for recognition.
- A microphone.
- Python 3 (only for the small local server; no packages needed).

> The page must be opened from `http://localhost` (which `start.bat` does), not by double-clicking `index.html`. Browsers only allow the microphone on secure pages.

## বৈশিষ্ট্য · Features

| | |
|---|---|
| সরাসরি লেখা | Live transcription while you speak, with partial results shown as you talk |
| ভাষা | বাংলা (বাংলাদেশ) `bn-BD`, বাংলা (ভারত) `bn-IN`, English `en-US` |
| ভয়েস কমান্ড | Say punctuation out loud (see below) |
| বাংলা সংখ্যা | Converts `25` → `২৫` automatically (toggle) |
| সম্পাদনা | The transcript is a normal text box. Edit freely while dictating |
| কপি / ডাউনলোড | Copy to clipboard or download as UTF-8 `.txt` |
| সংরক্ষণ | Save transcripts to a history list (stored only in this browser) |
| পড়ে শোনান | Read the text aloud if a Bangla voice is installed |
| অটো-রিস্টার্ট | Keeps listening when Chrome ends a session after silence |
| মাইক লেভেল | Live microphone level meter |

## ভয়েস কমান্ড · Voice commands

Say the command as a separate word:

| বলুন (Say) | ফলাফল (Result) |
|---|---|
| দাঁড়ি / পূর্ণচ্ছেদ | । |
| কমা | , |
| প্রশ্নবোধক চিহ্ন | ? |
| বিস্ময়সূচক চিহ্ন | ! |
| কোলন / সেমিকোলন | : / ; |
| নতুন লাইন | line break |
| নতুন অনুচ্ছেদ | new paragraph |
| থামো *(একা বললে)* | stop listening |
| মুছে দাও *(একা বললে)* | remove the last spoken part |

Example: “আমি ভালো আছি **দাঁড়ি** তুমি কেমন আছো **প্রশ্নবোধক চিহ্ন**” → “আমি ভালো আছি। তুমি কেমন আছো?”

`থামো` and `মুছে দাও` only work when said on their own, so normal sentences that contain those words are not affected. Turn off **ভয়েস কমান্ড** if you need to dictate these words literally.

To add or change commands, edit the lists at the top of [js/bangla-text.js](js/bangla-text.js).

## প্রজেক্ট গঠন · Project structure

```
index.html            UI
css/style.css         styles (light + dark mode, mobile friendly)
js/bangla-text.js     Bangla text processing: commands, digits, spacing, counts
js/app.js             speech recognition, UI, history, read-aloud
server.py             local server that opens the app in Chrome
start.bat             double-click launcher for Windows
tests/                unit tests for the text processing
```

Run the tests with Node.js:

```
node --test tests/bangla-text.test.js
```

## সমস্যা সমাধান · Troubleshooting

| সমস্যা | সমাধান |
|---|---|
| “মাইক্রোফোন ব্যবহারের অনুমতি দেওয়া হয়নি” | Click the icon left of the address bar → Microphone → Allow. Also check *Windows Settings → Privacy & security → Microphone*. |
| “নেটওয়ার্ক সমস্যা” | Check your internet connection. Brave and Opera always show this, so use Chrome. |
| Nothing appears when speaking | Make sure the right microphone is selected in Chrome (`chrome://settings/content/microphone`). |
| “পড়ে শোনান” is greyed out | No Bangla text-to-speech voice is installed. Microsoft Edge includes one. |
| Port 8000 busy | The server picks the next free port automatically, or run `python server.py --port 9000`. |

## গোপনীয়তা · Privacy

Recognition runs through the browser's speech service (Google's in Chrome), so audio leaves your computer while the microphone is on. Transcripts, history and settings are stored only in your browser's local storage on this machine.
