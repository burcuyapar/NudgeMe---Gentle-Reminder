import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text, Animated, StyleSheet } from 'react-native';
import { Radio } from 'lucide-react-native';
import { COLORS } from '../constants/theme';

export default function AnimatedMicButton({ 
  isRecording, 
  isProcessing, 
  isSpeaking, 
  onPress, 
  onPressIn, 
  onPressOut, 
  size = 80, 
}) { 
  const pulseAnim = useRef(new Animated.Value(1)).current; 
  const rotateAnim = useRef(new Animated.Value(0)).current; 

  // Pulsing animation when recording 
  useEffect(() => { 
    if (isRecording) { 
      Animated.loop( 
        Animated.sequence([ 
          Animated.timing(pulseAnim, { 
            toValue: 1.15, 
            duration: 800, 
            useNativeDriver: true, 
          }), 
          Animated.timing(pulseAnim, { 
            toValue: 1, 
            duration: 800, 
            useNativeDriver: true, 
          }), 
        ]) 
      ).start(); 
    } else { 
      pulseAnim.setValue(1); 
    } 
  }, [isRecording]); 

  // Rotating animation when processing 
  useEffect(() => { 
    if (isProcessing) { 
      Animated.loop( 
        Animated.timing(rotateAnim, { 
          toValue: 1, 
          duration: 2000, 
          useNativeDriver: true, 
        }) 
      ).start(); 
    } else { 
      rotateAnim.setValue(0); 
    } 
  }, [isProcessing]); 

  const rotation = rotateAnim.interpolate({ 
    inputRange: [0, 1], 
    outputRange: ['0deg', '360deg'], 
  }); 

  const getButtonStyle = () => { 
    if (isRecording) return styles.recording; 
    if (isProcessing) return styles.processing; 
    if (isSpeaking) return styles.speaking; 
    return styles.idle; 
  }; 

  const getStatusText = () => { 
    if (isRecording) return 'Release to send...'; 
    if (isProcessing) return 'Processing...'; 
    if (isSpeaking) return 'Playing response...'; 
    return 'Press and hold 🎤 to speak'; 
  }; 

  return ( 
    <View style={styles.container}> 
      {/* Outer glow ring when recording */} 
      {isRecording && ( 
        <Animated.View 
          style={[ 
            styles.glowRing, 
            { width: size + 20, height: size + 20, borderRadius: (size + 20) / 2, transform: [{ scale: pulseAnim }] } 
          ]} 
        /> 
      )} 

      {/* Main mic button */} 
      <Animated.View 
        style={[ 
          { transform: [{ scale: pulseAnim }, { rotate: rotation }] } 
        ]} 
      > 
        <TouchableOpacity 
          style={[styles.micButton, { width: size, height: size, borderRadius: size / 2 }, getButtonStyle()]} 
          onPress={onPress} 
          onPressIn={onPressIn} 
          onPressOut={onPressOut} 
          disabled={isProcessing || isSpeaking} 
          activeOpacity={0.8} 
        > 
          <Radio 
            size={size * 0.5} 
            color="#fff" 
            strokeWidth={2.5} 
          /> 
        </TouchableOpacity> 
      </Animated.View> 

      {/* Status text */} 
      <Text style={[ 
        styles.statusText, 
        isRecording && styles.statusTextRecording 
      ]}> 
        {getStatusText()} 
      </Text> 

      {isRecording && ( 
        <Text style={styles.hintText}> 
          Recording... 
        </Text> 
      )} 
    </View> 
  ); 
} 

const styles = StyleSheet.create({ 
  container: { 
    alignItems: 'center', 
    paddingVertical: 20, 
  }, 
  micButton: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    justifyContent: 'center', 
    alignItems: 'center', 
    elevation: 8, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 4.65, 
  }, 
  idle: { 
    backgroundColor: COLORS.softBlue, // Using COLORS.softBlue instead of COLORS.primary to match existing theme
  }, 
  recording: { 
    backgroundColor: '#FF6B6B', // Warm red 
    elevation: 12, 
    shadowOpacity: 0.4, 
  }, 
  processing: { 
    backgroundColor: '#C4B5E0', // Lavender 
  }, 
  speaking: { 
    backgroundColor: '#FFD9C7', // Peach 
  }, 
  glowRing: { 
    position: 'absolute', 
    width: 100, 
    height: 100, 
    borderRadius: 50, 
    backgroundColor: '#FF6B6B', 
    opacity: 0.2, 
  }, 
  statusText: { 
    fontSize: 16, 
    color: '#666', 
    marginTop: 16, 
    fontWeight: '600', 
  }, 
  statusTextRecording: { 
    color: '#FF6B6B', 
  }, 
  hintText: { 
    fontSize: 12, 
    color: '#999', 
    marginTop: 8, 
    fontStyle: 'italic', 
  }, 
}); 
