import { useState, useEffect, useRef } from 'react';
import alert from '../utils/alert';
import { searchPlaces } from '../utils/geocode';

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
  const latestQuery = useRef('');

  const searchLocations = async (query) => {
    if (!query.trim() || query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const results = await searchPlaces(query);
      // Ignore a slow answer for text the user has since changed.
      if (latestQuery.current === query) setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      if (latestQuery.current === query) setSearchResults([]);
    } finally {
      if (latestQuery.current === query) setSearching(false);
    }
  };

  const handleLocationInputChange = (text) => {
    setLocationInput(text);
    latestQuery.current = text;
    
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
    latestQuery.current = '';
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
      alert('Error', 'Please enter a location (zipcode, city, or city, state)');
      return;
    }

    setAdding(true);
    try {
      const [first] = await searchPlaces(locationInput);
      if (!first) {
        alert('Error', 'Could not find this location. Please try a different search term.');
        return;
      }

      onSelectLocation({
        id: Date.now().toString(),
        type: 'zipcode',
        name: first.name,
        zipcode: first.zipcode,
        latitude: first.latitude,
        longitude: first.longitude,
      });
      setLocationInput('');
      setSearchResults([]);

      // Close modal if onClose is provided (for LocationModal)
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      alert('Error', 'Could not find this location. Please try again with a different search term.');
    } finally {
      setAdding(false);
    }
  };

  const clearSearch = () => {
    setLocationInput('');
    latestQuery.current = '';
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
