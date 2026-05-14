import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch, Image, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
// import { useGoogleAuth, fetchCalendarEvents, importEventsToNudgeMe } from '../services/googleCalendar';
import { fetchCalendarEvents, importEventsToNudgeMe } from '../services/googleCalendar'; // Keep for future use if needed, but functions are unused
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';
import { useFocusEffect } from '@react-navigation/native';
import { formatTime } from '../utils/dateFormatter';
import { capitalizeFirstLetter } from '../utils/textUtils';
import * as Notifications from 'expo-notifications';
import { cancelAllNotifications } from '../services/notifications';

const ProfileScreen = ({ navigation }) => {
  const [userData, setUserData] = useState({
    name: 'Parent',
    email: 'user@example.com',
    children: [],
  });
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [lightMode, setLightMode] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [children, setChildren] = useState([]);
  const [userName, setUserName] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Master loading state
  const [personalNotes, setPersonalNotes] = useState([]);
  const [notesSaving, setNotesSaving] = useState(false);
  const [selfCare, setSelfCare] = useState(null);
  const [selfCareList, setSelfCareList] = useState([]);
  
  // Google Calendar Integration - COMING SOON (Disabled for V1.0)
  const [importing, setImporting] = useState(false);
  // const { request, response, promptAsync } = useGoogleAuth();

  // useEffect(() => {
  //   if (response?.type === 'success') {
  //     const { authentication } = response;
  //     handleGoogleImport(authentication.accessToken);
  //   }
  // }, [response]);

  const handleGoogleImport = async (token) => {
    try {
      setImporting(true);
      const events = await fetchCalendarEvents(token);
      const result = await importEventsToNudgeMe(events);
      Alert.alert(
        'Import Complete',
        `Successfully imported ${result.count} events.${result.errors.length ? `\nFailed: ${result.errors.length}` : ''}`
      );
      loadFamilyData(); // Refresh reminders list
    } catch (error) {
      Alert.alert('Import Failed', error.message);
    } finally {
      setImporting(false);
    }
  };

  const getCategoryEmoji = (category) => {
    const emojiMap = {
      health: '💊',
      wellness: '🧘',
      exercise: '🏃',
      sleep: '😴',
      nutrition: '🥗',
      mindfulness: '🧠',
      hydration: '💧',
      default: '✨'
    };
    return emojiMap[category] || emojiMap.default;
  };

  const handleEditNote = (noteId) => {
    const note = personalNotes.find(n => n.id === noteId);
    navigation.navigate('EditSelfCare', { note });
  };

  const getCurrentUserId = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id || null;
      if (uid) return uid;
    } catch {}
    try {
      const storedUid = await AsyncStorage.getItem('user_id');
      if (storedUid) return storedUid;
    } catch {}
    const generated = 'guest-' + Date.now();
    try {
      await AsyncStorage.setItem('user_id', generated);
    } catch {}
    return generated;
  };

  const loadFamilyData = React.useCallback(async (isRefetch = false) => {
    if (__DEV__) console.log('🔄 loadFamilyData called', { isRefetch, currentChildrenCount: children.length });
    
    try {
      // Only show full loading state if it's not a refetch (i.e., initial load or explicit refresh)
      // AND we don't have data yet.
      if (!isRefetch) {
         setIsLoading(true);
      }
      
      setProfileLoading(true);
      setDataLoading(true);

      // Get authenticated user directly to ensure RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || await getCurrentUserId();

      if (__DEV__) console.log('Profile loading for userId:', userId);

      const { data: userDataRow, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(); // Changed to maybeSingle to handle 0 rows gracefully

      if (userErr) {
        console.error('Error loading user data:', userErr);
      }

      const fetchedName = userDataRow?.user_name || '';
      const fetchedEmail = userDataRow?.user_email || '';
      let localUserData = null;
      try {
        const storedData = await AsyncStorage.getItem('userData');
        localUserData = storedData ? JSON.parse(storedData) : null;
      } catch {}

      if (fetchedName) {
        setUserName(fetchedName);
        setProfileName(fetchedName);
      } else {
        const localName = String(localUserData?.name || '').trim();
        setUserName(localName);
        setProfileName(localName);
      }
      setProfileEmail(fetchedEmail || String(localUserData?.email || '').trim());

      const fetchedNotes = userDataRow?.personal_notes ?? null;
      let notesArray = [];

      if (fetchedNotes) {
        if (Array.isArray(fetchedNotes)) {
          notesArray = fetchedNotes;
        } else if (typeof fetchedNotes === 'string') {
           try {
             // Try to parse as JSON array
             const parsed = JSON.parse(fetchedNotes);
             if (Array.isArray(parsed)) {
               notesArray = parsed;
             }
           } catch (e) {
             // If parsing fails, it might be a legacy plain text note
             if (fetchedNotes.trim().length > 0) {
                notesArray = [{
                   id: 'legacy-' + Date.now(),
                   text: fetchedNotes,
                   category: 'other',
                   hasReminder: false,
                   createdAt: new Date().toISOString()
                }];
             }
           }
        }
      }

      // If we didn't find notes in Supabase (or failed to parse), check AsyncStorage
       if (notesArray.length === 0) {
           try {
              const cached = await AsyncStorage.getItem('personal_notes');
              if (cached) {
                 const parsed = JSON.parse(cached);
                 if (Array.isArray(parsed)) notesArray = parsed;
              }
              
              // If still empty, try to fetch from onboarding userData
              if (notesArray.length === 0) {
                  const userDataStr = await AsyncStorage.getItem('userData');
                  if (userDataStr) {
                      const userData = JSON.parse(userDataStr);
                      // Check if there are preferences from onboarding
                      if (userData.preferences && typeof userData.preferences === 'string' && userData.preferences.trim().length > 0) {
                          notesArray = [{
                              id: 'onboarding-pref',
                              text: userData.preferences,
                              category: 'wellness', // Default category
                              hasReminder: false,
                              createdAt: new Date().toISOString()
                          }];
                      }
                  }
              }
           } catch (e) {}
       }

      setPersonalNotes(notesArray);
      
      // Fetch personal self-care reminders
      let fetchedSelfCareCount = 0;
      try {
        const { data: selfRows, error: selfErr } = await supabase
          .from('reminders')
          .select('*')
          .eq('user_id', userId)
          .eq('reminder_type', 'personal')
          .order('created_at', { ascending: false });
        if (!selfErr && Array.isArray(selfRows) && selfRows.length > 0) {
          setSelfCareList(selfRows);
          setSelfCare(selfRows[0]);
          fetchedSelfCareCount = selfRows.length;
        } else {
          setSelfCareList([]);
          setSelfCare(null);
        }
      } catch (e) {
        setSelfCareList([]);
        setSelfCare(null);
      }
      
      // Update local storage to match valid data
      if (notesArray.length > 0) {
          AsyncStorage.setItem('personal_notes', JSON.stringify(notesArray));
      }

      let kids = [];
      const rawKids = userDataRow?.children_info ?? null;
      if (rawKids) {
        if (Array.isArray(rawKids)) {
          kids = rawKids;
        } else if (typeof rawKids === 'string') {
          try {
            const parsed = JSON.parse(rawKids);
            kids = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.error('Error parsing children_info:', e);
            kids = [];
          }
        }
      }

      if (!Array.isArray(kids) || kids.length === 0) {
        const { data: childRows, error: childErr } = await supabase
          .from('children')
          .select('*')
          .eq('user_id', userId)
          .order('id', { ascending: true });
        if (!childErr && Array.isArray(childRows) && childRows.length > 0) {
          const palette = ['#9B7EBD','#F4A261','#7FC8A9','#E07A5F','#81B7D2','#D4A5A5'];
          kids = childRows.map((c, idx) => ({
            name: c?.name || '',
            age: c?.age ?? '',
            school_start: c?.dropoff_time || null,
            school_end: c?.pickup_time || null,
            activities: Array.isArray(c?.activities) ? c.activities : [],
            color: palette[idx % palette.length],
          }));
        }
      }

      if ((!Array.isArray(kids) || kids.length === 0) && localUserData && Array.isArray(localUserData.children)) {
        kids = localUserData.children;
      }

      const finalKids = Array.isArray(kids) ? kids : [];
      setChildren(finalKids);
      console.log(`✅ Data received: ${finalKids.length} children, ${fetchedSelfCareCount} self-care routines`);

    } catch (e) {
      console.error('Error loading family data:', e);
      setChildren([]);
    } finally {
      setProfileLoading(false);
      setDataLoading(false);
      setIsLoading(false); // Master loading done
    }
  }, [children.length]);

  useEffect(() => {
    loadUserData();
    const checkOnboardingFromDB = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || await getCurrentUserId();
        
        const { data: userRow } = await supabase
          .from('users')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        // If a user row exists, they have completed onboarding (since row is created at end of onboarding)
        // Also check if they have children OR if they just have self-care (row exists is enough)
        setHasCompletedOnboarding(!!userRow);
      } catch {
        setHasCompletedOnboarding(false);
      }
    };
    checkOnboardingFromDB();
    loadFamilyData(false); // Initial load
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('👀 ProfileScreen focused');
      const hasData = children.length > 0;
      loadFamilyData(hasData); 
    }, [loadFamilyData, children.length])
  );

  const loadUserData = async () => {
    try {
      const storedData = await AsyncStorage.getItem('userData');
      if (storedData) {
        setUserData(JSON.parse(storedData));
      }
      // You can also fetch updated data from Supabase here if needed
    } catch (e) {
      console.error('Failed to load user data', e);
    }
  };

  const handleClearReminders = () => {
    Alert.alert(
      'Clear All Reminders',
      'Are you sure you want to delete ALL reminders? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Cancel all iOS notifications first
              await cancelAllNotifications();

              // 2. Delete from database
              const { error } = await supabase
                .from('reminders')
                .delete()
                .neq('id', 0); // Hack to delete all rows

              if (error) throw error;
              
              Alert.alert('Success', 'All reminders have been cleared.');
            } catch (err) {
              console.error('Error clearing reminders:', err);
              Alert.alert('Error', 'Failed to clear reminders.');
            }
          }
        }
      ]
    );
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This will permanently remove all your data and scheduled notifications. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              setProfileLoading(true);
              
              // 1. Cancel all notifications
              await cancelAllNotifications();
              
              const { data: { user } } = await supabase.auth.getUser();
              const userId = user?.id || await getCurrentUserId();

              if (userId) {
                // 2. Delete user data from tables
                await supabase.from('reminders').delete().eq('user_id', userId);
                await supabase.from('children').delete().eq('user_id', userId);
                await supabase.from('users').delete().eq('user_id', userId);
              }

              // 3. Sign out (This will trigger navigation)
              await supabase.auth.signOut();
              
              // 4. Clear local storage
              await AsyncStorage.clear();

              Alert.alert('Account Deleted', 'Your account and all data have been removed.');
            } catch (err) {
              console.error('Error deleting account:', err);
              Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
            } finally {
              setProfileLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
      Alert.alert('Log Out', 'Are you sure you want to log out?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: async () => {
              try {
                  // Cancel all notifications before logging out
                  await cancelAllNotifications();
                  
                  await supabase.auth.signOut();
                  // Navigation will be handled by the auth state listener in AppNavigator
              } catch (error) {
                  console.error('Error logging out:', error);
                  // Fallback if listener doesn't catch it
                  AsyncStorage.clear().then(() => {
                      navigation.reset({
                          index: 0,
                          routes: [{ name: 'Welcome' }],
                      });
                  });
              }
          }}
      ]);
  };

  const renderSectionHeader = (title) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const handleEditChild = (child, index) => {
    navigation.navigate('EditFamily', {
      children: children,
      selectedIndex: index
    });
  };

  const formatAge = (age) => {
    if (!age) return '';
    const num = parseFloat(age);
    if (isNaN(num)) return '';
    // Check if whole number
    if (num % 1 === 0) {
      return `${num} years old`;
    }
    return `${num} years old`;
  };

  const ChildCard = ({ child, index, onPress }) => {
    const palette = ['#9B7EBD','#F4A261','#7FC8A9','#E07A5F','#81B7D2','#D4A5A5'];
    const bg = child.color || palette[index % palette.length];
    const name = capitalizeFirstLetter((child?.name || '').trim());
    const initialMatch = name.match(/[A-Za-z0-9]/);
    const initial = initialMatch ? initialMatch[0].toUpperCase() : '?';

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.childCardMini}
      >
        <View style={[styles.childIconCircle, { backgroundColor: bg }]}>
          <Text style={styles.childIconLetter}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.childTitle}>
            {child?.name ? `${child.name}` : 'Child'}
            {child?.age ? `, ${formatAge(child.age)}` : ''}
          </Text>
        </View>
        <Text style={styles.childChevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderSettingItem = ({ icon, title, subtitle, onPress, toggleValue, onToggle, titleStyle }) => (
    <TouchableOpacity 
      style={styles.settingItem} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingIconContainer}>
        <Text style={styles.settingIcon}>{icon}</Text>
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, titleStyle]}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {onToggle !== undefined ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: "#767577", true: COLORS.softBlue }}
          thumbColor={COLORS.white}
          ios_backgroundColor="#3e3e3e"
        />
      ) : (
        onPress && <Text style={styles.chevron}>›</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[COLORS.softBlue, COLORS.lavender]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <SafeAreaView style={styles.headerContent}>
            <TouchableOpacity 
              onPress={() => navigation.navigate('Dashboard')} 
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
               <ChevronLeft size={24} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>👤</Text>
              </View>
              {profileLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                profileName ? <Text style={styles.profileNameText}>{`Hi, ${profileName}!`}</Text> : null
              )}
              <TouchableOpacity style={[styles.editProfileButton, profileName ? styles.editProfileButtonWithSpace : null]} onPress={() => navigation.navigate('EditProfile')}>
                  <Text style={styles.editProfileText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.spacing} />

        {isLoading ? (
            <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <ActivityIndicator size="large" color={COLORS.softBlue} />
                <Text style={{ marginTop: 16, color: COLORS.gray, ...FONTS.body }}>Loading profile...</Text>
            </View>
        ) : (
            <>
                {!hasCompletedOnboarding && (
                  <View style={styles.section}>
                    <View style={styles.card}>
                      <View style={{ padding: 16, alignItems: 'center' }}>
                        <Text style={{ ...FONTS.body, color: COLORS.text, textAlign: 'center' }}>Complete onboarding to personalize your profile</Text>
                        <TouchableOpacity style={styles.ctaButton} onPress={() => navigation.navigate('Onboarding')}>
                          <Text style={styles.ctaButtonText}>Start Onboarding</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}

                {/* Family Info */}
                <View style={styles.section}>
                      <View style={styles.sectionHeaderContainer}>
                        <Text style={styles.sectionEmoji}>👨‍👩‍👧‍👦</Text>
                        <Text style={styles.sectionTitle}>Family</Text>
                      </View>
                      <View style={styles.card}>
                        {children && children.length > 0 ? (
                          <View>
                            {children.map((child, idx) => (
                              <ChildCard
                                key={`${child?.name || 'child'}-${idx}`}
                                child={child}
                                index={idx}
                                onPress={() => handleEditChild(child, idx)}
                              />
                            ))}
                            <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
                              <TouchableOpacity
                                style={[styles.addButton, { marginTop: 0, minWidth: 200, alignItems: 'center' }]}
                                onPress={() => navigation.navigate('EditFamily', { children: children, selectedIndex: 0 })}
                              >
                                <Text style={styles.addButtonText}>Edit Family Info</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.emptyCard}
                            activeOpacity={0.9}
                            onPress={() => navigation.navigate('EditFamily', { children: children, selectedIndex: 0 })}
                          >
                            <Text style={styles.emptyEmoji}>👨‍👩‍👧‍👦</Text>
                            <Text style={styles.emptyTitle}>No children added yet</Text>
                            <Text style={styles.emptySubtitle}>Tap below to get started</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Personal Self-Care */}
                    <View style={styles.selfCareSection}>
                      <View style={styles.sectionHeaderContainer}>
                        <Text style={styles.sectionEmoji}>💝</Text>
                        <Text style={styles.sectionTitle}>Personal Self-Care</Text>
                      </View>
                      
                      {(() => {
                        const legacy = personalNotes || [];
                        const modern = selfCareList || [];
                        const allItems = [...legacy, ...modern];
                        const totalCount = allItems.length;

                        if (totalCount === 0) {
                          return (
                            <View style={styles.emptyState}>
                              <Text style={styles.emptyEmoji}>💭</Text>
                              <Text style={styles.emptyText}>No self-care routines yet</Text>
                              <TouchableOpacity
                                style={styles.addButton}
                                onPress={() => navigation.navigate('AddSelfCare')}
                              >
                                <Text style={styles.addButtonText}>Add Self-Care Routine</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        }

                        let weeklyCount = 0;
                        let dailyCount = 0;
                        
                        allItems.forEach(item => {
                            if (item.recurrence === 'weekly') {
                                weeklyCount++;
                            } else {
                                dailyCount++;
                            }
                        });

                        return (
                          <View style={styles.card}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.softBlue + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                    <Text style={{ fontSize: 20 }}>💊</Text>
                                </View>
                                <View>
                                    <Text style={{ ...FONTS.h3, color: COLORS.text }}>{totalCount} Active Routines</Text>
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                        {weeklyCount > 0 && <Text style={{ ...FONTS.small, color: COLORS.gray }}>• {weeklyCount} Weekly</Text>}
                                        {dailyCount > 0 && <Text style={{ ...FONTS.small, color: COLORS.gray }}>• {dailyCount} Daily</Text>}
                                    </View>
                                </View>
                            </View>
                            
                            <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
                              <TouchableOpacity 
                                style={[styles.addButton, { marginTop: 0, minWidth: 200, alignItems: 'center' }]} 
                                onPress={() => navigation.navigate('AddSelfCare')}
                              >
                                <Text style={styles.addButtonText}>View All Routines</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })()}
                    </View>

                {/* Integrations */}
                <View style={styles.section}>
                  {renderSectionHeader('Integrations')}
                  <View style={styles.card}>
                    {renderSettingItem({
                      icon: '📅',
                      title: 'Import Google Calendar',
                      subtitle: 'Sync next 7 days of events',
                      onPress: () => Alert.alert(
                        'Coming Soon',
                        'Google Calendar sync will be available in the next update!',
                        [{ text: 'OK' }]
                      )
                    })}
                     {importing && (
                        <View style={{ padding: 10, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={COLORS.softBlue} />
                            <Text style={{ fontSize: 12, color: COLORS.gray, marginTop: 4 }}>Importing events...</Text>
                        </View>
                     )}
                  </View>
                </View>

                {/* Preferences */}
                <View style={styles.section}>
                  {renderSectionHeader('Preferences')}
                  <View style={styles.card}>
                    {renderSettingItem({
                        icon: '🔔',
                        title: 'Notifications',
                        subtitle: 'Manage alerts',
                        onPress: () => navigation.navigate('NotificationSettings')
                    })}
                  </View>
                </View>

                {/* Account Actions */}
                <View style={styles.section}>
                  {renderSectionHeader('Account')}
                  <View style={styles.card}>
                    {renderSettingItem({
                      icon: '🗑️', // Updated icon if font supports it, otherwise keep fallback
                      title: 'Clear All Reminders',
                      titleStyle: { color: COLORS.error },
                      onPress: handleClearReminders
                    })}
                     <View style={styles.separator} />
                     {renderSettingItem({
                      icon: '🚪',
                      title: 'Sign Out',
                      onPress: handleLogout
                    })}
                    <View style={styles.separator} />
                    {renderSettingItem({
                      icon: '👤',
                      title: 'Delete Account',
                      titleStyle: { color: COLORS.error },
                      onPress: handleDeleteAccount
                    })}
                  </View>
                </View>

                {/* About */}
                <View style={styles.section}>
                  {renderSectionHeader('About')}
                  <View style={styles.card}>
                    {renderSettingItem({
                      icon: 'ℹ️',
                      title: 'Version',
                      subtitle: '1.0.0 (Beta)'
                    })}
                     <View style={styles.separator} />
                     {renderSettingItem({
                      icon: '🔒',
                      title: 'Privacy Policy',
                      onPress: () => navigation.navigate('PrivacyPolicy')
                    })}
                     <View style={styles.separator} />
                     {renderSettingItem({
                      icon: '📜',
                      title: 'Terms of Service',
                      onPress: () => navigation.navigate('TermsOfService')
                    })}
                     <View style={styles.separator} />
                     {renderSettingItem({
                      icon: '💬',
                      title: 'Give Feedback',
                      onPress: () => Alert.alert('Feedback', 'Send us your thoughts at info.nudgemeapp@gmail.com')
                    })}
                  </View>
                </View>

                <View style={{ height: 40 }} />
            </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  headerContainer: {
    zIndex: 1,
  },
  header: {
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...SHADOWS.soft,
    height: 280,
    justifyContent: 'center',
  },
  headerContent: {
    paddingHorizontal: SIZES.padding,
    alignItems: 'center',
    width: '100%',
  },
  backButton: {
      position: 'absolute',
      top: 80,
      left: 20,
      zIndex: 10,
      padding: 10,
      marginTop: 20,
  },
  backButtonText: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: 'bold',
  },
  profileInfo: {
    alignItems: 'center',
    marginTop: 70,
  },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...SHADOWS.soft,
  },
  avatarText: {
    fontSize: 44,
  },
  userName: {
    ...FONTS.heading,
    color: COLORS.white,
    fontSize: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  profileNameText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  editProfileButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  editProfileButtonWithSpace: {
    marginBottom: 16,
  },
  editProfileText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  spacing: {
    height: 20, // Spacing between header and first card
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    ...FONTS.heading,
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 12,
    marginLeft: 4,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  noteInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#F1F1F1',
    ...FONTS.body,
    color: COLORS.text,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingIcon: {
    fontSize: 20,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  settingSubtitle: {
    ...FONTS.small,
    color: '#999',
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#ccc',
    fontWeight: 'bold',
  },
  separator: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 68, // Align with text
  },
  ctaButton: {
    marginTop: 12,
    backgroundColor: COLORS.softBlue,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  ctaButtonText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 14,
  },
  familyInfo: {
      padding: 16,
      paddingBottom: 8,
      alignItems: 'center',
      marginTop: 8,
  },
  familyText: {
      ...FONTS.body,
      fontSize: 16,
      color: COLORS.text,
      textAlign: 'center',
      marginBottom: 8,
  },
  emptyStateText: {
      color: '#999',
      fontStyle: 'italic',
  },
  cardAction: {
      padding: 16,
      paddingTop: 8,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: '#F0F0F0',
      marginTop: 8,
  },
  cardActionText: {
      ...FONTS.body,
      color: COLORS.softBlue,
      fontWeight: '600',
      fontSize: 15,
  },
  childCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 16,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: '#F1F1F1',
  },
  childCardMini: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  childIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  childIconLetter: {
    ...FONTS.h3,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  childInfoContainer: {
    flex: 1,
  },
  childTitle: {
    ...FONTS.h3,
    color: COLORS.text,
    marginBottom: 8,
  },
  schoolTime: {
    ...FONTS.small,
    color: COLORS.gray,
    marginBottom: 4,
  },
  childDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  childDetailIcon: {
    fontSize: 14,
    marginRight: 6,
    width: 20,
    textAlign: 'center',
  },
  childDetailText: {
    ...FONTS.body,
    fontSize: 14,
    color: COLORS.gray,
  },
  childArrowContainer: {
    justifyContent: 'center',
    height: 44,
  },
  childChevron: {
    fontSize: 24,
    color: '#CCCCCC',
    fontWeight: '300',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F1F1',
    ...SHADOWS.small,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    ...FONTS.small,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  linkBelow: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  linkText: {
    ...FONTS.body,
    color: COLORS.softBlue,
    fontWeight: '600',
    fontSize: 15,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingLeft: 4,
  },
  sectionEmoji: {
    fontSize: 22,
    marginRight: 8,
  },
  sectionTitle: {
    ...FONTS.heading,
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
  },
  selfCareSection: {
    marginBottom: 24,
  },
  selfCareCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selfCareContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selfCareIcon: {
    fontSize: 20,
  },
  selfCareTextContainer: {
    flexDirection: 'column',
    gap: 2,
  },
  selfCareTitle: {
    ...FONTS.small,
    color: COLORS.gray,
  },
  selfCareText: {
    ...FONTS.body,
    fontSize: 16,
    color: COLORS.text,
  },
  selfCareTime: {
    ...FONTS.small,
    color: '#999',
  },
  // Note Cards
  noteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: '#F8F9FA',
  },
  noteLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  noteRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  noteEmoji: {
    fontSize: 20,
  },
  noteContent: {
    flex: 1,
  },
  noteText: {
    ...FONTS.body,
    color: COLORS.text,
    fontWeight: '500',
  },
  noteTime: {
    ...FONTS.small,
    color: COLORS.softBlue,
    marginTop: 2,
    fontWeight: '600',
  },
  reminderBadge: {
    marginRight: 12,
  },
  reminderIcon: {
    fontSize: 16,
  },
  editIcon: {
    padding: 8,
  },
  editIconText: {
    fontSize: 16,
    color: '#999',
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  addMoreText: {
    ...FONTS.body,
    color: COLORS.softBlue,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F1F1',
    borderStyle: 'dashed',
  },
  emptyText: {
    ...FONTS.body,
    fontSize: 16,
    color: '#999',
    marginVertical: 10,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 10,
    ...SHADOWS.soft,
  },
  addButtonText: {
    ...FONTS.body,
    color: COLORS.white,
    fontWeight: '600',
  }
});
export default ProfileScreen;
