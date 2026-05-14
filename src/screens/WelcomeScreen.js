import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES, SHADOWS } from '../constants/theme';

const WelcomeScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Bell Icon Container */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔔</Text>
        </View>

        {/* App Name & Tagline */}
        <Text style={styles.appName}>NudgeMe</Text>
        <Text style={styles.tagline}>
          Let your mind rest.{'\n'}NudgeMe remembers.
        </Text>

        {/* Action Buttons */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('SignUp')}
        >
          <Text style={styles.buttonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate('SignIn')}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.padding,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    ...SHADOWS.soft,
  },
  icon: {
    fontSize: 40,
  },
  appName: {
    ...FONTS.appName,
    color: COLORS.softBlue,
    marginBottom: 10,
    textAlign: 'center',
  },
  tagline: {
    ...FONTS.body,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 60,
    lineHeight: 24,
  },
  button: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    ...SHADOWS.soft,
    width: '80%',
    marginBottom: 20,
  },
  buttonText: {
    ...FONTS.heading,
    color: COLORS.white,
    textAlign: 'center',
    fontSize: 18,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.softBlue,
    elevation: 0,
    shadowOpacity: 0,
    marginBottom: 0,
  },
  secondaryButtonText: {
    color: COLORS.softBlue,
  },
});

export default WelcomeScreen;
