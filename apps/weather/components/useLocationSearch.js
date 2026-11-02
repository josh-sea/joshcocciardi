import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';

/**
 * Custom hook for location search functionality
 * Provides shared logic for searching, adding, and managing location inputs
 */
export const useLocationSearch = (onSelectLocation, onClose = null) => {
  const [locationInput, setLocationInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchTimer, setSearchTimer] = useState(null);

  const searchLocations = async (query) => {
    if (!query.trim() || query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const geocodeResults = await Location.geocodeAsync(query.trim());
      
      if (geocodeResults.length === 0) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      // Get detailed address information for each result
      const results = [];
      for (let i = 0; i < Math.min(geocodeResults.length, 5); i++) {
        const coords = geocodeResults[i];
        try {
          const [address] = await Location.reverseGeocodeAsync({
            latitude: coords.latitude,
            longitude: coords.longitude
          });
          
          const locationName = address.city && address.region 
            ? `${address.city}, ${address.region}`
            : address.name || query.trim();

          const zipcode = address.postalCode || 'N/A';
          
          results.push({
            id: `search-${i}`,
            name: locationName,
            zipcode: zipcode,
            latitude: coords.latitude,
            longitude: coords.longitude,
            fullAddress: `${address.street || ''} ${address.city || ''} ${address.region || ''} ${address.postalCode || ''}`.trim()
          });
        } catch (reverseError) {
          // Fallback if reverse geocoding fails
          results.push({
            id: `search-${i}`,
            name: query.trim(),
            zipcode: 'N/A',
            latitude: coords.latitude,
            longitude: coords.longitude,
            fullAddress: query.trim()
          });
        }
      }
      
      setSearchResults(results);
      setSearching(false);
      
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      setSearching(false);
    }
  };

  const handleLocationInputChange = (text) => {
    setLocationInput(text);
    
    // Clear existing timer
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    
    // Set new timer for debounced search
    const newTimer = setTimeout(() => {
      searchLocations(text);
    }, 500); // 500ms delay
    
    setSearchTimer(newTimer);
  };

  const selectSearchResult = async (result) => {
    setAdding(true);
    setLocationInput('');
    setSearchResults([]);
    
    const newLocation = {
      id: Date.now().toString(),
      type: 'zipcode',
      name: result.name,
      zipcode: result.zipcode,
      latitude: result.latitude,
      longitude: result.longitude
    };

    onSelectLocation(newLocation);
    setAdding(false);
    
    // Close modal if onClose is provided (for LocationModal)
    if (onClose) {
      onClose();
    }
  };

  const addLocationManually = async () => {
    if (!locationInput.trim()) {
      Alert.alert('Error', 'Please enter a location (zipcode, city, or city, state)');
      return;
    }

    setAdding(true);
    try {
      const geocodeResult = await Location.geocodeAsync(locationInput.trim());
      
      if (geocodeResult.length === 0) {
        Alert.alert('Error', 'Could not find this location. Please try a different search term.');
        setAdding(false);
        return;
      }

      const coords = geocodeResult[0];
      
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude
        });
        
        const locationName = address.city && address.region 
          ? `${address.city}, ${address.region}`
          : locationInput.trim();

        const zipcode = address.postalCode || locationInput.trim();

        const newLocation = {
          id: Date.now().toString(),
          type: 'zipcode',
          name: locationName,
          zipcode: zipcode,
          latitude: coords.latitude,
          longitude: coords.longitude
        };

        onSelectLocation(newLocation);
        setLocationInput('');
        setSearchResults([]);
        setAdding(false);
        
        // Close modal if onClose is provided (for LocationModal)
        if (onClose) {
          onClose();
        }
        
      } catch (reverseError) {
        const newLocation = {
          id: Date.now().toString(),
          type: 'zipcode',
          name: locationInput.trim(),
          zipcode: locationInput.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude
        };

        onSelectLocation(newLocation);
        setLocationInput('');
        setSearchResults([]);
        setAdding(false);
        
        // Close modal if onClose is provided (for LocationModal)
        if (onClose) {
          onClose();
        }
      }
      
    } catch (error) {
      console.error('Geocoding error:', error);
      Alert.alert('Error', 'Could not find this location. Please try again with a different search term.');
      setAdding(false);
    }
  };

  const clearSearch = () => {
    setLocationInput('');
    setSearchResults([]);
    setAdding(false);
    setSearching(false);
  };

  // Clear search timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimer) {
        clearTimeout(searchTimer);
      }
    };
  }, [searchTimer]);

  return {
    locationInput,
    adding,
    searchResults,
    searching,
    handleLocationInputChange,
    selectSearchResult,
    addLocationManually,
    clearSearch,
    setLocationInput,
    setSearchResults,
    setAdding
  };
};
