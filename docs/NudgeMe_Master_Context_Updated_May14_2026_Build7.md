# NudgeMe Master Context - Build 7 (May 14, 2026)

## Overview
NudgeMe is an AI-powered reminder assistant for parents, built with React Native and Expo. It helps capture tasks, school schedules, and self-care routines through natural conversation.

## Tech Stack
- **Framework**: Expo SDK 54 / React Native 0.76.6
- **Database/Auth**: Supabase
- **AI Models**:
  - Claude: `claude-haiku-4-5-20251001` (Updated in Build 7)
  - OpenAI: `gpt-4.1-mini` (Updated in Build 7)
- **Node Version**: 20 (Required)

## Build 7 Changes (May 14, 2026)
- **AI Model Migration**:
  - Claude: Migrated to `claude-haiku-4-5-20251001` due to retirement of previous model.
  - OpenAI: Migrated to `gpt-4.1-mini` for proactive model lifecycle management.
- **Dependency Fixes**:
  - Downgraded `react-native-reanimated` to `3.16.7` for compatibility with React Native 0.76.6.
  - Removed `react-native-worklets` (incompatible with the downgraded Reanimated version).
- **Native Updates**:
  - Regenerated iOS native files via `expo prebuild --clean`.

## Key Features
- **Voice Assistant**: Natural language reminder capture.
- **Onboarding**: Intelligent setup flow for family data.
- **Dashboard**: Centralized view of all family activities.
- **Notifications**: Local and push notification support.

## Project Structure
- `/src/services`: AI and database logic (OpenAI, Claude, Supabase).
- `/src/screens`: UI screens for onboarding and management.
- `/src/constants`: Global configurations and prompts.
- `/ios`: Regenerated native iOS project files.

---
*Last Updated: May 14, 2026*