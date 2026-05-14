import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { cancelSingleNotification } from '../services/notifications';
import { COLORS, FONTS, SHADOWS, SIZES } from '../constants/theme';

const CATEGORIES = [
  { id: 'health', emoji: '💊', label: 'Health' },
  { id: 'wellness', emoji: '🧘', label: 'Wellness' },
  { id: 'exercise', emoji: '🏃', label: 'Exercise' },
  { id: 'sleep', emoji: '😴', label: 'Sleep' },
  { id: 'nutrition', emoji: '🥗', label: 'Nutrition' },
  { id: 'mindfulness', emoji: '🧠', label: 'Mindfulness' },
  { id: 'hydration', emoji: '💧', label: 'Hydration' },
  { id: 'other', emoji: '✨', label: 'Other' },
];

const EditSelfCareScreen = ({ navigation, route }) => {
  const { note } = route.params || {};
  
  const [text, setText] = useState(note?.text || '');
  const [category, setCategory] = useState(note?.category || 'other');
  const [hasReminder, setHasReminder] = useState(note?.hasReminder || false);
  const [time, setTime] = useState(note?.time || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) {
      Alert.alert('Missing Info', 'Please enter a routine or note.');
      return;
    }

    if (hasReminder && !time.trim()) {
      Alert.alert('Missing Time', 'Please set a time for your reminder.');
      return;
    }

    try {
      setLoading(true);
      
      // Fetch existing notes
      let currentNotes = [];
      try {
        const stored = await AsyncStorage.getItem('personal_notes');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            currentNotes = parsed;
          }
        }
      } catch (e) {
        console.log('Error reading notes', e);
      }

      // Update the specific note
      const updatedNotes = currentNotes.map(n => {
        if (n.id === note.id) {
          return {
            ...n,
            text: text.trim(),
            category,
            hasReminder,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      });

      // If for some reason note wasn't found (shouldn't happen), maybe add it? 
      // But usually we just update.
      
      const jsonString = JSON.stringify(updatedNotes);

      // Save to AsyncStorage
      await AsyncStorage.setItem('personal_notes', jsonString);

      // Save to Supabase
      const userId = await AsyncStorage.getItem('user_id');
      if (userId) {
         try {
             await supabase
                 .from('users')
                 .update({ personal_notes: jsonString })
                 .eq('user_id', userId);
         } catch (supaError) {
             console.log('Supabase error:', supaError);
         }
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to update note.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Routine',
      'Are you sure you want to remove this routine?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              // Fetch existing notes
              let currentNotes = [];
              const stored = await AsyncStorage.getItem('personal_notes');
              if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                  currentNotes = parsed;
                }
              }

              // Filter out the note
              const updatedNotes = currentNotes.filter(n => n.id !== note.id);

              // Cancel notification if it exists
              if (note.notification_id) {
                const ids = String(note.notification_id).split(',').map(s => s.trim()).filter(Boolean);
                for (const id of ids) {
                  await cancelSingleNotification(id);
                }
              }

              const jsonString = JSON.stringify(updatedNotes);

              await AsyncStorage.setItem('personal_notes', jsonString);

              const userId = await AsyncStorage.getItem('user_id');
              if (userId) {
                await supabase
                    .from('users')
                    .update({ personal_notes: jsonString })
                    .eq('user_id', userId);
              }
              
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.softBlue, COLORS.lavender]}
        style={styles.header}
      >
        <SafeAreaView style={styles.headerContent}>
          <View style={styles.headerRow}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()} 
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeft size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Self-Care</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Routine / Note</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="e.g., Drink water, 10 min meditation..."
            placeholderTextColor="#999"
            multiline
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryContainer}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  category === cat.id && styles.categoryChipSelected
                ]}
                onPress={() => setCategory(cat.id)}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[
                  styles.categoryLabel,
                  category === cat.id && styles.categoryLabelSelected
                ]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Reminder?</Text>
            <Switch
              value={hasReminder}
              onValueChange={setHasReminder}
              trackColor={{ false: "#767577", true: COLORS.softBlue }}
              thumbColor={COLORS.white}
            />
          </View>

          {hasReminder && (
            <View style={styles.timeContainer}>
              <Text style={styles.label}>Time</Text>
              <TextInput
                style={styles.inputTime}
                value={time}
                onChangeText={setTime}
                placeholder="e.g. 9:00 AM"
                placeholderTextColor="#999"
              />
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete Routine</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSave}
          disabled={loading}
        >
           {loading ? (
             <Text style={styles.saveButtonText}>Saving...</Text>
          ) : (
             <Text style={styles.saveButtonText}>Save Changes</Text>
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
  header: {
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...SHADOWS.soft,
  },
  headerContent: {
    paddingHorizontal: SIZES.padding,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.white,
  },
  content: {
    flex: 1,
    padding: SIZES.padding,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.medium,
    marginBottom: 20,
  },
  label: {
    ...FONTS.h4,
    color: COLORS.text,
    marginBottom: 10,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 15,
    padding: 15,
    ...FONTS.body,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipSelected: {
    backgroundColor: COLORS.softBlue,
    borderColor: COLORS.softBlue,
    shadowColor: COLORS.softBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryLabel: {
    ...FONTS.small,
    color: COLORS.text,
  },
  categoryLabelSelected: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  deleteButton: {
    alignSelf: 'center',
    padding: 10,
    marginBottom: 20,
  },
  deleteButtonText: {
    ...FONTS.body,
    color: COLORS.error,
    textDecorationLine: 'underline',
  },
  footer: {
    padding: SIZES.padding,
    paddingBottom: 40,
  },
  saveButton: {
    backgroundColor: COLORS.softBlue,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  saveButtonText: {
    ...FONTS.h3,
    color: COLORS.white,
  },
});

export default EditSelfCareScreen;
