# 🔔 NudgeMe - AI Voice Assistant for Busy Parents

*"Let your mind rest. NudgeMe remembers."*

A voice-first AI assistant that helps overwhelmed parents manage family schedules, school pickups, activities, and self-care through natural conversation.

![Status: Production](https://img.shields.io/badge/Status-Production%20Ready-success)
![Platform](https://img.shields.io/badge/Platform-iOS-blue)
![Framework](https://img.shields.io/badge/Framework-React%20Native%20%2B%20Expo-purple)
![TestFlight](https://img.shields.io/badge/TestFlight-Build%205%20Live-orange)

**🎯 Portfolio Project | 📱 Live on TestFlight | 🔒 Enterprise-Grade Security**

---

## 📖 Overview

NudgeMe is a production-ready iOS application that serves as a "second brain" for busy parents. Instead of manually entering reminders, parents simply speak naturally about their day, and AI handles the complexity of parsing, scheduling, and delivering context-aware notifications.

**This project demonstrates:**
- 📱 Full-stack mobile development from concept to production
- 🤖 Multi-AI integration (Claude, OpenAI Whisper, GPT-4, TTS)
- 🔐 Security-first architecture with Row Level Security
- 🎯 Complex notification systems with context-aware timing
- 🎤 Voice-first UX design and implementation
- 🚀 Professional deployment pipeline via TestFlight
- 🐛 Production debugging and critical bug fixes

---

## ✨ Key Features

### 🎤 Voice-Powered Onboarding
- 6-step conversational setup flow
- Natural language processing for family information
- Age-aware question logic (daycare, preschool, school)
- Persistent sessions with automatic authentication

### 🤖 AI Voice Assistant
- **Claude 3 Haiku (claude-3-haiku-20240307)** for intelligent reminder parsing
- **OpenAI Whisper** for accurate speech-to-text
- **GPT-4o-mini** for natural conversation
- **OpenAI TTS-1-HD** for human-like voice responses
- Press-and-hold microphone prevents user interruption
- Real-time audio level feedback

### 🔔 Smart Notification System
Sophisticated two-time architecture enabling context-aware alerts:

| Reminder Type | Advance Notice |
|---------------|----------------|
| School pickups | 30 minutes before |
| Activities | 60 minutes before |
| Pills/supplements | Exact time |
| Self-care (yoga, gym) | Configurable timing |

### 📊 Intelligent Dashboard
- Time-aware greetings (Good morning/afternoon/evening)
- Today's reminders + Upcoming section
- Child-specific color-coded interface
- Swipe to delete, tap to complete
- Empty state guidance

### 🔒 Production-Grade Security
- **Row Level Security (RLS)** enforcing user data isolation
- Multi-user support with zero cross-contamination
- Secure authentication via Supabase
- No sensitive data in client-side storage
- Proper foreign key relationships for data integrity

---

## 🏗️ Technical Architecture

### Tech Stack

```
Frontend:          React Native 0.75.4 + Expo SDK 54
Backend:           Supabase (PostgreSQL + Auth + RLS)
AI Services:       Claude 3 Haiku (claude-3-haiku-20240307), OpenAI (Whisper, GPT-4o-mini, TTS-1-HD)
Notifications:     Expo Notifications API (local scheduling)
Navigation:        React Navigation 7
State Management:  React Hooks + AsyncStorage
Voice Processing:  expo-av for audio recording
```

### Database Schema

```sql
users
├── id (UUID, primary key - not used for relationships)
├── user_id (TEXT, stores auth.users.id) ← Foreign key reference
├── name, email
└── timestamps

children
├── id (UUID, primary key)
├── user_id (TEXT, references users.user_id) ← Critical relationship
├── name, age, school_status
└── timestamps

reminders
├── id (UUID, primary key)
├── user_id (TEXT, references users.user_id) ← RLS filtering
├── child_id (UUID, references children.id)
├── category (school, activity, personal, household)
├── title, notes
├── event_time (Display time for users)
├── notification_time (Actual alert time) ← Two-time system
├── recurrence (one-time, daily, weekly)
├── is_completed
└── timestamps
```

### Key Architectural Decisions

**1. Two-Time Notification System**
- `event_time`: What users see on reminder cards (e.g., "3:00 PM")
- `notification_time`: When alert fires (e.g., "2:30 PM" for 30min advance)
- Solves UX problem: users think in event times, need advance warnings

**2. User ID Architecture** 
- `users.user_id` stores copy of Supabase `auth.users.id`
- All foreign keys reference `user_id` (not `users.id`)
- Enables RLS policies to filter by `auth.uid()::text`
- Critical for proper multi-user data isolation

**3. Local Notification Architecture**
- Device-local scheduling (no push notification server needed)
- Automatic rescheduling on app startup
- Handles device restarts, app reinstalls, updates
- Compares database state vs scheduled notifications

**4. Row Level Security Implementation**
Four policies per table (SELECT, INSERT, UPDATE, DELETE):
```sql
-- Example: SELECT policy on reminders table
CREATE POLICY "Users can view own reminders"
ON reminders FOR SELECT
USING (auth.uid()::text = user_id);
```

---

## 🚀 Development Journey

### Timeline: Concept → TestFlight (6 weeks)

| Milestone | Achievement |
|-----------|-------------|
| **Initial Build** | Successfully navigated 14+ failed build attempts |
| **Build 2** | First functional TestFlight build after nuclear reset |
| **Build 4** | Fixed authentication loop and notification persistence |
| **Build 5** | Resolved critical cross-user data leak via RLS |

### Major Technical Challenges Solved

#### 🔴 Challenge 1: Cross-User Data Leak (Build 5)
**Problem:** Users could see other users' reminders in production.

**Root Cause:** Overly permissive RLS policy with `using_expression = true` combined with PERMISSIVE mode created OR logic that bypassed restrictive policies.

**Solution:** 
- Identified testing policy left in production
- Deleted "Allow all operations for testing" policy
- Verified four proper RLS policies remain (all filtering by `auth.uid()`)
- Confirmed zero cross-contamination across 19 test reminders

**Learning:** PERMISSIVE policies combine with OR logic—one bad policy overrides all good ones.

#### 🔴 Challenge 2: Authentication Loop (Build 4)
**Problem:** Infinite navigation loop between Welcome and Dashboard screens.

**Root Cause:** Race condition between AsyncStorage session restore and `onAuthStateChange` listener registration.

**Solution:**
- Session restore MUST complete before listener registration
- Single source of truth: `onAuthStateChange` as primary auth signal
- Module-level `isCheckingAuth` guard with try/finally pattern
- Removed duplicate `checkAuthAndOnboarding` calls

**Learning:** `useRef` and module-level guards fail during hot reload—architectural fix needed, not flag-based.

#### 🔴 Challenge 3: 14+ Failed Builds (Build 2 Breakthrough)
**Problem:** Persistent build failures, pod install hanging, npm permission errors.

**Solution - Nuclear Reset Process:**
1. Complete deletion: `rm -rf ios node_modules package-lock.json`
2. Clean npm cache: `npm cache clean --force`
3. Mac restart (resolved system-level hanging)
4. Fresh install: `npm install --cache .npm-cache`
5. Clean prebuild: `npx expo prebuild --platform ios --clean`
6. Always open `.xcworkspace` (not `.xcodeproj`)

**Learning:** System-level issues (not just command issues) can cause cascading failures. Mac restart + nuclear reset = reliable recovery pattern.

#### 🔴 Challenge 4: Notification Persistence
**Problem:** Notifications disappeared after app reinstall/device restart.

**Solution:** Implemented automatic rescheduling on app startup:
```javascript
// Compare database reminders vs scheduled notifications
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
const activeReminders = await getActiveReminders();
// Reschedule missing notifications
```

**Learning:** Local notifications are device-local—they don't survive reinstalls. Rescheduling on startup is required architecture, not a bug fix.

---

## 📊 Project Statistics

- **Development Time:** 6 weeks (December 2025 - February 2026)
- **Total Builds:** 5 production builds on TestFlight
- **Lines of Code:** ~8,000 (excluding node_modules)
- **API Integrations:** 4 (Supabase, OpenAI, Anthropic, Expo)
- **Database Tables:** 3 with proper RLS policies
- **Security Policies:** 12 total (4 per table × 3 tables)
- **Critical Bugs Fixed:** 4 major (auth loop, data leak, builds, notifications)

---

## 🛠️ Setup Instructions

### Prerequisites
```bash
Node.js 18+
npm or yarn
Xcode (for iOS)
CocoaPods
Expo CLI
```

### Installation

1. **Clone repository**
```
git clone https://github.com/burcuyapar/NudgeMe---Gentle-Reminder.git
cd NudgeMe---Gentle-Reminder
```

2. **Install dependencies**
```bash
npm install
cd ios && pod install && cd ..
```

3. **Configure API keys**

Create `src/constants/config.js`:
```javascript
export const CONFIG = {
  SUPABASE_URL: 'your-supabase-project-url',
  SUPABASE_ANON_KEY: 'your-supabase-anon-key',
  OPENAI_API_KEY: 'your-openai-api-key',
  ANTHROPIC_API_KEY: 'your-anthropic-api-key',
};
```

4. **Set up Supabase database**
```bash
# Run migrations in order
psql -h your-db-host -U postgres -d your-db < database/migrations/001_initial_schema.sql
psql -h your-db-host -U postgres -d your-db < database/migrations/002_rls_policies.sql
```

5. **Development with iOS Simulator**
```bash
npx expo prebuild --platform ios --clean
cd ios
open NudgeMeGentleReminder.xcworkspace
# Build and run in Xcode
```

---

## 📁 Project Structure

```
NudgeMe/
├── src/
│   ├── screens/
│   │   ├── OnboardingScreen.js          # Voice-guided 6-step setup
│   │   ├── VoiceAssistantScreen.js      # Main AI chat interface
│   │   ├── DashboardScreen.js           # Today's reminders view
│   │   ├── AllRemindersScreen.js        # Categorized reminder list
│   │   ├── ProfileScreen.js             # Family management
│   │   └── [15+ additional screens]
│   ├── services/
│   │   ├── supabase.js                  # Database client
│   │   ├── whisper.js                   # Speech-to-text
│   │   ├── claude.js                    # AI reminder parsing
│   │   ├── openai.js                    # Conversation AI
│   │   ├── textToSpeech.js              # Voice responses
│   │   ├── notifications.js             # Local notification system
│   │   ├── reminders.js                 # CRUD + rescheduling
│   │   └── family.js                    # Family data management
│   ├── components/
│   │   ├── AnimatedMicButton.js         # Press-and-hold recording
│   │   ├── TypingDotsAnimation.js       # AI thinking indicator
│   │   └── WaveformAnimation.js         # Audio level feedback
│   ├── constants/
│   │   ├── config.js.template           # API keys template
│   │   └── theme.js                     # Design system
│   └── navigation/
│       └── AppNavigator.js              # React Navigation setup
├── database/
│   ├── migrations/                      # SQL migration files
│   └── rls-policies.sql                 # Row Level Security policies
├── docs/
│   ├── ARCHITECTURE.md                  # Technical deep dive
│   ├── DEVELOPMENT_JOURNEY.md           # Problem-solving narrative
│   └── SECURITY.md                      # Security implementation
├── .gitignore                           # Excludes config.js, secrets
├── app.json                             # Expo configuration
└── package.json                         # Dependencies
```

---

## 🎓 Key Learnings

### 1. React Native + Expo
- **.xcworkspace vs .xcodeproj:** Must open workspace when using CocoaPods
- **Build numbers:** Must be in `app.json` under `ios.buildNumber` (prebuild overwrites Info.plist)
- **iOS Simulator:** Best for daily dev (Expo Go has SDK version constraints)

### 2. Database & Security
- **RLS Policy Logic:** PERMISSIVE mode uses OR—one bad policy breaks everything
- **Foreign Key Design:** `users.user_id` (auth UID copy) vs `users.id` (random UUID)
- **Testing Multi-User:** Always test with multiple accounts to verify isolation

### 3. Notification Architecture
- **Local Notifications:** Don't survive app reinstalls, require rescheduling
- **Two-Time System:** Display time ≠ notification time for UX clarity
- **Startup Rescheduling:** Compare database vs scheduled notifications on app launch

### 4. AI Integration
- **Token Management:** Claude 3 Haiku (claude-3-haiku-20240307) more cost-effective than GPT-4 for parsing
- **Voice UX:** Press-and-hold prevents cutting users off mid-sentence
- **Context-Aware Timing:** Different reminder types need different advance notice

### 5. Debugging Methodology
- **Nuclear Reset:** Delete ios/ + node_modules + package-lock.json when stuck
- **System Restarts:** Mac restart can resolve persistent tool failures
- **One Change at a Time:** Test in isolation to identify root cause
- **Database Verification:** Always query `auth.users` table to confirm UID relationships

---

## 📸 Screenshots

<img width="2752" height="1536" alt="Gemini_Generated_Image_lwaxyhlwaxyhlwax" src="https://github.com/user-attachments/assets/573b300a-2735-461e-9e74-23d6c0a76fd7" />

---

## 🚧 Known Limitations & Future Roadmap

### Current Limitations
- iOS only (Android version planned)
- Manual reminder deletion only (no bulk operations)
- Single-parent account (family sharing planned)

### Roadmap
- [ ] Android version with React Native
- [ ] Calendar integration (Google Calendar, Apple Calendar)
- [ ] Family sharing (multiple parents, shared reminders)
- [ ] Adaptive learning (suggest routine improvements)
- [ ] Widget support (iOS home screen)
- [ ] Apple Watch companion app
- [ ] Location-based reminders

---

## 📝 Documentation

Comprehensive technical documentation available in `/docs`:

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Deep dive into technical decisions
- **[DEVELOPMENT_JOURNEY.md](docs/DEVELOPMENT_JOURNEY.md)** - Problem-solving narrative
- **[SECURITY.md](docs/SECURITY.md)** - Security implementation details
- **[API.md](docs/API.md)** - Service integration guide

---

## 🤝 Contributing

This is a portfolio project, but feedback and suggestions are welcome! 

**Ways to contribute:**
- 🐛 Report bugs via Issues
- 💡 Suggest features or improvements
- 📖 Improve documentation
- ⭐ Star the repo if you find it useful!

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 👩‍💻 About the Developer

Built by **Burcu Yapar** as a portfolio project demonstrating full-stack mobile development capabilities.

**Skills Demonstrated:**
- React Native mobile development (iOS)
- Multi-AI integration (Claude, OpenAI)
- Backend architecture (Supabase, PostgreSQL)
- Security engineering (RLS, data isolation)
- Voice UX design and implementation
- Production deployment (TestFlight)
- Critical debugging and problem-solving

**Connect:**
- GitHub: [@burcuyapar](https://github.com/burcuyapar)
- LinkedIn: https://www.linkedin.com/in/burcu-yapar-üç-22086a6/
- Portfolio: 

---

## 🙏 Acknowledgments

- **Claude AI (Anthropic)** - Architecture guidance and debugging assistance
- **OpenAI** - Whisper, GPT-4, and TTS capabilities
- **Supabase** - Excellent backend infrastructure
- **React Native Community** - Open-source libraries and support

---

**Status:** 🟢 Production Ready | Live on TestFlight  
## 📱 Try NudgeMe on TestFlight

**Live beta available now!**

👉 **[Join TestFlight Beta](https://testflight.apple.com/join/KUwQsFbz)** 👈

*Note: iOS device required. TestFlight is Apple's official beta testing platform.*

**Version:** 1.0.0 (Build 5)  
**Last Updated:** February 3, 2026

---

*This project represents 6 weeks of intensive development, debugging, and iteration—from concept to production-ready iOS application.*
