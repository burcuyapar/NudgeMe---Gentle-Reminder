import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

const WaveBar = ({ delay, color }) => {
  const heightAnim = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(heightAnim, {
          toValue: 24,
          duration: 400,
          useNativeDriver: false,
        }),
        Animated.timing(heightAnim, {
          toValue: 4,
          duration: 400,
          useNativeDriver: false,
        }),
      ])
    ).start();

    return () => heightAnim.stopAnimation();
  }, []);

  return (
    <Animated.View
      style={[
        styles.bar,
        { height: heightAnim, backgroundColor: color }
      ]}
    />
  );
};

export default function WaveformAnimation({ isActive, color = COLORS.softBlue }) {
  if (!isActive) return null;

  const bars = [0, 100, 200, 50, 150, 250, 100, 0];

  return (
    <View style={styles.container}>
      {bars.map((delay, index) => (
        <WaveBar key={index} delay={delay} color={color} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
    marginTop: 16,
    gap: 4,
  },
  bar: {
    width: 3,
    minHeight: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
});
