import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Bell, Clock, Save, Check, Calendar, User } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import * as Notifications from 'expo-notifications';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NotificationSettingsScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [preferences, setPreferences] = useState({
    allEnabled: true,
    schoolMinutesBefore: 30,
    activityMinutesBefore: 60,
    personalAtExactTime: true,
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const getCurrentUserId = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) return data.user.id;
      return await AsyncStorage.getItem('user_id');
    } catch {
      return null;
    }
  };

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const userId = await getCurrentUserId();
      if (!userId) return;

      const { data, error } = await supabase
        .from('users')
        .select('notification_preferences')
        .eq('user_id', userId)
        .single();

      if (data?.notification_preferences) {
        setPreferences(prev => ({
          ...prev,
          ...data.notification_preferences
        }));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const userId = await getCurrentUserId();
      if (!userId) {
        Alert.alert('Error', 'User not found');
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: preferences })
        .eq('user_id', userId);

      if (error) throw error;

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const OptionButton = ({ label, selected, onPress }) => (
    <TouchableOpacity
      style={[
        styles.optionButton,
        selected && styles.optionButtonSelected
      ]}
      onPress={onPress}
    >
      <Clock size={16} color={selected ? COLORS.softBlue : COLORS.gray} style={{ marginRight: 6 }} />
      <Text style={[
        styles.optionText,
        selected && styles.optionTextSelected
      ]}>{label}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.softBlue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Gradient Header */}
      <LinearGradient
        colors={[COLORS.softBlue, COLORS.lavender]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top', 'left', 'right']}>
          <View style={styles.headerContent}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <ChevronLeft size={24} color={COLORS.softBlue} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Notification Settings</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.spacing} />

        {/* Master Toggle */}
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
                <Bell size={24} color={COLORS.softBlue} />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.rowTitle}>Enable Notifications</Text>
                <Text style={styles.rowSubtitle}>Turn on/off all app notifications</Text>
              </View>
            </View>
            <Switch
              value={preferences.allEnabled}
              onValueChange={(val) => setPreferences(prev => ({ ...prev, allEnabled: val }))}
              trackColor={{ false: '#E0E0E0', true: COLORS.softBlue }}
              thumbColor={COLORS.white}
              ios_backgroundColor="#E0E0E0"
            />
          </View>
        </View>

        {preferences.allEnabled && (
          <>
            <Text style={styles.sectionHeaderTitle}>Reminder Preferences</Text>

            {/* School Reminders */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: '#FFF3E0' }]}>
                  <Text style={{ fontSize: 20 }}>🎒</Text>
                </View>
                <View>
                  <Text style={styles.cardTitle}>School Reminders</Text>
                  <Text style={styles.cardSubtitle}>Alert before school events</Text>
                </View>
              </View>
              <View style={styles.optionsGrid}>
                {[15, 30, 45, 60].map(mins => (
                  <OptionButton
                    key={mins}
                    label={`${mins}m`}
                    selected={preferences.schoolMinutesBefore === mins}
                    onPress={() => setPreferences(prev => ({ ...prev, schoolMinutesBefore: mins }))}
                  />
                ))}
              </View>
            </View>

            {/* Activities Reminders */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
                  <Text style={{ fontSize: 20 }}>⚽</Text>
                </View>
                <View>
                  <Text style={styles.cardTitle}>Activities</Text>
                  <Text style={styles.cardSubtitle}>Alert before activities</Text>
                </View>
              </View>
              <View style={styles.optionsGrid}>
                {[30, 60, 90, 120].map(mins => (
                  <OptionButton
                    key={mins}
                    label={`${mins}m`}
                    selected={preferences.activityMinutesBefore === mins}
                    onPress={() => setPreferences(prev => ({ ...prev, activityMinutesBefore: mins }))}
                  />
                ))}
              </View>
            </View>

            {/* Personal Reminders */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: '#F3E5F5' }]}>
                  <Text style={{ fontSize: 20 }}>💭</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Personal Reminders</Text>
                  <Text style={styles.cardSubtitle}>Self-care & personal tasks</Text>
                </View>
              </View>
              
              <View style={styles.separator} />
              
              {/* Quick Reminders Section */}
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.sectionHeaderTitle}>Quick Reminders</Text>
                <Text style={styles.rowSubtitle}>Pills, water, supplements, quick tasks</Text>
                <View style={[styles.row, { marginTop: 10 }]}>
                  <View style={styles.optionButton}>
                    <Clock size={16} color={COLORS.gray} style={{ marginRight: 6 }} />
                    <Text style={styles.optionText}>At exact time (default)</Text>
                  </View>
                </View>
              </View>

              <View style={styles.separator} />

              {/* Self-Care Activities Section */}
              <View>
                <Text style={styles.sectionHeaderTitle}>Self-Care Activities</Text>
                <Text style={[styles.rowSubtitle, { marginBottom: 12 }]}>Yoga, gym, meditation, classes</Text>
                <View style={styles.optionsGrid}>
                  {[0, 15, 30, 45, 60].map(mins => (
                    <OptionButton
                      key={mins}
                      label={mins === 0 ? 'Exact time' : `${mins}m`}
                      selected={(preferences.personalActivityOffset ?? 30) === mins}
                      onPress={() => setPreferences(prev => ({ ...prev, personalActivityOffset: mins }))}
                    />
                  ))}
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer / Save Button */}
      <View style={styles.footer}>
        {showSuccess && (
          <View style={styles.successToast}>
            <Check size={16} color={COLORS.white} />
            <Text style={styles.successText}>Settings Saved!</Text>
          </View>
        )}
        <TouchableOpacity 
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
  },
  header: {
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...SHADOWS.soft,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: COLORS.white,
    ...SHADOWS.soft,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  spacing: {
    height: 20,
  },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    ...SHADOWS.soft,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  rowSubtitle: {
    fontSize: 14,
    color: COLORS.gray || '#888',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...SHADOWS.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.gray || '#888',
  },
  separator: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 12,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionButtonSelected: {
    backgroundColor: '#F0F7FF', // Light blue tint
    borderColor: COLORS.softBlue,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.gray || '#888',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: COLORS.softBlue,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 13,
    color: COLORS.gray || '#888',
    marginTop: 12,
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 34,
    backgroundColor: COLORS.cream,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  saveButton: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  successToast: {
    position: 'absolute',
    top: -50,
    alignSelf: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.soft,
  },
  successText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default NotificationSettingsScreen;
