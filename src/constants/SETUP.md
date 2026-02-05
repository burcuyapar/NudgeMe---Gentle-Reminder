# Setup Instructions

## Prerequisites

- Node.js 18+
- Xcode (for iOS development)
- CocoaPods
- Expo CLI

## Installation

1. **Clone the repository**
```bash
   git clone https://github.com/burcuyapar/NudgeMe---Gentle-Reminder.git
   cd NudgeMe---Gentle-Reminder
```

2. **Install dependencies**
```bash
   npm install
   cd ios && pod install && cd ..
```

3. **Configure API keys**
```bash
   cd src/constants
   cp config.js.template config.js
```
   
   Then edit `config.js` with your actual API credentials:
   - **Supabase**: Get from https://app.supabase.com/project/_/settings/api
   - **OpenAI**: Get from https://platform.openai.com/api-keys
   - **Anthropic**: Get from https://console.anthropic.com/settings/keys

4. **Run on iOS Simulator**
```bash
   npx expo prebuild --platform ios --clean
   cd ios
   open NudgeMeGentleReminder.xcworkspace
```
   Then build and run in Xcode.

## Configuration

Your `src/constants/config.js` should look like:
```javascript
export const CONFIG = {
  SUPABASE_URL: 'https://abcd1234.supabase.co',     // Your actual URL
  SUPABASE_ANON_KEY: 'eyJhbGc...',                   // Your actual key
  OPENAI_API_KEY: 'sk-proj-...',                     // Your actual key
  ANTHROPIC_API_KEY: 'sk-ant-...',                   // Your actual key
};
```

⚠️ **Never commit `config.js` to Git!** It's protected by `.gitignore`.

## Troubleshooting

If you see "Configuration Error" when running the app, verify that:
1. You copied `config.js.template` to `config.js`
2. You replaced all placeholder values with real API keys
3. No placeholders like "your-project" remain in the file
```

4. **Commit message**: `docs: Add setup instructions`
5. Click **"Commit changes"**

---

## Visual Summary

Your repository structure should now look like:
```
NudgeMe---Gentle-Reminder/
├── .gitignore                          ← Updated to protect config.js
├── README.md                           ← Already there
├── LICENSE                             ← Already there
├── ARCHITECTURE                        ← Already there
├── JOURNEY                             ← Already there
├── SETUP.md                            ← New file (optional)
└── src/
    └── constants/
        └── config.js.template          ← New file (this is safe to commit)
