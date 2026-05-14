import { CONFIG } from '../constants/config';
import * as FileSystem from 'expo-file-system/legacy';

const TIMEOUT_DURATION = 60000; // 60 seconds

const fetchWithTimeout = async (resource, options = {}) => {
  const { timeout = TIMEOUT_DURATION } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Network request timed out');
    }
    throw error;
  }
};

export async function transcribeAudio(audioUri, retryCount = 0) {
  try {
    console.log('🎤 Starting Whisper transcription for:', audioUri);

    // Log file info
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (fileInfo.exists) {
        console.log(`📁 File size: ${(fileInfo.size / 1024).toFixed(2)} KB`);
    }

    // Create form data for multipart upload
    const formData = new FormData();
    
    // Add audio file - React Native format
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    });
    
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    // Call OpenAI Whisper API with timeout
    const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
        // Don't set Content-Type - FormData sets it automatically with boundary
      },
      body: formData,
      timeout: TIMEOUT_DURATION
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Whisper API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Transcription successful:', data.text);
    
    return data.text;

  } catch (error) {
    console.error(`❌ Transcription error (Attempt ${retryCount + 1}):`, error);
    
    // Retry logic (retry once)
    if (retryCount < 1 && (error.message.includes('timed out') || error.message.includes('Network request'))) {
        console.log('🔄 Retrying transcription...');
        return transcribeAudio(audioUri, retryCount + 1);
    }

    if (error.message.includes('timed out')) {
        throw new Error('Transcription took too long. Please check your internet connection and try again.');
    }
    
    throw error;
  }
}
