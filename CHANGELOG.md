# Changelog

All notable changes to NudgeMe will be documented in this file.

---

## [2.0.0] - 2025-12-21 🎉 MAJOR MILESTONE

### ✨ Added
- **Two-way voice conversation** - Complete voice assistant functionality
- **OpenAI Whisper integration** - Accurate speech-to-text transcription
- **OpenAI TTS-1-HD** - Natural, premium voice output (nova voice)
- **GPT-4o-mini integration** - Replaced Claude with OpenAI for conversation
- **Voice/text dual input** - Tap mic for voice OR type for text
- **Message replay** - Tap any AI response to hear it again
- **Voice toggle** - Turn voice responses on/off in header
- **Buffer package** - Proper base64 encoding in React Native

### 🔧 Changed
- **Switched from Claude to OpenAI** - Simplified to single API provider
- **Updated to expo-file-system/legacy** - Fixed deprecated API warnings
- **Improved error handling** - Better fallbacks and user feedback
- **Optimized voice quality** - Using TTS-1-HD instead of TTS-1

### 🐛 Fixed
- **Base64 conversion errors** - Solved React Native compatibility issue
- **Deprecated FileSystem API** - Using legacy API for SDK 54
- **Audio playback issues** - Proper file saving and playback flow
- **Duplicate voice generation** - Added lock to prevent multiple simultaneous calls

### 🎯 Technical Achievements
- Solved complex React Native binary data handling
- Implemented working voice recording → transcription → AI → TTS pipeline
- Created seamless user experience with visual feedback
- Achieved natural conversation flow with minimal latency

---

## [1.0.0] - 2025-12-20

### ✨ Added
- **Initial app structure** - 6 screens with navigation
- **Supabase integration** - Database setup with users and reminders tables
- **Claude API integration** - AI conversation capability
- **Basic UI** - Welcome, Dashboard, Profile, and other screens
- **expo-av audio recording** - Voice input capability (transcription pending)

### 🎨 Design
- Calming color scheme (soft blues, lavenders, peach)
- Gradient headers
- Clean, parent-friendly interface
- Reminder cards with status indicators

### 📦 Infrastructure
- React Native + Expo SDK 54 setup
- React Navigation 7
- Supabase client configuration
- Theme system

---

## [0.1.0] - 2025-12-19

### 🎯 Planning Phase
- **Product concept** - AI reminder assistant for busy parents
- **Market research** - Analyzed competitor apps (Sense, Aviva, Goldee)
- **Feature planning** - Voice-first interaction, smart nudges, calendar sync
- **Architecture design** - Selected tech stack (React Native, Supabase, AI APIs)
- **Created product spec** - Comprehensive documentation

---

## Key Milestones

- ✅ **Dec 19:** Product concept and planning
- ✅ **Dec 20:** App structure and basic UI built
- ✅ **Dec 21 AM:** Database integration working
- ✅ **Dec 21 PM:** 🎉 **VOICE ASSISTANT FULLY WORKING!**

---

## Technical Challenges Overcome

### Challenge 1: Claude API Audio Transcription
- **Problem:** Claude API doesn't support audio via Messages endpoint
- **Solution:** Switched to OpenAI Whisper for transcription

### Challenge 2: React Native Base64 Encoding
- **Problem:** No native `btoa()` function in React Native
- **Attempted:** Manual base64 loops, various libraries
- **Solution:** Buffer package (`Buffer.from().toString('base64')`)

### Challenge 3: Expo SDK 54 Compatibility
- **Problem:** `writeAsStringAsync` deprecated in new Expo
- **Solution:** Import from `expo-file-system/legacy`

### Challenge 4: Dual API Complexity
- **Problem:** Managing Claude + OpenAI was complex
- **Solution:** Consolidated to 100% OpenAI stack

### Challenge 5: Audio Playback
- **Problem:** Multiple failed approaches to play TTS audio
- **Solution:** ArrayBuffer → Buffer → base64 → FileSystem → expo-av

---

## Breaking Changes

### v2.0.0
- Replaced Claude API with OpenAI GPT-4o-mini
- Changed import: `expo-file-system` → `expo-file-system/legacy`
- Added new dependency: `buffer` package
- Updated config structure (removed Anthropic keys)

---

## Dependencies Added

### v2.0.0
- `buffer` - Base64 encoding for React Native
- `expo-file-system/legacy` - Updated usage

### v1.0.0
- `expo` ^54.0.0
- `react-native` 0.76.5
- `@supabase/supabase-js` ^2.47.10
- `expo-av` (latest)
- `@react-navigation/native` ^7.0.0
- `@react-navigation/native-stack` ^7.1.0

---

## Cost Evolution

### v2.0.0 (OpenAI only)
- Whisper: $0.006/min
- GPT-4o-mini: ~$0.0005/1K tokens
- TTS-1-HD: $0.030/1K chars
- **Total:** ~$0.33/user/month

### v1.0.0 (Claude + OpenAI)
- Claude Sonnet: $3/1M tokens
- OpenAI services: (same as above)
- **Total:** More expensive, more complex

---

## What's Next

See [README.md](README.md) for upcoming features and roadmap.

---

## Contributors

- Primary Developer: [Your Name]
- AI Assistant: Claude (Anthropic) - for architecture and debugging
- Development Tool: Trae Solo Builder - for rapid implementation

---

*This changelog follows [Keep a Changelog](https://keepachangelog.com/) format.*
