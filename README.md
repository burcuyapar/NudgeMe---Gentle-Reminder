# 🔔 NudgeMe - AI Voice Assistant for Busy Parents

*"Let your mind rest. NudgeMe remembers."*

A voice-first AI assistant that helps overwhelmed parents manage family schedules, school pickups, activities, and self-care through natural conversation.

![Status](https://img.shields.io/badge/Status-Build%207%20Complete-success)
![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-blue)
![Framework](https://img.shields.io/badge/Framework-React%20Native%20%2B%20Expo-purple)

---

## 📱 Try NudgeMe on TestFlight

**Live beta available now!**

👉 **[Join the Beta](https://testflight.apple.com/join/KUwQsFbz)** 👈

*Note: iOS device required. TestFlight is Apple's official beta testing platform.*

## 🎯 The Problem

Parents juggle countless responsibilities daily - school drop-offs, activity pickups, meal prep, appointments - leading to mental overload and missed commitments.

## ✨ The Solution

NudgeMe captures your family's routines through natural voice conversation and sends intelligent push notifications at the right time, so you can focus on what matters.

---

## 🚀 Current Features (Build 7)

### ✅ Voice-Powered Onboarding
- 6-step conversational flow to learn your family
- Natural language processing (no forms!)
- Collects: children info, school schedules, activities, self-care routines

### ✅ AI Voice Assistant
- Two-way voice conversation (tap & hold to speak)
- Powered by **Claude Haiku 4.5 (claude-haiku-4-5-20251001)** + OpenAI Whisper + TTS
- Create reminders naturally: *"Pick up Emma from ballet at 4pm tomorrow"*
- Enterprise-grade security with prompt injection defense

### ✅ Smart Dashboard
- Time-aware greetings (Good morning/afternoon/evening)
- Today's reminders + Upcoming section
- Swipe to delete, tap to complete
- Child-specific color-coded icons

### ✅ Reminder Intelligence
- Auto-generates reminders from conversation
- 4 types: School drop-off/pickup, Activities, Personal care
- Smart time parsing (*"tomorrow at 3"* → actual date/time)
- Duplicate detection and conflict resolution

### ✅ Push Notifications
- Local notifications at reminder time
- Recurring support (daily/weekly)
- Tap notification → opens app to reminder details

### ✅ Profile & Family Management
- Gender-neutral child icons (colored circles + initials)
- Edit family info, school schedules, activities
- Clean, calming UI designed for busy parents

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React Native (Expo SDK 54) |
| **Navigation** | React Navigation 7 |
| **Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth |
| **Voice Input** | OpenAI Whisper (speech-to-text) |
| **Conversation AI** | **Claude Haiku 4.5 (claude-haiku-4-5-20251001)** (voice assistant)<br>**GPT-4.1-mini (gpt-4.1-mini)** (onboarding parsing) |
| **Voice Output** | OpenAI TTS-1-HD (nova voice) |
| **Notifications** | expo-notifications |
| **Audio** | expo-av |

---

## 📂 Project Structure

```
NudgeMe/
├── src/
│   ├── screens/
│   │   ├── OnboardingScreen.js      # Voice-guided setup
│   │   ├── VoiceAssistantScreen.js  # Main AI chat
│   │   ├── DashboardScreen.js       # Today's reminders
│   │   ├── AllRemindersScreen.js    # Categorized view
│   │   ├── ProfileScreen.js         # Family info
│   │   ├── AddReminderScreen.js     # Manual entry
│   │   └── [15+ other screens]
│   ├── services/
│   │   ├── whisper.js               # Speech-to-text
│   │   ├── claude.js                # AI conversation
│   │   ├── openai.js                # Parsing & chat
│   │   ├── textToSpeech.js          # Text-to-speech
│   │   ├── notifications.js         # Push notifications
│   │   ├── reminders.js             # CRUD operations
│   │   └── supabase.js              # Database client
│   ├── components/
│   │   ├── AnimatedMicButton.js
│   │   ├── TypingDotsAnimation.js
│   │   └── WaveformAnimation.js
│   ├── constants/
│   │   ├── config.js.template       # API keys template
│   │   └── theme.js                 # Design system
│   └── navigation/
│       └── AppNavigator.js          # Route definitions
├── App.js                           # Entry point
└── package.json                     # Dependencies
```

---

## 🔐 Security Features

- **Prompt Injection Defense**: 4-layer protection against malicious input
- **Input Validation**: 30+ attack patterns detected
- **Output Sanitization**: Prevents system prompt leaks
- **Rate Limiting**: 5 attempts/hour per user
- **Strict Boundaries**: Refuses medical/parenting/mental health advice
- **API Key Protection**: Keys in `src/constants/config.js`, excluded from Git via `.gitignore`

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 20 (required)**
- npm or yarn
- Expo CLI
- iOS Simulator or physical device (for native features)

### Node Version Management
If you have `nvm` installed, run:
```bash
source ~/.nvm/nvm.sh
nvm use 20
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/burcuyapar/NudgeMe---Gentle-Reminder.git
cd NudgeMe
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp src/constants/config.js.template src/constants/config.js
```
   
Edit `src/constants/config.js` and add your API keys:
- Supabase URL and Anon Key
- OpenAI API Key
- Anthropic API Key

4. **Run the app**
```bash
npx expo run:ios
```
*Note: Due to custom native modules, you must use `run:ios` or `run:android` rather than `expo start`.*

---

## 📊 Database Schema

### `users` Table
- `user_id`, `user_name`, `email`
- `num_children`, `children_info` (JSONB)
- `school_schedule`, `activities` (JSONB)

### `reminders` Table
- `id`, `user_id`, `what`, `when_date`, `when_time`
- `reminder_type`, `recurrence`, `child_name`
- `notification_id`, `is_completed`, `notes`

### `children` Table
- `id`, `user_id`, `name`, `age`
- `school_name`, `dropoff_time`, `pickup_time`
- `activities` (JSONB)

---

## 🧪 Build History

| Build | Date | Status | Key Changes |
|-------|------|--------|-------------|
| Build 1 | Dec 2025 | ✅ | Initial MVP Research & Setup |
| Build 2 | Jan 2026 | ✅ | First TestFlight Upload |
| Build 4 | Feb 2026 | ✅ | Auto sign-in & Notification rescheduling |
| Build 6 | Apr 2026 | ✅ | Claude model update & TestFlight links |
| **Build 7** | **May 14, 2026** | ✅ | **Migrate retired AI models (Claude 4.5, GPT 4.1), Node 20 Fix** |

---

## 🎓 Key Learnings

1. **React Native**: Base64 encoding requires Buffer package (no native `btoa`)
2. **Expo SDK 54**: Native modules require prebuild flow
3. **AI Conversation**: Structured prompts > free-form for data collection
4. **Security**: Prompt injection is real - 4-layer defense essential
5. **UX**: Voice-first reduces friction for busy parents dramatically

---

## 🤝 Contributing

This is a personal learning project, but feedback is welcome! Feel free to:
- Open issues for bugs or feature requests
- Submit PRs for improvements
- Share ideas for making parents' lives easier

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👩‍💻 About

Built by **Burcu Yapar** as part of an intensive journey to transition into product management and AI development.

**Status**: 🟢 Build 7 Complete | Ready for Beta Testing  
**Version**: 1.0.0 (Build 7)  
**Last Updated**: May 14, 2026