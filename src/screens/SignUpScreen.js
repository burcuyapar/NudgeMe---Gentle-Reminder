import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { COLORS, FONTS, SIZES, SHADOWS } from '../constants/theme';
import { supabase, signInWithGoogle, signInWithApple, handleAuthCallback } from '../services/supabase';

const SignUpScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const checkOnboardingAndNavigate = async (userId) => {
    try {
      console.log('🔍 DEBUG: Checking onboarding status...');
      console.log('🔍 DEBUG: Current user ID:', userId);

      const { data: userRow, error } = await supabase
        .from('users')
        .select('onboarding_completed, user_id, email')
        .eq('user_id', userId)
        .single();

      console.log('🔍 DEBUG: Query result - data:', userRow);
      console.log('🔍 DEBUG: Query result - error:', error);
      console.log('🔍 DEBUG: onboarding_completed value:', userRow?.onboarding_completed);
      console.log('🔍 DEBUG: onboarding_completed type:', typeof userRow?.onboarding_completed);

      if (error) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Onboarding' }],
        });
        return;
      }

      if (userRow?.onboarding_completed === true) {
        console.log('✅ User has completed onboarding - navigating to Dashboard');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Dashboard' }],
        });
      } else {
        console.log('⚠️ User has NOT completed onboarding - navigating to Onboarding');
        console.log('⚠️ Reason: onboarding_completed =', userRow?.onboarding_completed);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Onboarding' }],
        });
      }
    } catch {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Onboarding' }],
      });
    }
  };

  useEffect(() => {
    const handleUrl = async ({ url }) => {
      await handleAuthCallback(url);
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => { if (url) handleAuthCallback(url); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await checkOnboardingAndNavigate(session.user.id);
      }
    });

    return () => {
      sub.remove();
      subscription.unsubscribe();
    };
  }, []);

  const handleOAuthSignIn = async (provider) => {
    setLoading(true);
    const { error } = provider === 'google' 
      ? await signInWithGoogle()
      : await signInWithApple();
    
    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (error) throw error;

      if (!data.session) {
         // User created but needs email verification
         Alert.alert('Success', 'Please check your email to verify your account.', [
             { text: 'OK', onPress: () => navigation.navigate('SignIn') }
         ]);
         setLoading(false);
      }
      // If data.session exists, onAuthStateChange listener will handle navigation
    } catch (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerContainer}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join NudgeMe today</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.gray}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor={COLORS.gray}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Create a password"
                placeholderTextColor={COLORS.gray}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity 
              style={styles.button}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialContainer}>
              <TouchableOpacity 
                style={styles.socialButton}
                onPress={() => Alert.alert('Coming Soon', 'Sign in with Google will be available soon!', [{ text: 'OK' }])}
              >
                <Text style={styles.socialIcon}>G</Text>
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.socialButton}
                onPress={() => Alert.alert('Coming Soon', 'Sign in with Apple will be available soon!', [{ text: 'OK' }])}
              >
                <Text style={styles.socialIcon}></Text>
                <Text style={styles.socialButtonText}>Apple</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
                <Text style={styles.link}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SIZES.padding,
  },
  backButton: {
    marginBottom: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 30,
    color: COLORS.text,
  },
  headerContainer: {
    marginBottom: 40,
  },
  title: {
    ...FONTS.heading,
    fontSize: 32,
    color: COLORS.text,
    marginBottom: 10,
  },
  subtitle: {
    ...FONTS.body,
    fontSize: 18,
    color: COLORS.gray,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    fontSize: 16,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 20,
    ...SHADOWS.soft,
  },
  buttonText: {
    ...FONTS.heading,
    color: COLORS.white,
    fontSize: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
  },
  footerText: {
    ...FONTS.body,
    color: COLORS.gray,
  },
  link: {
    ...FONTS.body,
    color: COLORS.softBlue,
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#888',
    fontSize: 14,
  },
  socialContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: COLORS.white,
  },
  socialIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  socialButtonText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
});

export default SignUpScreen;
