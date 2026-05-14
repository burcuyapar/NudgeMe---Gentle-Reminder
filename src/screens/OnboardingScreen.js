import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';

import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { transcribeAudio } from '../services/whisper';
import { callOpenAI, parseChildren, parseActivities, parseSelfReminder, parseSchoolSchedule } from '../services/openai';
import { speakAsNudge, stopSpeaking, initializeAudio } from '../services/textToSpeech';
import { saveUserData, ReminderService } from '../services/reminders';
import { scheduleReminderNotification } from '../services/notifications';
import { getCurrentUserId, getUserNotificationPreferences } from '../services/familyService';
import { supabase } from '../services/supabase';
import { getNextWeekdayOccurrence, getNextDayOccurrence, getNextOccurrence } from '../utils/dateHelpers';
import { getReminderIcon, isValidEmoji } from '../utils/reminderIcons';
import { calculateNotificationTime } from '../utils/timeCalculations';

const DEBUG_TTS = true;

function validateTimeStr(timeStr) {
  if (!timeStr) return false;
  
  // Normalized check
  const t = String(timeStr).trim().toUpperCase();
  
  // Check for HH:MM AM/PM or HH:MM:SS
  // 1. HH:MM AM/PM
  const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    const h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    if (h < 1 || h > 12) return false;
    if (m < 0 || m > 59) return false;
    return true;
  }
  
  // 2. HH:MM:SS (24h)
  const match24 = t.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    const s = parseInt(match24[3], 10);
    if (h < 0 || h > 23) return false;
    if (m < 0 || m > 59) return false;
    if (s < 0 || s > 59) return false;
    return true;
  }

  // 3. HH:MM (24h)
  const match24Short = t.match(/^(\d{1,2}):(\d{2})$/);
  if (match24Short) {
    const h = parseInt(match24Short[1], 10);
    const m = parseInt(match24Short[2], 10);
    if (h < 0 || h > 23) return false;
    if (m < 0 || m > 59) return false;
    return true;
  }
  
  return false;
}

function convertToTimeFormat(timeStr) {
  if (!timeStr) return null;
  let time = String(timeStr).toLowerCase().replace(/\s+/g, '');
  const match = time.match(/(\d+):?(\d*)\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  let minute = match[2] ? parseInt(match[2], 10) : 0;
  const isPM = !!(match[3] && match[3].includes('p'));
  if (isPM && hour !== 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
}

function getDropoffTime(schoolStartTime) {
  if (!schoolStartTime) return null;
  
  // First convert to standard format
  const standardTime = convertToTimeFormat(schoolStartTime);
  if (!standardTime) return null;
  
  // Parse the time
  const [hours, minutes] = standardTime.split(':').map(Number);
  
  // Subtract 30 minutes
  let dropoffHour = hours;
  let dropoffMin = minutes - 30;
  
  // Handle negative minutes
  if (dropoffMin < 0) {
    dropoffMin += 60;
    dropoffHour -= 1;
  }
  
  // Handle negative hours (edge case)
  if (dropoffHour < 0) {
    dropoffHour += 24;
  }
  
  // Return in HH:MM:SS format
  return `${dropoffHour.toString().padStart(2, '0')}:${dropoffMin.toString().padStart(2, '0')}:00`;
}

function subtractMinutes(timeStr, minutes) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':');
  const hours = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  let newHour = hours;
  let newMin = mins - minutes;
  while (newMin < 0) {
    newMin += 60;
    newHour -= 1;
  }
  if (newHour < 0) newHour += 24;
  return `${newHour.toString().padStart(2, '0')}:${newMin.toString().padStart(2, '0')}:00`;
}

function getPickupTime(eventTime) {
  return subtractMinutes(convertToTimeFormat(eventTime), 30);
}

function getActivityTime(eventTime) {
  return subtractMinutes(convertToTimeFormat(eventTime), 60);
}

function validateAndMapSchoolTimes(parsedChildren, schoolKids, message) {
  const children = Array.isArray(parsedChildren) ? parsedChildren : [];
  const names = (schoolKids || []).map(c => c.name).filter(Boolean);
  const normalizedExpected = names.map(n => n.trim().toLowerCase());
  const seenIndexes = new Set();
  const timePairs = new Set();
  let isValid = true;

  if (!children.length || children.length !== names.length) {
    isValid = false;
  }

  for (const child of children) {
    if (!child || !child.name) {
      isValid = false;
      break;
    }
    const idx = normalizedExpected.indexOf(String(child.name).trim().toLowerCase());
    if (idx === -1) {
      isValid = false;
      break;
    }
    if (seenIndexes.has(idx)) {
      isValid = false;
      break;
    }
    if (!child.dropoff_time || !child.pickup_time) {
      isValid = false;
      break;
    }
    // Validate time format
    if (!validateTimeStr(child.dropoff_time) || !validateTimeStr(child.pickup_time)) {
      console.log('❌ Invalid time format detected:', child.dropoff_time, child.pickup_time);
      isValid = false;
      break;
    }
    seenIndexes.add(idx);
    timePairs.add(`${child.dropoff_time}__${child.pickup_time}`);
  }

  const lower = String(message || '').toLowerCase();
  let expectsDifferent = false;
  if (names.length > 1) {
    let matchCount = 0;
    for (const name of names) {
      const pattern = new RegExp(`for\\s+${name.toLowerCase()}`, 'i');
      if (pattern.test(lower)) {
        matchCount += 1;
      }
    }
    if (matchCount >= 2) {
      expectsDifferent = true;
    }
  }
  if (expectsDifferent && timePairs.size === 1 && names.length > 1) {
    isValid = false;
  }

  const perChild = {};
  if (isValid) {
    for (const child of children) {
      const idx = normalizedExpected.indexOf(String(child.name).trim().toLowerCase());
      if (idx !== -1) {
        const name = names[idx];
        perChild[name] = {
          start: child.dropoff_time,
          end: child.pickup_time,
        };
      }
    }
  }

  return { isValid, perChild, children };
}

export default function OnboardingScreen({ navigation }) {
  // ==================== STATE ====================
  const [currentStage, setCurrentStage] = useState(0);
  const [currentQuestionType, setCurrentQuestionType] = useState('welcome');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [recording, setRecording] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  
  // Collected data
  const [collectedData, setCollectedData] = useState({
    user_id: '',
    name: '',
    numChildren: 0,
    children: [],
    activities: [],
    selfReminders: [],
  });
  
  // Temporary data for multi-step questions
  const [tempChildData, setTempChildData] = useState({
    pendingChild: null,
    pendingActivity: null,
    pendingRest: [],
    schoolQueue: [],
    currentGroup: null,
    pendingStartTime: null,
  });
  
  const [lastChildName, setLastChildName] = useState('');
  
  // Refs
  const scrollViewRef = useRef(null);
  
  // ==================== AUTO-SCROLL ====================
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);
  
  // ==================== KEYBOARD LISTENERS ====================
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);
  
  // ==================== INIT USER ID ====================
  useEffect(() => {
    (async () => {
      try {
        const uid = await getCurrentUserId();
        setCollectedData(prev => ({ ...prev, user_id: uid }));
      } catch {}
    })();
  }, []);
  
  // ==================== TTS HELPER ====================
  const playMessage = (text, ttsText = null) => {
    if (!voiceEnabled) return;
    
    const textToSpeak = ttsText || text;
    
    if (DEBUG_TTS) {
      console.log('═══════════════════════════════════════');
      console.log('🔊 SCREEN TEXT:', text);
      console.log('🔊 TTS TEXT:   ', textToSpeak);
      console.log('🔊 MATCH?:     ', text === textToSpeak ? '✅ YES' : (ttsText ? '⚠️ SIMPLIFIED' : '❌ NO'));
      console.log('═══════════════════════════════════════');
    }
    
    speakAsNudge(textToSpeak, () => setIsSpeaking(false));
  };
  


  // ==================== INITIAL WELCOME ====================
  useEffect(() => {
    // Initialize audio mode on mount
    initializeAudio();

    if (currentStage === 0) {
      const welcomeMsg = {
        id: '0',
        role: 'assistant',
        content: "Hi! I'm NudgeMe, your personal reminder assistant. I'll help you keep track of everything so you don't have to. Let's get started!",
        timestamp: new Date(),
      };
      setMessages([welcomeMsg]);
      
      playMessage(welcomeMsg.content);
      
      // Add name question AFTER a delay (for display)
      setTimeout(() => {
        const nameQ = {
          id: '1',
          role: 'assistant',
          content: "First, what's your name?",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, nameQ]);
        
        playMessage(nameQ.content);
        
        setCurrentStage(1);
        setCurrentQuestionType('name');
      }, 2000);
    }
  }, []);
  
  // ==================== HELPER FUNCTIONS ====================
  
  const isNegativeResponse = (text) => {
    const t = (text || '').toLowerCase().trim();
    // Remove common punctuation for easier matching
    const clean = t.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    
    // Direct matches
    if (['no', 'nope', 'nah', 'none', 'nothing', 'not yet', 'no thanks', 'not now'].includes(clean)) return true;
    
    // Prefix/Suffix
    if (clean.startsWith('no ') || clean.startsWith('nope ') || clean.startsWith('nah ')) return true;
    
    // Keywords indicating negative
    const negativePhrases = [
      "doesn't", "does not", "dont", "don't", 
      "stays home", "stay home", 
      "too young", "not old enough", 
      "not yet", "neither", 
      "no school", "no daycare", "no preschool"
    ];
    
    return negativePhrases.some(phrase => clean.includes(phrase));
  };
  
  const to12 = (time24) => {
    if (!time24) return '';
    const match = time24.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return time24;
    let [_, h, m] = match;
    h = parseInt(h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    if (h > 12) h -= 12;
    return `${h}:${m} ${ampm}`;
  };

  const getSchoolQuestion = (childName, age) => {
    if (age <= 2) {
      // Baby/Toddler
      return `Thanks! Does ${childName} go to daycare?`;
    } else if (age >= 3 && age <= 4) {
      // Preschool age
      return `Thanks! Does ${childName} go to preschool or daycare?`;
    } else if (age >= 5 && age <= 18) {
      // School age
      return `Thanks! Does ${childName} go to school?`;
    } else {
      // Age unclear or missing
      return `Thanks! Does ${childName} go to school or daycare?`;
    }
  };
  
  const parseNumber = (text) => {
    // Check for digit
    const digitMatch = text.match(/\d+/);
    if (digitMatch) return parseInt(digitMatch[0]);
    
    // Check for word numbers
    const wordNumbers = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    
    const lowerText = text.toLowerCase();
    for (const [word, num] of Object.entries(wordNumbers)) {
      if (lowerText.includes(word)) return num;
    }
    
    return null;
  };
  
  // ==================== AUDIO RECORDING ====================
  
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone permission');
        return;
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Could not start recording');
    }
  };
  
  const stopRecording = async () => {
    if (!recording) return;
    
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      
      if (uri) {
        // Show thinking indicator
        const thinkingMsg = {
          id: String(Date.now()),
          role: 'user',
          content: '(Processing voice...)',
          timestamp: new Date(),
          isThinking: true,
        };
        setMessages(prev => [...prev, thinkingMsg]);
        
        // Transcribe
        const transcription = await transcribeAudio(uri);
        console.log('🎤 Whisper transcription:', transcription);
        
        if (transcription) {
          // Replace thinking with transcription
          setMessages(prev =>
            prev.map(msg =>
              msg.isThinking ? { ...msg, content: transcription, isThinking: false } : msg
            )
          );
          
          // Process the transcribed text
          processInputText(transcription);
        }
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setMessages(prev => prev.filter(msg => !msg.isThinking));
    }
  };
  
  // ==================== TEXT INPUT HANDLING ====================
  
  const handleSend = () => {
    if (!inputText.trim()) return;
    
    const userMsg = {
      id: String(Date.now()),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMsg]);
    processInputText(inputText.trim());
    setInputText('');
  };
  
  const CHILD_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD'];

  // ==================== MAIN INPUT PROCESSING ====================
  
  const goToActivities = (data) => {
    const scheduledChildren = data.children.filter(c => c.schoolStartTime);
    if (scheduledChildren.length > 0) {
      const names = scheduledChildren.map(c => c.name).join(' and ');
      const confirmText = scheduledChildren.length === 1
        ? `Great! I'll remind you about ${names}'s schedule.`
        : `Great! I'll remind you about ${names}'s schedules.`;
      setMessages(prev => [...prev, {
        id: String(Date.now()),
        role: 'assistant',
        content: confirmText,
        timestamp: new Date(),
      }]);
      playMessage(confirmText);
    }

    const hasBaby = data.children.some(child => child.age < 1);
    const hasOlderKids = data.children.some(child => child.age >= 1);

    let activitiesQuestion;
    if (hasBaby && !hasOlderKids) {
      activitiesQuestion = "Perfect! Any regular activities like baby classes, pediatrician visits, or playgroups?";
    } else if (hasBaby && hasOlderKids) {
      activitiesQuestion = "Perfect! Any regular activities like sports, classes, baby groups, or other commitments?";
    } else {
      activitiesQuestion = "Perfect! Any regular activities like sports, music classes, or other commitments?";
    }

    setMessages(prev => [...prev, {
      id: String(Date.now() + 10),
      role: 'assistant',
      content: activitiesQuestion,
      timestamp: new Date(),
    }]);

    playMessage(activitiesQuestion);

    setCurrentStage(4);
    setCurrentQuestionType('activities_intro');
    setTempChildData(prev => ({ ...prev, pendingChild: null, childQueue: [], scheduleMode: false }));
  };

  const processChildQueue = (queue, currentData) => {
    // 1. Check if queue is empty
    if (!queue || queue.length === 0) {
      // Queue finished. Check if we need to ask about MORE children.
      if (currentData.children.length < currentData.numChildren) {
        // More children - ask about next one
        const msg = "Thanks! Now tell me about your next child. What's their name and age?";
        setMessages(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          content: msg,
          timestamp: new Date(),
        }]);
        
        playMessage(msg);
        
        setCurrentQuestionType('child_info');
        setTempChildData(prev => ({ ...prev, pendingChild: null, childQueue: [] }));
      } else {
        const needsSchedule = currentData.children.filter(child => {
          if (!child) return false;
          const age = child.age;
          if (child.schoolStartTime && child.schoolEndTime) return false;
          if (age < 1) return false;
          if (child.school === 'No daycare') return false;
          if (age >= 1 && age < 5) {
            if (child.school === 'Daycare' || child.school === 'Preschool') return true;
            return false;
          }
          if (age >= 5) return true;
          if (child.school && child.school !== 'N/A (baby)' && child.school !== 'No daycare') return true;
          return false;
        });

        if (needsSchedule.length > 0) {
          const first = needsSchedule[0];
          const remaining = needsSchedule.slice(1);
          const msg = `What time is drop-off and pickup for ${first.name}?`;

          setTempChildData(prev => ({
            ...prev,
            pendingChild: first,
            childQueue: remaining,
            scheduleMode: true,
          }));

          setMessages(prev => [...prev, {
            id: String(Date.now()),
            role: 'assistant',
            content: msg,
            timestamp: new Date(),
          }]);

          playMessage(msg);

          setCurrentQuestionType('child_school_times');
          return;
        }

        goToActivities(currentData);
      }
      return;
    }

    // 2. Process next child
    const child = queue[0];
    const remainingQueue = queue.slice(1);
    const childAge = child.age;
    const childName = child.name;
    
    console.log(`📊 Child age: ${childAge}, determining school flow...`);

    // ───────────────────────────────────────────────────────
    // PATH 1: BABY (AGE < 1) - Skip school entirely
    // ───────────────────────────────────────────────────────
    if (childAge < 1) {
      console.log('👶 Baby detected - skipping school questions');
      
      const newChild = {
        ...child,
        school: 'N/A (baby)',
        schoolStartTime: null,
        schoolEndTime: null,
        color: CHILD_COLORS[currentData.children.length % CHILD_COLORS.length]
      };
      
      const updatedChildren = [...currentData.children, newChild];
      const updatedData = { ...currentData, children: updatedChildren };
      
      setCollectedData(updatedData);
      
      // Recurse for next child in queue
      processChildQueue(remainingQueue, updatedData);
      return;
    }

    // ───────────────────────────────────────────────────────
    // PATH 2: TODDLER (AGE 1-4) - Ask about daycare/preschool
    // ───────────────────────────────────────────────────────
    if (childAge >= 1 && childAge < 5) {
      console.log('👧 Toddler detected - asking about daycare/preschool');
      
      setTempChildData(prev => ({
        ...prev,
        pendingChild: child,
        childQueue: remainingQueue
      }));

      const msg = `Does ${childName} go to daycare or preschool?`;
      setMessages(prev => [...prev, {
        id: String(Date.now()),
        role: 'assistant',
        content: msg,
        timestamp: new Date(),
      }]);
      
      playMessage(msg);
      
      setCurrentQuestionType('child_daycare');
      return;
    }

    // ───────────────────────────────────────────────────────
    // PATH 3: SCHOOL AGE (AGE 5+) - SAVE FOR BATCH PROCESSING
    // ───────────────────────────────────────────────────────
    if (childAge >= 5) {
      console.log('🎒 School-age child detected - queuing for batch processing');
      
      // We add them to collectedData immediately BUT without school times
      // They will be picked up by the "schoolAgeChildren" check at the end of the queue
      const newChild = {
        ...child,
        school: 'School',
        schoolStartTime: null, // Will be filled later
        schoolEndTime: null,
        color: CHILD_COLORS[currentData.children.length % CHILD_COLORS.length]
      };
      
      const updatedChildren = [...currentData.children, newChild];
      const updatedData = { ...currentData, children: updatedChildren };
      setCollectedData(updatedData);
      
      // Recurse immediately for next child
      processChildQueue(remainingQueue, updatedData);
      return;
    }
    
    // Fallback for missing age
    setTempChildData(prev => ({
      ...prev,
      pendingChild: child,
      childQueue: remainingQueue
    }));
    
    const msg = `Does ${childName} go to school or daycare?`;
    setMessages(prev => [...prev, {
      id: String(Date.now()),
      role: 'assistant',
      content: msg,
      timestamp: new Date(),
    }]);
    
    playMessage(msg);
    
    setCurrentQuestionType('child_daycare');
  };

  const processInputText = (message) => {
    console.log(`Processing Stage ${currentStage}, Type: ${currentQuestionType}, Input: "${message}"`);
    
    // STAGE 1: NAME
    if (currentStage === 1 && currentQuestionType === 'name') {
      // Extract just the name using simple parsing
      let extractedName = message.trim();
      
      // Common patterns: "I'm X", "My name is X", "X", "Hi, I'm X"
      const patterns = [
        /(?:i'?m|i am)\s+([a-z]+)/i,
        /(?:my name is|name's)\s+([a-z]+)/i,
        /^([a-z]+)$/i,
        /hi[,\s]+(?:i'?m|i am)\s+([a-z]+)/i,
      ];
      
      for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          extractedName = match[1];
          break;
        }
      }
      
      // Capitalize first letter
      const name = extractedName.charAt(0).toUpperCase() + extractedName.slice(1).toLowerCase();
      
      setCollectedData(prev => ({ ...prev, name }));
      
      const responseText = `Nice to meet you, ${name}! How many children do you have?`;
      
      setMessages(prev => [...prev, {
        id: String(Date.now()),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      }]);
      
      // ADD TTS HERE
      playMessage(responseText);
      
      setCurrentStage(2);
      setCurrentQuestionType('num_children');
      return;
    }
    
    // STAGE 2: NUMBER OF CHILDREN
    if (currentStage === 2 && currentQuestionType === 'num_children') {
      const numChildren = parseNumber(message);
      
      if (numChildren === null) {
        const msg = "I didn't catch that. How many children do you have? (Just the number)";
        setMessages(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          content: msg,
          timestamp: new Date(),
        }]);
        
        playMessage(msg, "I didn't catch that. How many children do you have? Just the number");
        
        return;
      }
      
      setCollectedData(prev => ({ ...prev, numChildren }));
      
      if (numChildren === 0) {
        // Skip to activities
        const msg = "Got it! Let's move on to activities.";
        setMessages(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          content: msg,
          timestamp: new Date(),
        }]);

        playMessage(msg);

        setCurrentStage(4);
        setCurrentQuestionType('activities_intro');
      } else {
        const msg = numChildren === 1 
          ? "Great! Tell me about your child. What's their name and age?"
          : "Great! Tell me about your children. What are their names and ages?";

        setMessages(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          content: msg,
          timestamp: new Date(),
        }]);
        
        playMessage(msg);
        
        setCurrentStage(3);
        setCurrentQuestionType('child_info');
      }
      return;
    }
    
    // STAGE 3: CHILD INFO (BATCH)
    if (currentStage === 3 && currentQuestionType === 'child_info') {
      (async () => {
        try {
          const parsedChildren = await parseChildren(message);
          
          if (!parsedChildren || parsedChildren.length === 0) {
            const msg = "I didn't catch that. Could you tell me their names and ages?";
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            
            playMessage(msg);
            return;
          }
          
          // Start processing queue with new age-based logic
          // Note: We don't add to collectedData immediately anymore. 
          // processChildQueue adds them one by one.
          processChildQueue(parsedChildren, collectedData);
          
        } catch (err) {
          console.error('Parse error:', err);
        }
      })();
      return;
    }
    
    // STAGE 3: CHILD DAYCARE ANSWER
    if (currentStage === 3 && currentQuestionType === 'child_daycare') {
      const text = message.trim().toLowerCase();
      
      if (isNegativeResponse(text)) {
        // No daycare - save null and continue
        const newChild = {
          ...tempChildData.pendingChild,
          school: 'No daycare', // Explicitly mark as No daycare
          schoolStartTime: null,
          schoolEndTime: null,
          color: CHILD_COLORS[collectedData.children.length % CHILD_COLORS.length]
        };
        
        const updatedChildren = [...collectedData.children, newChild];
        const updatedData = { ...collectedData, children: updatedChildren };
        setCollectedData(updatedData);
        
        processChildQueue(tempChildData.childQueue, updatedData);
        return;
      }
      
      // Yes - ask for times
      const msg = "Great! What time is drop-off and pickup?";
      setMessages(prev => [...prev, {
        id: String(Date.now()),
        role: 'assistant',
        content: msg,
        timestamp: new Date(),
      }]);
      
      playMessage(msg);
      
      // Update pending child
      setTempChildData(prev => ({
        ...prev,
        pendingChild: { ...prev.pendingChild, school: 'Daycare' }
      }));
      
      setCurrentQuestionType('child_school_times');
      return;
    }
    
    // STAGE 3: SCHOOL TIMES ANSWER (Shared for School & Daycare)
    if (currentStage === 3 && currentQuestionType === 'child_school_times') {
      console.log('🗣️ User input for school times:', message);
      
      (async () => {
        try {
          // Use AI parsing instead of brittle regex
          const childToUpdate = tempChildData.pendingChild;
          console.log(`🤖 Calling parseSchoolSchedule for child: ${childToUpdate.name}`);
          
          // Log raw input for debug
          console.log('📝 Raw voice input:', message);

          const result = await parseSchoolSchedule(message, [childToUpdate]);
          console.log('🤖 AI parsed result:', JSON.stringify(result, null, 2));

          const parsedChild = result && result.children && result.children.length > 0 ? result.children[0] : null;

          if (parsedChild && parsedChild.dropoff_time && parsedChild.pickup_time) {
            const startTime = parsedChild.dropoff_time;
            const endTime = parsedChild.pickup_time;

            console.log(`✅ AI extracted - Drop-off: ${startTime}, Pickup: ${endTime}`);
            
            // DIRECTLY SAVE DATA (No confirmation)
            const child = tempChildData.pendingChild;
            const schoolType = child.school || (child.age < 5 ? 'Daycare' : 'School');
            
            // Update collected data
            const existingIndex = collectedData.children.findIndex(c =>
              c && c.name === child.name && c.age === child.age
            );
            
            let updatedChildren;
            if (existingIndex >= 0) {
              updatedChildren = collectedData.children.map((c, idx) => {
                if (idx !== existingIndex) return c;
                return {
                  ...c,
                  school: schoolType,
                  schoolStartTime: startTime,
                  schoolEndTime: endTime,
                };
              });
            } else {
              const newChild = {
                ...child,
                school: schoolType,
                schoolStartTime: startTime,
                schoolEndTime: endTime,
                color: CHILD_COLORS[collectedData.children.length % CHILD_COLORS.length]
              };
              updatedChildren = [...collectedData.children, newChild];
            }
            
            const updatedData = { ...collectedData, children: updatedChildren };
            setCollectedData(updatedData);

            // HANDLE NEXT STEP
            if (tempChildData.scheduleMode) {
              // We are in the "ask times for all kids" loop
              const queue = tempChildData.childQueue || [];
              if (!queue.length) {
                goToActivities(updatedData);
                return;
              }
              const nextChild = queue[0];
              const remaining = queue.slice(1);
              const msg = `What time is drop-off and pickup for ${nextChild.name}?`;

              setTempChildData(prev => ({
                ...prev,
                pendingChild: nextChild,
                childQueue: remaining,
                scheduleMode: true,
                parsedTimes: null // clear
              }));

              setMessages(prev => [...prev, {
                id: String(Date.now()),
                role: 'assistant',
                content: msg,
                timestamp: new Date(),
              }]);

              playMessage(msg);
              setCurrentQuestionType('child_school_times'); // Stay in loop
              return;
            } else {
               // We are in the "ask about each child one by one" loop (Daycare flow)
               // Continue to next child in the main queue
               processChildQueue(tempChildData.childQueue, updatedData);
               return;
            }
            
          } else {
            console.warn('⚠️ AI could not extract valid times from:', message);
            const msg = "I didn't catch the exact times. Could you please say the drop-off and pickup times again? (e.g., '8:30 AM and 3:00 PM')";
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            playMessage(msg);
          }
        } catch (err) {
          console.error('❌ Error parsing school times:', err);
          const msg = "Sorry, I had trouble understanding that. Could you please repeat the times?";
          setMessages(prev => [...prev, {
            id: String(Date.now()),
            role: 'assistant',
            content: msg,
            timestamp: new Date(),
          }]);
          playMessage(msg);
        }
      })();
      return;
    }
    
    // STAGE 3: MULTIPLE CHILDREN SCHOOL TIMES (Merged)
    if (currentStage === 3 && currentQuestionType === 'multiple_children_school_times') {
      (async () => {
        try {
          const schoolKids = tempChildData.schoolAgeChildren || collectedData.children.filter(c => c.age >= 5);
          console.log('🗣️ User input for multiple school times:', message);
          
          const result = await parseSchoolSchedule(message, schoolKids);
          const parsedChildren = result && Array.isArray(result.children) ? result.children : [];
          console.log('🤖 AI parsed school schedule:', parsedChildren);
          
          if (!parsedChildren || parsedChildren.length === 0) {
             console.warn('⚠️ No times parsed for multiple children');
             if (schoolKids.length > 0) {
                const firstChild = schoolKids[0];
                const msg = `I didn't quite catch that. Let's do this one by one. What are the drop-off and pickup times for ${firstChild.name}?`;
                setMessages(prev => [...prev, {
                  id: String(Date.now()),
                  role: 'assistant',
                  content: msg,
                  timestamp: new Date(),
                }]);
                playMessage(msg);
                setTempChildData({
                  pendingChild: firstChild,
                  childQueue: schoolKids.slice(1),
                  scheduleMode: true
                });
                setCurrentQuestionType('child_school_times');
             }
             return;
          }

          // DIRECTLY SAVE DATA (No confirmation)
          const validation = validateAndMapSchoolTimes(parsedChildren, schoolKids, message);
          const perChild = validation.perChild || {};
          
          console.log('✅ AI extracted times map:', perChild);

          const updatedChildren = collectedData.children.map(child => {
             if (schoolKids.find(k => k.name === child.name)) {
                 const t = perChild[child.name];
                 if (t) {
                     return {
                        ...child,
                        school: 'School',
                        schoolStartTime: t.start,
                        schoolEndTime: t.end
                     };
                 }
             }
             return child;
          });
          
          setCollectedData(prev => ({ ...prev, children: updatedChildren }));
          
          // MOVE DIRECTLY TO NEXT STAGE
          const activityQuestion = `Any regular activities like sports, music classes, or other commitments?`;
          setMessages(prev => [...prev, {
             id: String(Date.now()),
             role: 'assistant',
             content: activityQuestion,
             timestamp: new Date(),
          }]);
          playMessage(activityQuestion);
          setCurrentStage(4);
          setCurrentQuestionType('activities_intro');
          setTempChildData({ schoolAgeChildren: null, perChildTimes: null, parsedSchoolTimes: null });

        } catch (err) {
          console.error('❌ Error parsing multiple school times:', err);
          const schoolKids = tempChildData.schoolAgeChildren || collectedData.children.filter(c => c.age >= 5);
          if (schoolKids.length > 0) {
            const firstChild = schoolKids[0];
            const msg = `Sorry, I'm having trouble. Let's go one by one. What are the times for ${firstChild.name}?`;
            setMessages(prev => [...prev, {
               id: String(Date.now()),
               role: 'assistant',
               content: msg,
               timestamp: new Date(),
            }]);
            playMessage(msg);
            setTempChildData({
               pendingChild: firstChild,
               childQueue: schoolKids.slice(1),
               scheduleMode: true
            });
            setCurrentQuestionType('child_school_times');
          }
        }
      })();
      return;
    }

    // STAGE 3: CONFIRM SAME TIMES
    if (currentStage === 3 && currentQuestionType === 'confirm_same_times') {
       const text = message.toLowerCase();
       if (text.includes('same') || text.includes('yes')) {
          // Re-trigger the multiple_children_school_times logic with "same" appended effectively
          // But since we can't easily jump back with state, we just ask for the time again clearly if we missed it, 
          // OR if we already parsed it in the previous step we could have saved it. 
          // Simplified flow: Just ask for the time again for "all of them".
          
          const msg = "Got it. What are the times?";
          setMessages(prev => [...prev, {
             id: String(Date.now()),
             role: 'assistant',
             content: msg,
             timestamp: new Date(),
          }]);
          
          playMessage(msg);
          
          setCurrentQuestionType('multiple_children_school_times'); // Loop back to catch the time
          return;
       } else {
          // Different times - Fallback to asking one by one (would need more complex logic, 
          // but for this task let's just ask for the first child's time to restart a manual loop?
          // For MVP, let's just say: "Okay, let's do them one by one." and reset queue? 
          // Complex. Let's stick to the user's prompt: "For MVP, prompt them to give times separately"
          
          // Actually, the user code just says "prompt them to give times separately" 
          // We can restart the processChildQueue with just the schoolAgeChildren!
          
           const msg = "Okay, let's do them one by one.";
           setMessages(prev => [...prev, {
             id: String(Date.now()),
             role: 'assistant',
             content: msg,
             timestamp: new Date(),
           }]);
           
           playMessage(msg);
           
           // We need to RESET the schoolStartTime for these kids to null (already null)
           // And feed them back into processChildQueue somehow. 
           // But processChildQueue takes a queue.
           
           // Create a queue of just these children
           const queue = tempChildData.schoolAgeChildren;
           
           // We need to set them up so processChildQueue handles them individually.
           // BUT processChildQueue logic for age >= 5 currently queues them for batch! 
           // We need a flag to force individual processing or handle it differently.
           
           // Hack for MVP: Change their age to 4.9 in the queue to trigger the "daycare" flow? No, that asks "Daycare".
           // Better: Add a flag `forceIndividual: true` to the child object in queue?
           // The processChildQueue function doesn't check flags.
           
           // SIMPLEST FIX: Just ask for the first one manually here, then loop.
           // This is getting complex. Let's stick to the "Same" path working perfectly first.
           
           // User instruction says: "For MVP, prompt them to give times separately"
           // Let's just ask for the first child's time manually and handle it as a single child answer.
           
           const firstChild = tempChildData.schoolAgeChildren[0];
           const msg2 = `What time is drop-off and pickup for ${firstChild.name}?`;
           setMessages(prev => [...prev, {
             id: String(Date.now() + 1),
             role: 'assistant',
             content: msg2,
             timestamp: new Date(),
           }]);
           
           playMessage(msg2);
           
           setTempChildData({ 
              pendingChild: firstChild, 
              childQueue: tempChildData.schoolAgeChildren.slice(1) // Remaining kids
           });
           
           setCurrentQuestionType('child_school_times'); // This handler works for single child
           return;
       }
    }

    // STAGE 4: ACTIVITIES INTRO
    if (currentStage === 4 && currentQuestionType === 'activities_intro') {
      (async () => {
        // ⚠️ CRITICAL: Check for NO FIRST - before any async calls
        const text = message.trim().toLowerCase();
        
        if (isNegativeResponse(text)) {
          console.log('❌ User has no activities');
          
          // Save empty activities
          setCollectedData(prev => ({ 
            ...prev, 
            activities: [] 
          }));
          
          // Friendly message
          const noActivityMsg = `No problem! You can always add activities later in your profile.`;
          setMessages(prev => [...prev, {
            id: String(Date.now()),
            role: 'assistant',
            content: noActivityMsg,
            timestamp: new Date(),
          }]);
          
          playMessage(noActivityMsg);
          
          // Move to self-care reminder
          const name = collectedData.name || 'there';
          const selfCareMsg = `One last thing, ${name}. Let's not forget about you! Would you like a daily reminder for yourself?`;
          
          setMessages(prev => [...prev, {
            id: String(Date.now() + 1),
            role: 'assistant',
            content: selfCareMsg,
            timestamp: new Date(),
          }]);
          
          playMessage(selfCareMsg);
          
          setCurrentStage(5);
          setCurrentQuestionType('self_reminder_intro');
          
          return;
        }
        
        // User wants to add activities
        try {
          const childrenList = collectedData.children || [];
          const parsed = await parseActivities(message, childrenList, lastChildName);
          const items = (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
          
          if (!parsed.hasActivity || items.length === 0) {
            const msg = "I didn't catch any activities. Could you say that again?";
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            playMessage(msg);
            return;
          }

          // 1. Separate complete vs incomplete
          const complete = [];
          const incomplete = [];
          
          items.forEach(item => {
            if (!item.day || !item.time) {
              incomplete.push(item);
            } else {
              complete.push(item);
            }
          });

          // 2. Save complete ones
          if (complete.length > 0) {
            const newActivities = complete.map(item => ({
              activity: item.activity || 'Activity',
              child: item.child || (childrenList[0]?.name || lastChildName || ''),
              day: item.day,
              time: item.time,
              icon: item.icon || null, // Capture icon from AI
            }));
            
            const updatedActivities = [...(collectedData.activities || []), ...newActivities];
            setCollectedData(prev => ({ ...prev, activities: updatedActivities }));
            
            const activityList = newActivities.map(act => {
               const childPart = act.child ? ` for ${act.child}` : '';
               const timePart = act.time ? ` at ${act.time}` : '';
               const dayPart = act.day ? ` - ${act.day}s${timePart}` : '';
               return `- ${act.activity}${childPart}${dayPart}`;
            }).join('\n');
            
            const msg = `Great! I've added:\n${activityList}`;
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            playMessage(msg);
          }

          // 3. Handle incomplete ones (Prioritize first one)
          if (incomplete.length > 0) {
            const item = incomplete[0];
            const activityName = item.activity || 'that activity';
            
            setTempChildData(prev => ({ ...prev, pendingActivity: activityName }));
            
            const msg = `What days and times for ${activityName}?`;
            setMessages(prev => [...prev, {
              id: String(Date.now() + 1),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            playMessage(msg);
            
            setCurrentQuestionType('activity_details');
            return;
          }
          
          // 4. If all complete, ask for more
          setMessages(prev => [...prev, {
            id: String(Date.now() + 1),
            role: 'assistant',
            content: 'Any other regular activities?',
            timestamp: new Date(),
          }]);
          playMessage('Any other regular activities?');
          setCurrentQuestionType('activities_more');

        } catch (err) {
          console.error('Parse error:', err);
        }
      })();
      return;
    }
    
    // STAGE 4: ACTIVITY DETAILS (Follow-up)
    if (currentStage === 4 && currentQuestionType === 'activity_details') {
      const activityName = tempChildData.pendingActivity;
      const textToParse = `${activityName} ${message}`;
      
      (async () => {
        try {
          const childrenList = collectedData.children || [];
          const parsed = await parseActivities(textToParse, childrenList, lastChildName);
          const items = (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
          
          // Logic duplicate - ideally refactor, but keeping inline for safety
          const complete = [];
          const incomplete = [];
          items.forEach(item => {
            // Check for duplicate in existing data
            const isDuplicate = (collectedData.activities || []).some(existing => 
                existing.activity.toLowerCase() === (item.activity || '').toLowerCase() &&
                existing.day === item.day &&
                existing.time === item.time
            );
            if (isDuplicate) return;

            if (!item.day || !item.time) {
               // Only treat as incomplete if we don't have a complete version in this batch
               const hasCompleteInBatch = items.some(other => 
                   other !== item &&
                   (other.activity || '').toLowerCase() === (item.activity || '').toLowerCase() &&
                   other.day && other.time
               );
               if (!hasCompleteInBatch) {
                   incomplete.push(item);
               }
            } else {
              complete.push(item);
            }
          });

          if (complete.length > 0) {
            const newActivities = complete.map(item => ({
              activity: item.activity || activityName,
              child: item.child || (childrenList[0]?.name || lastChildName || ''),
              day: item.day,
              time: item.time,
              icon: item.icon || null, // Capture icon from AI
            }));
            
            const updatedActivities = [...(collectedData.activities || []), ...newActivities];
            setCollectedData(prev => ({ ...prev, activities: updatedActivities }));
            
            const activityList = newActivities.map(act => {
               const childPart = act.child ? ` for ${act.child}` : '';
               const timePart = act.time ? ` at ${act.time}` : '';
               const dayPart = act.day ? ` - ${act.day}s${timePart}` : '';
               return `- ${act.activity}${childPart}${dayPart}`;
            }).join('\n');
            
            const msg = `Got it! Added:\n${activityList}`;
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            playMessage(msg);
          }

          if (incomplete.length > 0) {
             // Still missing details? Ask again or give up?
             // Let's ask again but be specific
             const msg = `I still need the day and time for ${activityName}. Can you say it like "Mondays at 4pm"?`;
             setMessages(prev => [...prev, {
              id: String(Date.now() + 1),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            playMessage(msg);
            return;
          }

          // All done
          setMessages(prev => [...prev, {
            id: String(Date.now() + 1),
            role: 'assistant',
            content: 'Any other regular activities?',
            timestamp: new Date(),
          }]);
          playMessage('Any other regular activities?');
          setCurrentQuestionType('activities_more');

        } catch (err) {
            console.error(err);
        }
      })();
      return;
    }
    
    // STAGE 4: ACTIVITIES MORE
    if (currentStage === 4 && currentQuestionType === 'activities_more') {
      const text = message.trim().toLowerCase();
      
      // ⚠️ STEP 1: CHECK FOR NEGATIVE - DO THIS FIRST, BEFORE ANYTHING ELSE
      const isNegative = 
        text === 'no' || 
        text === 'nope' || 
        text === 'no.' || 
        text.includes('no more') || 
        text.includes("that's all") || 
        text.includes("that's it") ||
        isNegativeResponse(text);
      
      if (isNegative) {
        console.log('✅ User said NO to more activities');
        
        // ⚠️ STEP 2: CHANGE STAGE IMMEDIATELY - BEFORE TTS, BEFORE OPENAI
        setCurrentStage(5);
        setCurrentQuestionType('self_reminder_intro');
        
        // ⚠️ STEP 3: ADD MESSAGES
        const name = collectedData.name || 'there';
        const selfCareMsg = `One last thing, ${name}. Let's not forget about you! Would you like a daily reminder for yourself? Something like "Take your vitamins" or "10 minutes of quiet time"?`;
        
        setMessages(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          content: selfCareMsg,
          timestamp: new Date(),
        }]);
        
        // ⚠️ STEP 4: ONLY THEN CALL TTS (OPTIONAL)
        playMessage(selfCareMsg);
        
        return; // ⚠️ CRITICAL: EXIT IMMEDIATELY
      }
      
      (async () => {
        // Add more activities
        try {
          const childrenList = collectedData.children || [];
          const parsed = await parseActivities(text, childrenList, lastChildName);
          const items = (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
          
          if (parsed.hasActivity && items.length > 0) {
            // 1. Separate complete vs incomplete
            const complete = [];
            const incomplete = [];
            items.forEach(item => {
              if (!item.day || !item.time) incomplete.push(item);
              else complete.push(item);
            });

            // 2. Add complete
            if (complete.length > 0) {
              const newActivities = complete.map(item => ({
                activity: item.activity || 'Activity',
                child: item.child || (childrenList[0]?.name || lastChildName || ''),
                day: item.day,
                time: item.time,
                icon: item.icon || null, // Capture icon from AI
              }));
              
              const updatedActivities = [...(collectedData.activities || []), ...newActivities];
              setCollectedData(prev => ({ ...prev, activities: updatedActivities }));
              
              const activityList = newActivities.map(act => {
                 const childPart = act.child ? ` for ${act.child}` : '';
                 const timePart = act.time ? ` at ${act.time}` : '';
                 const dayPart = act.day ? ` - ${act.day}s${timePart}` : '';
                 return `- ${act.activity}${childPart}${dayPart}`;
              }).join('\n');
              
              setMessages(prev => [...prev, {
                id: String(Date.now()),
                role: 'assistant',
                content: `Added:\n${activityList}`,
                timestamp: new Date(),
              }]);
            }

            // 3. Handle incomplete
            if (incomplete.length > 0) {
              const item = incomplete[0];
              const activityName = item.activity || 'that activity';
              setTempChildData(prev => ({ ...prev, pendingActivity: activityName }));
              
              const msg = `What days and times for ${activityName}?`;
              setMessages(prev => [...prev, {
                id: String(Date.now() + 1),
                role: 'assistant',
                content: msg,
                timestamp: new Date(),
              }]);
              playMessage(msg);
              setCurrentQuestionType('activity_details');
              return;
            }
            
            // 4. Ask for more
            setMessages(prev => [...prev, {
              id: String(Date.now() + 1),
              role: 'assistant',
              content: 'Any other activities?',
              timestamp: new Date(),
            }]);
          }
        } catch (err) {
          console.error('Parse error:', err);
        }
      })();
      return;
    }
    
    // STAGE 5: SELF-REMINDER
    if (currentStage === 5 && currentQuestionType === 'self_reminder_intro') {
      const text = message.trim().toLowerCase();
      
      // Check if they said NO
      if (isNegativeResponse(text)) {
        console.log('❌ User declined self-care reminder');
        
        setCollectedData(prev => ({ 
          ...prev, 
          selfReminders: [] 
        }));
        
        const msg = "No problem! Let's review what we've set up.";
        setMessages(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          content: msg,
          timestamp: new Date(),
        }]);
        
        playMessage(msg);
        
        // Move to summary
        generateSummary();
        
        return;
      }
      
      // They want a reminder - parse it
      console.log('✅ Parsing self-care reminder:', message);
      
      (async () => {
        try {
          const parsed = await parseSelfReminder(message);
          const items = parsed?.items || [];
          
          if (items.length > 0) {
            const normalized = items
              .filter(it => it && it.what)
              .map(it => ({
                what: it.what,
                time: it.time || null,
                notes: it.duration || null,
                recurrence: it.recurrence || 'daily',
                day: it.day || null,
                days: it.days || null,
                icon: it.icon || null, // Capture icon from AI
              }));
            
            if (normalized.length === 0) {
              throw new Error('No valid self-reminder items');
            }
            
            setCollectedData(prev => ({ 
              ...prev, 
              selfReminders: normalized,
            }));
            
            const first = normalized[0];
            let cleanWhat = first.what;
            cleanWhat = cleanWhat.replace(/^(to |about )/i, '');
            cleanWhat = cleanWhat.replace(/\bmy\b/gi, '').replace(/\s{2,}/g, ' ').trim();
            
            const timeText = first.time ? ` at ${first.time}` : '';
            const dayText = first.recurrence === 'weekly' && first.day ? ` on ${first.day}s` : ' daily';
            const durationText = first.notes ? ` for ${first.notes}` : '';
            
            const confirmMsg = normalized.length === 1
              ? `Perfect! I'll remind you to ${cleanWhat}${dayText}${timeText}${durationText}.`
              : `Perfect! I'll remind you about those ${normalized.length} self-care items.`;
            
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: confirmMsg,
              timestamp: new Date(),
            }]);
            
            playMessage(confirmMsg);
            
            const updatedData = { 
              ...collectedData, 
              selfReminders: normalized,
            };
            setCollectedData(updatedData);
            generateSummary(updatedData);
            
            return;
          } else {
            // Parsing failed - ask again more specifically
            const msg = "What would you like to be reminded about? (e.g., 'Take vitamins at 8am')";
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            
            playMessage(msg, "What would you like to be reminded about? For example, Take vitamins at 8am");
            
            setCurrentQuestionType('self_reminder_detail');
            return;
          }
        } catch (error) {
          console.error('❌ Error parsing self-care:', error);
          
          // Ask again
          setMessages(prev => [...prev, {
            id: String(Date.now()),
            role: 'assistant',
            content: "What would you like to be reminded about?",
            timestamp: new Date(),
          }]);
          
          setCurrentQuestionType('self_reminder_detail');
          return;
        }
      })();
      return;
    }
    
    // STAGE 5: SELF-REMINDER DETAIL
    if (currentStage === 5 && currentQuestionType === 'self_reminder_detail') {
      (async () => {
        try {
          const parsed = await parseSelfReminder(message);
          const items = parsed?.items || [];
          
          if (items.length > 0) {
            const normalized = items
              .filter(it => it && it.what)
              .map(it => ({
                what: it.what,
                time: it.time || null,
                notes: it.duration || null,
                recurrence: it.recurrence || 'daily',
                day: it.day || null,
                days: it.days || null,
                icon: it.icon || null, // Capture icon from AI
              }));
            
            const updatedData = { ...collectedData, selfReminders: normalized };
            setCollectedData(updatedData);
            
            console.log('✅ Saved self-reminders (detail):', normalized);
            
            const first = normalized[0];
            let cleanWhat = first.what;
            cleanWhat = cleanWhat.replace(/^(to |about )/i, '');
            cleanWhat = cleanWhat.replace(/\bmy\b/gi, '').replace(/\s{2,}/g, ' ').trim();
            
            // Format time + duration for confirmation
            const timeText = first.time ? ` at ${first.time}` : '';
            const dayText = first.recurrence === 'weekly' && first.day ? ` on ${first.day}s` : ' daily';
            const durationText = first.notes ? ` for ${first.notes}` : '';
            
            const msg = normalized.length === 1
              ? `Perfect! I'll remind you to ${cleanWhat}${dayText}${timeText}${durationText}.`
              : `Perfect! I'll remind you about those ${normalized.length} self-care items.`;
            setMessages(prev => [...prev, {
              id: String(Date.now()),
              role: 'assistant',
              content: msg,
              timestamp: new Date(),
            }]);
            
            playMessage(msg);
          }
          
          generateSummary({ ...collectedData, selfReminders: items });
        } catch (err) {
          console.error('Parse error:', err);
          generateSummary();
        }
      })();
      return;
    }
    
    // STAGE 6: SUMMARY CONFIRMATION
    if (currentStage === 6 && currentQuestionType === 'summary_confirm') {
      const isConfirmed = /\b(yes|yeah|yep|correct|right|good|perfect|ok|looks good)\b/i.test(message);
      
      console.log('🔍 User response:', message);
      console.log('🔍 Is confirmed?', isConfirmed);

      if (isConfirmed) {
        // Save data
        console.log('✅ User confirmed, saving...');
        saveDataAndComplete();
      } else {
        console.log('❌ User wants to correct (or unmatched response)');
        const msg = "No problem! You can update your info later in your Profile.";
        setMessages(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          content: msg,
          timestamp: new Date(),
        }]);
        
        playMessage(msg);
        
        saveDataAndComplete();
      }
      return;
    }
  };
  
  // ==================== SUMMARY GENERATION ====================
  
  const generateSummary = (dataToUse = collectedData) => {
    setCurrentStage(6);
    setCurrentQuestionType('summary_confirm');
    
    console.log('🔍 SUMMARY DEBUG:', { 
      selfReminders: dataToUse.selfReminders, 
      allData: dataToUse, 
    });
    
    const userName = dataToUse.name || 'there';
    const childrenList = dataToUse.children || [];
    const activities = dataToUse.activities || [];
    const selfReminders = dataToUse.selfReminders || [];
    console.log('💝 Self Reminder Check:', {
      count: selfReminders.length,
      items: selfReminders,
    });
    
    let summaryText = `All set, ${userName}! Here's your family:\n\n`;
    
    // Children
    summaryText += `👶 Your Children:\n`;
    childrenList.forEach((child) => {
      summaryText += `- ${child.name} (${child.age} years old)`;
      if (child.school && child.schoolStartTime && child.schoolEndTime) {
        summaryText += `\n  School: ${child.schoolStartTime} - ${child.schoolEndTime}`;
      }
      summaryText += `\n`;
    });
    
    // Activities
    if (activities.length > 0) {
      summaryText += `\n\n🎯 Activities:\n`;
      activities.forEach((act) => {
        const timeStr = act.time ? ` ${act.day}s ${act.time}` : ` ${act.day}s`;
        summaryText += `- ${act.activity} -${timeStr}`;
        if (act.child && childrenList.length > 1) {
          summaryText += ` (${act.child})`;
        }
        summaryText += `\n`;
      });
    }
    
    if (selfReminders.length > 0) { 
      summaryText += "\n\n💝 Your Reminders:\n"; 
      selfReminders.forEach(item => {
        summaryText += `- ${item.what}`;
        if (item.recurrence === 'weekly') {
             if (item.days && item.days.length > 0) {
                 const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                 const daysStr = item.days.map(d => dayNames[d]).join(', ');
                 summaryText += ` on ${daysStr}`;
             } else if (item.day) {
                 summaryText += ` on ${item.day}s`;
             }
        }
        if (item.time) {
          summaryText += ` at ${item.time}`;
        }
        summaryText += `\n`;
      });
    }
    
    console.log('📊 Summary - selfReminders:', selfReminders);
    
    summaryText += `\n\nDoes this look good?`;
    
    setMessages(prev => [...prev, {
      id: String(Date.now()),
      role: 'assistant',
      content: summaryText,
      timestamp: new Date(),
    }]);

    // Speak summary intro
    const childrenCount = childrenList.length;
    const activitiesCount = activities.length;
    let countsPart = `You have ${childrenCount} ${childrenCount === 1 ? 'child' : 'children'}`;
    if (activitiesCount > 0) {
      countsPart += `, ${activitiesCount} ${activitiesCount === 1 ? 'activity' : 'activities'}`;
    }
    let selfPart = '';
    if (selfReminders.length === 1) {
      const only = selfReminders[0];
      let cleanWhat = (only.what || '').replace(/^(to |about )/i, '').replace(/\bmy\b/gi, '').trim();
      const timeStr = only.time ? ` at ${only.time}` : '';
      let dayStr = ' daily';
      if (only.recurrence === 'weekly') {
        if (only.days && only.days.length > 0) {
           const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
           dayStr = ` on ${only.days.map(d => dayNames[d]).join(' and ')}`;
        } else if (only.day) {
           dayStr = ` on ${only.day}s`;
        }
      }
      selfPart = `, and a reminder to ${cleanWhat}${dayStr}${timeStr}`;
    } else if (selfReminders.length > 1) {
      selfPart = `, and ${selfReminders.length} self-care reminders`;
    }
    const summaryTTS = `All set, ${userName}! ${countsPart}${selfPart}. Does this look good?`;
    playMessage(summaryText, summaryTTS);
  };
  
  // ==================== SAVE AND COMPLETE ====================
  
  const saveDataAndComplete = async () => {
    try {
      console.log('Saving:', JSON.stringify(collectedData, null, 2));
      const msg = "Perfect! Saving your information...";
      setMessages(prev => [...prev, {
        id: String(Date.now()),
        role: 'assistant',
        content: msg,
        timestamp: new Date(),
      }]);
      
      playMessage(msg);
      console.log('🔍 About to save:', collectedData);
      
      const userId = await getCurrentUserId();
      console.log('👤 User ID retrieved:', userId);
      
      if (!userId) {
        console.error('❌ CRITICAL: User ID is missing! Cannot save data.');
        Alert.alert('Error', 'User ID is missing. Please try restarting the app.');
        return;
      }

      const payload = { ...collectedData, user_id: userId };
      
      console.log('� Attempting to save user data:', { 
        user_name: payload.name, 
        num_children: payload.numChildren, 
        children_info: payload.children, 
        activities: payload.activities,
        user_id: payload.user_id
      });
      
      // FIX #1: Error handling for user save
      try {
          console.log('🔄 Calling saveUserData with payload...');
          const { result, error } = await saveUserData(payload);
          if (error) {
             console.error('❌ Database error saving user:', error);
             Alert.alert('Save failed', error.message || 'Could not save profile');
             return; 
          }
          console.log('✅ User data saved successfully:', result);
      } catch (saveErr) {
          console.error('❌ Save exception saving user:', saveErr);
          Alert.alert('Save error', saveErr.message);
          return;
      }

      // Save each child to children table
      try {
        console.log('👶 Saving children to database...');
        for (const child of (collectedData.children || [])) {
          const childActivities = (Array.isArray(collectedData.activities) ? collectedData.activities : []).filter(a => a && a.child === child.name);
          const childData = {
            user_id: userId,
            name: child.name,
            age: parseFloat(child.age),
            school_name: child.school || 'School',
            dropoff_time: child.schoolStartTime || null,
            pickup_time: child.schoolEndTime || null,
            activities: JSON.stringify(childActivities),
          };
          console.log('   -> Inserting child:', child.name, childData);
          
          const { error: childError } = await supabase.from('children').insert(childData);
          if (childError) {
             console.error(`❌ Error saving child ${child.name}:`, childError);
          } else {
             console.log(`✅ Child ${child.name} saved.`);
          }
        }
      } catch (e) {
        console.error('❌ Exception saving children:', e);
      }

      // Verify saved children (Debug Log)
      try {
        console.log('🔍 Verifying saved children data...');
        const { data: savedChildren, error: fetchError } = await supabase
            .from('children')
            .select('*')
            .eq('user_id', userId);
            
        if (fetchError) {
            console.error('❌ Error fetching saved children:', fetchError);
        } else {
            console.log('✅ Database query result (Children):', JSON.stringify(savedChildren, null, 2));
        }
      } catch (e) {
        console.error('❌ Exception verifying children:', e);
      }
      
      // Create all reminders after profile saved
      try {
          console.log('📝 Creating reminders from onboarding...');
          
          const userPrefs = await getUserNotificationPreferences();
          const remindersToCreate = [];
          
          const safeChildren = Array.isArray(collectedData.children) ? collectedData.children : [];
          for (const child of safeChildren) {
            if (child.schoolStartTime) {
              const schoolStartEventTime = convertToTimeFormat(child.schoolStartTime);
              if (schoolStartEventTime) {
                const what = `Get ${child.name} ready for school`;
                const rType = 'school_dropoff';
                const notifTime = calculateNotificationTime(schoolStartEventTime, rType, what, userPrefs);
                
                const reminder = {
                  user_id: userId,
                  reminder_type: rType,
                  what: what,
                  icon: '🎒',
                  when_time: schoolStartEventTime,
                  event_time: schoolStartEventTime,
                  notification_time: notifTime,
                  when_date: null,
                  recurrence: 'weekdays',
                  child_name: child.name,
                  is_completed: false,
                };
                remindersToCreate.push(reminder);
                console.log('   ➕ Prepared reminder:', reminder.what, reminder.event_time, 'Notify:', reminder.notification_time);
              } else {
                console.warn('   ⚠️ Skipping school dropoff reminder due to invalid time:', child.schoolStartTime);
              }
            }
            if (child.schoolEndTime) {
              const schoolEndEventTime = convertToTimeFormat(child.schoolEndTime);
              if (schoolEndEventTime) {
                const what = `Pick up ${child.name}`;
                const rType = 'school_pickup';
                const notifTime = calculateNotificationTime(schoolEndEventTime, rType, what, userPrefs);

                const reminder = {
                  user_id: userId,
                  reminder_type: rType,
                  what: what,
                  icon: '🎒',
                  when_time: schoolEndEventTime,
                  event_time: schoolEndEventTime,
                  notification_time: notifTime,
                  when_date: null,
                  recurrence: 'weekdays',
                  child_name: child.name,
                  is_completed: false,
                };
                remindersToCreate.push(reminder);
                console.log('   ➕ Prepared reminder:', reminder.what, reminder.event_time, 'Notify:', reminder.notification_time);
              } else {
                 console.warn('   ⚠️ Skipping school pickup reminder due to invalid time:', child.schoolEndTime);
              }
            }
          }
          
          const safeActivities = Array.isArray(collectedData.activities) ? collectedData.activities : [];
          if (safeActivities.length > 0) {
            for (const activity of safeActivities) {
              const activityEventTime = convertToTimeFormat(activity.time);
              if (activityEventTime) {
                let iconSelected = activity.icon;
                if (!isValidEmoji(iconSelected)) {
                   if (__DEV__) console.log(`⚠️ AI icon '${iconSelected}' invalid/missing, using fallback.`);
                   iconSelected = getReminderIcon(activity.activity, 'activity');
                } else {
                   if (__DEV__) console.log(`✅ AI selected icon: ${iconSelected}`);
                }
                
                if (__DEV__) console.log('🎨 Creating activity reminder:', { 
                  what: activity.activity, 
                  icon: iconSelected, 
                  reminder_type: 'activity' 
                });

                // Calculate notification time using preferences
                const notifTime = calculateNotificationTime(activityEventTime, 'activity', activity.activity, userPrefs);

                const reminder = {
                  user_id: userId,
                  reminder_type: 'activity',
                  what: `${activity.activity} for ${activity.child}`,
                  icon: iconSelected,
                  when_time: activityEventTime,
                  // Ensure event_time is set
                  event_time: activityEventTime,
                  notification_time: notifTime,
                  when_date: null,
                  recurrence: 'weekly',

                  child_name: activity.child,
                  notes: activity.day || null,
                  is_completed: false,
                };
                remindersToCreate.push(reminder);
                console.log('   ➕ Prepared reminder:', reminder.what, 'Event:', reminder.event_time, 'Notify:', reminder.notification_time);
              } else {
                 console.warn('   ⚠️ Skipping activity reminder due to invalid time:', activity.time);
              }
            }
          }
          
          const selfItems = Array.isArray(collectedData.selfReminders) ? collectedData.selfReminders : [];
          if (selfItems.length > 0) {
            for (const item of selfItems) {
              const itemTime = convertToTimeFormat(item.time);
              if (itemTime) {
                
                // Construct recurrence string based on user requirement
                 let recurrenceVal = item.recurrence || 'daily';
                 let notesVal = item.notes || null;

                 if (recurrenceVal === 'weekly') {
                    if (item.days && Array.isArray(item.days)) {
                       recurrenceVal = 'weekly';
                       notesVal = JSON.stringify({ days: item.days });
                    } else if (item.day) {
                       const rawDay = item.day.toLowerCase().trim();
                       let fullDay = rawDay;
                       if (rawDay.startsWith('mon')) fullDay = 'monday';
                       else if (rawDay.startsWith('tue')) fullDay = 'tuesday';
                       else if (rawDay.startsWith('wed')) fullDay = 'wednesday';
                       else if (rawDay.startsWith('thu')) fullDay = 'thursday';
                       else if (rawDay.startsWith('fri')) fullDay = 'friday';
                       else if (rawDay.startsWith('sat')) fullDay = 'saturday';
                       else if (rawDay.startsWith('sun')) fullDay = 'sunday';

                       recurrenceVal = 'weekly';
                       notesVal = fullDay;
                    }
                 }

                let iconSelected = item.icon;
                if (!isValidEmoji(iconSelected)) {
                   iconSelected = getReminderIcon(item.what, 'personal');
                } else {
                   console.log(`✅ AI selected self-care icon: ${iconSelected}`);
                }

                const rType = 'personal';
                const notifTime = calculateNotificationTime(itemTime, rType, item.what, userPrefs);

                const reminder = {
                  user_id: userId,
                  reminder_type: rType,
                  what: item.what,
                  icon: iconSelected,
                  when_time: itemTime,
                  event_time: itemTime,
                  notification_time: notifTime,
                  when_date: null,
                  recurrence: recurrenceVal,
                  notes: notesVal,
                  is_completed: false,
                };
                remindersToCreate.push(reminder);
                console.log('   ➕ Prepared reminder:', reminder.what, reminder.event_time, 'Notify:', reminder.notification_time);
              } else {
                 console.warn('   ⚠️ Skipping self-care reminder due to invalid time:', item.time);
              }
            }
          }
          
          // Create reminders one by one using ReminderService for verification
          if (remindersToCreate.length > 0) {
            console.log(`📝 Creating ${remindersToCreate.length} reminders via Service...`);
            
            let successCount = 0;
            let failCount = 0;

            for (const reminderPayload of remindersToCreate) {
              try {
                // Use ReminderService.createReminder which handles verification and transaction
                const result = await ReminderService.createReminder(reminderPayload);
                
                if (result.success) {
                  console.log(`✅ Created reminder: ${reminderPayload.what}`);
                  successCount++;
                } else {
                  console.error(`❌ Failed to create reminder: ${reminderPayload.what}`, result.error);
                  failCount++;
                }
              } catch (err) {
                 console.error(`❌ Exception creating reminder: ${reminderPayload.what}`, err);
                 failCount++;
              }
            }

            console.log(`📊 Reminder creation summary: ${successCount} succeeded, ${failCount} failed.`);
            
            if (failCount > 0) {
              Alert.alert('Note', `${failCount} reminders could not be scheduled. Check settings.`);
            }

          } else {
            console.log('⚠️ No reminders were generated to insert.');
          }
          
      } catch (error) { 
        console.error('❌ Reminder creation logic failed:', error); 
      }
      
      const finalMessage = "All set! Let's get started. 🎉";
      await new Promise((resolve) => {
        speakAsNudge(finalMessage, resolve);
      });

      // Get the authenticated user to confirm format
      const { data: { user: authUser } } = await supabase.auth.getUser();
      console.log('🔍 DEBUG: Auth user ID:', authUser?.id);
      console.log('🔍 DEBUG: Auth user ID type:', typeof authUser?.id);
      console.log('🔍 DEBUG: userId being used:', userId);
      console.log('🔍 DEBUG: userId type:', typeof userId);

      // Ensure we're using the authenticated user's ID
      const userIdToUpdate = authUser?.id || userId;

      console.log('🔍 DEBUG: Starting onboarding completion update...');
      console.log('🔍 DEBUG: userIdToUpdate =', userIdToUpdate);

      // Mark onboarding as completed
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ onboarding_completed: true })
        .eq('id', userIdToUpdate)
        .select(); // Add .select() to return the updated row

      if (__DEV__) {
        console.log('🔍 DEBUG: Update response data:', updateData);
        console.log('🔍 DEBUG: Update error:', updateError);
      }

      if (updateError) {
        console.error('❌ Error marking onboarding complete:', updateError);
      }

      if (__DEV__) {
        if (updateData && updateData.length > 0) {
          console.log('✅ Successfully updated onboarding_completed to true');
        } else {
          console.log('⚠️ Update returned no data - may have failed silently');
        }
      }

      navigation.navigate('Dashboard');
      
      setCurrentStage(7);
    } catch (err) {
      console.error('❌ SAVE ERROR Details:', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        fullError: err,
      });
      Alert.alert('Error', `Could not save data: ${err?.message || 'Please try again.'}`);
    }
  };
  
  // ==================== RENDER ====================
  
  return (
    <View style={{ flex: 1 }}>

      <LinearGradient
        colors={['#B8C5E8', '#E8D5E5']}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.bellIcon}>🔔</Text>
            <Text style={styles.headerTitle}>NudgeMe</Text>
          </View>
          <Text style={styles.stepIndicator}>Step {currentStage}/6</Text>
        </View>
      
      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatContainer}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((msg, index) => (
            <View
              key={`msg-${msg.id}-${index}`}
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userBubble : styles.assistantBubble
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  msg.role === 'user' ? styles.userText : styles.assistantText
                ]}
              >
                {msg.content}
              </Text>
              {msg.isThinking && (
                <ActivityIndicator size="small" color="#7B9FE8" style={{ marginLeft: 8 }} />
              )}
            </View>
          ))}
        </ScrollView>
        
        <View style={styles.inputContainer}>
          {/* Mic Button */}
          <TouchableOpacity
            style={[
              styles.micButton,
              isRecording && styles.micButtonRecording
            ]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            activeOpacity={0.8}
            disabled={isSpeaking}
          >
            <Text style={styles.micIcon}>
              {isRecording ? '🔴' : '🎤'}
            </Text>
          </TouchableOpacity>
          
          {/* Text Input */}
          <TextInput
            style={styles.textInput}
            placeholder="Type your answer..."
            placeholderTextColor="#A0AEC0"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isRecording && !isSpeaking}
            multiline
            numberOfLines={2}
          />
          
          {/* Send Button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              inputText.trim() && !isRecording && !isSpeaking && styles.sendButtonActive
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isRecording || isSpeaking}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.sendButtonText,
              inputText.trim() && !isRecording && !isSpeaking && styles.sendButtonTextActive
            ]}>
              Send
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compact Footer */}
        {!keyboardVisible && (
          <Text style={styles.footerHint}>
            Press and hold 🎤 to speak
          </Text>
        )}
      </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8E9F3',
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
  },
  
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  
  bellIcon: {
    fontSize: 28,
  },
  
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  stepIndicator: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.95,
  },
  
  content: {
    flex: 1,
  },
  
  chatContainer: {
    flex: 1,
  },
  
  chatContent: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 20,
    marginBottom: 12,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#6B7BE8',
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  
  userText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  
  assistantText: {
    color: '#2D3748',
    fontWeight: '400',
  },
  
  footerHint: {
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    fontWeight: '500',
    opacity: 0.6,
  },
  
  inputContainer: {
    marginHorizontal: 16,
    marginBottom: 0,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#6B7BE8',
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
    fontSize: 16,
    color: '#2D3748',
    borderWidth: 0,
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
    backgroundColor: '#6B7BE8',
  },
  
  sendButtonText: {
    fontSize: 15, 
    fontWeight: '600',
    color: '#718096',
  },
  
  sendButtonTextActive: {
    color: '#FFFFFF',
  },
});
