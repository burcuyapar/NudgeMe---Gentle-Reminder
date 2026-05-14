import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

import WelcomeScreen from '../screens/WelcomeScreen';
import SignUpScreen from '../screens/SignUpScreen';
import SignInScreen from '../screens/SignInScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import { VoiceAssistantScreen } from '../screens/VoiceAssistantScreen';
import AddReminderScreen from '../screens/AddReminderScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import EditFamilyScreen from '../screens/EditFamilyScreen';
import EditChildScreen from '../screens/EditChildScreen';
import AllRemindersScreen from '../screens/AllRemindersScreen';
import SmartReminderSetupScreen from '../screens/SmartReminderSetupScreen';
import AddPersonalReminderScreen from '../screens/AddPersonalReminderScreen';
import AddSelfCareScreen from '../screens/AddSelfCareScreen';
import EditSelfCareScreen from '../screens/EditSelfCareScreen';
import EditBasicInfoScreen from '../screens/EditBasicInfoScreen';
import EditSchoolScreen from '../screens/EditSchoolScreen';
import EditActivitiesScreen from '../screens/EditActivitiesScreen';
import EditRoutinesScreen from '../screens/EditRoutinesScreen';
import EditSpecialNotesScreen from '../screens/EditSpecialNotesScreen';
import TestingChecklistScreen from '../screens/TestingChecklistScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from '../screens/TermsOfServiceScreen';
import { COLORS, FONTS } from '../constants/theme';
import { navigationRef, navigate } from './navigationRef';

const Stack = createNativeStackNavigator();
const AUTH_SESSION_KEY = 'nudgeme_auth_session';
let isCheckingAuth = false;

const AppNavigator = () => {
  const [initialRoute, setInitialRoute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuthAndOnboarding = async () => {
    if (isCheckingAuth) return;
    isCheckingAuth = true;
    try {
      setIsLoading(true);
      console.log('🔄 Checking auth status...');
      
      // Session restoration moved to useEffect

      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;

      console.log(`👤 Auth complete: ${userId ? 'Authenticated' : 'Not Authenticated'}`);

      if (!userId) {
        isCheckingAuth = false;
        setInitialRoute('Welcome');
        setIsLoading(false);
        return;
      }

      console.log('📋 Checking onboarding status...');
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
        console.warn('⚠️ Error fetching user data, defaulting to Onboarding:', error);
        // If we can't verify onboarding, assume it's incomplete or let Onboarding screen handle it
        isCheckingAuth = false;
        setInitialRoute('Onboarding');
        setIsLoading(false);
        return;
      }

      if (userRow?.onboarding_completed === true) {
        console.log('✅ User has completed onboarding - navigating to Dashboard');
        isCheckingAuth = false;
        setInitialRoute('Dashboard');
      } else {
        if (__DEV__) {
          console.log('⚠️ User has NOT completed onboarding - navigating to Onboarding');
          console.log('⚠️ Reason: onboarding_completed =', userRow?.onboarding_completed);
        }
        isCheckingAuth = false;
        setInitialRoute('Onboarding');
      }
      setIsLoading(false);
    } catch (err) {
      console.error('❌ Auth check failed:', err);
      isCheckingAuth = false;
      setInitialRoute('Welcome');
    } finally {
      isCheckingAuth = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let authSubscription;
    let isMounted = true;

    const initialize = async () => {
      // 1. Read AsyncStorage for saved session tokens
      try {
        const savedSession = await AsyncStorage.getItem(AUTH_SESSION_KEY);
        if (savedSession) {
          const { access_token, refresh_token } = JSON.parse(savedSession);
          if (access_token && refresh_token) {
            // 2. If tokens exist, call await supabase.auth.setSession
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
              console.log('❌ Failed to restore session:', error);
              await AsyncStorage.removeItem(AUTH_SESSION_KEY);
            } else {
              console.log('✅ Session restored from storage');
            }
          }
        }
      } catch (e) {
        console.warn('Error reading session from storage:', e);
      }

      if (!isMounted) return;

      // 3. ONLY AFTER that completes, set up the onAuthStateChange listener
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`🔔 Auth event: ${event}`);
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          if (session) {
            await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }));
            
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
               await checkAuthAndOnboarding();
            }
          } else {
             // Handle case where event is INITIAL_SESSION but no session exists (e.g. first run)
             if (event === 'INITIAL_SESSION') {
                 setInitialRoute('Welcome');
                 setIsLoading(false);
             }
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('👤 User signed out - clearing storage and navigating to Auth screen');
          await AsyncStorage.removeItem(AUTH_SESSION_KEY);
          setInitialRoute('Welcome');
          setIsLoading(false);
          // Force navigation if the navigator is already mounted
          if (navigationRef.current) {
             navigationRef.current.reset({
                index: 0,
                routes: [{ name: 'Welcome' }],
            });
          }
        }
      });
      
      authSubscription = data.subscription;
    };

    initialize();

    return () => {
      isMounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  if (isLoading || !initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.cream }}>
        <Text style={{ fontSize: 40, marginBottom: 20 }}>🔔</Text>
        <Text style={{ fontSize: 32, fontWeight: 'bold', color: COLORS.darkGray, marginBottom: 20 }}>NudgeMe</Text>
        <ActivityIndicator size="large" color={COLORS.softBlue} />
        <Text style={{ marginTop: 16, color: COLORS.gray, fontSize: 16 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.cream },
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="VoiceAssistant" component={VoiceAssistantScreen} />
        <Stack.Screen name="AddReminder" component={AddReminderScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="EditFamily" component={EditFamilyScreen} />
        <Stack.Screen name="EditChildScreen" component={EditChildScreen} />
        <Stack.Screen name="AllReminders" component={AllRemindersScreen} />
        <Stack.Screen name="SmartReminderSetup" component={SmartReminderSetupScreen} />
        <Stack.Screen name="AddPersonalReminder" component={AddPersonalReminderScreen} />
        <Stack.Screen name="AddSelfCare" component={AddSelfCareScreen} />
        <Stack.Screen name="EditSelfCare" component={EditSelfCareScreen} />
        <Stack.Screen name="EditBasicInfo" component={EditBasicInfoScreen} />
        <Stack.Screen name="EditSchool" component={EditSchoolScreen} />
        <Stack.Screen name="EditActivities" component={EditActivitiesScreen} />
        <Stack.Screen name="EditRoutines" component={EditRoutinesScreen} />
        <Stack.Screen name="EditSpecialNotes" component={EditSpecialNotesScreen} />
        <Stack.Screen name="TestingChecklist" component={TestingChecklistScreen} />
        <Stack.Screen 
          name="NotificationSettings" 
          component={NotificationSettingsScreen} 
          options={{ title: 'Notification Settings' }}
        />
        <Stack.Screen 
          name="PrivacyPolicy" 
          component={PrivacyPolicyScreen} 
          options={{ title: 'Privacy Policy' }} 
        />
        <Stack.Screen 
          name="TermsOfService" 
          component={TermsOfServiceScreen} 
          options={{ title: 'Terms of Service' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
