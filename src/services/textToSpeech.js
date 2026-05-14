import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { CONFIG } from '../constants/config';

let currentSound = null;
let isSpeaking = false;
let speechQueue = [];

// ✅ Queue system to prevent simultaneous speech
export async function speakAsNudge(text, onFinish) {
  // Add to queue
  speechQueue.push({ text, onFinish });
  
  // If already speaking, just add to queue and return
  if (isSpeaking) {
    console.log('⏳ Already speaking, queued:', text.substring(0, 40));
    return;
  }
  
  // Process queue
  await processQueue();
}

async function processQueue() {
  // If queue is empty, we're done
  if (speechQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  
  // Mark as speaking
  isSpeaking = true;
  
  // Get next item from queue
  const { text, onFinish } = speechQueue.shift();
  
  try {
    console.log('🔊 TTS Speaking:', text.substring(0, 50));
    
    // Set audio mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      volume: 1.0,
    });
    
    // Stop any current sound
    if (currentSound) {
      try {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
      } catch (e) {
        console.log('Could not stop previous sound');
      }
      currentSound = null;
    }
    
    // Call OpenAI TTS
    const apiStart = Date.now();
    let response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        voice: 'nova',
        input: text,
        speed: 1.0,
        response_format: 'mp3',
      }),
    });
    console.log(`⏱️ TTS API took: ${Date.now() - apiStart}ms`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('🔄 TTS 404, retrying with tts-1');
        response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: 'nova',
            input: text,
            speed: 1.0,
            response_format: 'mp3',
          }),
        });
      }
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`TTS API error: ${response.status} ${errText}`);
      }
    }
    
    // Get audio data
    const arrayBuffer = await response.arrayBuffer();
    
    // Convert to base64
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    
    // Save to file
    const fileUri = `${FileSystem.documentDirectory}speech_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(fileUri, base64Audio, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // Play audio
    const { sound } = await Audio.Sound.createAsync(
      { uri: fileUri },
      {
        shouldPlay: true,
        volume: 1.0,
        isMuted: false,
      }
    );
    
    currentSound = sound;
    await sound.setVolumeAsync(1.0);
    
    console.log('✅ Audio playing');
    
    // Wait for playback to complete
    await new Promise((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          console.log('✅ Audio finished');
          sound.unloadAsync();
          currentSound = null;
          if (onFinish) onFinish();
          resolve();
        }
        if (status.error) {
          console.error('❌ Playback error:', status.error);
          sound.unloadAsync();
          currentSound = null;
          if (onFinish) onFinish();
          resolve();
        }
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error('❌ TTS Error:', error);
    if (onFinish) onFinish();
  } finally {
    // ✅ CRITICAL: Mark as not speaking and process next in queue
    isSpeaking = false;
    
    // Process next item in queue if any
    if (speechQueue.length > 0) {
      await processQueue();
    }
  }
}

// Stop all speech
export async function stopSpeaking() {
  speechQueue = [];
  isSpeaking = false;
  
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch (e) {
      console.log('Could not stop sound');
    }
    currentSound = null;
  }
}

// Initialize audio
export async function initializeAudio() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      volume: 1.0,
    });
    console.log('✅ Audio mode initialized');
  } catch (error) {
    console.error('❌ Audio init error:', error);
  }
}
