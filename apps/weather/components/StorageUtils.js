import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  SAVED_LOCATIONS: '@WeatherApp:saved_locations',
  SELECTED_PERSONALITY: '@WeatherApp:selected_personality',
  LAST_SELECTED_LOCATION: '@WeatherApp:last_selected_location'
};

/**
 * Storage utility functions for persisting app data
 */
export const StorageUtils = {
  /**
   * Save locations to persistent storage
   * @param {Array} locations - Array of location objects to save
   */
  async saveLocations(locations) {
    try {
      const jsonValue = JSON.stringify(locations);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, jsonValue);
      console.log('Locations saved to storage:', locations.length);
    } catch (error) {
      console.error('Error saving locations:', error);
    }
  },

  /**
   * Load locations from persistent storage
   * @returns {Promise<Array>} Array of saved location objects
   */
  async loadLocations() {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_LOCATIONS);
      const locations = jsonValue != null ? JSON.parse(jsonValue) : [];
      console.log('Locations loaded from storage:', locations.length);
      return locations;
    } catch (error) {
      console.error('Error loading locations:', error);
      return [];
    }
  },

  /**
   * Save selected personality to persistent storage
   * @param {string} personality - Personality mode identifier
   */
  async savePersonality(personality) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_PERSONALITY, personality);
      console.log('Personality saved to storage:', personality);
    } catch (error) {
      console.error('Error saving personality:', error);
    }
  },

  /**
   * Load selected personality from persistent storage
   * @returns {Promise<string>} Saved personality mode, defaults to 'default'
   */
  async loadPersonality() {
    try {
      const personality = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_PERSONALITY);
      const result = personality != null ? personality : 'default';
      console.log('Personality loaded from storage:', result);
      return result;
    } catch (error) {
      console.error('Error loading personality:', error);
      return 'default';
    }
  },

  /**
   * Save last selected location to persistent storage
   * @param {Object} location - Location object to save
   */
  async saveLastSelectedLocation(location) {
    try {
      const jsonValue = JSON.stringify(location);
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SELECTED_LOCATION, jsonValue);
      console.log('Last selected location saved to storage:', location.name);
    } catch (error) {
      console.error('Error saving last selected location:', error);
    }
  },

  /**
   * Load last selected location from persistent storage
   * @returns {Promise<Object|null>} Last selected location object or null
   */
  async loadLastSelectedLocation() {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SELECTED_LOCATION);
      const location = jsonValue != null ? JSON.parse(jsonValue) : null;
      console.log('Last selected location loaded from storage:', location?.name || 'none');
      return location;
    } catch (error) {
      console.error('Error loading last selected location:', error);
      return null;
    }
  },

  /**
   * Clear all stored data (useful for development/testing)
   */
  async clearAllData() {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.SAVED_LOCATIONS,
        STORAGE_KEYS.SELECTED_PERSONALITY,
        STORAGE_KEYS.LAST_SELECTED_LOCATION
      ]);
      console.log('All storage data cleared');
    } catch (error) {
      console.error('Error clearing storage data:', error);
    }
  },

  /**
   * Get storage info for debugging
   * @returns {Promise<Object>} Object containing current storage state
   */
  async getStorageInfo() {
    try {
      const [locations, personality, lastLocation] = await Promise.all([
        this.loadLocations(),
        this.loadPersonality(),
        this.loadLastSelectedLocation()
      ]);

      return {
        savedLocations: locations,
        selectedPersonality: personality,
        lastSelectedLocation: lastLocation,
        totalLocations: locations.length
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        savedLocations: [],
        selectedPersonality: 'default',
        lastSelectedLocation: null,
        totalLocations: 0
      };
    }
  }
};

export default StorageUtils;
