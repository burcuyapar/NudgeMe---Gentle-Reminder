import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS, FONTS, SIZES, SHADOWS } from '../constants/theme';
import { callClaude, SYSTEM_PROMPTS } from '../services/claude';
import { transcribeAudio } from '../services/whisper';
import { speakAsNudge, stopSpeaking, isSpeaking } from '../services/textToSpeech';
import TypingDotsAnimation from '../components/TypingDotsAnimation';
import { extractReminderFromResponse, cleanResponseText, formatReminderForDB } from '../services/reminderExtractor';
import { supabase } from '../services/supabase';
import { ReminderService } from '../services/reminders';
import { getNextOccurrence, getNextDayOccurrence } from '../utils/dateHelpers';
import { getCurrentUserId, getUserNotificationPreferences } from '../services/familyService';
import { calculateNotificationTime } from '../utils/timeCalculations';
import { scheduleReminderNotification } from '../services/notifications';
import { 
  detectInjection, 
  sanitizeInput, 
  validateOutput,
  checkRateLimit,
  // handleInjectionAttempt, 
  // logInjectionAttempt, 
  // recordInjectionAttempt 
} from '../services/security';

const MAX_RECORDING_DURATION_MS = 30000; // 30 seconds safety timeout

const VoiceAssistantScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([
    { id: '1', text: "Hi! I'm NudgeMe, your friendly reminder assistant! Press and hold 🎤 to start or type below.", sender: 'ai', timestamp: new Date() }
  ]);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSpeakingNow, setIsSpeakingNow] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  
  const flatListRef = useRef(null);
  const recordingTimeoutRef = useRef(null); 
  const recordingRef = useRef(null); 
  const isRecordingRef = useRef(false);
  const lastActiveTime = useRef(Date.now());



  useEffect(() => {
    // Setup audio mode when component mounts
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('✅ Audio mode configured');
      } catch (error) {
        console.error('❌ Audio setup error:', error);
      }
    };
    
    setupAudio();
    
    // Cleanup on unmount
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      stopSpeaking();
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);

  const addToChat = (text, sender, id = Date.now().toString(), isTranscribing = false, isThinking = false, source = 'text') => {
    setMessages(prev => [...prev, { 
        id, 
        text, 
        sender, 
        isTranscribing, 
        isThinking, 
        source,
        timestamp: new Date()
    }]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const updateMessage = (id, updates) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  };

  const handleSpeechDone = () => {
      setIsSpeakingNow(false);
  };

  const handlePressIn = async () => {
    try {
      // DEFENSIVE CLEANUP: Check for stale recording BEFORE permissions
      if (recordingRef.current) {
        try {
          console.log('⚠️ Cleaning up stale recording from previous session...');
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {
          console.log('⚠️ Cleanup warning:', e);
        }
        recordingRef.current = null;
        // Small delay to ensure audio system is ready
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('🎤 Requesting permissions...');
      
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone access in your device settings to use voice features.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      console.log('✅ Permission granted');
      
      console.log('🎤 Creating new recording...');

      // Reset audio mode before new recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Create and start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        undefined,
        100 // Status update interval in ms
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      
      console.log('✅ Recording started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Clean up
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) { /* ignore */ }
        recordingRef.current = null;
      }
      setIsRecording(false);
      setIsThinking(false);
      setIsTranscribing(false);
      
      // Show user-friendly error
      Alert.alert(
        'Recording Error',
        'Failed to start recording. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handlePressOut = async () => {
    if (!recordingRef.current) {
      console.log('⚠️ No recording to stop');
      setIsRecording(false);
      return;
    }

    try {
      console.log('🛑 Stopping recording...');
      
      // Check if still recording
      const status = await recordingRef.current.getStatusAsync();
      if (!status.isRecording) {
        console.log('⚠️ Recording already stopped');
        recordingRef.current = null;
        setIsRecording(false);
        return;
      }
      
      // Stop the recording
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      
      console.log('✅ Recording stopped, URI:', uri);
      
      // Clear ref immediately
      recordingRef.current = null;
      setIsRecording(false);

      // Reset audio mode after stopping
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false, // Reset to false when not recording
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Process the recording
      if (uri) {
        setIsTranscribing(true);
        // Call your transcription handling here
        const transcribingMsgId = Date.now().toString();
        addToChat('🎤 Transcribing...', 'user', transcribingMsgId, true, false, 'voice');
        
        try {
          const transcribedText = await transcribeAudio(uri);
          console.log('📝 Transcribed text:', transcribedText);
          
          updateMessage(transcribingMsgId, { 
              text: transcribedText, 
              isTranscribing: false 
          });
          
          handleProcessing(transcribedText, 'voice');
        } catch (transcriptionError) {
          console.error('❌ Transcription error:', transcriptionError);
          updateMessage(transcribingMsgId, { 
            text: "Sorry, I couldn't understand that.", 
            isTranscribing: false 
          });
        } finally {
          setIsTranscribing(false);
          setIsRecording(false);
        }
      } else {
        console.log('⚠️ No URI from recording');
      }
      
    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Force cleanup on error
      try {
        if (recordingRef.current) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch (e) {
        // Ignore cleanup error
      }
      recordingRef.current = null;
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  const pad = (n) => String(n).padStart(2, '0');
  const to24h = (s) => {
    if (!s) return null;
    const m = s.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3]?.toLowerCase() || null;
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${pad(h)}:${pad(mm)}`;
  };
  const detectWeekday = (text) => {
    if (!text) return null;
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const t = text.toLowerCase();
    for (const d of days) {
      if (t.includes(d.toLowerCase())) return d;
    }
    return null;
  };
  const extractTime = (text) => {
    if (!text) return null;
    const match = text.match(/(\d{1,2}:\d{2}\s*[ap]m|\d{1,2}\s*[ap]m|\d{1,2}:\d{2})/i);
    return match ? to24h(match[0]) : null;
  };
  const hasExplicitTime = (text) => {
    if (!text) return false;
    return /(\d{1,2}:\d{2}|\d{1,2}\s*[ap]m)/i.test(text);
  };
  const findActivitySuggestion = async (userText) => {
    try {
      const stored = await AsyncStorage.getItem('userData');
      const data = stored ? JSON.parse(stored) : {};
      const children = Array.isArray(data.children) ? data.children : [];
      const t = userText.toLowerCase();
      for (const c of children) {
        const act = c.activities || '';
        if (!act) continue;
        const keywords = ['soccer','football','basketball','piano','music','violin','swim','swimming','class','practice','lesson'];
        const found = keywords.find(k => t.includes(k));
        if (found && act.toLowerCase().includes(found)) {
          const day = detectWeekday(act);
          const time24 = extractTime(act);
          if (day) {
            const prettyTime = time24 ? (() => { const [h,m]=time24.split(':').map(Number); const ap=h>=12?'PM':'AM'; const h12=h%12||12; return `${h12}:${pad(m)} ${ap}`; })() : null;
            const dayText = day;
            const base = `I'll remind you about ${c.name}'s ${found} ${dayText}${prettyTime ? ` at ${prettyTime}` : ''}. When should I remind you?`;
            return base;
          }
        }
      }
      for (const c of children) {
        const school = c.school || '';
        if (!school) continue;
        if (t.includes('pickup') || t.includes('pick up')) {
          const day = detectWeekday(school) || 'weekdays';
          return `I'll remind you about ${c.name}'s school pickup ${day}. When should I remind you?`;
        }
        if (t.includes('drop') || t.includes('drop-off') || t.includes('drop off')) {
          const day = detectWeekday(school) || 'weekdays';
          return `I'll remind you about ${c.name}'s school drop-off ${day}. When should I remind you?`;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleProcessing = async (userText, source = 'text') => {
    if (!userText.trim()) return;

    // SECURITY: Check rate limit
    const rateCheck = checkRateLimit();
    if (!rateCheck) {
      console.log('🚨 Rate limit exceeded');
      const errorMsg = {
          id: (Date.now() + 2).toString(),
          text: "You're sending messages too fast. Please wait a moment.",
          sender: 'ai',
          timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
      setIsThinking(false);
      return;
    }

    console.log(`🚀 Sending to Claude (${source}):`, userText);

    if (source === 'text') {
        addToChat(userText, 'user', Date.now().toString(), false, false, 'text');
        setInputText('');
    }

    const thinkingMsgId = (Date.now() + 1).toString();
    setIsThinking(true);
    addToChat('💭 Thinking...', 'ai', thinkingMsgId, false, true, source);

    // SECURITY: Detect injection attempts
    const isInjection = detectInjection(userText);

    if (isInjection) {
      console.log('🚨 Injection attempt blocked');
      
      // Log the attempt (placeholder for future implementation)
      // logInjectionAttempt('temp_user', userText); 
      
      // Show safe response to user
      const safeResponse = "I'm NudgeMe, a reminder assistant. I can only help with capturing tasks and reminders. What would you like me to remember?";
      
      updateMessage(thinkingMsgId, {
          text: safeResponse,
          isThinking: false
      });
      
      if (voiceEnabled) {
          setIsSpeakingNow(true);
          speakAsNudge(safeResponse, handleSpeechDone); 
      }
      
      setIsThinking(false);
      return; // Stop here, don't call AI
    }

    // SECURITY: Sanitize input before sending to AI
    const cleanInput = sanitizeInput(userText);

    try {
      if (!hasExplicitTime(cleanInput)) {
        const familyHint = await findActivitySuggestion(cleanInput);
        if (familyHint) {
          setIsThinking(false);
          updateMessage(thinkingMsgId, {
            text: familyHint,
            isThinking: false
          });
          if (voiceEnabled) {
            setIsSpeakingNow(true);
            speakAsNudge(familyHint, handleSpeechDone);
          }
          return;
        }
      }
      const history = messages
        .filter(m => !m.isTranscribing && !m.isThinking)
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'ai', 
          content: m.text
        }));

      const now = new Date();
      const todayIso = now.toISOString().split('T')[0];
      const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const weekdayName = weekdayNames[now.getDay()];
      const todayLong = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const todayTime = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      });

      const todayContext = `

TODAY CONTEXT:
- Today's date is: ${todayLong}
- Current date in ISO format: ${todayIso}
- Current time is: ${todayTime}
- Day of week: ${weekdayName}

DATE RULES:
- All reminder dates must be on or after ${todayIso}.
- Never return a date in the past.
- Current time is ${todayTime}. Use this for relative time calculations (e.g. "in 10 minutes").
- When the user says "tomorrow", "next week", "next Monday", "next Saturday", or a bare weekday name, calculate based on ${todayIso} as today.
- "Tomorrow" = ${todayIso} plus 1 day.
- "Next week" = ${todayIso} plus 7 days (same weekday).

RELATIVE TIME RULES:
- "in X minutes" -> Add X minutes to ${todayTime}.
- "in X hours" -> Add X hours to ${todayTime}.
- If the time rolls over to the next day, use tomorrow's date.


DAY NAME RULES:
- A bare weekday (e.g. "Sunday", "Monday") WITHOUT the word "next" means the nearest future occurrence of that weekday from ${todayIso}.
- Examples (if today is Saturday):
  - "Sunday" = tomorrow (1 day away).
  - "Monday" = 2 days away.
  - "Friday" = 6 days away.
  - "Saturday" = 7 days away (next week).
- "This Sunday" / "this Monday" follow the same rule as a bare weekday (nearest future occurrence).
- Phrases like "next Sunday" or "next Monday" mean the occurrence of that weekday in the following week, at least 7 days after ${todayIso}.

- A calendar date like "December 15" must be in the future; if it would be in the past for ${todayIso}, move it to the next year.
`;

      const systemPrompt = SYSTEM_PROMPTS.VOICE_ASSISTANT + todayContext;

      const result = await callClaude(
        history,
        cleanInput,
        systemPrompt,
        'claude-haiku-4-5-20251001'
      );

      setIsThinking(false);

      if (result.success) {
        // SECURITY: Validate AI didn't break character
        const isSafe = validateOutput(result.response);
        const safeResponse = isSafe ? result.response : "I can't discuss my internal instructions, but I'm here to help you with your reminders!";

        const reminderResult = extractReminderFromResponse(safeResponse);
        
        // Clean response text (remove JSON block)
        const cleanText = cleanResponseText(safeResponse);

        console.log('✅ Claude Replied:', cleanText);
        console.log('=== TTS DEBUG ===');
        console.log('Original message:', cleanText);
        console.log('Message length:', String(cleanText ?? '').length);
        console.log('================');
        
        updateMessage(thinkingMsgId, {
            text: cleanText,
            isThinking: false
        });

        if (reminderResult) {
          const remindersArray = Array.isArray(reminderResult) ? reminderResult : [reminderResult];
          console.log('💾 Saving reminder to database...', remindersArray.length);
          
          try {
            const userId = await getCurrentUserId();
            const userPrefs = await getUserNotificationPreferences();

            if (!userId) {
              console.warn('⚠️ No userId available, skipping reminder save');
              return;
            }
            
            for (const reminderData of remindersArray) {
              const formattedReminder = formatReminderForDB({
                ...reminderData
              }, userId);
              formattedReminder.child_name = null;

              // Calculate intelligent notification time using preferences
              const lowerTitle = (formattedReminder.what || '').toLowerCase();
              const calcType = formattedReminder.child_name 
                ? (lowerTitle.includes('school') ? 'school_dropoff' : 'activity')
                : 'personal';
                
              // Fix 2: Force 0 Offset for Voice One-Time Reminders
              const isOneTime = !formattedReminder.recurrence || 
                                formattedReminder.recurrence === 'once' || 
                                formattedReminder.recurrence === 'one-time';

              let notifTime;
              if (isOneTime && calcType === 'personal') {
                 // One-time voice reminders: notify at exact time (0 offset)
                 notifTime = formattedReminder.event_time || formattedReminder.when_time;
                 console.log('🔔 One-time voice reminder: using 0 offset');
              } else {
                 notifTime = calculateNotificationTime(
                  formattedReminder.event_time || formattedReminder.when_time,
                  calcType,
                  formattedReminder.what,
                  userPrefs
                );
              }
              
              if (notifTime) {
                  formattedReminder.notification_time = notifTime;
              }

              const hasTime =
                formattedReminder.when_time &&
                formattedReminder.when_time !== 'null' &&
                formattedReminder.when_time !== '';

              if (!hasTime) {
                console.log('⚠️ Missing time - AI should have asked for it');
                const whatLabel = formattedReminder.what || reminderData.what || 'this reminder';
                const followUp = `What time would you like to be reminded for "${whatLabel}"?`;
                addToChat(followUp, 'ai');
                continue;
              }

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              let normalizedDate = formattedReminder.when_date || null;

              if (normalizedDate) {
                try {
                  const sourceDateStr = reminderData.when_date || normalizedDate;
                  const parts = String(sourceDateStr).split('-').map(Number);
                  const y = parts[0];
                  const m = parts[1];
                  const d = parts[2];
                  let reminderDate = new Date(
                    isNaN(y) ? today.getFullYear() : y,
                    (m || 1) - 1,
                    d || 1
                  );
                  reminderDate.setHours(0, 0, 0, 0);

                  const lowerMessage = cleanInput.toLowerCase();

                  if (reminderDate < today) {
                    if (reminderData.day) {
                      const dayName = String(reminderData.day);
                      const dayLower = dayName.toLowerCase();
                      const isNextWeekPhrase =
                        lowerMessage.includes('next week') ||
                        lowerMessage.includes(`next ${dayLower}`);

                      const baseIso = getNextDayOccurrence(
                        dayName,
                        formattedReminder.when_time || null
                      );
                      if (isNextWeekPhrase) {
                        const baseDate = new Date(`${baseIso}T00:00:00`);
                        baseDate.setDate(baseDate.getDate() + 7);
                        baseDate.setHours(0, 0, 0, 0);
                        const year = baseDate.getFullYear();
                        const month = String(baseDate.getMonth() + 1).padStart(2, '0');
                        const day = String(baseDate.getDate()).padStart(2, '0');
                        normalizedDate = `${year}-${month}-${day}`;
                      } else {
                        normalizedDate = baseIso;
                      }
                    } else if (lowerMessage.includes('tomorrow')) {
                      const tomorrow = new Date(today);
                      tomorrow.setDate(today.getDate() + 1);
                      const year = tomorrow.getFullYear();
                      const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
                      const day = String(tomorrow.getDate()).padStart(2, '0');
                      normalizedDate = `${year}-${month}-${day}`;
                    } else if (lowerMessage.includes('next week')) {
                      const nextWeek = new Date(today);
                      nextWeek.setDate(today.getDate() + 7);
                      const year = nextWeek.getFullYear();
                      const month = String(nextWeek.getMonth() + 1).padStart(2, '0');
                      const day = String(nextWeek.getDate()).padStart(2, '0');
                      normalizedDate = `${year}-${month}-${day}`;
                    } else {
                      let candidate = new Date(
                        today.getFullYear(),
                        (m || 1) - 1,
                        d || 1
                      );
                      candidate.setHours(0, 0, 0, 0);
                      if (candidate < today) {
                        candidate.setFullYear(today.getFullYear() + 1);
                      }
                      const year = candidate.getFullYear();
                      const month = String(candidate.getMonth() + 1).padStart(2, '0');
                      const day = String(candidate.getDate()).padStart(2, '0');
                      normalizedDate = `${year}-${month}-${day}`;
                    }
                  } else {
                    const year = reminderDate.getFullYear();
                    const month = String(reminderDate.getMonth() + 1).padStart(2, '0');
                    const day = String(reminderDate.getDate()).padStart(2, '0');
                    normalizedDate = `${year}-${month}-${day}`;
                  }
                } catch (e) {
                  console.error('❌ Failed to normalize when_date, falling back to today:', e);
                  const year = today.getFullYear();
                  const month = String(today.getMonth() + 1).padStart(2, '0');
                  const day = String(today.getDate()).padStart(2, '0');
                  normalizedDate = `${year}-${month}-${day}`;
                }
              } else if (formattedReminder.when_time && !formattedReminder.recurrence) {
                const baseTime = `${formattedReminder.when_time}:00`;
                normalizedDate = getNextOccurrence(baseTime);
              }

              formattedReminder.when_date = normalizedDate;
              
              const pad = (n) => String(n).padStart(2, '0');
              const minusMinutes = (hhmm, minutes) => {
                if (!hhmm) return hhmm;
                const [h, m] = hhmm.split(':').map(Number);
                const d = new Date();
                d.setHours(h, m, 0, 0);
                d.setMinutes(d.getMinutes() - minutes);
                return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
              };
              const normalizeTime = (t) => {
                if (!t) return null;
                const str = String(t);
                const m = str.match(/^\d{2}:\d{2}/);
                return m ? m[0] : str;
              };
              const recKey = formattedReminder.recurrence
                ? (formattedReminder.recurrence.startsWith('weekly-') ? formattedReminder.recurrence : formattedReminder.recurrence)
                : (formattedReminder.when_date ? `date-${formattedReminder.when_date}` : 'none');
              let occupied = new Set();
              if (formattedReminder.recurrence) {
                const { data: existingRec } = await supabase
                  .from('reminders')
                  .select('when_time, recurrence')
                  .eq('user_id', userId)
                  .eq('recurrence', formattedReminder.recurrence);
                if (existingRec && Array.isArray(existingRec)) {
                  existingRec.forEach(r => {
                    const nt = normalizeTime(r.when_time);
                    if (nt) occupied.add(nt);
                  });
                }
              } else if (formattedReminder.when_date) {
                const { data: existingDate } = await supabase
                  .from('reminders')
                  .select('when_time, when_date')
                  .eq('user_id', userId)
                  .eq('when_date', formattedReminder.when_date);
                if (existingDate && Array.isArray(existingDate)) {
                  existingDate.forEach(r => {
                    const nt = normalizeTime(r.when_time);
                    if (nt) occupied.add(nt);
                  });
                }
              }
              let finalTime = formattedReminder.when_time;
              let iter = 0;
              while (finalTime && occupied.has(normalizeTime(finalTime)) && iter < 8) {
                finalTime = minusMinutes(finalTime, 15);
                iter += 1;
              }
              if (finalTime) {
                formattedReminder.when_time = finalTime;
              }

              const now = new Date();
              const todayYear = now.getFullYear();
              const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
              const todayDay = String(now.getDate()).padStart(2, '0');
              const todayIso = `${todayYear}-${todayMonth}-${todayDay}`;

              if (formattedReminder.when_date === todayIso) {
                const parts = String(formattedReminder.when_time).split(':');
                if (parts.length >= 2) {
                  const hours = parseInt(parts[0], 10);
                  const minutes = parseInt(parts[1], 10);
                  if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
                    const reminderTime = new Date();
                    reminderTime.setHours(hours, minutes, 0, 0);
                    if (reminderTime < now) {
                      console.log('⚠️ Time is in past for today');
                      const whatLabel = formattedReminder.what || reminderData.what || 'this reminder';
                      const errorMessage = `That time has already passed today for "${whatLabel}". What time would work instead?`;
                      addToChat(errorMessage, 'ai');
                      continue;
                    }
                  }
                }
              }
              
              // Use centralized service with verification
              const res = await ReminderService.createReminder(formattedReminder);
              
              if (res.success) {
                  console.log(`✅ Reminder created: ${formattedReminder.what}`);
              } else {
                  console.error(`❌ Failed to create reminder: ${formattedReminder.what}`, res.error);
                  addToChat(`I couldn't save the reminder "${formattedReminder.what}". Please try again.`, 'ai');
              }
            }
            
            // If we successfully processed at least one, we can give a general success message if needed, 
            // but the AI response usually covers it. 
            // However, if ALL failed, we should probably say something.
            // For now, individual error messages in chat seem sufficient.

          } catch (error) {
            console.error('❌ Error saving reminders:', error);
            addToChat("I had trouble saving your reminders. Please try again.", 'ai');
          }
        }
        
        if (voiceEnabled) {
            setIsSpeakingNow(true);
            console.log('🔊 Starting TTS immediately...');
            speakAsNudge(cleanText, handleSpeechDone); 
        }
      } else {
        console.error('❌ Claude Error:', result.error);
        updateMessage(thinkingMsgId, {
            text: "Sorry, I'm having trouble connecting to my brain right now. 🧠",
            isThinking: false
        });
      }

    } catch (error) {
      console.error('Processing error:', error);
      setIsThinking(false);
      updateMessage(thinkingMsgId, {
        text: "Something went wrong. Please try again.",
        isThinking: false
      });
    }
  };

  const handleSendText = () => {
      handleProcessing(inputText, 'text');
  };
  
  const handleMessagePress = (text) => {
      if (voiceEnabled) {
          stopSpeaking();
          setIsSpeakingNow(true);
          speakAsNudge(text, () => setIsSpeakingNow(false));
      }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';
    return (
      <TouchableOpacity 
        activeOpacity={0.8}
        onPress={() => !isUser && handleMessagePress(item.text)}
        style={[
            styles.messageBubble, 
            isUser ? styles.userBubble : styles.aiBubble
        ]}
      >
        {item.isThinking ? (
          <TypingDotsAnimation />
        ) : (
          <>
            <Text style={[
              styles.messageText,
              isUser ? styles.userText : styles.aiText,
              item.isTranscribing && styles.transcribingText
            ]}>
              {item.text}
            </Text>
            
            {!isUser && voiceEnabled && !item.isTranscribing && (
                <Text style={styles.tapToHearText}>👆 Tap to hear</Text>
            )}
            
            {item.timestamp && (
                <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.aiTimestamp]}>
                    {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            )}
          </>
        )}
      </TouchableOpacity>
    );
  };

  const isProcessing = isTranscribing || isThinking;

  return (
    <View style={{ flex: 1 }}>
      {/* KeepAwake managed via useEffect */}
      <LinearGradient
        colors={['#B8C5E8', '#E8D5E5']}
        style={styles.container}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
          >
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ChevronLeft size={24} color="#FFFFFF" />
              </TouchableOpacity>
              
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle}>🔔 NudgeMe</Text>
              </View>

              <View style={{ width: 44 }} />
            </View>

            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.chatContainer}
              style={styles.chatList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />

            <View style={styles.bottomArea}>
              <View style={styles.inputContainer}>
                <TouchableOpacity
                  style={[
                    styles.micButton,
                    isRecording && styles.micButtonRecording
                  ]}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  activeOpacity={0.8}
                  disabled={isSpeakingNow || isProcessing}
                >
                  <Text style={styles.micIcon}>
                    {isRecording ? '🔴' : '🎤'}
                  </Text>
                </TouchableOpacity>

                <TextInput
                  style={styles.textInput}
                  placeholder="Type your answer..."
                  value={inputText}
                  onChangeText={setInputText}
                  onSubmitEditing={handleSendText}
                  returnKeyType="send"
                  editable={!isRecording}
                  multiline
                  numberOfLines={2}
                />

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    inputText.trim() && !isRecording && !isProcessing && !isSpeakingNow && styles.sendButtonActive
                  ]}
                  onPress={handleSendText}
                  disabled={!inputText.trim() || isRecording || isProcessing || isSpeakingNow}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sendButtonText,
                      inputText.trim() && !isRecording && !isProcessing && !isSpeakingNow && styles.sendButtonTextActive
                    ]}
                  >
                    Send
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.footerHint}>
                Press and hold 🎤 to speak
              </Text>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingVertical: 15,
    backgroundColor: 'transparent',
  },
  backButton: {
    padding: 10,
  },
  headerTitleContainer: {
      flex: 1,
      alignItems: 'center',
  },
  headerTitle: {
    ...FONTS.heading,
    color: '#FFFFFF',
    fontSize: 20,
  },
  chatList: {
    flex: 1,
  },
  chatContainer: {
    padding: SIZES.padding,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 15,
    borderRadius: 20,
    marginBottom: 15,
    ...SHADOWS.soft,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#6B7FFF',
    borderBottomRightRadius: 5,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 5,
  },
  messageText: {
    ...FONTS.body,
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: COLORS.white,
  },
  aiText: {
    color: COLORS.text,
  },
  tapToHearText: {
      ...FONTS.small,
      color: COLORS.softBlue,
      marginTop: 8,
      fontSize: 10,
      fontWeight: 'bold',
  },
  transcribingText: {
    fontStyle: 'italic',
    opacity: 0.8,
  },
  timestamp: {
      ...FONTS.small,
      fontSize: 10,
      marginTop: 4,
      alignSelf: 'flex-end',
  },
  userTimestamp: {
      color: 'rgba(255,255,255,0.7)',
  },
  aiTimestamp: {
    color: '#999',
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  inputContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    height: 56,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  micButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6B7FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonRecording: {
    backgroundColor: '#FF6B6B',
  },
  micIcon: {
    fontSize: 24,
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
  },
  sendButton: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  sendButtonActive: {
    backgroundColor: '#6B7FFF',
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#718096',
  },
  sendButtonTextActive: {
    color: '#FFFFFF',
  },
  footerHint: {
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
    opacity: 0.8,
  },
});

export { VoiceAssistantScreen };
