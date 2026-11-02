import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  Alert, 
  TextInput, 
  Modal,
  FlatList,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import axios from 'axios';
import * as Location from 'expo-location';
import { WEATHER_API_KEY, OPENAI_API_KEY } from '@env';
import mockWeatherData from '../mockWeatherData';
import { createPromptWithPersonality, setMode } from './integrate_personality';
import { useLocationSearch } from './useLocationSearch';
import LocationSearchForm from './LocationSearchForm';
import { StorageUtils } from './StorageUtils';

/**
 * Modal component for app settings including personality selection and location management
 * @param {boolean} visible - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {string} selectedPersonality - Currently selected AI personality mode
 * @param {Function} onPersonalityChange - Callback when personality is changed
 * @param {Function} onSelectLocation - Callback when a location is selected
 * @param {Array} locations - Array of saved locations
 * @param {Function} onDeleteLocation - Callback to delete a location
 * @param {boolean} gettingCurrentLocation - Whether current location is being fetched
 */
const MenuModal = ({ visible, onClose, selectedPersonality, onPersonalityChange, onSelectLocation, locations, onDeleteLocation, gettingCurrentLocation }) => {
  // Use shared location search hook with onClose callback to close modal after adding location
  const locationSearch = useLocationSearch(onSelectLocation, onClose);

  const personalityOptions = [
    { label: 'Default', value: 'default', emoji: '😊' },
    { label: 'Snarky', value: 'snarky', emoji: '😏' },
    { label: 'Merica', value: 'merica', emoji: '🇺🇸' },
    { label: 'Marvin', value: 'marvin', emoji: '🤖' },
    { label: 'Silly', value: 'silly', emoji: '🤪' },
    { label: 'Dad Joke', value: 'dad_joke', emoji: '👨' },
    { label: 'Gen Z', value: 'gen_z', emoji: '✨' },
    { label: 'Gandalf', value: 'gandalf', emoji: '🧙‍♂️' },
    { label: 'Wise Guy', value: 'wise_guy', emoji: '🕴️' }
  ];

  const handlePersonalitySelect = (personality) => {
    onPersonalityChange(personality);
  };

  const renderLocationItem = ({ item }) => (
    <View style={styles.locationItem}>
      <TouchableOpacity 
        style={styles.locationItemContent}
        onPress={() => {
          onSelectLocation(item);
        }}
      >
        <Text style={styles.locationItemName}>{item.name}</Text>
        <Text style={styles.locationItemType}>
          {item.type === 'current' ? '📍 Current Location' : `📮 ${item.zipcode}`}
        </Text>
      </TouchableOpacity>
      {item.type === 'zipcode' && (
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => onDeleteLocation(item.id)}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Settings</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.menuContent} showsVerticalScrollIndicator={false}>
          {/* Location Section */}
          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Locations</Text>
            
            <LocationSearchForm
              locationInput={locationSearch.locationInput}
              adding={locationSearch.adding}
              searchResults={locationSearch.searchResults}
              searching={locationSearch.searching}
              handleLocationInputChange={locationSearch.handleLocationInputChange}
              selectSearchResult={locationSearch.selectSearchResult}
              addLocationManually={locationSearch.addLocationManually}
              showTitle={true}
              styles={{
                addLocationSection: styles.addLocationSection,
                sectionLabel: styles.sectionLabel,
                inputContainer: styles.inputContainer,
                locationInput: styles.locationInput,
                addButton: styles.addButton,
                addButtonDisabled: styles.addButtonDisabled,
                addButtonText: styles.addButtonText,
                searchResultsContainer: styles.searchResultsContainer,
                searchingIndicator: styles.searchingIndicator,
                searchingText: styles.searchingText,
                searchResultItem: styles.searchResultItem,
                searchResultContent: styles.searchResultContent,
                searchResultName: styles.searchResultName,
                searchResultDetails: styles.searchResultDetails,
              }}
            />

            <Text style={styles.sectionLabel}>Saved Locations</Text>
            {locations.map((item) => (
              <View key={item.id} style={styles.locationItem}>
                <TouchableOpacity 
                  style={[styles.locationItemContent, gettingCurrentLocation && item.type === 'current' && styles.locationItemDisabled]}
                  onPress={() => {
                    onSelectLocation(item);
                    onClose();
                  }}
                  disabled={gettingCurrentLocation && item.type === 'current'}
                >
                  <View style={styles.locationItemInfo}>
                    <Text style={styles.locationItemName}>{item.name}</Text>
                    <Text style={styles.locationItemType}>
                      {item.type === 'current' ? '📍 Current Location' : `📮 ${item.zipcode}`}
                    </Text>
                  </View>
                  {gettingCurrentLocation && item.type === 'current' && (
                    <ActivityIndicator size="small" color="#007AFF" style={styles.locationLoadingIndicator} />
                  )}
                </TouchableOpacity>
                {item.type === 'zipcode' && (
                  <TouchableOpacity 
                    style={styles.deleteButton}
                    onPress={() => onDeleteLocation(item.id)}
                  >
                    <Text style={styles.deleteButtonText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Personality Section */}
          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>AI Personality</Text>
            <Text style={styles.settingsDescription}>
              Select how you'd like your weather summaries to be presented
            </Text>

            {personalityOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.personalityOption,
                  selectedPersonality === option.value && styles.personalityOptionSelected
                ]}
                onPress={() => handlePersonalitySelect(option.value)}
              >
                <View style={styles.personalityOptionContent}>
                  <Text style={styles.personalityEmoji}>{option.emoji}</Text>
                  <Text style={[
                    styles.personalityLabel,
                    selectedPersonality === option.value && styles.personalityLabelSelected
                  ]}>
                    {option.label}
                  </Text>
                </View>
                {selectedPersonality === option.value && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

/**
 * Modal component for selecting and managing location preferences
 * @param {boolean} visible - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {Function} onSelectLocation - Callback when a location is selected
 * @param {Array} locations - Array of available locations
 * @param {Function} onDeleteLocation - Callback to delete a location by ID
 */
const LocationModal = ({ visible, onClose, onSelectLocation, locations, onDeleteLocation }) => {
  // Use shared location search hook with onClose callback
  const locationSearch = useLocationSearch(onSelectLocation, onClose);

  const renderLocationItem = ({ item }) => (
    <View style={styles.locationItem}>
      <TouchableOpacity 
        style={styles.locationItemContent}
        onPress={() => {
          onSelectLocation(item);
          onClose();
        }}
      >
        <Text style={styles.locationItemName}>{item.name}</Text>
        <Text style={styles.locationItemType}>
          {item.type === 'current' ? '📍 Current Location' : `📮 ${item.zipcode}`}
        </Text>
      </TouchableOpacity>
      {item.type === 'zipcode' && (
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => onDeleteLocation(item.id)}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Choose Location</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Done</Text>
          </TouchableOpacity>
        </View>

        <LocationSearchForm
          locationInput={locationSearch.locationInput}
          adding={locationSearch.adding}
          searchResults={locationSearch.searchResults}
          searching={locationSearch.searching}
          handleLocationInputChange={locationSearch.handleLocationInputChange}
          selectSearchResult={locationSearch.selectSearchResult}
          addLocationManually={locationSearch.addLocationManually}
          showTitle={true}
          styles={{
            addLocationSection: styles.addLocationSection,
            sectionLabel: styles.sectionLabel,
            inputContainer: styles.inputContainer,
            locationInput: styles.locationInput,
            addButton: styles.addButton,
            addButtonDisabled: styles.addButtonDisabled,
            addButtonText: styles.addButtonText,
            searchResultsContainer: styles.searchResultsContainer,
            searchingIndicator: styles.searchingIndicator,
            searchingText: styles.searchingText,
            searchResultItem: styles.searchResultItem,
            searchResultContent: styles.searchResultContent,
            searchResultName: styles.searchResultName,
            searchResultDetails: styles.searchResultDetails,
          }}
        />

        <Text style={styles.sectionLabel}>Saved Locations</Text>
        <FlatList
          data={locations}
          renderItem={renderLocationItem}
          keyExtractor={item => item.id}
          style={styles.locationsList}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Modal>
  );
};

/**
 * Modal component for selecting weather metrics to display in the timeline
 * @param {boolean} visible - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {Function} onSelectMetric - Callback when a metric is selected
 * @param {string} selectedMetric - Currently selected metric ID
 * @param {Array} availableMetrics - Array of available weather metrics
 */
const MetricSelector = ({ visible, onClose, onSelectMetric, selectedMetric, availableMetrics }) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Choose Metric</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.menuContent} showsVerticalScrollIndicator={false}>
          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Available Metrics</Text>
            <Text style={styles.settingsDescription}>
              Select which weather metric to display in the timeline
            </Text>

            {availableMetrics.map((metric) => (
              <TouchableOpacity
                key={metric.id}
                style={[
                  styles.personalityOption,
                  selectedMetric === metric.id && styles.personalityOptionSelected
                ]}
                onPress={() => {
                  onSelectMetric(metric.id);
                  onClose();
                }}
              >
                <View style={styles.personalityOptionContent}>
                  <Text style={styles.personalityEmoji}>{metric.emoji}</Text>
                  <View>
                    <Text style={[
                      styles.personalityLabel,
                      selectedMetric === metric.id && styles.personalityLabelSelected
                    ]}>
                      {metric.label}
                    </Text>
                    <Text style={[
                      styles.settingsDescription,
                      { marginBottom: 0, fontSize: 12 },
                      selectedMetric === metric.id && { color: 'rgba(255,255,255,0.8)' }
                    ]}>
                      {metric.unit ? `Measured in ${metric.unit}` : 'No unit'}
                    </Text>
                  </View>
                </View>
                {selectedMetric === metric.id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const Weather = () => {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [savedLocations, setSavedLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [gettingCurrentLocation, setGettingCurrentLocation] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('now');
  const [aiSummaries, setAiSummaries] = useState({});
  const [summaryLoading, setSummaryLoading] = useState({});
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [selectedPersonality, setSelectedPersonality] = useState('merica');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('temperature');
  const [metricSelectorVisible, setMetricSelectorVisible] = useState(false);
  const [personalityTransitioning, setPersonalityTransitioning] = useState(false);
  const [storageInitialized, setStorageInitialized] = useState(false);

  // Ref to store stable hourly data that won't be affected by AI summary state changes
  const stableHourlyData = useRef(null);

  // Note: API keys are now loaded from .env file for security

  // Available metrics for the timeline
  const availableMetrics = [
    {
      id: 'temperature',
      label: 'Temperature',
      unit: '°F',
      emoji: '🌡️',
      color: '#007AFF',
      getHourlyValue: (hour) => Math.round(hour.temperature),
      getDailyValue: (day) => Math.round(day.temperatureHigh),
      getDailyLowValue: (day) => Math.round(day.temperatureLow),
      getIntensity: (value) => Math.min(Math.max((value - 32) / 68, 0), 1),
      getBarColor: (intensity) => {
        if (intensity < 0.3) return '#4A90E2';
        if (intensity < 0.6) return '#7ED321';
        if (intensity < 0.8) return '#F5A623';
        return '#D0021B';
      }
    },
    {
      id: 'feelsLike',
      label: 'Feels Like',
      unit: '°F',
      emoji: '🤔',
      color: '#FF6B6B',
      getHourlyValue: (hour) => Math.round(hour.apparentTemperature),
      getDailyValue: (day) => Math.round(day.apparentTemperatureHigh),
      getDailyLowValue: (day) => Math.round(day.apparentTemperatureLow),
      getIntensity: (value) => Math.min(Math.max((value - 32) / 68, 0), 1),
      getBarColor: (intensity) => {
        if (intensity < 0.3) return '#4A90E2';
        if (intensity < 0.6) return '#7ED321';
        if (intensity < 0.8) return '#F5A623';
        return '#D0021B';
      }
    },
    {
      id: 'humidity',
      label: 'Humidity',
      unit: '%',
      emoji: '💧',
      color: '#4ECDC4',
      getHourlyValue: (hour) => Math.round(hour.humidity * 100),
      getDailyValue: (day) => Math.round(day.humidity * 100),
      getDailyLowValue: () => null,
      getIntensity: (value) => value / 100,
      getBarColor: (intensity) => {
        if (intensity < 0.3) return '#FFF3B8';
        if (intensity < 0.6) return '#4ECDC4';
        if (intensity < 0.8) return '#45B7B8';
        return '#006BA6';
      }
    },
    {
      id: 'rainProbability',
      label: 'Rain Chance',
      unit: '%',
      emoji: '🌧️',
      color: '#74B9FF',
      getHourlyValue: (hour) => Math.round((hour.precipProbability || 0) * 100),
      getDailyValue: (day) => Math.round((day.precipProbability || 0) * 100),
      getDailyLowValue: () => null,
      getIntensity: (value) => value / 100,
      getBarColor: (intensity) => {
        if (intensity < 0.25) return '#DDD6FE';
        if (intensity < 0.5) return '#A5B4FC';
        if (intensity < 0.75) return '#6366F1';
        return '#4338CA';
      }
    },
    {
      id: 'wind',
      label: 'Wind Speed',
      unit: 'mph',
      emoji: '💨',
      color: '#A8E6CF',
      getHourlyValue: (hour) => Math.round(hour.windSpeed || 0),
      getDailyValue: (day) => Math.round(day.windSpeed || 0),
      getDailyLowValue: () => null,
      getIntensity: (value) => Math.min(value / 30, 1), // Normalize to 30mph max
      getBarColor: (intensity) => {
        if (intensity < 0.25) return '#E8F5E8';
        if (intensity < 0.5) return '#A8E6CF';
        if (intensity < 0.75) return '#88D8A3';
        return '#4CAF50';
      }
    },
    {
      id: 'uvIndex',
      label: 'UV Index',
      unit: '',
      emoji: '☀️',
      color: '#FFD93D',
      getHourlyValue: (hour) => Math.round(hour.uvIndex || 0),
      getDailyValue: (day) => Math.round(day.uvIndex || 0),
      getDailyLowValue: () => null,
      getIntensity: (value) => Math.min(value / 11, 1), // UV index goes 0-11+
      getBarColor: (intensity) => {
        if (intensity < 0.3) return '#4CAF50';
        if (intensity < 0.6) return '#FFC107';
        if (intensity < 0.8) return '#FF9800';
        return '#F44336';
      }
    },
    {
      id: 'visibility',
      label: 'Visibility',
      unit: 'mi',
      emoji: '👁️',
      color: '#9B59B6',
      getHourlyValue: (hour) => Math.round(hour.visibility || 10),
      getDailyValue: (day) => Math.round(day.visibility || 10),
      getDailyLowValue: () => null,
      getIntensity: (value) => Math.min(value / 10, 1), // Normalize to 10 miles
      getBarColor: (intensity) => {
        if (intensity < 0.25) return '#E74C3C';
        if (intensity < 0.5) return '#F39C12';
        if (intensity < 0.75) return '#F1C40F';
        return '#2ECC71';
      }
    }
  ];

  /**
   * Determines available weather metrics based on current conditions (adds snow in winter)
   * @param {Object} weatherData - Current weather data object
   * @returns {Array} Array of available weather metrics with seasonal adjustments
   */
  const getAvailableMetricsForConditions = (weatherData) => {
    const currentMonth = new Date().getMonth() + 1;
    const isWinter = currentMonth === 12 || currentMonth <= 2;
    const currentTemp = weatherData?.currently?.temperature || 50;
    const hasSnow = isWinter || currentTemp < 35;

    let metrics = [...availableMetrics];

    if (hasSnow) {
      metrics.push({
        id: 'snow',
        label: 'Snow',
        unit: 'in',
        emoji: '❄️',
        color: '#E8F4FD',
        getHourlyValue: (hour) => parseFloat((hour.precipAccumulation || 0).toFixed(1)),
        getDailyValue: (day) => parseFloat((day.precipAccumulation || 0).toFixed(1)),
        getDailyLowValue: () => null,
        getIntensity: (value) => Math.min(value / 6, 1), // Normalize to 6 inches
        getBarColor: (intensity) => {
          if (intensity < 0.25) return '#F8FAFC';
          if (intensity < 0.5) return '#E2E8F0';
          if (intensity < 0.75) return '#CBD5E1';
          return '#64748B';
        }
      });
    }

    return metrics;
  };

  /**
   * Gets the currently selected weather metric configuration
   * @returns {Object} The metric configuration object with display and calculation functions
   */
  const getCurrentMetric = () => {
    // Provide fallback for when weatherData might be temporarily undefined during re-renders
    const metrics = weatherData ? getAvailableMetricsForConditions(weatherData) : availableMetrics;
    const foundMetric = metrics.find(m => m.id === selectedMetric);
    
    // Always return a valid metric - fallback to first available metric or temperature
    return foundMetric || metrics[0] || availableMetrics[0];
  };

  /**
   * Generates an AI-powered weather summary using OpenAI API with personality
   * @param {string} timeframe - Time period for the summary (now, today, tomorrow, week, weekend)
   * @param {Object} weatherInfo - Processed weather data object
   * @param {string} locationName - Name of the location for context
   */
  const generateAISummary = React.useCallback(async (timeframe, weatherInfo, locationName) => {
    try {
      // Use functional state updates to avoid dependency issues
      setSummaryLoading(prev => ({ ...prev, [timeframe]: true }));
      
      let prompt = '';
      
      if (timeframe === 'now') {
        const current = weatherInfo.current;
        const currentHour = new Date().getHours();
        const currentMonth = new Date().getMonth() + 1;
        
        let season = 'spring';
        if (currentMonth >= 6 && currentMonth <= 8) season = 'summer';
        else if (currentMonth >= 9 && currentMonth <= 11) season = 'fall';
        else if (currentMonth === 12 || currentMonth <= 2) season = 'winter';
        
        let timeOfDay = 'morning';
        if (currentHour >= 12 && currentHour < 17) timeOfDay = 'afternoon';
        else if (currentHour >= 17 && currentHour < 20) timeOfDay = 'evening';
        else if (currentHour >= 20 || currentHour < 6) timeOfDay = 'night';
        
        prompt = `Write a brief 1-2 sentence weather summary for RIGHT NOW in ${locationName}:
        
Temperature: ${Math.round(current.temperature)}°F (feels like ${Math.round(current.apparentTemperature)}°F)
Conditions: ${current.summary}
Humidity: ${Math.round(current.humidity * 100)}%
Wind: ${Math.round(current.windSpeed)} mph
Time: ${timeOfDay} in ${season}

Be conversational and focus on how it feels to be outside right now. Keep it under 30 words.`;
        
      } else if (timeframe === 'today') {
        const today = weatherInfo.today;
        prompt = `Write a brief 1-2 sentence summary for TODAY's weather in ${locationName}:
        
High: ${Math.round(today.temperatureHigh)}°F, Low: ${Math.round(today.temperatureLow)}°F
Conditions: ${today.summary}

Focus on what to expect throughout the day. Keep it under 30 words.`;
        
      } else if (timeframe === 'tomorrow') {
        const tomorrow = weatherInfo.tomorrow;
        prompt = `Write a brief 1-2 sentence summary for TOMORROW's weather in ${locationName}:
        
High: ${Math.round(tomorrow.temperatureHigh)}°F, Low: ${Math.round(tomorrow.temperatureLow)}°F
Conditions: ${tomorrow.summary}

Focus on planning for tomorrow. Keep it under 30 words.`;
        
      } else if (timeframe === 'week') {
        prompt = `Write a brief 1-2 sentence summary for THIS WEEK's weather in ${locationName}:
        
${weatherInfo.weekSummary}

Focus on the overall weekly trend. Keep it under 30 words.`;
        
      } else if (timeframe === 'weekend') {
        const saturday = weatherInfo.saturday;
        const sunday = weatherInfo.sunday;
        prompt = `Write a brief 1-2 sentence summary for THIS WEEKEND in ${locationName}:
        
Saturday: ${saturday.summary}, High: ${Math.round(saturday.temperatureHigh)}°F
Sunday: ${sunday.summary}, High: ${Math.round(sunday.temperatureHigh)}°F

Focus on weekend plans. Keep it under 30 words.`;
      }

      const messagesWithPersonality = createPromptWithPersonality(prompt, selectedPersonality);

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4.1-nano',
          messages: messagesWithPersonality,
          max_tokens: 100,
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const summary = response.data.choices[0].message.content.trim();
      
      // Update state directly to avoid timing issues
      setAiSummaries(prev => ({ ...prev, [timeframe]: summary }));
      setSummaryLoading(prev => ({ ...prev, [timeframe]: false }));
      
    } catch (error) {
      console.error(`Error generating AI summary for ${timeframe}:`, error);
      
      // Fallback summaries
      let fallback = '';
      if (timeframe === 'now') {
        const current = weatherInfo.current;
        fallback = `${Math.round(current.temperature)}°F with ${Math.round(current.humidity * 100)}% humidity. ${current.windSpeed > 10 ? 'Breezy' : 'Calm'} conditions.`;
      } else if (timeframe === 'today') {
        fallback = `High of ${Math.round(weatherInfo.today.temperatureHigh)}°F, low of ${Math.round(weatherInfo.today.temperatureLow)}°F today.`;
      } else if (timeframe === 'tomorrow') {
        fallback = `Tomorrow: ${Math.round(weatherInfo.tomorrow.temperatureHigh)}°F high, ${Math.round(weatherInfo.tomorrow.temperatureLow)}°F low.`;
      } else {
        fallback = 'Weather information available.';
      }
      
      // Update state directly to avoid timing issues
      setAiSummaries(prev => ({ ...prev, [timeframe]: fallback }));
      setSummaryLoading(prev => ({ ...prev, [timeframe]: false }));
    }
  }, [selectedPersonality]);

  /**
   * Gets the user's current location using device GPS with error handling and Android optimizations
   * @returns {Promise<Object|null>} Location object with coordinates and name, or null if failed
   */
  const getCurrentLocation = async () => {
    setGettingCurrentLocation(true);
    
    try {
      console.log('Starting location request...');
      
      // Check if location services are enabled
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      console.log('Location services enabled:', isLocationEnabled);
      
      if (!isLocationEnabled) {
        Alert.alert(
          'Location Services Disabled',
          'Please enable location services in your device settings to use current location.',
          [{ text: 'OK' }]
        );
        setGettingCurrentLocation(false);
        return null;
      }

      // Request permissions
      console.log('Requesting location permissions...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to use current location. Please check your app permissions in device settings.',
          [{ text: 'OK' }]
        );
        setGettingCurrentLocation(false);
        return null;
      }

      // Get current position with Android-friendly settings
      console.log('Getting current position...');
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // More Android-friendly than Low
        timeout: 20000, // Increased timeout for Android
        maximumAge: 60000, // Shorter max age for fresher location
      });

      console.log('Location received:', location.coords);

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // Reverse geocode to get location name
      try {
        console.log('Reverse geocoding...');
        const [address] = await Location.reverseGeocodeAsync(coords);
        console.log('Address:', address);
        
        const locationName = address.city && address.region 
          ? `${address.city}, ${address.region}`
          : 'Current Location';
        
        const currentLoc = {
          id: 'current',
          type: 'current',
          name: locationName,
          latitude: coords.latitude,
          longitude: coords.longitude
        };

        console.log('Final location object:', currentLoc);
        setCurrentLocation(currentLoc);
        setGettingCurrentLocation(false);
        return currentLoc;
        
      } catch (reverseError) {
        console.log('Could not get location name, using coordinates');
        const currentLoc = {
          id: 'current',
          type: 'current',
          name: 'Current Location',
          latitude: coords.latitude,
          longitude: coords.longitude
        };

        setCurrentLocation(currentLoc);
        setGettingCurrentLocation(false);
        return currentLoc;
      }

    } catch (err) {
      console.error('Error getting current location:', err);
      
      // More specific error messages for Android
      let errorMessage = 'Could not get your current location. ';
      
      if (err.code === 'E_LOCATION_TIMEOUT') {
        errorMessage += 'Location request timed out. Please try again or make sure you have a clear view of the sky.';
      } else if (err.code === 'E_LOCATION_UNAVAILABLE') {
        errorMessage += 'Location services are unavailable. Please check your device settings.';
      } else if (err.code === 'E_LOCATION_SETTINGS_UNSATISFIED') {
        errorMessage += 'Please enable high accuracy location in your device settings.';
      } else {
        errorMessage += 'Please try again or use a zipcode.';
      }
      
      Alert.alert('Location Error', errorMessage, [{ text: 'OK' }]);
      setGettingCurrentLocation(false);
      return null;
    }
  };

  const handleSelectLocation = async (location) => {
    if (location.type === 'current') {
      // Always get fresh current location when user explicitly selects it
      const current = await getCurrentLocation();
      if (current) {
        setSelectedLocation(current);
        // Save last selected location to storage
        await StorageUtils.saveLastSelectedLocation(current);
      }
    } else {
      setSelectedLocation(location);
      
      // Save last selected location to storage
      await StorageUtils.saveLastSelectedLocation(location);
      
      if (location.type === 'zipcode' && !savedLocations.find(loc => loc.id === location.id)) {
        const newSavedLocations = [...savedLocations, location];
        setSavedLocations(newSavedLocations);
        // Save updated locations list to storage
        await StorageUtils.saveLocations(newSavedLocations);
      }
    }
  };

  const handleDeleteLocation = (locationId) => {
    Alert.alert(
      'Delete Location',
      'Are you sure you want to remove this location?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            const newSavedLocations = savedLocations.filter(loc => loc.id !== locationId);
            setSavedLocations(newSavedLocations);
            
            // Save updated locations list to storage
            await StorageUtils.saveLocations(newSavedLocations);
            
            if (selectedLocation && selectedLocation.id === locationId) {
              setSelectedLocation(null);
              setWeatherData(null);
              // Clear last selected location from storage
              await StorageUtils.saveLastSelectedLocation(null);
            }
          }
        }
      ]
    );
  };

  const getAllLocations = () => {
    const locations = [];
    
    locations.push({
      id: 'current',
      type: 'current',
      name: currentLocation ? currentLocation.name : 'Current Location',
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude
    });
    
    locations.push(...savedLocations);
    
    return locations;
  };

  // Initialize storage and load saved data
  useEffect(() => {
    const initializeStorage = async () => {
      try {
        console.log('Initializing storage...');
        
        // Load saved data from storage
        const [savedPersonality, savedLocationsList, lastLocation] = await Promise.all([
          StorageUtils.loadPersonality(),
          StorageUtils.loadLocations(),
          StorageUtils.loadLastSelectedLocation()
        ]);

        // Set loaded personality
        if (savedPersonality) {
          setSelectedPersonality(savedPersonality);
          setMode(savedPersonality);
          console.log('Loaded personality:', savedPersonality);
        }

        // Set loaded locations
        if (savedLocationsList && savedLocationsList.length > 0) {
          setSavedLocations(savedLocationsList);
          console.log('Loaded saved locations:', savedLocationsList.length);
        }

        // Try to restore last selected location if it's a zipcode location
        if (lastLocation && lastLocation.type === 'zipcode') {
          setSelectedLocation(lastLocation);
          console.log('Restored last selected location:', lastLocation.name);
        } else {
          // Otherwise, try to get current location
          const current = await getCurrentLocation();
          if (current) {
            setSelectedLocation(current);
          }
        }

        setStorageInitialized(true);
        console.log('Storage initialization complete');
        
      } catch (error) {
        console.error('Error initializing storage:', error);
        
        // Fallback: still try to get current location
        const current = await getCurrentLocation();
        if (current) {
          setSelectedLocation(current);
        }
        
        setStorageInitialized(true);
      }
    };

    initializeStorage();
  }, []);

  // Consolidated useEffect for weather data and AI summary management
  useEffect(() => {
    let isMounted = true;
    let summaryTimer = null;

    const handleWeatherAndSummaries = async () => {
      // Fetch weather data when location changes
      if (selectedLocation && selectedLocation.latitude && selectedLocation.longitude) {
        // Store the hourly data reference before any state changes
        if (weatherData?.hourly?.data) {
          stableHourlyData.current = weatherData.hourly.data;
        }

        // Only fetch new weather data if location actually changed (not just personality)
        if (!personalityTransitioning) {
          await fetchWeather(selectedLocation.latitude, selectedLocation.longitude);
          setAiSummaries({});
          setSummaryLoading({});
        }
      }

      // Generate AI summaries when conditions are right
      if (weatherData && selectedLocation && isMounted) {
        const weatherInfo = prepareWeatherInfo(weatherData);
        
        // Generate summary for current timeframe if not already generated or loading
        // This includes personality changes since summaries were cleared in onPersonalityChange
        if (!aiSummaries[selectedTimeframe] && !summaryLoading[selectedTimeframe]) {
          // Use requestAnimationFrame to ensure this runs after render
          summaryTimer = setTimeout(() => {
            if (isMounted) {
              generateAISummary(selectedTimeframe, weatherInfo, selectedLocation.name);
            }
          }, 50);
        }
      }
    };

    handleWeatherAndSummaries();

    return () => {
      isMounted = false;
      if (summaryTimer) {
        clearTimeout(summaryTimer);
      }
    };
  }, [selectedLocation, weatherData?.currently?.time, selectedTimeframe, selectedPersonality]);

  // Separate useEffect for personality transitioning management
  useEffect(() => {
    if (!personalityTransitioning) return;

    let transitionTimer = null;
    let summaryCheckTimer = null;

    // Reset personality transitioning after maximum time
    transitionTimer = setTimeout(() => {
      setPersonalityTransitioning(false);
    }, 2000);

    // Also reset when AI summary loads for current timeframe
    const checkSummaryLoaded = () => {
      if (aiSummaries[selectedTimeframe] && !summaryLoading[selectedTimeframe]) {
        clearTimeout(transitionTimer);
        setTimeout(() => {
          setPersonalityTransitioning(false);
        }, 100);
      } else {
        summaryCheckTimer = setTimeout(checkSummaryLoaded, 200);
      }
    };

    checkSummaryLoaded();

    return () => {
      if (transitionTimer) clearTimeout(transitionTimer);
      if (summaryCheckTimer) clearTimeout(summaryCheckTimer);
    };
  }, [personalityTransitioning, aiSummaries, selectedTimeframe, summaryLoading]);

  /**
   * Fetches weather data from Pirate Weather API for given coordinates
   * @param {number} latitude - Latitude coordinate
   * @param {number} longitude - Longitude coordinate
   */
  const fetchWeather = async (latitude, longitude) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Fetching weather for coordinates: ${latitude}, ${longitude}`);
      
      const response = await axios.get(
        `https://api.pirateweather.net/forecast/${WEATHER_API_KEY}/${latitude},${longitude}?exclude=hrrr`
      );
      
      setWeatherData(response.data);
      console.log('Weather data fetched successfully');
      setLoading(false);
      
    } catch (err) {
      console.error('Error fetching weather data:', err);
      setError('Failed to fetch weather data. Please try again.');
      setLoading(false);
    }
  };

  const prepareWeatherInfo = (weatherData) => {
    const current = weatherData.currently;
    const daily = weatherData.daily.data;
    
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSaturday = dayOfWeek === 6 ? 7 : (6 - dayOfWeek) % 7;
    const saturdayIndex = daysUntilSaturday;
    const sundayIndex = (daysUntilSaturday + 1) % 7;
    
    return {
      current,
      today: daily[0],
      tomorrow: daily[1],
      weekSummary: weatherData.daily.summary,
      saturday: daily[saturdayIndex],
      sunday: daily[sundayIndex]
    };
  };

  const handleRefresh = async () => {
    if (!selectedLocation || !selectedLocation.latitude || !selectedLocation.longitude) return;
    
    setRefreshing(true);
    setError(null);
    
    try {
      // Clear existing AI summaries so they get regenerated
      setAiSummaries({});
      setSummaryLoading({});
      
      // Fetch fresh weather data
      await fetchWeather(selectedLocation.latitude, selectedLocation.longitude);
      
    } catch (error) {
      console.error('Error refreshing weather data:', error);
      setError('Failed to refresh weather data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const getCurrentDisplayData = () => {
    if (!weatherData) return null;
    
    const formatTemp = (temp) => `${Math.round(temp)}°F`;
    const weatherInfo = prepareWeatherInfo(weatherData);
    
    switch (selectedTimeframe) {
      case 'now':
        return {
          title: 'Right Now',
          summary: weatherInfo.current.summary,
          temperature: formatTemp(weatherInfo.current.temperature),
          feelsLike: `Feels like ${formatTemp(weatherInfo.current.apparentTemperature)}`,
          details: [
            { label: 'Humidity', value: `${Math.round(weatherInfo.current.humidity * 100)}%` },
            { label: 'Wind', value: `${Math.round(weatherInfo.current.windSpeed)} mph` },
            { label: 'UV Index', value: weatherInfo.current.uvIndex },
            { label: 'Visibility', value: `${weatherInfo.current.visibility} mi` }
          ]
        };
        
      case 'today':
        return {
          title: 'Today',
          summary: weatherInfo.today.summary,
          temperature: `${formatTemp(weatherInfo.today.temperatureHigh)}`,
          feelsLike: `Low ${formatTemp(weatherInfo.today.temperatureLow)}`,
          details: [
            { label: 'Sunrise', value: new Date(weatherInfo.today.sunriseTime * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) },
            { label: 'Sunset', value: new Date(weatherInfo.today.sunsetTime * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) },
            { label: 'Humidity', value: `${Math.round(weatherInfo.today.humidity * 100)}%` },
            { label: 'UV Index', value: weatherInfo.today.uvIndex }
          ]
        };
        
      case 'tomorrow':
        return {
          title: 'Tomorrow',
          summary: weatherInfo.tomorrow.summary,
          temperature: `${formatTemp(weatherInfo.tomorrow.temperatureHigh)}`,
          feelsLike: `Low ${formatTemp(weatherInfo.tomorrow.temperatureLow)}`,
          details: [
            { label: 'Sunrise', value: new Date(weatherInfo.tomorrow.sunriseTime * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) },
            { label: 'Sunset', value: new Date(weatherInfo.tomorrow.sunsetTime * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) },
            { label: 'Humidity', value: `${Math.round(weatherInfo.tomorrow.humidity * 100)}%` },
            { label: 'UV Index', value: weatherInfo.tomorrow.uvIndex }
          ]
        };
        
      case 'week':
        const weekHighs = weatherData.daily.data.slice(0, 7).map(day => Math.round(day.temperatureHigh));
        const weekLows = weatherData.daily.data.slice(0, 7).map(day => Math.round(day.temperatureLow));
        const avgHigh = Math.round(weekHighs.reduce((a, b) => a + b) / weekHighs.length);
        const avgLow = Math.round(weekLows.reduce((a, b) => a + b) / weekLows.length);
        const maxHigh = Math.max(...weekHighs);
        const minLow = Math.min(...weekLows);
        return {
          title: 'This Week',
          summary: weatherInfo.weekSummary,
          temperature: `${avgHigh}°`,
          feelsLike: `Lows ${avgLow}°`,
          details: [
            { label: 'AVG HIGH', value: `${avgHigh}°F` },
            { label: 'AVG LOW', value: `${avgLow}°F` },
            { label: 'VARIATION', value: `${avgHigh - avgLow}°F` },
            { label: 'DAYS', value: '7 days' }
          ]
        };
        
      case 'weekend':
        return {
          title: 'This Weekend',
          summary: `Saturday: ${weatherInfo.saturday.summary}`,
          temperature: `${formatTemp(weatherInfo.saturday.temperatureHigh)}`,
          feelsLike: `Sunday ${formatTemp(weatherInfo.sunday.temperatureHigh)}`,
          details: [
            { label: 'Sat High', value: formatTemp(weatherInfo.saturday.temperatureHigh) },
            { label: 'Sat Low', value: formatTemp(weatherInfo.saturday.temperatureLow) },
            { label: 'Sun High', value: formatTemp(weatherInfo.sunday.temperatureHigh) },
            { label: 'Sun Low', value: formatTemp(weatherInfo.sunday.temperatureLow) }
          ]
        };
        
      default:
        return null;
    }
  };

  // Use useMemo to cache the scrollable data and prevent it from being recalculated
  // during AI summary state changes
  const scrollableData = useMemo(() => {
    // Add safeguards to prevent issues during re-renders
    if (!weatherData || !weatherData.hourly || !weatherData.daily) return [];
    
    const currentMetric = getCurrentMetric();
    if (!currentMetric) return [];
    
    // Additional safety check for hourly and daily data arrays
    if (!Array.isArray(weatherData.hourly.data) || !Array.isArray(weatherData.daily.data)) return [];
    
    switch (selectedTimeframe) {
      case 'now':
      case 'today': {
        // For "now" and "today", start from current time and go forward
        const hourlyData = weatherData.hourly?.data || [];
        const now = new Date();
        const currentHour = now.getHours();
        
        // For "today", show from current hour until end of day
        // For "now", show next 24 hours
        const hoursToShow = selectedTimeframe === 'today' 
          ? Math.min(24 - currentHour, hourlyData.length) // Until end of today
          : Math.min(24, hourlyData.length); // Next 24 hours for "now"
        
        const displayData = hourlyData.slice(0, hoursToShow);
        
        return displayData.map((hour, index) => {
          const hourTime = new Date(hour.time * 1000);
          const isNow = index === 0; // First hour is current time
          
          const value = currentMetric.getHourlyValue(hour);
          const intensity = currentMetric.getIntensity(value);
          
          return {
            id: `hour-${index}`,
            time: isNow ? 'Now' : hourTime.toLocaleTimeString([], { hour: 'numeric' }),
            value: value,
            displayValue: `${value}${currentMetric.unit}`,
            condition: hour.summary,
            intensity: intensity,
            barColor: currentMetric.getBarColor(intensity),
            isHighlighted: isNow,
            rawData: hour
          };
        });
      }
      
      case 'tomorrow': {
        // For tomorrow, start at 12am of the next day
        const hourlyData = weatherData.hourly?.data || [];
        const now = new Date();
        const currentHour = now.getHours();
        
        // Calculate hours until midnight (start of tomorrow)
        const hoursUntilMidnight = 24 - currentHour;
        const startOffset = hoursUntilMidnight;
        
        return hourlyData.slice(startOffset, startOffset + 24).map((hour, index) => {
          const hourTime = new Date(hour.time * 1000);
          
          const value = currentMetric.getHourlyValue(hour);
          const intensity = currentMetric.getIntensity(value);
          
          return {
            id: `hour-${index}`,
            time: hourTime.toLocaleTimeString([], { hour: 'numeric' }),
            value: value,
            displayValue: `${value}${currentMetric.unit}`,
            condition: hour.summary,
            intensity: intensity,
            barColor: currentMetric.getBarColor(intensity),
            isHighlighted: false,
            rawData: hour
          };
        });
      }
      
      case 'week':
      case 'weekend': {
        // For daily data
        const dailyData = weatherData.daily?.data || [];
        const daysToShow = selectedTimeframe === 'weekend' ? 4 : 7; // Weekend now shows 4 days
        
        // Calculate proper offset for weekend (Friday through Monday)
        let startOffset = 0;
        if (selectedTimeframe === 'weekend') {
          const today = new Date();
          const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          
          // Find the next Friday (start of weekend experience)
          let daysUntilFriday;
          if (currentDayOfWeek === 5) {
            // Today is Friday
            daysUntilFriday = 0;
          } else if (currentDayOfWeek === 6) {
            // Today is Saturday, this Friday is yesterday (-1), next Friday is 6 days away
            daysUntilFriday = 6;
          } else if (currentDayOfWeek === 0) {
            // Today is Sunday, this Friday is 2 days ago (-2), next Friday is 5 days away
            daysUntilFriday = 5;
          } else {
            // Monday through Thursday
            daysUntilFriday = 5 - currentDayOfWeek;
          }
          
          startOffset = daysUntilFriday;
        }
        
        return dailyData.slice(startOffset, startOffset + daysToShow).map((day, index) => {
          const dayTime = new Date(day.time * 1000);
          const isToday = index === 0 && selectedTimeframe === 'week';
          
          const value = currentMetric.getDailyValue(day);
          const lowValue = currentMetric.getDailyLowValue(day);
          const intensity = currentMetric.getIntensity(value);
          
          return {
            id: `day-${index}`,
            time: isToday ? 'Today' : dayTime.toLocaleDateString([], { weekday: 'short' }),
            value: value,
            lowValue: lowValue,
            displayValue: `${value}${currentMetric.unit}`,
            displayLowValue: lowValue ? `${lowValue}${currentMetric.unit}` : null,
            condition: day.summary,
            intensity: intensity,
            barColor: currentMetric.getBarColor(intensity),
            isHighlighted: isToday,
            rawData: day
          };
        });
      }
      
      default:
        return [];
    }
  }, [
    // Only depend on core weather data and user selections, NOT on AI summary state
    weatherData, 
    selectedTimeframe, 
    selectedMetric,
    // Include weatherData?.currently?.time to refresh when new data comes in
    weatherData?.currently?.time
  ]);

  // Getter function for backward compatibility
  const getScrollableData = () => scrollableData;

  const getTemperatureBarColor = (intensity) => {
    // Create a color gradient from cool to warm
    if (intensity < 0.3) return '#4A90E2'; // Cool blue
    if (intensity < 0.6) return '#7ED321'; // Green
    if (intensity < 0.8) return '#F5A623'; // Orange
    return '#D0021B'; // Warm red
  };

  const timeframeSections = [
    { id: 'now', title: 'Now' },
    { id: 'today', title: 'Today' },
    { id: 'tomorrow', title: 'Tomorrow' },
    { id: 'week', title: 'Week' },
    { id: 'weekend', title: 'Weekend' }
  ];

  if (!selectedLocation) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.welcomeTitle}>Welcome to Weather App</Text>
        <Text style={styles.welcomeText}>Choose a location to get started</Text>
        
        <TouchableOpacity 
          style={[styles.button, gettingCurrentLocation && styles.buttonDisabled]}
          onPress={getCurrentLocation}
          disabled={gettingCurrentLocation}
        >
          <Text style={styles.buttonText}>
            {gettingCurrentLocation ? 'Getting Location...' : '📍 Use Current Location'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]}
          onPress={() => setLocationModalVisible(true)}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>🏙️ Enter City or Zipcode</Text>
        </TouchableOpacity>

        <LocationModal
          visible={locationModalVisible}
          onClose={() => setLocationModalVisible(false)}
          onSelectLocation={handleSelectLocation}
          locations={getAllLocations()}
          onDeleteLocation={handleDeleteLocation}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading weather information...</Text>
        <Text style={styles.locationText}>for {selectedLocation.name}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => fetchWeather(selectedLocation.latitude, selectedLocation.longitude)}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!weatherData) {
    return (
      <View style={styles.centerContainer}>
        <Text>No weather data available.</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => fetchWeather(selectedLocation.latitude, selectedLocation.longitude)}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayData = getCurrentDisplayData();
  
  if (!displayData) {
    return <View style={styles.centerContainer}><Text>Loading...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
            title="Pull to refresh weather and AI summary"
            titleColor="#666"
          />
        }
      >
        {/* Header with Location and Menu */}
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <View style={styles.locationDisplay}>
              <Text style={styles.locationText}>{selectedLocation.name}</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.menuButton}
              onPress={() => setSettingsModalVisible(true)}
            >
              <View style={styles.hamburger}>
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Timeframe Navigation Chips */}
        <View style={styles.timeframeNavigationContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.timeframeChips}
            contentContainerStyle={styles.timeframeChipsContent}
          >
            {timeframeSections.map((section) => (
              <TouchableOpacity
                key={section.id}
                style={[
                  styles.timeframeChip,
                  selectedTimeframe === section.id && styles.timeframeChipSelected
                ]}
                onPress={() => {
                  setSelectedTimeframe(section.id);
                  // Generate AI summary if not already generated
                  if (weatherData && !aiSummaries[section.id] && !summaryLoading[section.id]) {
                    const weatherInfo = prepareWeatherInfo(weatherData);
                    generateAISummary(section.id, weatherInfo, selectedLocation.name);
                  }
                }}
              >
                <Text style={[
                  styles.timeframeChipText,
                  selectedTimeframe === section.id && styles.timeframeChipTextSelected
                ]}>
                  {section.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Hero Weather Card */}
        <View style={styles.heroWeatherCard}>
          <View style={styles.currentConditions}>
            <Text style={styles.currentTitle}>{displayData.title}</Text>
            <Text style={styles.currentSummary}>{displayData.summary}</Text>
            <Text style={styles.currentTemp}>{displayData.temperature}</Text>
            <Text style={styles.feelsLike}>{displayData.feelsLike}</Text>
          </View>

          {/* AI Summary */}
          <View style={styles.naturalSummaryCard}>
            <Text style={styles.naturalSummaryTitle}>AI Summary</Text>
            {summaryLoading[selectedTimeframe] ? (
              <View style={styles.summaryLoadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.summaryLoadingText}>Analyzing...</Text>
              </View>
            ) : (
              <Text style={styles.naturalSummaryText}>
                {aiSummaries[selectedTimeframe] || 'Generating summary...'}
              </Text>
            )}
          </View>

          {/* Details Grid */}
          <View style={styles.detailsGrid}>
            {displayData.details.map((detail, index) => (
              <View key={index} style={styles.detailItem}>
                <Text style={styles.detailLabel}>{detail.label}</Text>
                <Text style={styles.detailValue}>{detail.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Waze-inspired Scrollable Timeline */}
        <View style={styles.timelineCard}>
          <View style={styles.timelineHeader}>
            <Text style={styles.timelineTitle}>
              {selectedTimeframe === 'now' || selectedTimeframe === 'today' || selectedTimeframe === 'tomorrow' 
                ? 'Hourly Forecast' 
                : selectedTimeframe === 'weekend' 
                ? 'Weekend Forecast' 
                : 'Weekly Forecast'}
            </Text>
            <TouchableOpacity 
              style={styles.metricSelector}
              onPress={() => setMetricSelectorVisible(true)}
            >
              <Text style={styles.timelineSubtitle}>
                {getCurrentMetric()?.emoji} {getCurrentMetric()?.label}
              </Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.timelineScrollView}
            contentContainerStyle={styles.timelineContent}
          >
            {scrollableData.map((item, index) => (
              <View key={item.id} style={[
                styles.timelineItem,
                item.isHighlighted && styles.timelineItemHighlighted
              ]}>
                {/* Time label */}
                <Text style={[
                  styles.timelineTime,
                  item.isHighlighted && styles.timelineTimeHighlighted
                ]}>
                  {item.time}
                </Text>
                
                {/* Metric bar */}
                <View style={styles.temperatureBarContainer}>
                  <View 
                    style={[
                      styles.temperatureBar,
                      { 
                        backgroundColor: item.barColor,
                        height: Math.max(20, item.intensity * 80) // Min 20px, max 80px
                      }
                    ]} 
                  />
                </View>
                
                {/* Metric value */}
                <Text style={[
                  styles.temperatureValue,
                  item.isHighlighted && styles.temperatureValueHighlighted
                ]}>
                  {item.displayValue}
                </Text>
                
                {/* Low value for daily data */}
                {item.displayLowValue && (
                  <Text style={styles.lowTemperatureValue}>
                    {item.displayLowValue}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <LocationModal
        visible={locationModalVisible}
        onClose={() => setLocationModalVisible(false)}
        onSelectLocation={handleSelectLocation}
        locations={getAllLocations()}
        onDeleteLocation={handleDeleteLocation}
      />

      <MenuModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        selectedPersonality={selectedPersonality}
        onPersonalityChange={async (personality) => {
          setPersonalityTransitioning(true);
          setSelectedPersonality(personality);
          setMode(personality);
          
          // Save personality to storage
          await StorageUtils.savePersonality(personality);
          
          // Clear AI summaries immediately to avoid race condition
          setAiSummaries({});
          setSummaryLoading({});
        }}
        onSelectLocation={handleSelectLocation}
        locations={getAllLocations()}
        onDeleteLocation={handleDeleteLocation}
        gettingCurrentLocation={gettingCurrentLocation}
      />

      <MetricSelector
        visible={metricSelectorVisible}
        onClose={() => setMetricSelectorVisible(false)}
        onSelectMetric={setSelectedMetric}
        selectedMetric={selectedMetric}
        availableMetrics={getAvailableMetricsForConditions(weatherData)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsButton: {
    backgroundColor: 'white',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  settingsButtonText: {
    fontSize: 16,
    color: '#666',
  },
  locationDisplay: {
    flex: 1,
  },
  menuButton: {
    backgroundColor: '#f8f9fa',
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: '#ffffff',
    borderLeftColor: '#ffffff',
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomColor: '#d1d5db',
    borderRightColor: '#d1d5db',
  },
  hamburger: {
    width: 18,
    height: 14,
    justifyContent: 'space-between',
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    backgroundColor: '#666',
    borderRadius: 1,
  },
  menuContent: {
    flex: 1,
    padding: 20,
  },
  menuSection: {
    marginBottom: 32,
  },
  menuSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    marginBottom: 10,
  },
  welcomeText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  locationSelector: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
  },
  locationSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  timeframeNavigationContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
    height: 75,
    paddingVertical: 10,
  },
  timeframeChips: {
    flexGrow: 0,
  },
  timeframeChipsContent: {
    paddingRight: 20,
    paddingLeft: 5,
    paddingVertical: 5,
    alignItems: 'center',
  },
  timeframeChip: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 25,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: '#ffffff',
    borderLeftColor: '#ffffff',
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomColor: '#d1d5db',
    borderRightColor: '#d1d5db',
    minWidth: 70,
    alignItems: 'center',
  },
  timeframeChipSelected: {
    backgroundColor: '#007AFF',
    borderTopColor: '#4A9EFF',
    borderLeftColor: '#4A9EFF',
    borderBottomColor: '#0056CC',
    borderRightColor: '#0056CC',
    shadowOpacity: 0.2,
  },
  timeframeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  timeframeChipTextSelected: {
    color: 'white',
  },
  heroWeatherCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 30,
    minHeight: 400,
  },
  currentConditions: {
    alignItems: 'center',
    marginBottom: 20,
  },
  currentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  currentSummary: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  currentTemp: {
    fontSize: 56,
    fontWeight: '300',
    color: '#333',
    marginBottom: 4,
  },
  feelsLike: {
    fontSize: 16,
    color: '#666',
  },
  naturalSummaryCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  naturalSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  naturalSummaryText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  summaryLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryLoadingText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailItem: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 15,
    minWidth: 200,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  addLocationSection: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zipcodeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginRight: 10,
    color: 'fuchsia',
  },
  locationInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginRight: 10,
    color: 'fuchsia',
    backgroundColor: 'white',
  },
  searchResultsContainer: {
    marginTop: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    maxHeight: 200,
    overflow: 'hidden',
  },
  searchingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchingText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 14,
  },
  searchResultItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchResultContent: {
    padding: 12,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  searchResultDetails: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  locationsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  locationItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationItemDisabled: {
    opacity: 0.6,
  },
  locationItemInfo: {
    flex: 1,
  },
  locationItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  locationItemType: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  locationLoadingIndicator: {
    marginLeft: 12,
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  settingsContent: {
    flex: 1,
    padding: 20,
  },
  settingsSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  settingsDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  personalityList: {
    flex: 1,
  },
  personalityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  personalityOptionSelected: {
    backgroundColor: '#007AFF',
  },
  personalityOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  personalityEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  personalityLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  personalityLabelSelected: {
    color: 'white',
  },
  checkmark: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  // Waze-inspired Timeline Styles
  timelineCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 30,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  timelineSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
  },
  timelineScrollView: {
    flex: 1,
  },
  timelineContent: {
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  timelineItem: {
    alignItems: 'center',
    marginHorizontal: 4,
    width: 50,
    paddingVertical: 8,
  },
  timelineItemHighlighted: {
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
    height: 16,
  },
  timelineTimeHighlighted: {
    color: '#007AFF',
    fontWeight: '600',
  },
  temperatureBarContainer: {
    height: 90,
    width: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    justifyContent: 'flex-end',
    marginVertical: 8,
    overflow: 'hidden',
  },
  temperatureBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 20,
  },
  temperatureValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  temperatureValueHighlighted: {
    color: '#007AFF',
    fontWeight: '700',
  },
  lowTemperatureValue: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
  metricSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: '#ffffff',
    borderLeftColor: '#ffffff',
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomColor: '#d1d5db',
    borderRightColor: '#d1d5db',
  }
});

export default Weather;
