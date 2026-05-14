import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';

const EditProfileScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

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
    return null;
  };

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const storedData = await AsyncStorage.getItem('userData');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setName(parsedData.name || '');
        setEmail(parsedData.email || '');
      }
      const userId = await getCurrentUserId();
      if (userId) {
        let data = null;
         let error = null;
         try {
           const res = await supabase
             .from('users')
             .select('user_name, user_email')
             .eq('user_id', userId)
             .limit(1);
           data = res.data && res.data.length > 0 ? res.data[0] : null;
           error = res.error || null;
         } catch {}

         if (error && error.code === '42703') {
           try {
             const res2 = await supabase
               .from('users')
               .select('user_name')
               .eq('user_id', userId)
               .limit(1);
             data = res2.data && res2.data.length > 0 ? res2.data[0] : null;
             error = res2.error || null;
           } catch {}
         }

         if (!error && data) {
           if (data.user_name != null) setName(data.user_name || '');
           if (data.user_email != null) setEmail(data.user_email || '');
         }
      }
    } catch (e) {
      console.error('Failed to load user data', e);
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      const userId = await getCurrentUserId();
      
      // Update local storage
      try {
        const stored = await AsyncStorage.getItem('userData');
        const parsed = stored ? JSON.parse(stored) : {};
        const next = { ...parsed, name, email };
        await AsyncStorage.setItem('userData', JSON.stringify(next));
      } catch {}

      // Update Supabase
      let upsertError = null;
      try {
        // Manual upsert
        const { data: existing, error: checkError } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', userId)
          .limit(1);

        if (checkError && checkError.code !== 'PGRST116') throw checkError;

        const updateData = { user_name: name, user_email: email };
        const updateDataFallback = { user_name: name }; // no email

        if (existing && existing.length > 0) {
           const { error: updErr } = await supabase.from('users').update(updateData).eq('user_id', userId);
           if (updErr && updErr.code === '42703') {
             await supabase.from('users').update(updateDataFallback).eq('user_id', userId);
           } else if (updErr) throw updErr;
        } else {
           const { error: insErr } = await supabase.from('users').insert([{ user_id: userId, ...updateData }]);
           if (insErr && insErr.code === '42703') {
             await supabase.from('users').insert([{ user_id: userId, ...updateDataFallback }]);
           } else if (insErr) throw insErr;
        }
      } catch (err) {
        upsertError = err;
      }

      if (upsertError && upsertError.code !== 'PGRST205' && upsertError.code !== '404') {
         throw upsertError;
      }

      Alert.alert('Success', 'Profile updated');
      navigation.goBack();
    } catch (e) {
      console.error('Failed to save profile', e);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity style={styles.editButton} onPress={() => setIsEditMode(prev => !prev)}>
          <Text style={styles.editButtonText}>{isEditMode ? 'Cancel' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {!isEditMode ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionIcon}>📝</Text>
              <Text style={styles.sectionHeaderTitle}>Profile Information</Text>
            </View>
            <View style={styles.sectionDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{name || 'Not set'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{email || 'Not set'}</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                autoCapitalize="words"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity 
              style={[styles.saveButton, isLoading && styles.disabledButton]} 
              onPress={handleSave}
              disabled={isLoading}
            >
              <Text style={styles.saveButtonText}>
                {isLoading ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingVertical: 15,
  },
  backButton: {
    padding: 10,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.text,
  },
  editButton: { padding: 8 },
  editButtonText: { ...FONTS.body, color: COLORS.softBlue, fontWeight: '600' },
  content: {
    padding: SIZES.padding,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  sectionHeaderTitle: {
    ...FONTS.h3,
    color: '#333',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#EEE',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    ...FONTS.body,
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  infoValue: {
    ...FONTS.body,
    color: '#333',
    fontSize: 16,
    flexShrink: 1,
    textAlign: 'right',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    ...FONTS.body,
    color: COLORS.text,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: COLORS.text,
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    padding: 16,
    marginTop: 32,
    marginHorizontal: 20,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default EditProfileScreen;
